import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createMarketsBackend, MARKETS_SOURCE_RPC } from '../src/lib/marketsBackend.js'
import { createMarketSourceLookup } from '../src/lib/marketSourceLookup.js'
import { marketsSourceFixture, marketFixtureId as id } from './fixtures/marketsSourceFixture.mjs'
function sdkFixture() {
  const calls = []; let token = 'synthetic-session-a', data = null, status = 200, rejected = false, stalled = false
  const client = createClient('https://markets-source-fixture.invalid', 'synthetic-publishable-key', {
    accessToken: async () => token,
    global: { fetch: async (url, init) => {
      const request = new Request(url, init)
      calls.push({ url: new URL(request.url), method: request.method, headers: request.headers, signal: request.signal, body: await request.json() })
      if (stalled) return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('Synthetic abort', 'AbortError')), { once: true }))
      if (rejected) throw new Error('synthetic network failure')
      return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
    } },
  })
  return { backend: createMarketsBackend(client), calls, setData: value => { data = value; status = 200 },
    deny: () => { data = { code: '42501', message: 'synthetic permission denied' }; status = 403 },
    missing: () => { data = { code: 'PGRST202', message: 'synthetic missing function' }; status = 404 },
    reject: () => { rejected = true }, stall: () => { stalled = true }, setToken: value => { token = value } }
}
test('source transport has no global-client fallback or read at construction and refuses non-instant clocks', async () => {
  assert.equal((await createMarketsBackend().loadDirectory()).reason, 'client_not_configured')
  assert.equal((await createMarketsBackend(null).loadDirectory()).snapshot, null)
  const fixture = sdkFixture(); assert.equal(fixture.calls.length, 0)
  for (const at of ['2026-10-02', '2026-02-30T00:00:00Z', 0]) {
    assert.equal((await fixture.backend.loadDirectory({ at })).reason, 'inspection_time_unavailable')
  }
  assert.equal(fixture.calls.length, 0)
})
test('installed SDK uses exact RPC/time and current session without cache, provider calls or caller identity guesses', async () => {
  const fixture = sdkFixture(), snapshot = marketsSourceFixture(); fixture.setData(snapshot)
  const result = await fixture.backend.loadDirectory({ at: snapshot.validAt })
  assert.equal(result.status, 'available'); assert.ok(Object.isFrozen(result.snapshot.assets[0]))
  assert.equal(fixture.calls[0].url.pathname, '/rest/v1/rpc/' + MARKETS_SOURCE_RPC)
  assert.equal(fixture.calls[0].method, 'POST'); assert.deepEqual(fixture.calls[0].body, { p_at: snapshot.validAt })
  assert.equal(fixture.calls[0].headers.get('authorization'), 'Bearer synthetic-session-a')
  assert.equal(fixture.calls[0].headers.get('apikey'), 'synthetic-publishable-key')
  const source = createMarketSourceLookup(result.snapshot)
  assert.equal(source.search('SAME').results.length, 4)
  const model = source.lookup({ id: id(1), kind: 'equity' }).model
  assert.equal(model.reporting.sections[0].records.length, 1); assert.equal(model.price.quote, null)
  snapshot.reporting[0].evidence.assessments[0].stale = true; fixture.setToken('synthetic-session-b'); fixture.setData(snapshot)
  const corrected = await fixture.backend.loadDirectory({ at: snapshot.validAt })
  assert.equal(createMarketSourceLookup(corrected.snapshot).lookup({ id: id(1) }).model.reporting.sections[0].records.length, 0)
  assert.equal(fixture.calls[1].headers.get('authorization'), 'Bearer synthetic-session-b')
  assert.equal(model.reporting.sections[0].records.length, 1)
})
test('null, missing RPC, denied and malformed responses remain unavailable; another valid instant cannot supply this scope', async () => {
  const fixture = sdkFixture()
  assert.deepEqual(await fixture.backend.loadDirectory(), { status: 'unavailable', reason: 'directory_unavailable', snapshot: null })
  fixture.missing(); assert.equal((await fixture.backend.loadDirectory()).reason, 'directory_reader_unavailable')
  fixture.deny(); assert.equal((await fixture.backend.loadDirectory()).snapshot, null)
  for (const data of [[], {}, { status: 'available', publiclyEligible: true }, { status: 'unavailable', assets: marketsSourceFixture().assets },
    { ...marketsSourceFixture(), assets: [{ ...marketsSourceFixture().assets[0], releaseState: 'private' }] },
    { ...marketsSourceFixture(), privateNote: 'x'.repeat(2 * 1024 * 1024) }]) {
    fixture.setData(data); assert.equal((await fixture.backend.loadDirectory()).snapshot, null)
  }
  fixture.setData(marketsSourceFixture())
  assert.equal((await fixture.backend.loadDirectory({ at: '2024-04-08T18:00:00.000002Z' })).reason, 'inspection_scope_mismatch')
  assert.equal((await fixture.backend.loadDirectory({ at: '2024-04-08T14:00:00.000001-04:00' })).status, 'available')
  fixture.reject(); assert.equal((await fixture.backend.loadDirectory()).snapshot, null)
})


test('fixed deadline aborts an installed SDK stalled read, ends unavailable and does not retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = sdkFixture(); fixture.stall()
  let finished = false
  const pending = fixture.backend.loadDirectory().then(result => { finished = true; return result })
  for (let n = 0; n < 12; n++) await Promise.resolve()
  assert.equal(fixture.calls.length, 1); assert.equal(fixture.calls[0].signal.aborted, false)
  t.mock.timers.tick(14999); await Promise.resolve(); assert.equal(finished, false)
  t.mock.timers.tick(1)
  assert.deepEqual(await pending, { status: 'unavailable', reason: 'directory_request_timeout', snapshot: null })
  assert.equal(fixture.calls[0].signal.aborted, true)
  t.mock.timers.tick(60000); assert.equal(fixture.calls.length, 1)
  const unsupported = createMarketsBackend({ rpc: () => Promise.resolve({ data: marketsSourceFixture() }) })
  assert.equal((await unsupported.loadDirectory()).reason, 'directory_reader_unavailable')
  const invalid = createMarketsBackend({ rpc: () => { throw new Error('Synthetic constructor failure') } })
  assert.equal((await invalid.loadDirectory()).reason, 'directory_request_failed')
})
