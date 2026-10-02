import test from 'node:test'
import assert from 'node:assert/strict'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { normalizeReviewedPublicVersion, normalizeReviewedPublicStoryVersion } from '../src/lib/reviewedPublicVersion.js'

test('actual retained-capture/publication owners bind immutable source and Story versions, fail closed under changed authority', async t => {
  const f = await createReviewedVersionFixture(), { db } = f
  t.after(() => db.close())
  let version, story_version, story_id, correction
  await t.test('eligible source alone has no reviewed public version; only existing owner can bind', async () => {
    assert.equal(await f.readArticle(f.first.article_id), null)
    for (const role of ['anon','authenticated','service_role']) {
      await db.exec(`set role ${role}`)
      try {
        await assert.rejects(f.bindArticle(f.first), /permission denied|publication owner/)
        await assert.rejects(db.query('insert into mip_private.reviewed_public_stories(subject_type,subject_id,subject_kind) values($1,$2,$3)', ['article',f.first.article_id,'article']), /permission denied/)
      } finally { await db.exec('reset role') }
    }
  })
  await t.test('capture/hash/claim/Unicode mismatch reject atomically', async () => {
    await assert.rejects(f.bindArticle({ ...f.first, capture_hash: '0'.repeat(64) }), /capture\/hash mismatch/)
    await assert.rejects(f.bindArticle({ ...f.first, capture_id: f.second.capture_id, capture_hash: f.second.capture_hash }), /capture\/hash mismatch/)
    await assert.rejects(f.bindArticle(f.first, { claims: [f.claim_id] }), /nested evidence publication permission/)
    await db.query('update public.article_claims set char_start=3,char_end=char_end+1 where id=$1',[f.article_claim_id])
    await assert.rejects(f.bindArticle(f.first), /span mismatch/)
    await db.query('update public.article_claims set char_start=2,char_end=char_end-1 where id=$1',[f.article_claim_id])
    assert.equal(await f.scalar('select count(*)::int from mip_private.reviewed_public_article_versions'),0)
    version = await f.bindArticle(f.first)
    assert.equal(await f.bindArticle(f.first),version)
    await assert.rejects(f.bindArticle(f.first,{uncertainty:'Changed decision payload'}), /idempotency conflict/)
    const row = await f.readArticle(f.first.article_id)
    assert.equal(row.public_version_id,version)
    assert.equal(row.capture_id,f.first.capture_id)
    assert.equal(row.capture_hash,f.first.capture_hash)
    assert.equal(row.evidence[0].span_start,2)
    assert.ok(normalizeReviewedPublicVersion(row))
    assert.equal(await f.scalar('select review_state from evidence_pipeline.article_captures where id=$1',[f.first.capture_id]),'pending')
  })
  await t.test('stable Story UUID binds actual canonical node and exact released member, not display grouping', async () => {
    await assert.rejects(f.bindStory([version],{subject:f.event_id}), /published canonical subject/)
    story_version=await f.bindStory([version])
    story_id=await f.scalar('select story_id from mip_private.reviewed_public_story_versions where public_version_id=$1',[story_version])
    const row=await f.readStory(story_id)
    assert.ok(normalizeReviewedPublicStoryVersion(row))
    assert.equal(row.subject_id,f.graph_node_id)
    assert.equal(row.subject_kind,'event')
    assert.equal(row.members[0].public_version_id,version)
    assert.equal(row.members[0].capture_id,f.first.capture_id)
    assert.equal(await f.bindStory([version]),story_version)
    await assert.rejects(f.bindStory([version],{reason:'Changed decision payload'}), /idempotency conflict/)
  })
  await t.test('pending newer capture cannot inherit approval or replace original public fields', async () => {
    correction=await f.ingest({ ...f.article,title:'PENDING_NEW_TITLE',summary:'PENDING_PRIVATE_CORRECTION' },'correction')
    const row=await f.readArticle(f.first.article_id)
    assert.equal(row.public_version_id,version)
    assert.equal(row.title,f.article.title)
    assert.equal(row.pending_revision,true)
    assert.ok(!JSON.stringify(row).includes('PENDING_'))
    await assert.rejects(f.bindArticle(correction,{predecessor:version,review:'correction-review',reason:'Correction'}), /capture must match existing published/)
  })
  await t.test('Source Report is explicitly permitted exact new capture with zero admitted propositions', async () => {
    await assert.rejects(f.bindArticle(correction,{kind:'source_report',predecessor:version,review:'report-review',reason:'Attributed update'}), /explicit admission/)
    const report=await f.bindArticle(correction,{kind:'source_report',claims:[],predecessor:version,review:'report-review',reason:'Attributed update; reconciliation pending'})
    const row=normalizeReviewedPublicVersion(await f.readArticle(f.first.article_id))
    assert.equal(row.public_version_id,report)
    assert.equal(row.title,'PENDING_NEW_TITLE')
    assert.equal(row.admission_kind,'source_report')
    assert.deepEqual(row.evidence,[])
    assert.equal(row.source_report.fetch_time,null)
    assert.equal(row.source_report.source_version_id,correction.capture_id)
    assert.equal(row.is_current_source_version,true)
    assert.equal(row.superseded_by_public_version_id,null)
    const older=normalizeReviewedPublicVersion(await f.readArticle(f.first.article_id,version))
    assert.equal(older.is_current_source_version,false)
    assert.equal(older.superseded_by_public_version_id,report)
    assert.notEqual(row.source_report.article_original_fetched_at,row.source_report.capture_retained_at)
    await assert.rejects(f.scalar('select mip_private.require_reviewed_public_article_version($1,$2,$3)',[report,correction.capture_id,correction.capture_hash]), /reviewed admitted public capture/)
  })
  await t.test('immutable rows, exact predecessor CAS and no rewrite/delete/truncate', async () => {
    await assert.rejects(f.bindArticle(f.first,{predecessor:version,review:'stale-review',reason:'Stale'}), /predecessor conflict/)
    for (const sql of ['update mip_private.reviewed_public_article_versions set review_ref=\'rewrite\'',
      'delete from mip_private.reviewed_public_article_evidence','truncate mip_private.reviewed_public_story_members']) {
      await assert.rejects(db.exec(sql), /append-only/)
    }
    await assert.rejects(f.bindStory([version],{predecessor:null,review:'stale-story'}), /predecessor conflict/)
  })
  await t.test('claim text/span/currentness mutations revoke exact historical version instead of silently reinterpreting it', async () => {
    await db.query('update public.claims set canonical_text=$1 where id=$2',['UNREVIEWED_CHANGED_TEXT',f.claim_id])
    assert.equal(await f.readArticle(f.first.article_id,version),null)
    assert.equal(await f.readStory(story_id),null)
    await db.query('update public.claims set canonical_text=$1 where id=$2',['A source reports a vessel arrival.',f.claim_id])
    assert.ok(await f.readStory(story_id))
    await db.query("update public.events set comparison_validation_state='pending_review' where id=$1",[f.event_id])
    assert.equal(await f.readStory(story_id),null)
    await db.query("update public.events set comparison_validation_state='approved' where id=$1",[f.event_id])
  })
  await t.test('source withdrawal removes head/history/report/story for both roles; private history survives', async () => {
    await db.query("update public.articles set source_status='withdrawn' where id=$1",[f.first.article_id])
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        assert.equal(await f.readArticle(f.first.article_id),null)
        assert.equal(await f.readArticle(f.first.article_id,version),null)
        assert.equal(await f.readStory(story_id),null)
        await assert.rejects(db.exec('select * from mip_private.reviewed_public_article_evidence'),/permission denied/)
      } finally { await db.exec('reset role') }
    }
    assert.equal(await f.scalar('select count(*)::int from evidence_pipeline.article_captures where article_id=$1',[f.first.article_id]),2)
    assert.equal(await f.scalar('select count(*)::int from mip_private.reviewed_public_article_versions where article_id=$1',[f.first.article_id]),2)
  })
})

