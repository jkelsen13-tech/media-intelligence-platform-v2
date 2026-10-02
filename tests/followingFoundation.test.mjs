import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createFollowingHandler } from '../supabase/source-proposals/investigationFollowingHandler.mjs'
import { createInvestigationFollowingClient } from '../src/lib/investigationFollowingClient.js'

const read = p => readFile(new URL(p, import.meta.url), 'utf8')
test('private Following binds retained identities, declared differences and authorized cursors', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const uid = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), iid = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2),($3)', [uid, viewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1', 'investigation_workspace_batch_v1', 'investigation_reference_integrity_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  await db.exec(await read('../supabase/source-proposals/investigation_following_v1.sql'))
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), obs = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1'), follow = rpc('mip_investigation_following_v1')
  const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0]
  const subject = await scalar("insert into public.nodes(type,label) values('event','Synthetic subject') returning id")
  const add = async summary => {
    await intake('enqueue', { run_id: 'following-fixture', article: { url: 'https://example.org/following', title: 'Synthetic', outlet: 'Fixture', summary, published_at: '2010-01-01T00:00:00Z' } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const capture = await add('A report.')
  const candidate = await intake('candidate', { capture_id: capture.capture_id, candidate_key: 'following', candidate_kind: 'claim', statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', event_node_id: subject, extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  let observation = await obs('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const state = { question: 'What changed?', scope_note: 'Synthetic private retained scope.', canonical_subject: { type: 'graph_node', id: subject }, time_range: { from: null, to: null, meaning: 'Unknown.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
  const put = (prior, s = state, o = observation, id = iid) => ws('put', { investigation_id: id, version_id: randomUUID(), previous_version_id: prior?.id ?? null, observation_id: o.id, state: s, change_reason: 'Synthetic revision.' })
  const grant = (user, role) => ws('set_access', { investigation_id: iid, user_id: user, access_role: role, reason: 'Synthetic assignment.' })
  await db.exec('set role service_role')
  const v1 = await put(null); await grant(uid, 'reviewer'); await grant(viewer, 'viewer')
  const get = (user = viewer, limit = 20) => follow('read', { user_id: user, investigation_id: iid, limit })
  const actionInput = (version = v1, previous = null, user = viewer) => ({ user_id: user, investigation_id: iid, event_id: randomUUID(), previous_event_id: previous, version_id: version.id, subject_id: subject })
  const subscriptionInput = actionInput(); let current, v2, v3, v4

  await t.test('viewer subscribe is explicit, idempotent, privately anchored and separate from review', async () => {
    assert.equal((await get()).subscription, null)
    current = await follow('subscribe', subscriptionInput)
    assert.equal(current.status, 'active'); assert.equal(current.subject.id, subject); assert.equal(current.publicly_eligible, false)
    assert.deepEqual(await follow('subscribe', subscriptionInput), current)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_review_receipts'), 0)
    assert.equal((await get(uid)).subscription, null)
    await assert.rejects(follow('subscribe', { ...subscriptionInput, subject_id: randomUUID(), event_id: randomUUID(), previous_event_id: current.current_event_id }), e => e.code === '22023')
    await assert.rejects(follow('subscribe', { ...subscriptionInput, user_id: outsider }), e => e.code === '42501')
    await assert.rejects(follow('subscribe', { ...subscriptionInput, version_id: randomUUID(), event_id: randomUUID(), previous_event_id: current.current_event_id }), e => e.code === '22023')
    await assert.rejects(follow('subscribe', { ...subscriptionInput, subject_id: randomUUID() }), e => e.code === '23505')
  })
  await t.test('unclassified version advance remains visible; no unchanged transition can be declared material', async () => {
    v2 = await put(v1)
    const b = await get(); assert.equal(b.version_advanced, true); assert.equal(b.unclassified_version_changes, true); assert.deepEqual(b.changes, [])
    assert.equal(b.coverage, 'registered_material_changes_only')
    await assert.rejects(follow('register_material_change', { user_id: uid, investigation_id: iid, change_id: randomUUID(), before_version_id: v1.id, after_version_id: v2.id, materiality_reason: 'Empty is not proof.' }), e => e.code === '22023')
  })
  let declaration
  await t.test('exact nonempty retained difference requires authorized reviewer declaration and immutable reason', async () => {
    v3 = await put(v2, { ...state, unresolved_questions: ['Was the retained report corrected?'] })
    const input = { user_id: uid, investigation_id: iid, change_id: randomUUID(), before_version_id: v2.id, after_version_id: v3.id, materiality_reason: 'Explicit synthetic reviewer declaration; not verified truth.' }
    await assert.rejects(follow('register_material_change', { ...input, user_id: viewer }), e => e.code === '42501')
    declaration = await follow('register_material_change', input)
    assert.equal(declaration.before_observation_id, observation.id); assert.equal(declaration.after_observation_id, observation.id)
    assert.equal(declaration.changes.definition_changes.unresolved_questions_changed, true)
    assert.equal(Object.hasOwn(declaration, 'declared_by'), false)
    assert.deepEqual(await follow('register_material_change', input), declaration)
    await assert.rejects(follow('register_material_change', { ...input, materiality_reason: 'Changed reason.' }), e => e.code === '23505')
    await assert.rejects(follow('register_material_change', { ...input, change_id: randomUUID(), before_version_id: v1.id }), e => e.code === '22023')
    await assert.rejects(follow('register_material_change', { ...input, change_id: randomUUID() }), e => e.code === '23505')
    assert.equal((await get()).changes[0].id, declaration.id)
  })
  await t.test('late correction uses saved observation pointers and bounded registered changes', async () => {
    await add('A corrected report.')
    observation = await obs('observe', { observation_id: randomUUID(), previous_observation_id: observation.id, candidate_ids: [candidate] })
    v4 = await put(v3, v3.state)
    const c = await follow('register_material_change', { user_id: uid, investigation_id: iid, change_id: randomUUID(), before_version_id: v3.id, after_version_id: v4.id, materiality_reason: 'Retained late correction requires reconsideration.' })
    assert.ok(c.changes.evidence_changes.length > 0)
    assert.equal(c.after_observation_id, observation.id)
    const b = await get(viewer, 1); assert.equal(b.has_more, true); assert.equal(b.changes.length, 1); assert.equal(b.changes[0].after_version_id, v3.id)
  })
  await t.test('exact displayed acknowledgment preserves later changes and never advances review or other users', async () => {
    await ws('mark_review', { user_id: uid, investigation_id: iid, version_id: v4.id, receipt_id: randomUUID(), previous_receipt_id: null })
    assert.equal((await get()).subscription.acknowledged_version_id, v1.id)
    const input = actionInput(v3, current.current_event_id)
    current = await follow('acknowledge', input)
    assert.deepEqual(await follow('acknowledge', input), current)
    const b = await get(); assert.equal(b.subscription.acknowledged_version_id, v3.id); assert.equal(b.changes.length, 1); assert.equal(b.changes[0].after_version_id, v4.id)
    assert.equal(b.unclassified_version_changes, false)
    await assert.rejects(follow('acknowledge', actionInput(v1, current.current_event_id)), e => e.code === '40001')
    await assert.rejects(follow('acknowledge', actionInput(v4, subscriptionInput.event_id)), e => e.code === '40001')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_review_receipts'), 1)
  })
  await t.test('unsubscribe and explicit resubscribe share an immutable compare-and-swap history', async () => {
    const input = { user_id: viewer, investigation_id: iid, event_id: randomUUID(), previous_event_id: current.current_event_id }
    current = await follow('unsubscribe', input)
    assert.deepEqual(await follow('unsubscribe', input), current); assert.deepEqual((await get()).changes, [])
    assert.deepEqual((await follow('list', { user_id: viewer })).items, [])
    await assert.rejects(follow('acknowledge', actionInput(v4, current.current_event_id)), e => e.code === '22023')
    current = await follow('subscribe', actionInput(v3, current.current_event_id))
    assert.equal(current.anchor_version_id, v1.id); assert.equal((await get()).changes.length, 1)
  })
  await t.test('assignment revocation is transactional, audited and never undone by assignment restoration', async () => {
    await db.exec('begin'); await grant(viewer, 'revoked'); await db.exec('rollback')
    assert.equal((await get()).subscription.status, 'active')
    const before = await scalar('select count(*)::int from evidence_pipeline.investigation_follow_events')
    await grant(viewer, 'revoked'); await grant(viewer, 'revoked')
    await assert.rejects(get(), e => e.code === '42501')
    await assert.rejects(follow('subscribe', subscriptionInput), e => e.code === '42501')
    assert.deepEqual((await follow('list', { user_id: viewer })).items, [])
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_follow_events'), before + 1)
    await grant(viewer, 'viewer')
    current = (await get()).subscription; assert.equal(current.status, 'revoked'); assert.deepEqual((await get()).changes, [])
    current = await follow('subscribe', actionInput(v3, current.current_event_id)); assert.equal(current.status, 'active')
  })
  await t.test('explicit private revoke is durable, service-only and requires a fresh observed baseline', async () => {
    const request = { user_id: viewer, investigation_id: iid, event_id: randomUUID(), previous_event_id: current.current_event_id }
    current = await follow('revoke', request)
    assert.deepEqual(await follow('revoke', request), current)
    assert.equal((await get()).subscription.status, 'revoked'); assert.deepEqual((await get()).changes, [])
    await assert.rejects(follow('subscribe', actionInput(v4, request.previous_event_id)), e => e.code === '40001')
    current = await follow('subscribe', actionInput(v3, current.current_event_id))
  })
  await t.test('independent subscriptions cannot reuse another user receipt or acknowledgment cursor', async () => {
    const own = actionInput(v1, null, uid), second = await follow('subscribe', own)
    assert.equal(second.acknowledged_version_id, v1.id)
    await assert.rejects(follow('subscribe', { ...own, event_id: current.current_event_id, previous_event_id: second.current_event_id }), e => e.code === '23505')
    await assert.rejects(follow('acknowledge', { ...actionInput(v4, current.current_event_id, uid) }), e => e.code === '40001')
    assert.equal((await get(uid)).subscription.acknowledged_version_id, v1.id)
    assert.equal((await get()).subscription.acknowledged_version_id, v3.id)
    const list = await follow('list', { user_id: viewer, limit: 1 })
    assert.equal(list.items.length, 1); assert.equal(list.items[0].investigation_id, iid)
    assert.equal(list.items[0].subject.id, subject); assert.equal(list.has_more, false)
  })
  await t.test('anchor removal refuses acknowledgment and suppresses declared changes without invented public alias', async () => {
    const v5 = await put(v4, { ...v4.state, canonical_subject: null })
    const b = await get(); assert.equal(b.anchor_matches_head, false); assert.deepEqual(b.changes, []); assert.equal(b.unclassified_version_changes, true)
    await assert.rejects(follow('acknowledge', actionInput(v5, current.current_event_id)), e => e.code === '22023')
    await assert.rejects(follow('subscribe', actionInput(v4, current.current_event_id)), e => e.code === '22023')
    await assert.rejects(follow('register_material_change', { user_id: uid, investigation_id: iid, change_id: randomUUID(), before_version_id: v4.id, after_version_id: v5.id, materiality_reason: 'Anchor removed.' }), e => e.code === '22023')
  })
  await t.test('private handler injects verified identity and denies arbitrary admin commands and payloads', async () => {
    let identity = viewer
    const handler = createFollowingHandler({ authenticate: async () => ({ id: identity }), rpc: async (a, i) => { try { return { data: await follow(a, i) } } catch (error) { return { error } } }, allowedOrigins: ['https://example.org'] })
    const request = (action, input) => handler(new Request('https://unbound.invalid/private', { method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json', origin: 'https://example.org' }, body: JSON.stringify({ action, input }) }))
    assert.equal((await request('read', { investigation_id: iid })).status, 200)
    assert.equal((await request('read', { investigation_id: iid, user_id: uid })).status, 400)
    for (const a of ['revoke', 'register_material_change', 'set_access']) assert.equal((await request(a, {})).status, 400)
    identity = outsider; const denied = await request('read', { investigation_id: iid }); assert.equal(denied.status, 403)
    assert.deepEqual(await denied.json(), { error: { code: 'access_denied' } }); assert.equal(denied.headers.get('cache-control'), 'private, no-store')
    identity = viewer; await grant(viewer, 'revoked'); assert.equal((await request('read', { investigation_id: iid })).status, 403); await grant(viewer, 'viewer')
    const secret = createFollowingHandler({ authenticate: async () => { throw new Error('Bearer SECRET') }, rpc: () => {} })
    const r = await secret(new Request('https://unbound.invalid', { method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'list' }) }))
    assert.equal((await r.text()).includes('SECRET'), false)
  })
  await t.test('malformed and cross-investigation requests fail atomically', async () => {
    const count = await scalar('select count(*)::int from evidence_pipeline.investigation_follow_events')
    for (const input of [{ ...subscriptionInput, user_id: null }, { ...subscriptionInput, subject_id: null }, { ...subscriptionInput, extra: true }, { ...subscriptionInput, previous_event_id: randomUUID() }]) await assert.rejects(follow('subscribe', input))
    const fresh = await obs('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
    const other = await put(null, state, fresh, randomUUID())
    const restored = (await get()).subscription
    await assert.rejects(follow('subscribe', actionInput(other, restored.current_event_id)), e => e.code === '22023')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_follow_events'), count)
  })
  await t.test('scope changes refuse a comparable material declaration even with the same explicit subject', async () => {
    const secondCapture = await add('A second report.')
    const secondCandidate = await intake('candidate', { capture_id: secondCapture.capture_id, candidate_key: 'scope', candidate_kind: 'claim', statement: 'A second report.', source_field: 'summary', span_start: 0, span_end: 16, excerpt: 'A second report.', event_node_id: subject, extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
    const fresh = await obs('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
    const expanded = await obs('observe', { observation_id: randomUUID(), candidate_ids: [candidate, secondCandidate] })
    const otherId = randomUUID(), a = await put(null, state, fresh, otherId), b = await put(a, state, expanded, otherId)
    await ws('set_access', { investigation_id: otherId, user_id: uid, access_role: 'reviewer', reason: 'Synthetic assignment.' })
    await assert.rejects(follow('register_material_change', { user_id: uid, investigation_id: otherId, change_id: randomUUID(), before_version_id: a.id, after_version_id: b.id, materiality_reason: 'Same subject cannot hide a changed collection scope.' }), e => e.code === '22023' && /scope mismatch/.test(e.message))
  })
  await t.test('browser roles lack RPC/table access; immutable receipts and declarations reject rewriting', async () => {
    await db.exec('reset role')
    for (const table of ['investigation_follow_events', 'investigation_material_changes']) {
      await assert.rejects(db.exec(`delete from evidence_pipeline.${table}`), /append-only/)
      await assert.rejects(db.exec(`update evidence_pipeline.${table} set id=id`), /append-only/)
      await assert.rejects(db.exec(`truncate evidence_pipeline.${table} cascade`), /append-only/)
    }
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(get(), /permission denied/)
      for (const table of ['investigation_follows', 'investigation_follow_events', 'investigation_material_changes']) await assert.rejects(db.exec(`select * from evidence_pipeline.${table}`), /permission denied/)
      await db.exec('reset role')
    }
  })
})

test('private consumer stays unbound, explicit, cacheless and secret-free', async () => {
  assert.equal((await createInvestigationFollowingClient().list()).error.code, 'following_unbound')
  let calls = 0
  const iid = randomUUID(), client = createInvestigationFollowingClient({ call: async () => { calls++; return { data: { contract_version: 'private-investigation-following-1', scope: 'private_investigation', investigation_id: iid, publicly_eligible: false } } } })
  assert.equal(calls, 0); assert.equal((await client.read({ investigation_id: iid })).error, null); assert.equal(calls, 1)
  assert.equal((await client.read({ investigation_id: iid, user_id: randomUUID() })).error.code, 'invalid_request'); assert.equal(calls, 1)
  const denied = createInvestigationFollowingClient({ call: async () => ({ data: { sensitive: 'old' }, error: { code: 'access_denied', message: 'SECRET' } }) })
  assert.deepEqual(await denied.read({ investigation_id: iid }), { data: null, error: { code: 'access_denied' } })
  const failing = createInvestigationFollowingClient({ call: async () => { throw new Error('SECRET') } })
  assert.equal(JSON.stringify(await failing.list()).includes('SECRET'), false)
  for (const data of [{ publicly_eligible: true }, { publicly_eligible: false, scope: 'public_story' }]) {
    assert.equal((await createInvestigationFollowingClient({ call: async () => ({ data }) }).list()).error.code, 'invalid_response')
  }
})


test('consumer snapshots request primitives and refuses accessors before an asynchronous call', async () => {
  const iid = randomUUID(), input = { investigation_id: iid }; let resolve
  const client = createInvestigationFollowingClient({ call: async (action, retained) => {
    assert.equal(retained.investigation_id, iid)
    await new Promise(r => { resolve = r })
    return { data: { contract_version: 'private-investigation-following-1', scope: 'private_investigation', investigation_id: iid, publicly_eligible: false } }
  } })
  const pending = client.read(input); input.investigation_id = randomUUID(); resolve()
  assert.equal((await pending).error, null)
  let invoked = false
  const accessor = Object.defineProperty({}, 'investigation_id', { enumerable: true, get() { invoked = true; throw new Error('SECRET') } })
  assert.equal((await client.read(accessor)).error.code, 'invalid_request'); assert.equal(invoked, false)
})
