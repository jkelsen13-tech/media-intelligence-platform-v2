import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorldViewUsage, evaluateWorldViewHighCostAccess, worldViewResourceObservation } from '../src/lib/worldViewResourcePolicy.js'

test('high-cost capability requires admission, identity when requested and authoritative remaining budgets', () => {
  const args = { admission: { approved: true }, entitlement: { allowed: true, identityRequired: true, identityPresent: true },
    budgets: Object.fromEntries(['account', 'concurrency', 'global', 'provider'].map(key => [key, { authoritative: true, remaining: 1 }])) }
  assert.equal(evaluateWorldViewHighCostAccess(args).allowed, true)
  assert.equal(evaluateWorldViewHighCostAccess().allowed, false)
  assert.equal(evaluateWorldViewHighCostAccess({ ...args, entitlement: { ...args.entitlement, identityPresent: false } }).reason, 'identity-required')
  for (const key of Object.keys(args.budgets)) {
    for (const invalid of [null, 0, -1, Infinity, '10']) {
      const budgets = { ...args.budgets, [key]: { authoritative: true, remaining: invalid } }
      assert.equal(evaluateWorldViewHighCostAccess({ ...args, budgets }).allowed, false)
    }
    assert.equal(evaluateWorldViewHighCostAccess({ ...args, budgets: { ...args.budgets, [key]: { remaining: 10 } } }).allowed, false)
  }
})

test('product, active and actual high-cost minutes remain separate through idle, hidden and disposal', () => {
  let time = 0
  const usage = createWorldViewUsage({ now: () => time })
  usage.transition('visible-active'); usage.explore(); time = 60000
  assert.equal(usage.snapshot().highFidelityMinutes, 0, 'a product session does not activate a provider')
  usage.setHighCostActive(true); time = 120000
  usage.transition('visible-idle'); time = 180000
  usage.transition('hidden'); time = 240000
  assert.equal(usage.explore(), false)
  usage.transition('visible-active'); time = 300000
  usage.transition('disposed'); time = 600000
  const state = usage.snapshot()
  assert.equal(state.productSessions, 1)
  assert.equal(state.visibleMinutes, 4)
  assert.equal(state.explorationMinutes, 3)
  assert.equal(state.highFidelityMinutes, 2)
  assert.equal(usage.transition('visible-active'), false)
})

test('a bookmark action does not turn idle time into exploration minutes', () => {
  let time = 0
  const usage = createWorldViewUsage({ now: () => time })
  usage.explore(); time = 60000
  assert.equal(usage.snapshot().state, 'visible-idle')
  assert.equal(usage.snapshot().explorationActions, 1)
  assert.equal(usage.snapshot().explorationMinutes, 0)
})

test('observable requests never infer billing, zero CORS transfer sizes remain unknown', () => {
  const usage = createWorldViewUsage({ now: () => 0 })
  usage.observeRequest({ provider: 'sample', kind: 'root' })
  assert.equal(usage.snapshot().providers[0].observableBillableUnits, null)
  usage.observeRequest({ provider: 'sample', kind: 'root', billableUnits: 1, costUsd: 0.006, transferBytes: 512 })
  assert.equal(usage.snapshot().providers[0].observableBillableUnits, 1)
  assert.equal(usage.snapshot().unknownByteRequests, 1)
  assert.equal(usage.snapshot().observableBytes, 512)
  assert.equal(worldViewResourceObservation({ name: 'https://tile.openstreetmap.org/1/2/3.png', transferSize: 0 }).transferBytes, null)
  assert.equal(worldViewResourceObservation({ name: 'https://unrelated.test/secret', transferSize: 1 }), null)
})
