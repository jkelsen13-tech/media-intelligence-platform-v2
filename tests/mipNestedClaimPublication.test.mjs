import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation } from '../scripts/mipConsolidationRestore.mjs'
import { insertCyclosporaCohort, CYCLOSPORA_EVENT, CYCLOSPORA_ARTICLES } from '../scripts/mipPublicSurfaceCohort.mjs'

test('nested payloads admit published sources and exclude private content for both reader roles', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  await insertCyclosporaCohort(db)
  const article = CYCLOSPORA_ARTICLES[0].id
  const claim = (await db.query('select c.*, ac.id surface_id, ac.surface_text from claims c join article_claims ac on ac.claim_id=c.id where ac.article_id=$1 limit 1', [article])).rows[0]
  const pending = (await db.query("insert into events(canonical_title,comparison_validation_state) values ('PRIVATE_EVENT','pending_review') returning id")).rows[0].id
  const privateClaim = (await db.query("insert into claims(event_id,canonical_text,rule_version) values ($1,'PRIVATE_CLAIM','sc-v2-event-projection') returning id", [pending])).rows[0].id
  await db.query("insert into article_claims(claim_id,article_id,surface_text,auditability_state) values ($1,$2,'PRIVATE_SURFACE','verified_retained_source')", [privateClaim, article])
  await db.query("insert into event_articles(event_id,article_id,membership_method) values ($1,$2,'fixture')", [pending, article])
  const hiddenArticle = (await db.query("insert into articles(feed,outlet,title,url,reader_state) values ('fixture','Hidden','PRIVATE_ARTICLE','https://example.org/private','withheld') returning id")).rows[0].id
  await db.query("insert into article_claims(claim_id,article_id,surface_text,auditability_state) values ($1,$2,'PRIVATE_SOURCE_SURFACE','verified_retained_source')", [claim.id, hiddenArticle])
  await db.query("insert into claim_evidence_links(claim_id,evidence_url,linked_from_article_id) values ($1,'https://example.org/PUBLIC_EVIDENCE',$2),($1,'https://example.org/PRIVATE_EVIDENCE',$3),($1,'https://example.org/UNBOUND_EVIDENCE',null)", [claim.id, article, hiddenArticle])
  await db.query("insert into claim_corrections(claim_id,correcting_article_id,correction_text) values ($1,$2,'PUBLIC_CORRECTION'),($1,$3,'PRIVATE_CORRECTION')", [claim.id, article, hiddenArticle])
  const passage = 'Surface claim "' + claim.surface_text + '" grouped under canonical "' + claim.canonical_text + '" PUBLIC_EXPLANATION'
  const explanation = (await db.query("insert into explanations(assertion_id,assertion_type,version,rule_version,provenance_class,supporting_passage,review_status,state,falsification_condition) values ($1,'claim_grouping',1,'sc-v2-event-projection|fixture','human_reviewed',$2,'published','ok','Disproved by a contrary source') returning id", ['fixture:' + article, passage])).rows[0].id
  async function payload(role) {
    await db.exec('set role ' + role)
    try {
      const news = (await db.query('select * from news_detail_public')).rows
      const comparison = (await db.query('select * from comparison_public')).rows
      await assert.rejects(db.query('select * from article_claims'), /permission denied/)
      await assert.rejects(db.query('select * from mip_private.reader_claim_surfaces'), /permission denied/)
      return { news, comparison, text: JSON.stringify({ news, comparison }) }
    } finally { await db.exec('reset role') }
  }
  async function readers(check) {
    for (const role of ['anon','authenticated']) await check(await payload(role))
  }

  await t.test('reproduces the old nested leak, then closes it on upgrade', async () => {
    const previous = await readFile(new URL('../supabase/migrations/20260905172611_mip_public_surface_views.sql', import.meta.url), 'utf8')
    await db.exec(previous)
    await readers(({text}) => assert.ok(text.includes('PRIVATE_SURFACE')))
    await db.exec(await readFile(new URL('../supabase/migrations/20260905182355_mip_nested_claim_publication_gates.sql', import.meta.url), 'utf8'))
    await readers(({news,comparison,text}) => {
      assert.equal(news.length,3)
      assert.equal(comparison.length,1)
      assert.ok(!text.includes('PRIVATE_'))
      assert.ok(!text.includes('UNBOUND_EVIDENCE'))
      assert.ok(text.includes('PUBLIC_EVIDENCE'))
      assert.ok(text.includes('PUBLIC_CORRECTION'))
      assert.ok(text.includes('PUBLIC_EXPLANATION'))
      assert.ok(text.includes(claim.surface_text))
    })
  })
  await t.test('draft, invalid provenance and retracted explanations cannot enter JSON', async () => {
    for (const patch of [
      {review_status:'draft'}, {state:'source_withdrawn'}, {is_current:false},
      {falsification_condition:'missing: review'}, {archived_sources:[{status:'missing'}]}
    ]) {
      await db.query("update explanations set review_status='published',state='ok',is_current=true,falsification_condition='Disproved by a contrary source',archived_sources='[]' where id=$1",[explanation])
      for (const [key,value] of Object.entries(patch)) await db.query('update explanations set '+key+'=$1 where id=$2',[Array.isArray(value)?JSON.stringify(value):value,explanation])
      await readers(({text}) => assert.ok(!text.includes('PUBLIC_EXPLANATION')))
    }
  })
  await t.test('pending and quarantined event claims never leak through eligible articles', async () => {
    for (const state of ['pending_review','quarantined']) {
      await db.query('update events set comparison_validation_state=$1 where id=$2',[state,pending])
      await readers(({text}) => assert.ok(!text.includes('PRIVATE_CLAIM')))
    }
  })
  await t.test('unverified and noncurrent surfaces are excluded', async () => {
    await db.query("update article_claims set auditability_state='unverified_against_retained_source' where id=$1",[claim.surface_id])
    await readers(({news}) => assert.ok(!JSON.stringify(news).includes(claim.surface_text)))
    await db.query("update article_claims set auditability_state='verified_retained_source',is_current=false where id=$1",[claim.surface_id])
    await readers(({news}) => assert.ok(!JSON.stringify(news).includes(claim.surface_text)))
    await db.query('update article_claims set is_current=true where id=$1',[claim.surface_id])
  })
  await t.test('event retraction removes nested news claims as well as comparison', async () => {
    await db.query("update events set comparison_validation_state='pending_review' where id=$1",[CYCLOSPORA_EVENT.id])
    await readers(({news,comparison}) => {
      assert.equal(comparison.length,0)
      assert.ok(news.every(row => row.reviewed_claims.length===0))
    })
    await db.query("update events set comparison_validation_state='approved' where id=$1",[CYCLOSPORA_EVENT.id])
  })
  await t.test('withheld/corrected/withdrawn sources lose nested evidence and corrections', async () => {
    for (const [reader,status] of [['withheld','active'],['eligible','corrected'],['eligible','withdrawn']]) {
      await db.query('update articles set reader_state=$1,source_status=$2 where id=$3',[reader,status,article])
      await readers(({text}) => {
        assert.ok(!text.includes('PUBLIC_EVIDENCE'))
        assert.ok(!text.includes('PUBLIC_CORRECTION'))
      })
    }
    await db.query("update articles set reader_state='eligible',source_status='active' where id=$1",[article])
  })
  await t.test('removing event membership removes the surface even on eligible articles', async () => {
    await db.query('delete from event_articles where event_id=$1 and article_id=$2',[CYCLOSPORA_EVENT.id,article])
    await readers(({news}) => assert.deepEqual(news.find(row=>row.article_id===article).reviewed_claims,[]))
  })
})