test('public search covers frozen public fields and exact reviewed excerpts; private body and truncated negatives are denied',async t=>{
  const f=await createReviewedVersionFixture()
  t.after(()=>f.db.close())
  const excerpt='ReviewedBodySpanToken reports a recorded observation.'
  const sourceStart=Array.from(f.article.body_text.slice(0,f.article.body_text.indexOf(excerpt))).length
  const claim=await f.scalar("insert into public.claims(event_id,canonical_text,status,rule_version) values($1,$2,'active','sc-v2-event-projection') returning id",[f.event_id,excerpt])
  const surface=await f.scalar("insert into public.article_claims(article_id,claim_id,surface_text,char_start,char_end,evidence_source_field,evidence_excerpt,auditability_state) values($1,$2,$3,$4,$5,'body_text',$3,'verified_retained_source') returning id",[f.first.article_id,claim,excerpt,sourceStart,sourceStart+Array.from(excerpt).length])
  await f.bindArticle(f.first,{claims:[surface]})
  const search=query=>f.scalar('select public.search_reviewed_public_article_ids_v1($1,100)',[query])
  assert.deepEqual((await search('ReviewedBodySpanToken')).article_ids,[f.first.article_id])
  assert.deepEqual((await search('PRIVATE_BODY_ONLY_TOKEN')).article_ids,[])
  assert.equal((await search('PRIVATE_BODY_ONLY_TOKEN')).complete,true)
  await f.bindArticle(f.second,{kind:'source_report',claims:[],review:'second-report'})
  const exceeded=await f.scalar('select public.search_reviewed_public_article_ids_v1($1,1)',['source report'])
  assert.equal(exceeded.complete,false)
  assert.deepEqual(exceeded.article_ids,[])
  assert.deepEqual((await search('ReviewedBodySpanToken')).article_ids,[f.first.article_id])
})

test('invalidated latest Story/source head never resurrects older visible Source Report history', async t => {
  const f=await createReviewedVersionFixture()
  t.after(()=>f.db.close())
  const report=await f.bindArticle(f.first,{kind:'source_report',claims:[],review:'report-first'})
  const olderStory=await f.bindStory([report],{review:'story-report-first'})
  const storyId=await f.scalar('select story_id from mip_private.reviewed_public_story_versions where public_version_id=$1',[olderStory])
  const proposition=await f.bindArticle(f.first,{predecessor:report,review:'proposition-next',reason:'Explicit proposition review'})
  await f.bindStory([proposition],{predecessor:olderStory,review:'story-proposition-next',reason:'Exact released proposition membership'})
  await f.db.query("update public.article_claims set is_current=false where id=$1",[f.article_claim_id])
  assert.equal(await f.readArticle(f.first.article_id),null)
  assert.equal(await f.readStory(storyId),null)
  assert.ok(await f.readArticle(f.first.article_id,report))
  assert.ok(await f.readStory(storyId,olderStory))
  const directory=await f.scalar('select public.read_reviewed_public_story_directory_v1(null,30)')
  assert.deepEqual(directory.stories,[])
  assert.equal(directory.complete,true)
  for (const role of ['anon','authenticated']) {
    await f.db.exec(`set role ${role}`)
    try {
      assert.equal(await f.scalar('select count(*)::int from public.news_reviewed_articles_public'),0)
      await assert.rejects(f.db.exec('select title from public.articles'),/permission denied/)
      await assert.rejects(f.db.exec('select * from public.comparison_public'),/permission denied/)
    } finally {await f.db.exec('reset role')}
  }
})
