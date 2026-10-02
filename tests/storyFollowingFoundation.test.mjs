import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { storyFollowingFixture } from './storyFollowingFixture.mjs'
import { normalizePublicStoryContext } from '../src/lib/storyFollowingClient.js'

test('public Story Following runs actual canonical SQL and keeps personal state private', async t => {
  const f = await storyFollowingFixture(); t.after(() => f.db.close())
  const { db, viewer, secondUser, v1, follow } = f
  const read = (user = viewer) => follow('read', { user_id: user, story_id: v1.story_id })
  const input = (story, previous = null, user = viewer) => ({ user_id: user, story_id: story.story_id,
    subject_type: story.subject_type, subject_id: story.subject_id, public_version_id: story.public_version_id,
    event_id: randomUUID(), previous_event_id: previous })
  let saved, v2, v3, declaration
  await t.test('explicit subscribe binds stable reviewed story/subject and exact displayed version', async () => {
    assert.equal((await read()).subscription, null)
    const request = input(v1); saved = await follow('subscribe', request)
    assert.deepEqual(await follow('subscribe', request), saved)
    assert.equal(saved.acknowledged_public_version_id, v1.public_version_id)
    assert.equal(saved.subject_id, f.subject)
    assert.equal((await read(secondUser)).subscription, null)
    await assert.rejects(follow('subscribe', { ...input(v1, saved.current_event_id), subject_id: randomUUID() }), e => e.code === '22023')
    await assert.rejects(follow('subscribe', { ...input(v1, saved.current_event_id), public_version_id: randomUUID() }), e => e.code === '22023')
    await assert.rejects(follow('subscribe', { ...input(v1), user_id: randomUUID() }), e => e.code === '42501')
  })
  await t.test('version advance without material ownership creates no unread material claim', async () => {
    v2 = await f.storyVersion([f.first], v1)
    const state = await read()
    assert.equal(state.version_advanced, true); assert.equal(state.unclassified_version_changes, true)
    assert.equal(state.unread_count, 0); assert.deepEqual(state.changes, [])
    await assert.rejects(f.declare(v2, v1, f.first), e => e.code === '22023')
  })
  await t.test('publication owner declares exact admitted evidence difference; service cannot', async () => {
    const next = await f.source('Second'); v3 = await f.storyVersion([f.first, next], v2)
    declaration = await f.declare(v3, v2, next)
    const state = await read(); assert.equal(state.unread_count, 1)
    assert.equal(state.changes[0].material_change_id, declaration.data.material_change_id)
    assert.equal(state.changes[0].materiality_owner, 'reviewed_publication_owner')
    assert.equal(Object.hasOwn(state.changes[0], 'declared_by'), false)
    const direct = i => db.query('select mip_private.declare_public_story_material_change_v1($1::jsonb)', [JSON.stringify(i)])
    assert.deepEqual((await direct(declaration.input)).rows[0].declare_public_story_material_change_v1, declaration.data)
    await assert.rejects(direct({ ...declaration.input, reason: 'Mutated declaration.' }), e => e.code === '23505')
    await assert.rejects(direct({ ...declaration.input, material_change_id: randomUUID(), evidence_refs: [randomUUID()] }), e => e.code === '22023')
    await assert.rejects(db.query('update mip_private.public_story_material_changes set reason=$1', ['rewritten']), e => e.code === '42501')
    await db.exec('set role service_role')
    try { await assert.rejects(direct(declaration.input), e => e.code === '42501') } finally { await db.exec('reset role') }
    await db.exec('set role anon')
    try {
      const context = (await db.query('select public.read_reviewed_public_story_context_v1($1) r', [v1.story_id])).rows[0].r
      assert.ok(normalizePublicStoryContext(context)); assert.equal(context.material_changes.length, 1)
      assert.equal(context.evidence_versions[0].admission_kind, 'source_report')
      await assert.rejects(db.query('select declared_by from mip_private.public_story_material_changes'), e => e.code === '42501')
      await assert.rejects(db.query('select * from mip_private.public_story_follows'), e => e.code === '42501')
      await assert.rejects(db.query('select public.mip_public_story_following_v1($1,$2)', ['list', JSON.stringify({ user_id: viewer })]), e => e.code === '42501')
    } finally { await db.exec('reset role') }
  })
  await t.test('acknowledgement uses displayed older version and leaves later material change unread', async () => {
    saved = await follow('acknowledge', input(v2, saved.current_event_id))
    assert.equal(saved.acknowledged_public_version_id, v2.public_version_id)
    assert.equal((await read()).unread_count, 1); assert.equal((await read()).unclassified_version_changes, false)
    await assert.rejects(follow('acknowledge', input(v1, saved.current_event_id)), e => e.code === '40001')
    await assert.rejects(follow('acknowledge', input(v3, null)), e => e.code === '40001')
    assert.equal((await read(secondUser)).subscription, null)
  })
  await t.test('CAS, own cursor, immutable event and explicit unsubscribe govern private state', async () => {
    const own = await follow('subscribe', input(v1, null, secondUser))
    await assert.rejects(follow('acknowledge', { ...input(v3, saved.current_event_id, secondUser), event_id: saved.current_event_id }), e => e.code === '23505')
    await assert.rejects(follow('list', { user_id: secondUser, after: randomUUID() }), e => e.code === '22023')
    saved = await follow('unsubscribe', { user_id: viewer, story_id: v1.story_id, event_id: randomUUID(), previous_event_id: saved.current_event_id })
    assert.equal((await read()).unread_count, 0)
    assert.equal((await follow('list', { user_id: viewer })).items.length, 0)
    assert.equal((await read(secondUser)).subscription.current_event_id, own.current_event_id)
    saved = await follow('subscribe', input(v2, saved.current_event_id))
  })
  await t.test('latest withdrawn source revokes durable follow; no old-head fallback or auto-resume', async () => {
    const latestMember = v3.members.at(-1)
    await db.query("update public.articles set source_status='withdrawn' where id=$1", [latestMember.article_id])
    const state = await read(); assert.equal(state.story_status, 'revoked'); assert.equal(state.subscription.status, 'revoked')
    assert.equal(state.head_public_version_id, null); assert.equal(state.unread_count, 0); assert.deepEqual(state.changes, [])
    assert.equal((await follow('list', { user_id: viewer })).items.length, 0)
    assert.deepEqual(await follow('subscribe', input(v2, state.subscription.current_event_id)), { error_code: 'access_denied' })
    await db.query("update public.articles set source_status='active' where id=$1", [latestMember.article_id])
    assert.equal((await read()).subscription.status, 'revoked')
    assert.equal((await read()).unread_count, 0)
    saved = await follow('subscribe', input(v2, state.subscription.current_event_id))
    assert.equal((await read()).unread_count, 1)
  })
  await t.test('explicit service revocation persists and no receipt replay alters another account', async () => {
    const revoked = await follow('revoke', { user_id: viewer, story_id: v1.story_id, event_id: randomUUID(), previous_event_id: saved.current_event_id })
    assert.equal((await read()).subscription.status, 'revoked')
    await assert.rejects(follow('subscribe', input(v3, saved.current_event_id)), e => e.code === '40001')
    assert.equal((await read(secondUser)).subscription.status, 'revoked') // source-owner withdrawal revoked every affected active preference even without a foreground read.
    assert.ok(revoked.current_event_id)
  })
})
