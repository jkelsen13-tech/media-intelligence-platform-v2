import test from 'node:test'
import assert from 'node:assert/strict'
import { curatedFixture, curatedTables } from './curatedBackendFixture.mjs'

test('curated backend withholds table reads unless its bound beta flag is exactly true', async () => {
  for (const value of [false, null, 'true', 1]) {
    const f = curatedFixture({ tables: { ...curatedTables(), pipeline_config: [{ key: 'phase3_beta', value }] } })
    assert.ok(Object.isFrozen(f.backend)); assert.equal(f.calls.length, 0)
    assert.equal(await f.backend.loadPhase3BetaFlag(), false)
    assert.deepEqual(await f.backend.loadPhase3BetaView(), { enabled: false, cases: [], policies: [] })
    assert.ok(f.calls.every(c => c.table === 'pipeline_config'))
  }
  const denied = curatedFixture({ errors: { pipeline_config: { code: '42501', message: 'denied' } } })
  assert.equal((await denied.backend.loadPhase3BetaView()).enabled, false)
})

test('all four curated tables paginate beyond 1000 and preserve complete ownership and chronology', async () => {
  const n = 1002, pad = x => String(x).padStart(5, '0'), tables = { pipeline_config: [{ key: 'phase3_beta', value: true }] }
  tables.p3_legal_case = Array.from({ length: n }, (_, i) => ({ id: `case-${pad(i)}`, created_at: new Date(Date.UTC(2020, 0, n - i)).toISOString(), case_status: 'ongoing' }))
  tables.p3_legal_case_evidence = tables.p3_legal_case.map((c, i) => ({ id: `ev-${pad(i)}`, case_id: c.id, track: 'confirmed_reporting', created_at: c.created_at }))
  tables.p3_policy = tables.p3_legal_case.map((c, i) => ({ id: `policy-${pad(i)}`, created_at: c.created_at }))
  tables.p3_policy_track_event = tables.p3_policy.map((p, i) => ({ id: `transition-${pad(i)}`, policy_id: p.id, track: 'stated_objective', event_date: p.created_at }))
  const f = curatedFixture({ tables }), view = await f.backend.loadPhase3BetaView()
  assert.equal(view.casesUnavailable, false); assert.equal(view.policiesUnavailable, false)
  assert.deepEqual(view.cases.map(c => c.id), tables.p3_legal_case.map(c => c.id).reverse())
  assert.deepEqual(view.policies.map(p => p.id), tables.p3_policy.map(p => p.id).reverse())
  for (const c of view.cases) { const rows = c.tracks.flatMap(t => t.rows); assert.equal(rows.length, 1); assert.equal(rows[0].case_id, c.id) }
  for (const p of view.policies) { assert.equal(p.stated_objective.length, 1); assert.equal(p.stated_objective[0].policy_id, p.id) }
  for (const table of Object.keys(tables).filter(t => t !== 'pipeline_config')) {
    const calls = f.calls.filter(c => c.table === table); assert.equal(calls.length, 2); assert.ok(calls[1].params.has('id'))
  }
  const before = f.calls.length; f.setToken('curated-session-two'); await f.backend.loadPhase3BetaView()
  assert.ok(f.calls.slice(before).every(c => c.request.headers.get('authorization') === 'Bearer curated-session-two'))
  assert.ok(f.calls.every(c => c.request.method === 'GET' && c.request.headers.get('apikey') === 'fixture-browser-key'))
})

test('curated tracks preserve verdict attribution, absence markers, social uncertainty, and policy provenance', async () => {
  const f = curatedFixture({ tables: curatedTables() }), view = await f.backend.loadPhase3BetaView()
  assert.match(view.cases[0].verdict_block.framed_as, /Documented claim of the deciding body/)
  assert.equal(view.cases[1].verdict_block, null)
  const missing = view.cases[1].tracks.find(t => t.track === 'missing_evidence').rows[0]
  assert.equal(missing.is_marker, true); assert.match(missing.marker_copy, /not yet reviewer-confirmed/)
  assert.equal(view.cases[1].tracks.find(t => t.track === 'unverified_social').rows[0].is_unverified_social, true)
  assert.equal(view.policies[0].agency, 'Recorded agency'); assert.equal(view.policies[0].source_locator.chapter, '2')
  assert.equal(view.policies[0].stated_objective[0].source_passage, 'Recorded objective passage')
  assert.equal(view.policies[0].actual_outcome[0].source_passage, 'Recorded outcome passage')
})

test('later-page failure withholds the affected section without hiding the other section or claiming absence', async () => {
  for (const table of ['p3_legal_case', 'p3_legal_case_evidence', 'p3_policy', 'p3_policy_track_event']) {
    const tables = curatedTables(); tables[table] = Array.from({ length: 1001 }, (_, i) => ({ ...tables[table][0], id: String(i).padStart(5, '0') }))
    const f = curatedFixture({ tables, errors: { [table]: p => p.has('id') ? { code: '42501', message: 'later page denied' } : null } })
    const view = await f.backend.loadPhase3BetaView(), casesFailed = table.startsWith('p3_legal')
    assert.equal(view.casesUnavailable, casesFailed); assert.equal(view.policiesUnavailable, !casesFailed)
    assert.equal(view[casesFailed ? 'cases' : 'policies'].length, 0)
    assert.ok(view[casesFailed ? 'policies' : 'cases'].length > 0)
  }
  const empty = await curatedFixture({ tables: { pipeline_config: [{ key: 'phase3_beta', value: true }] } }).backend.loadPhase3BetaView()
  assert.deepEqual(empty, { enabled: true, cases: [], policies: [], casesUnavailable: false, policiesUnavailable: false })
})
