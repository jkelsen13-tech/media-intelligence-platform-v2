import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { PGlite } from '@electric-sql/pglite'
import { FunctionsClient } from '@supabase/functions-js'
import { createInvestigationApiHandler } from '../supabase/functions/investigation-api/handler.mjs'
import { createInvestigationFollowingClient } from '../src/lib/investigationFollowingClient.js'
import { createInvestigationBackend } from '../src/lib/investigationBackend.js'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'

const root = fileURLToPath(new URL('../', import.meta.url)), read = p => readFile(new URL(p, import.meta.url), 'utf8')
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await mkdir(root + 'tests/.compiled', { recursive: true })
const output = root + 'tests/.compiled/FollowingWorkspace.mjs'
await esbuild.build({ absWorkingDir: root, entryPoints: ['src/components/PrivateInvestigationWorkspace.jsx'], outfile: output, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react','react/jsx-runtime','react-dom'], plugins: [{ name: 'css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }] })
const { default: Workspace } = await import(pathToFileURL(output))
const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.children ?? n.props?.children) : String(n)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('private Following runs through retained SQL, verified gateway, installed SDK and mounted native owners', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec(await read('./changeQueueFixture.sql')); await db.exec('create table public.mip_profiles(id uuid primary key)')
  const viewer = randomUUID(), reviewer = randomUUID(), outsider = randomUUID(), iid = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2),($3)', [viewer, reviewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','investigation_change_briefings_v1']) await db.exec(await read('../supabase/migrations/' + files.find(f => f.endsWith(`_${suffix}.sql`))))
  await db.exec(await read('../supabase/source-proposals/assessment_relevant_inputs_v1.sql'))
  for (const suffix of ['investigation_workspace_batch_v1','investigation_reference_integrity_v1']) await db.exec(await read('../supabase/migrations/' + files.find(f => f.endsWith(`_${suffix}.sql`))))
  await db.exec(await read('../supabase/source-proposals/investigation_following_v1.sql'))
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1'), follow = rpc('mip_investigation_following_v1')
  const subject = (await db.query("insert into public.nodes(type,label) values('event','Synthetic Following subject') returning id")).rows[0].id
  await intake('enqueue', { run_id: 'binding-fixture', article: { url: 'https://example.org/private-following', title: 'Synthetic', outlet: 'Fixture', summary: 'A report.', published_at: '2010-01-01T00:00:00Z' } })
  const job = await intake('claim'), cap = await intake('finish', { job_id: job.id, lease_token: job.lease_token })
  const candidate = await intake('candidate', { capture_id: cap.capture_id, candidate_key: 'following', candidate_kind: 'claim', statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', event_node_id: subject, extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  const observation = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const initialState = { question: 'Synthetic private question', scope_note: 'Synthetic assigned investigation only.', canonical_subject: { type: 'graph_node', id: subject }, time_range: { from: null, to: null, meaning: 'Unknown.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
  const put = (previous, state) => ws('put', { investigation_id: iid, version_id: randomUUID(), previous_version_id: previous?.id ?? null, observation_id: observation.id, state, change_reason: 'Synthetic version.' })
  const grant = (user, role) => ws('set_access', { investigation_id: iid, user_id: user, access_role: role, reason: 'Synthetic assignment.' })
  await db.exec('set role service_role')
  const v1 = await put(null, initialState); await grant(viewer, 'viewer'); await grant(reviewer, 'reviewer')
  const calls = [], auth = []; let rpcFault = null, expired = false, holdAction = null, held = null, switchAfterAction = null
  const invokeRpc = name => async (action, input) => { try { return { data: await rpc(name)(action, input) } } catch (e) { return { error: { code: e.code } } } }
  const handler = createInvestigationApiHandler({ authenticate: async authorization => {
    auth.push(authorization); const id = authorization.slice('Bearer '.length)
    return !expired && [viewer, reviewer, outsider].includes(id) ? { id } : null
  }, workspaceRpc: invokeRpc('mip_investigation_workspace_v1'), followingRpc: async (action, input) => {
    if (rpcFault === 'missing') return { error: { code: '42883', message: 'SECRET SQL' } }
    if (rpcFault === 'foreign_subject') {
      const result = await invokeRpc('mip_investigation_following_v1')(action, input)
      const change = (await db.query('select to_jsonb(c) c from evidence_pipeline.investigation_material_changes c limit 1')).rows[0].c
      return { data: { ...result.data, changes: [{ ...change, subject_id: randomUUID() }] } }
    }
    if (rpcFault === 'exception') throw new Error('Bearer SECRET')
    if (rpcFault === 'malformed') return { data: { publicly_eligible: false, investigation_id: iid, contract_version: 'private-investigation-following-1', scope: 'private_investigation' } }
    return invokeRpc('mip_investigation_following_v1')(action, input)
  }, checksRpc: async () => ({ data: {} }), reviewsRpc: async () => ({ data: {} }) })
  const functions = new FunctionsClient('https://private-fixture.invalid/functions/v1', { customFetch: async (url, options) => {
    const body = JSON.parse(options.body), entry = { url: String(url), body, headers: new Headers(options.headers) }; calls.push(entry)
    const response = await handler(new Request(url, options))
    if (String(url).endsWith('/following') && body.action === switchAfterAction) { switchAfterAction = null; functions.setAuth(reviewer) }
    if (String(url).endsWith('/following') && body.action === holdAction) {
      holdAction = null; return new Promise(resolve => { held = () => { held = null; resolve(response) } })
    }
    return response
  } })
  functions.setAuth(viewer)
  const backend = createInvestigationBackend({ functions }); assert.equal(calls.length, 0)
  let current, tree
  function Probe({ userId = viewer, sessionLoading = false }) {
    current = usePrivateInvestigationWorkspace({ userId, sessionLoading, client: backend.workspace, active: true, initialInvestigationId: iid })
    return React.createElement(Workspace, { workspace: current, followingClient: backend.following })
  }
  const mount = async userId => { functions.setAuth(userId); await act(async () => { tree = TestRenderer.create(React.createElement(Probe, { userId })); await tick(); await tick() }) }
  const button = label => tree.root.findAllByType('button').find(b => text(b) === label)
  const click = async label => { const b = button(label); assert.ok(b, label); assert.equal(b.props.disabled, false); await act(async () => { await b.props.onClick(); await tick() }) }
  const followingCalls = () => calls.filter(c => c.url.endsWith('/following'))
  const unmount = () => { if (tree) act(() => tree.unmount()); tree = null }
  t.after(unmount)
  let v2, v3

  await t.test('construction and mounted private workspace make no automatic Following query', async () => {
    await mount(viewer); assert.equal(current.status, 'ready'); assert.equal(followingCalls().length, 0)
    assert.match(text(tree.toJSON()), /Following status has not been loaded/)
    assert.doesNotMatch(text(tree.toJSON()), /No saved follow preference/)
    await click('Load following status'); assert.match(text(tree.toJSON()), /No saved follow preference/)
    assert.equal(followingCalls().length, 1)
  })
  await t.test('explicit follow is durable only after a receipt and foreground read; no review or classification producer', async () => {
    await click('Follow investigation')
    assert.match(text(tree.toJSON()), /Following is saved for this account/)
    assert.deepEqual(followingCalls().slice(-2).map(c => c.body.action), ['subscribe','read'])
    const payload = followingCalls().at(-2).body.input
    assert.equal(payload.version_id, v1.id); assert.equal(payload.subject_id, subject); assert.equal(Object.hasOwn(payload, 'user_id'), false)
    assert.equal((await follow('read', { user_id: viewer, investigation_id: iid })).subscription.status, 'active')
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_material_changes')).rows[0].n, 0)
    assert.ok(auth.every(h => h.startsWith('Bearer ')))
  })
  for (const mode of ['read', 'subscribe']) await t.test(`server actor binding rejects ${mode} for token B before React changes from account A`, async () => {
    const otherId = randomUUID(), side = await ws('put', { investigation_id: otherId, version_id: randomUUID(), previous_version_id: null, observation_id: observation.id, state: { ...initialState, question: `Synthetic actor-binding separate question ${mode}` }, change_reason: 'Synthetic actor-binding fixture.' })
    for (const user of [viewer, reviewer]) await ws('set_access', { investigation_id: otherId, user_id: user, access_role: 'viewer', reason: 'Synthetic assignment.' })
    if (mode === 'read') await follow('subscribe', { user_id: reviewer, investigation_id: otherId, event_id: randomUUID(), previous_event_id: null, version_id: side.id, subject_id: subject })
    await act(async () => { await current.actions.selectInvestigation(otherId); await tick() })
    await click('Load following status')
    functions.setAuth(reviewer) // Both assigned; React and its request key deliberately still belong to viewer.
    try {
      const before = (await db.query('select count(*)::int n from evidence_pipeline.investigation_follow_events')).rows[0].n
      await click(mode === 'read' ? 'Reload following status' : 'Follow investigation')
      assert.equal(current.state.bundle, null); assert.equal(current.status, 'authentication_required')
      assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_follow_events')).rows[0].n, before)
      assert.doesNotMatch(text(tree.toJSON()), /Following is saved for this account|Acknowledged version:/)
      if (mode === 'subscribe') {
        assert.equal((await follow('read', { user_id: viewer, investigation_id: otherId })).subscription, null)
        assert.equal((await follow('read', { user_id: reviewer, investigation_id: otherId })).subscription, null)
      }
    } finally {
      functions.setAuth(viewer)
      await act(async () => { await current.actions.refresh(); await current.actions.selectInvestigation(iid); await tick() })
      await click('Load following status')
    }
  })
  await t.test('post-write confirmation rejects a new SDK actor even when the saved receipt belongs to the displayed actor', async () => {
    switchAfterAction = 'unsubscribe'
    try {
      await click('Unfollow investigation')
      assert.equal(current.state.bundle, null); assert.equal(current.status, 'authentication_required')
      assert.doesNotMatch(text(tree.toJSON()), /No saved follow preference|saved follow preference is unsubscribed/)
    } finally {
      switchAfterAction = null; functions.setAuth(viewer)
      await act(async () => { await current.actions.refresh(); await current.actions.selectInvestigation(iid); await tick() })
      await click(button('Reload following status') ? 'Reload following status' : 'Load following status')
      await click('Follow investigation')
    }
  })
  await t.test('in-app declarations stay provisional and acknowledgment binds the exact displayed older version', async () => {
    v2 = await put(v1, { ...initialState, unresolved_questions: ['Synthetic unresolved question.'] })
    await follow('register_material_change', { user_id: reviewer, investigation_id: iid, change_id: randomUUID(), before_version_id: v1.id, after_version_id: v2.id, materiality_reason: 'Synthetic explicit reviewer declaration.' })
    v3 = await put(v2, { ...v2.state, unresolved_questions: ['Synthetic later question.'] })
    await act(async () => { await current.actions.selectVersion(iid, v2.id); await tick() })
    await click('Load following status')
    assert.match(text(tree.toJSON()), /Synthetic explicit reviewer declaration/); assert.match(text(tree.toJSON()), /classification is provisional/)
    assert.match(text(tree.toJSON()), /materiality is unknown/)
    await click('Acknowledge displayed version')
    const input = followingCalls().filter(c => c.body.action === 'acknowledge').at(-1).body.input
    assert.equal(input.version_id, v2.id); assert.notEqual(input.version_id, v3.id)
    assert.equal((await follow('read', { user_id: viewer, investigation_id: iid })).subscription.acknowledged_version_id, v2.id)
    assert.match(text(tree.toJSON()), /materiality is unknown/)
    assert.ok(followingCalls().every(c => !['revoke','register_material_change'].includes(c.body.action)))
  })
  await t.test('stale CAS produces no automatic read or mutation retry and requires explicit reload', async () => {
    const saved = (await follow('read', { user_id: viewer, investigation_id: iid })).subscription
    await follow('unsubscribe', { user_id: viewer, investigation_id: iid, event_id: randomUUID(), previous_event_id: saved.current_event_id })
    const count = followingCalls().length
    await click('Unfollow investigation')
    assert.equal(followingCalls().length, count + 1); assert.match(text(tree.toJSON()), /Reload status before choosing another action/)
    assert.doesNotMatch(text(tree.toJSON()), /saved follow preference is unsubscribed/)
    await click('Load following status'); assert.match(text(tree.toJSON()), /saved follow preference is unsubscribed/)
    await click('Follow investigation')
  })
  await t.test('missing RPC, malformed response and secret-bearing errors stay unavailable, never unfollowed', async () => {
    for (const fault of ['missing','malformed','foreign_subject','exception']) {
      rpcFault = fault; await click(button('Reload following status') ? 'Reload following status' : 'Load following status')
      assert.match(text(tree.toJSON()), /Following is unavailable/); assert.doesNotMatch(text(tree.toJSON()), /No saved follow preference|SECRET/)
    }
    rpcFault = null; await click('Load following status')
  })
  await t.test('assignment revocation clears the real workspace records, and restored access does not auto-resume', async () => {
    await grant(viewer, 'revoked'); await click('Reload following status')
    assert.equal(current.state.bundle, null); assert.equal(current.status, 'access_denied'); assert.doesNotMatch(text(tree.toJSON()), /Synthetic private question|Synthetic explicit reviewer declaration/)
    await grant(viewer, 'viewer'); await act(async () => { await current.actions.refresh(); await tick() })
    await click('Load following status'); assert.match(text(tree.toJSON()), /saved follow preference was revoked/)
    await click('Follow investigation')
  })
  await t.test('late writes and reads cannot reveal or alter another account state', async () => {
    holdAction = 'unsubscribe'; let pending
    act(() => { pending = button('Unfollow investigation').props.onClick() })
    for (let i = 0; i < 10 && !held; i++) await act(async () => { await tick() })
    assert.ok(held)
    functions.setAuth(reviewer)
    await act(async () => { tree.update(React.createElement(Probe, { userId: reviewer })); await tick(); await tick() })
    assert.doesNotMatch(text(tree.toJSON()), /Following is saved for this account/)
    await act(async () => { held(); await pending; await tick() })
    await click('Load following status'); assert.match(text(tree.toJSON()), /No saved follow preference/)
    holdAction = 'read'; act(() => { pending = button('Reload following status').props.onClick() })
    for (let i = 0; i < 10 && !held; i++) await act(async () => { await tick() })
    assert.ok(held)
    functions.setAuth(viewer)
    await act(async () => { tree.update(React.createElement(Probe, { userId: viewer })); await tick(); await tick() })
    await act(async () => { held(); await pending; await tick() })
    assert.match(text(tree.toJSON()), /Following status has not been loaded/)
    await click('Load following status'); assert.match(text(tree.toJSON()), /saved follow preference is unsubscribed/)
  })
  await t.test('logout, expiry and version switches discard current and delayed Following payloads', async () => {
    await act(async () => { tree.update(React.createElement(Probe, { userId: null })); await tick() })
    assert.equal(current.state.bundle, null); assert.doesNotMatch(text(tree.toJSON()), /Synthetic private question/)
    functions.setAuth(viewer); await act(async () => { tree.update(React.createElement(Probe, { userId: viewer })); await tick(); await tick() })
    await click('Load following status')
    expired = true; await click('Reload following status'); expired = false
    assert.equal(current.state.bundle, null); assert.equal(current.status, 'authentication_required')
    assert.doesNotMatch(text(tree.toJSON()), /Synthetic private question|saved follow preference/)
    await act(async () => { await current.actions.refresh(); await current.actions.selectInvestigation(iid); await tick() })
    await click('Load following status'); await act(async () => { await current.actions.selectVersion(iid, v1.id); await tick() })
    assert.match(text(tree.toJSON()), /Following status has not been loaded/)
  })
  await t.test('gateway and client reject trusted producer commands, spoofing and foreign assignment without fallback', async () => {
    functions.setAuth(outsider)
    const result = await backend.following.read({ investigation_id: iid }); assert.equal(result.data, null); assert.equal(result.error.code, 'access_denied')
    const before = followingCalls().length
    assert.equal((await backend.following.subscribe({ user_id: viewer })).error.code, 'invalid_request'); assert.equal(followingCalls().length, before)
    for (const action of ['register_material_change','revoke']) {
      const r = await handler(new Request('https://private-fixture.invalid/functions/v1/investigation-api/following', { method: 'POST', headers: { authorization: `Bearer ${reviewer}`, 'content-type': 'application/json' }, body: JSON.stringify({ action, input: {} }) }))
      assert.equal(r.status, 400)
    }
    assert.equal((await createInvestigationBackend(null).following.read({ investigation_id: iid })).error.code, 'following_unbound')
    assert.ok(calls.every(c => c.url.startsWith('https://private-fixture.invalid/functions/v1/investigation-api/')))
    assert.ok(followingCalls().every(c => !Object.hasOwn(c.body.input, 'user_id')))
    functions.setAuth(viewer)
  })
  if (process.env.MIP_FOLLOWING_BINDING_RECEIPTS) {
    // Task-specific opt-in only. Generate the browser projection through the same
    // SDK/Auth gateway, so its actor stamp is genuine to this synthetic fixture.
    functions.setAuth(reviewer)
    const saved = await backend.following.subscribe({ investigation_id: iid, event_id: randomUUID(), previous_event_id: null, version_id: v1.id, subject_id: subject }, { expectedUserId: reviewer })
    assert.equal(saved.error, null)
    const bundle = (await backend.workspace.read(iid, v2.id)).data
    const subscription = (await backend.following.read({ investigation_id: iid }, { expectedUserId: reviewer })).data
    assert.equal(subscription.authenticated_user_id, reviewer)
    await mkdir(process.env.MIP_FOLLOWING_BINDING_RECEIPTS, { recursive: true })
    await writeFile(join(process.env.MIP_FOLLOWING_BINDING_RECEIPTS, 'private-browser-fixture.json'), JSON.stringify({ viewer: reviewer, bundle, subscription }, null, 2) + '\n')
  }
})


