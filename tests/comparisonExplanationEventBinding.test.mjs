import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation } from '../scripts/mipConsolidationRestore.mjs'
import { insertCyclosporaCohort, CYCLOSPORA_EVENT, CYCLOSPORA_ARTICLES } from '../scripts/mipPublicSurfaceCohort.mjs'

// All added rows are isolated CI counterexamples, never production evidence.
test('comparison explanations cannot cross event identity despite matching article and claim text', async t => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  await insertCyclosporaCohort(db)
  const read = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
  const forward = await read('20260909152111_comparison_explanation_event_binding.sql')
  const article = CYCLOSPORA_ARTICLES[0].id
  const claim = (await db.query('select c.*,ac.surface_text from claims c join article_claims ac on ac.claim_id=c.id where ac.article_id=$1 limit 1',[article])).rows[0]
  const foreign = (await db.query("insert into events(canonical_title,comparison_validation_state) values ('Separate synthetic event','approved') returning id")).rows[0].id
  for (const member of CYCLOSPORA_ARTICLES.slice(0,2)) await db.query("insert into event_articles(event_id,article_id,membership_method) values ($1,$2,'fixture')",[foreign,member.id])
  const foreignClaim = (await db.query("insert into claims(event_id,canonical_text,rule_version) values ($1,$2,'sc-v2-event-projection') returning id",[foreign,claim.canonical_text])).rows[0].id
  await db.query("insert into article_claims(claim_id,article_id,surface_text,auditability_state) values ($1,$2,$3,'verified_retained_source')",[foreignClaim,article,claim.surface_text])
  const passage = 'Surface claim "' + claim.surface_text + '" grouped under canonical "' + claim.canonical_text + '"'
  const assertion = event => 'sc:claim_grouping:' + event + ':0:' + article
  async function explanation(event, marker, date) {
    return (await db.query("insert into explanations(assertion_id,assertion_type,version,rule_version,provenance_class,supporting_passage,review_status,state,falsification_condition,recomputed_at) values ($1,'claim_grouping',1,'sc-v2-event-projection|fixture','human_reviewed',$2,'published','ok','Contrary retained source disproves grouping',$3) returning id",[assertion(event),passage + ' ' + marker,date])).rows[0].id
  }
  const own = await explanation(claim.event_id,'OWN_EVENT_EXPLANATION','2024-04-08 18:00:00.123456+00')
  const other = await explanation(foreign,'FOREIGN_EVENT_EXPLANATION','2024-04-08 18:00:00.123457+00')
  async function payload(role,event=claim.event_id) {
    await db.exec('set role ' + role)
    try {
      const row=(await db.query('select * from comparison_public where event_key=md5($1)',[event])).rows[0]
      await assert.rejects(db.query('select * from explanations'),/permission denied/)
      await assert.rejects(db.query('select * from mip_private.reader_claim_surfaces'),/permission denied/)
      return JSON.stringify(row)
    } finally { await db.exec('reset role') }
  }
  const readers=async fn=>{for(const role of ['anon','authenticated'])await fn(role)}
  const retained=async()=> (await db.query('select to_jsonb(x) as value from explanations x order by id')).rows
  const permissions=async()=> (await db.query("select relacl::text,reloptions from pg_class where oid='public.comparison_public'::regclass")).rows

  await t.test('reproduces the cross-event selection and preserves the exact history and access options on correction', async()=>{
    await db.exec(await read('20260905182355_mip_nested_claim_publication_gates.sql'))
    await readers(async role=>assert.match(await payload(role),/FOREIGN_EVENT_EXPLANATION/))
    const before=await retained(), acl=await permissions()
    await db.exec(forward)
    assert.deepEqual(await retained(),before)
    assert.deepEqual(await permissions(),acl)
    await readers(async role=>{
      assert.match(await payload(role),/OWN_EVENT_EXPLANATION/)
      assert.doesNotMatch(await payload(role),/FOREIGN_EVENT_EXPLANATION/)
      assert.match(await payload(role,foreign),/FOREIGN_EVENT_EXPLANATION/)
    })
    await db.exec(forward)
    assert.deepEqual(await retained(),before,'replay only replaces the view')
  })
  await t.test('absence of an own-event explanation never falls back to a newer foreign explanation', async()=>{
    await db.query('update explanations set is_current=false where id=$1',[own])
    await readers(async role=>{
      assert.doesNotMatch(await payload(role),/OWN_EVENT_EXPLANATION|FOREIGN_EVENT_EXPLANATION/)
      assert.match(await payload(role,foreign),/FOREIGN_EVENT_EXPLANATION/)
    })
    await db.query('update explanations set is_current=true where id=$1',[own])
  })
  await t.test('the full assertion grammar rejects suffix-only, malformed and foreign identifiers', async()=>{
    for(const value of ['fixture:'+article,assertion(foreign),assertion(claim.event_id)+':extra',
      'sc:claim_grouping:'+claim.event_id+':not-an-ordinal:'+article,
      'prefix:'+assertion(claim.event_id)]) {
      await db.query('update explanations set assertion_id=$1 where id=$2',[value,own])
      await readers(async role=>assert.doesNotMatch(await payload(role),/OWN_EVENT_EXPLANATION|FOREIGN_EVENT_EXPLANATION/))
    }
    await db.query('update explanations set assertion_id=$1 where id=$2',[assertion(claim.event_id),own])
  })
  await t.test('event binding does not promote drafts or bypass source and event retraction', async()=>{
    await db.query("update explanations set review_status='draft' where id=$1",[own])
    await readers(async role=>assert.doesNotMatch(await payload(role),/OWN_EVENT_EXPLANATION|FOREIGN_EVENT_EXPLANATION/))
    await db.query("update explanations set review_status='published' where id=$1",[own])
    await db.query("update articles set source_status='withdrawn' where id=$1",[article])
    await readers(async role=>assert.doesNotMatch(await payload(role),/OWN_EVENT_EXPLANATION|FOREIGN_EVENT_EXPLANATION/))
    await db.query("update articles set source_status='active' where id=$1",[article])
    await db.query("update events set comparison_validation_state='pending_review' where id=$1",[CYCLOSPORA_EVENT.id])
    await readers(async role=>assert.equal(await payload(role),undefined))
    await db.query("update events set comparison_validation_state='approved' where id=$1",[CYCLOSPORA_EVENT.id])
    await readers(async role=>assert.match(await payload(role),/OWN_EVENT_EXPLANATION/))
    assert.equal((await db.query('select count(*)::int n from explanations where id in ($1,$2)',[own,other])).rows[0].n,2)
  })
})
