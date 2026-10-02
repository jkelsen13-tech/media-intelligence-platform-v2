import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createMaterialHistoryFixture } from './storyMaterialHistoryFixture.mjs'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { installStoryFollowingFixture } from '../scripts/storyFollowingPackage.mjs'
import { evaluateNewsStoryState, reconstructNewsStateHistory, newsSourceReports } from '../src/lib/newsStoryState.js'

const hour = 3600000
const ago = hours => new Date(Date.now() - hours * hour).toISOString()
const complete = 'mip_private.public_story_material_history_is_complete($1,$2)'

test('frozen670 actual public SQL/SDK reproduces the unsafe phase reset', async t => {
  const proposalSource = execFileSync('git', ['show', '670efb8:supabase/source-proposals/story_following_v1.sql'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  const f = await createMaterialHistoryFixture(t, { proposalSource })
  const origin = Date.now() - 6.5 * hour
  await f.append(0, { effectiveAt: new Date(origin).toISOString() })
  const last = await f.append(1, { effectiveAt: new Date(origin + 5.5 * hour).toISOString() })
  const now = Date.now(), full = await f.context(last.story.public_version_id)
  assert.equal(full.error, null); assert.equal(full.data.has_more, false)
  assert.equal(evaluateNewsStoryState(full.data, now).state, 'Developing')
  await f.withdraw(0)
  const omitted = await f.context(last.story.public_version_id)
  assert.equal(omitted.error, null); assert.equal(omitted.data.has_more, false)
  assert.equal(evaluateNewsStoryState(omitted.data, now).state, 'Breaking')
  t.diagnostic(JSON.stringify({ witness: 'frozen670 actual SQL→public SDK→production policy', full: 'Developing', omitted: 'Breaking', has_more: omitted.data.has_more }))
})

test('withdrawn first declaration cannot reset the production Breaking phase', async t => {
  const f = await createMaterialHistoryFixture(t)
  const origin = Date.now() - 6.5 * hour
  const first = await f.append(0, { effectiveAt: new Date(origin).toISOString(), reason: 'WITHHELD_FIRST_DECLARATION_TOKEN' })
  const last = await f.append(1, { effectiveAt: new Date(origin + 5.5 * hour).toISOString() })
  const now = Date.now()
  const full = await f.context(last.story.public_version_id)
  assert.equal(full.error, null)
  assert.equal(full.data.has_more, false)
  assert.equal(evaluateNewsStoryState(full.data, now).state, 'Developing')
  await f.withdraw(0)
  const partial = await f.context(last.story.public_version_id)
  assert.equal(partial.error, null)
  assert.deepEqual(partial.data.material_changes.map(c => c.material_change_id), [last.change.material_change_id])
  assert.doesNotMatch(JSON.stringify(partial), new RegExp(`WITHHELD_FIRST_DECLARATION_TOKEN|${first.change.material_change_id}|${first.sourceVersion}|PRIVATE_BODY_ONLY_TOKEN|declared_by|request_fingerprint`))
  assert.equal(partial.data.has_more, true)
  assert.equal(evaluateNewsStoryState(partial.data, now).reason_code, 'incomplete_material_change_history')
  assert.deepEqual(reconstructNewsStateHistory(partial.data, now), [])
})

test('withdrawn intermediate declaration makes retained public history incomplete without hidden fields', async t => {
  const f = await createMaterialHistoryFixture(t)
  const first = await f.append(0, { effectiveAt: ago(8) })
  const middle = await f.append(1, { effectiveAt: ago(5), reason: 'WITHHELD_MIDDLE_DECLARATION_TOKEN' })
  const last = await f.append(2, { effectiveAt: ago(1) })
  assert.equal((await f.context()).data.material_changes.length, 3)
  await f.withdraw(1)
  const context = await f.context()
  assert.equal(context.error, null); assert.equal(context.data.has_more, true)
  assert.deepEqual(context.data.material_changes.map(c => c.material_change_id), [first.change.material_change_id,last.change.material_change_id])
  assert.equal(evaluateNewsStoryState(context.data, Date.now()).reason_code, 'incomplete_material_change_history')
  assert.doesNotMatch(JSON.stringify(context), new RegExp(`WITHHELD_MIDDLE_DECLARATION_TOKEN|${middle.change.material_change_id}|${middle.sourceVersion}|PRIVATE_BODY_ONLY_TOKEN|declared_by|request_fingerprint`))
})

test('mixed exact evidence refuses the entire withdrawn successor envelope without leaking its still-public member', async t => {
  const f = await createMaterialHistoryFixture(t)
  const first = await f.append(0, { effectiveAt: ago(6.5), members: [f.sourceVersions[0],f.sourceVersions[1]], reason: 'WITHHELD_MIXED_DECLARATION_TOKEN' })
  await f.append(2, { effectiveAt: ago(1) })
  const full = await f.context()
  assert.equal(full.data.has_more, false); assert.equal(full.data.evidence_versions.length, 3)
  await f.withdraw(0)
  assert.ok(await f.readArticle(f.second.article_id,f.sourceVersions[1]))
  const context = await f.context()
  assert.equal(context.error, null); assert.equal(context.data.has_more, true)
  assert.deepEqual(context.data.evidence_versions.map(v => v.public_version_id), [f.sourceVersions[2]])
  assert.doesNotMatch(JSON.stringify(context), new RegExp(`WITHHELD_MIXED_DECLARATION_TOKEN|${first.change.material_change_id}|${f.sourceVersions[0]}|${f.sourceVersions[1]}`))
  assert.equal(evaluateNewsStoryState(context.data, Date.now()).reason_code, 'incomplete_material_change_history')
})

test('actual mixed-evidence byte-shape cap preserves incomplete coverage when fewer than 100 declarations exceed 100 evidence versions', async t => {
  const f = await createMaterialHistoryFixture(t)
  let prior = f.sourceVersions.slice(0,2)
  for (let index=0; index<51; index++) {
    const next = []
    for (let source=0; source<2; source++) next.push(await f.bindArticle(f.sources[source], { kind: 'source_report', claims: [], review: randomUUID(), predecessor: prior[source], reason: 'Synthetic retained report evidence version.' }))
    await f.append(0, { effectiveAt: ago(1), sourceVersion: next[0], members: next })
    prior = next
  }
  const context = await f.context()
  assert.equal(context.error, null); assert.equal(context.data.has_more, true)
  assert.equal(context.data.material_changes.length, 50)
  assert.equal(context.data.evidence_versions.length, 100)
  assert.equal(evaluateNewsStoryState(context.data, Date.now()).reason_code, 'incomplete_material_change_history')
  assert.deepEqual(reconstructNewsStateHistory(context.data, Date.now()), [])
  await f.db.exec('set role anon')
  // Every declared successor is authorized. The boolean continuity proof is
  // complete; the context's separate evidence bound honestly marks truncation.
  try { assert.equal(await f.scalar('select ' + complete, [f.storyId,context.data.story.public_version_id]), true) }
  finally { await f.db.exec('reset role') }
})

test('private completeness proof and public context both stop at 100 relevant declarations', async t => {
  const f = await createMaterialHistoryFixture(t)
  for (let index=0; index<101; index++) await f.append(index%2, { effectiveAt: ago(1) })
  const context = await f.context()
  assert.equal(context.error, null); assert.equal(context.data.has_more, true)
  assert.equal(context.data.material_changes.length, 100)
  assert.equal(evaluateNewsStoryState(context.data, Date.now()).reason_code, 'incomplete_material_change_history')
  await f.db.exec('set role anon')
  try { assert.equal(await f.scalar('select ' + complete, [f.storyId,context.data.story.public_version_id]), false) }
  finally { await f.db.exec('reset role') }
})

test('no declaration is honest unknown coverage and undeclared version gaps are not missing declared history', async t => {
  const f = await createMaterialHistoryFixture(t)
  for (const selected of [f.initial, (await f.append(0, { declaration: false })).story]) {
    const context = await f.context(selected.public_version_id)
    assert.equal(context.error, null); assert.equal(context.data.has_more, false)
    assert.deepEqual(context.data.material_changes, [])
    assert.equal(evaluateNewsStoryState(context.data, Date.now()).reason_code, 'no_declared_reviewed_proposition_material_change')
  }
  const declared = await f.append(1, { effectiveAt: ago(1) })
  const context = await f.context(declared.story.public_version_id)
  assert.equal(context.data.has_more, false)
  assert.equal(evaluateNewsStoryState(context.data, Date.now()).state, 'Breaking')
})

test('selected historical scope excludes later withdrawn declarations and current head never falls back', async t => {
  const f = await createMaterialHistoryFixture(t)
  const first = await f.append(0, { effectiveAt: ago(8) })
  await f.append(1, { effectiveAt: ago(5) })
  const last = await f.append(2, { effectiveAt: ago(1) })
  await f.withdraw(1)
  const historical = await f.context(first.story.public_version_id)
  assert.equal(historical.error, null); assert.equal(historical.data.has_more, false)
  assert.deepEqual(historical.data.material_changes.map(c => c.material_change_id), [first.change.material_change_id])
  assert.equal((await f.context()).data.has_more, true)
  assert.equal((await f.context(f.initial.public_version_id)).data.has_more, false)
  await f.withdraw(2)
  assert.equal((await f.context()).data, null)
  assert.equal((await f.context(last.story.public_version_id)).data, null)
  // Exact old body is separately authorized; current-head RLS hides its material
  // rows, so completeness must account for that filtering rather than inventing
  // an empty history. No currently forbidden payload becomes public.
  const retained = await f.context(first.story.public_version_id)
  assert.equal(retained.error, null); assert.equal(retained.data.story.public_version_id, first.story.public_version_id)
  assert.deepEqual(retained.data.material_changes, []); assert.equal(retained.data.has_more, true)
  assert.equal(evaluateNewsStoryState(retained.data, Date.now()).reason_code, 'incomplete_material_change_history')
  await f.withdraw(0)
  assert.equal((await f.context(first.story.public_version_id)).data, null)
})

test('source-report correction with withheld predecessor identity retains attribution and complete declared coverage', async t => {
  const f = await createMaterialHistoryFixture(t)
  const report = await f.bindArticle(f.second, { kind: 'source_report', review: randomUUID(), claims: [], predecessor: f.sourceVersions[1], reason: 'Synthetic attributed replacement.' })
  await f.withdraw(3)
  const last = await f.append(1, { effectiveAt: ago(1), kind: 'correction', novelty: 'correction', sourceVersion: report })
  const context = await f.context(last.story.public_version_id)
  assert.equal(context.error, null); assert.equal(context.data.has_more, false)
  assert.equal(context.data.material_changes.length, 1)
  assert.equal(evaluateNewsStoryState(context.data, Date.now()).reason_code, 'latest_material_change_is_attributed_report_pending_verification')
  const reports = newsSourceReports(context.data, Date.now())
  assert.equal(reports[0].label, 'SOURCE REPORT')
  assert.equal(reports[0].verification_label, 'Pending MIP verification / reconciliation')
  assert.doesNotMatch(JSON.stringify(context), new RegExp(`${f.sourceVersions[3]}|PRIVATE_BODY_ONLY_TOKEN|declared_by|request_fingerprint`))
})

test('source-report correction cannot hide a withdrawn earlier declaration or acquire Breaking', async t => {
  const f = await createMaterialHistoryFixture(t)
  const first = await f.append(0, { effectiveAt: ago(6.5), reason: 'WITHHELD_REPORT_ANCESTRY_TOKEN' })
  const report = await f.bindArticle(f.second, { kind: 'source_report', review: randomUUID(), claims: [], predecessor: f.sourceVersions[1], reason: 'Synthetic attributed correction.' })
  const last = await f.append(1, { effectiveAt: ago(1), kind: 'correction', novelty: 'correction', sourceVersion: report })
  await f.withdraw(0)
  const context = await f.context(last.story.public_version_id)
  assert.equal(context.data.has_more, true)
  assert.equal(evaluateNewsStoryState(context.data, Date.now()).reason_code, 'incomplete_material_change_history')
  assert.equal(newsSourceReports(context.data, Date.now())[0].label, 'SOURCE REPORT')
  assert.doesNotMatch(JSON.stringify(context), new RegExp(`WITHHELD_REPORT_ANCESTRY_TOKEN|${first.change.material_change_id}|${first.sourceVersion}`))
})

test('boolean helper denies unknown, mismatched and withdrawn selected versions without a private-state oracle', async t => {
  const f = await createMaterialHistoryFixture(t)
  const first = await f.append(0, { effectiveAt: ago(6.5) })
  const last = await f.append(1, { effectiveAt: ago(1) })
  const otherVersion = await f.bindStory([f.sourceVersions[1]], { type: 'article', subject: f.second.article_id, review: randomUUID() })
  assert.equal((await f.context('not-a-uuid')).error.code, 'invalid_request')
  assert.equal((await f.context(randomUUID())).data, null)
  assert.equal((await f.context(otherVersion)).data, null)
  const owner = await f.scalar("select pg_get_userbyid(proowner) from pg_proc where oid='mip_private.public_story_material_history_is_complete(uuid,uuid)'::regprocedure")
  assert.equal(owner, await f.scalar("select pg_get_userbyid(relowner) from pg_class where oid='mip_private.reviewed_public_story_versions'::regclass"))
  const actor = randomUUID(), privateActor = randomUUID()
  await f.db.query('insert into public.mip_profiles values($1),($2)', [actor,privateActor])
  const foreignSource = await f.bindArticle(f.second, { kind: 'source_report', review: randomUUID(), claims: [], predecessor: f.sourceVersions[1], reason: 'Synthetic unrelated admitted report.' })
  const foreignVersion = await f.bindStory([foreignSource], { type: 'article', subject: f.second.article_id, review: randomUUID(), predecessor: otherVersion, reason: 'Synthetic unrelated story update.' })
  const foreignId = await f.scalar('select story_id from mip_private.reviewed_public_story_versions where public_version_id=$1', [foreignVersion])
  const foreign = await f.readStory(foreignId, foreignVersion)
  const beforeUnrelatedDeclaration = await f.context()
  await f.scalar('select mip_private.declare_public_story_material_change_v1($1::jsonb)', [JSON.stringify({ material_change_id: randomUUID(), story_id: foreignId, public_version_id: foreignVersion,
    previous_public_version_id: otherVersion, effective_at: ago(1), reason: 'UNRELATED_DECLARATION_PRIVATE_SCOPE_TOKEN', evidence_refs: [foreignSource], review_refs: [foreign.review_ref],
    policy_version: foreign.policy_version, kind: 'update', importance: 'major', novelty: 'genuinely_new', event_state: 'active' })])
  assert.deepEqual(await f.context(), beforeUnrelatedDeclaration)
  assert.doesNotMatch(JSON.stringify(beforeUnrelatedDeclaration), new RegExp(`UNRELATED_DECLARATION_PRIVATE_SCOPE_TOKEN|${foreignId}|${foreignVersion}`))
  for (const role of ['anon','authenticated','service_role']) {
    await f.db.exec('set role ' + role)
    try {
      assert.equal(await f.scalar('select ' + complete, [f.storyId,last.story.public_version_id]), true)
      for (const [story, version] of [[randomUUID(),last.story.public_version_id],[f.storyId,randomUUID()],[f.storyId,otherVersion],[null,null]])
        assert.equal(await f.scalar('select ' + complete, [story,version]), false)
      if (role !== 'service_role') {
        await assert.rejects(f.db.query('select declared_by,request_fingerprint from mip_private.public_story_material_changes'), e => e.code === '42501')
        await assert.rejects(f.db.query('select * from mip_private.public_story_follows'), e => e.code === '42501')
      }
    } finally { await f.db.exec('reset role') }
  }
  const before = await f.context()
  await f.db.exec('set role service_role')
  try { await f.scalar('select public.mip_public_story_following_v1($1,$2::jsonb)', ['subscribe', JSON.stringify({ user_id: privateActor, story_id: f.storyId, subject_type: last.story.subject_type, subject_id: last.story.subject_id, public_version_id: last.story.public_version_id, event_id: randomUUID(), previous_event_id: null })]) }
  finally { await f.db.exec('reset role') }
  assert.deepEqual(await f.context(), before)
  assert.doesNotMatch(JSON.stringify(before), new RegExp(`${actor}|${privateActor}`))
  await f.withdraw(0)
  await f.db.exec('set role anon')
  try { assert.equal(await f.scalar('select ' + complete, [f.storyId,first.story.public_version_id]), false) }
  finally { await f.db.exec('reset role') }
  await f.withdraw(1)
  await f.db.exec('set role anon')
  try { assert.equal(await f.scalar('select ' + complete, [f.storyId,last.story.public_version_id]), false) }
  finally { await f.db.exec('reset role') }
})

test('checked publication owner proves completeness under FORCE RLS without superuser or bypass privileges', async t => {
  const f = await createReviewedVersionFixture(); t.after(() => f.db.close())
  const third = await f.ingest({ ...f.article, url: 'https://example.invalid/nonbypass-history', outlet: 'Synthetic source C' })
  await f.db.query("update public.articles set reader_state='eligible' where id=$1", [third.article_id])
  await f.db.query("insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id) values($1,'Synthetic vessel','event',1,$2)", [third.article_id,f.graph_node_id])
  const versions = []
  for (const source of [f.first,f.second,third]) versions.push(await f.bindArticle(source, { kind: 'source_report', claims: [], review: randomUUID() }))
  const stories = []
  for (const version of versions) {
    const id = await f.bindStory([version], { predecessor: stories.at(-1)?.public_version_id ?? null, reason: stories.length ? 'Synthetic owner history update.' : null, review: randomUUID() })
    const sid = await f.scalar('select story_id from mip_private.reviewed_public_story_versions where public_version_id=$1', [id])
    stories.push(await f.readStory(sid, id))
  }
  // PostgreSQL's bootstrap superuser cannot be demoted. Install the actual pack
  // as a separate, explicitly non-bypass existing owner instead; do not change
  // the helper body or public publication-reader predicates for this fixture.
  await f.db.exec(`create table public.mip_profiles(id uuid primary key);
    create role synthetic_history_owner nologin nosuperuser nobypassrls;
    grant usage,create on schema public to synthetic_history_owner;
    grant execute on function public.read_reviewed_public_story_v1(uuid,uuid) to synthetic_history_owner;
    grant execute on function mip_private.public_story_version_is_visible(uuid) to synthetic_history_owner with grant option;
    alter schema mip_private owner to synthetic_history_owner;
    alter table mip_private.reviewed_public_stories owner to synthetic_history_owner;
    alter table mip_private.reviewed_public_story_versions owner to synthetic_history_owner;
    alter table mip_private.reviewed_public_story_members owner to synthetic_history_owner;
    alter table public.mip_profiles owner to synthetic_history_owner;
    alter table public.articles owner to synthetic_history_owner;
    alter table public.nodes owner to synthetic_history_owner;
    set role synthetic_history_owner;`)
  try {
    await installStoryFollowingFixture(f.db)
    assert.deepEqual((await f.db.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0], { rolsuper: false, rolbypassrls: false })
    assert.equal(await f.scalar("select pg_get_userbyid(proowner) from pg_proc where oid='mip_private.public_story_material_history_is_complete(uuid,uuid)'::regprocedure"), 'synthetic_history_owner')
    assert.equal(await f.scalar("select relforcerowsecurity from pg_class where oid='mip_private.public_story_material_changes'::regclass"), true)
    // Explicit synthetic owner fixture declarations reference actual adjacent,
    // already admitted versions. This test isolates FORCE RLS authority; all
    // production declaration validation runs in the other regression fixtures.
    for (let index=1; index<stories.length; index++) await f.db.query(`insert into mip_private.public_story_material_changes(material_change_id,story_id,public_version_id,previous_public_version_id,
      subject_type,subject_id,sequence,effective_at,declared_by,reason,evidence_refs,review_refs,policy_version,kind,importance,novelty,event_state,request_fingerprint)
      values($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),current_user,'Synthetic owner fixture',$8,$9,$10,'update','major','genuinely_new','active','fixture')`,
      [randomUUID(),stories[index].story_id,stories[index].public_version_id,stories[index-1].public_version_id,stories[index].subject_type,stories[index].subject_id,index+1,[versions[index]],[stories[index].review_ref],stories[index].policy_version])
  } finally { await f.db.exec('reset role') }
  const latest = stories.at(-1)
  await f.db.exec('set role anon')
  try { assert.equal(await f.scalar('select ' + complete, [latest.story_id,latest.public_version_id]), true) }
  finally { await f.db.exec('reset role') }
  await f.db.query("update public.articles set source_status='withdrawn' where id=$1", [f.second.article_id])
  await f.db.exec('set role anon')
  try {
    assert.equal(await f.scalar('select ' + complete, [latest.story_id,latest.public_version_id]), false)
    const context = await f.scalar('select public.read_reviewed_public_story_context_v1($1,$2)', [latest.story_id,latest.public_version_id])
    assert.equal(context.has_more, true); assert.equal(context.material_changes.length, 1)
  } finally { await f.db.exec('reset role') }
})