test('Following client snapshots local actor expectation and refuses mismatched read and receipt actors', async () => {
  const actor = randomUUID(), other = randomUUID(), iid = randomUUID(), event = randomUUID(), version = randomUUID(), subject = randomUUID()
  for (const action of ['read','subscribe']) {
    let resolve, retained
    const context = { expectedUserId: actor }, input = action === 'read' ? { investigation_id: iid } : { investigation_id: iid, event_id: event, previous_event_id: null, version_id: version, subject_id: subject }
    const client = createInvestigationFollowingClient({ call: async (_action, _input, expectation) => { retained = expectation; await new Promise(r => { resolve = r }); return { data: { authenticated_user_id: other, publicly_eligible: false, investigation_id: iid } } } })
    const pending = client[action](input, context); context.expectedUserId = other; resolve()
    assert.equal(retained.expectedUserId, actor)
    assert.deepEqual(await pending, { data: null, error: { code: 'identity_mismatch' } })
  }
  let invoked = false
  const accessor = Object.defineProperty({}, 'expectedUserId', { enumerable: true, get() { invoked = true; return actor } })
  assert.equal((await createInvestigationFollowingClient({ call: () => assert.fail() }).read({ investigation_id: iid }, accessor)).error.code, 'invalid_request')
  assert.equal(invoked, false)
})
