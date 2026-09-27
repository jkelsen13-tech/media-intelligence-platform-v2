import test from 'node:test'
import assert from 'node:assert/strict'
import {FORWARD_SOURCE} from '../supabase/qualification/qik-ingest/forwardSourceContract.mjs'

import {validateOperationalConfig, assertExactSourcePlan, runOperationalHost} from '../supabase/qualification/qik-ingest/operationalHost.mjs'

const localSource = Object.freeze({...FORWARD_SOURCE, feedUrl: 'http://127.0.0.1:43191/controlled.xml'})
function environment() {
  return {
    MIP_QIK_OPERATIONAL_ENABLED: 'owner-authorized-one-shot',
    MIP_QIK_SOURCE_ID: localSource.id, MIP_QIK_SOURCE_FEED_URL: localSource.feedUrl,
    MIP_QIK_RELEASE_SHA: '82bc1a501cf3fca9eb40cf52c23889db340fbc75',
    MIP_QIK_EXPECTED_RELEASE_SHA: '82bc1a501cf3fca9eb40cf52c23889db340fbc75',
    MIP_QIK_NATIVE_RUN_ID: 'qik-host-controlled-operational',
    MIP_QIK_NATIVE_LOGIN: 'cnc_11111111111111111111111111111111_collector',
    MIP_QIK_NATIVE_DATABASE_URL: 'postgresql://cnc_11111111111111111111111111111111_collector:controlled-password@127.0.0.1:5432/disposable',
    MIP_QIK_INGEST_RUN_KEY: 'controlled-token-111111111111111111111111111111',
  }
}
const complete = config => ({run_id: config.runId, state: 'completed', connection_closed: true,
  needs_reconciliation: false, http_status: 200, inserted: 2, duplicates: 0, unresolved: 0,
  failed_jobs: 0, extracted_captures: 2, extraction_incomplete: 0})

test('operational wrapper refuses disabled, source drift and host retry configuration before execution', async () => {
  for (const changes of [
    {MIP_QIK_OPERATIONAL_ENABLED: undefined}, {MIP_QIK_OPERATIONAL_ENABLED: 'true'},
    {MIP_QIK_SOURCE_ID: '00000000-0000-4000-8000-000000000001'},
    {MIP_QIK_SOURCE_FEED_URL: localSource.feedUrl + '?drift=1'},
    {MIP_QIK_EXPECTED_RELEASE_SHA: '0'.repeat(40)},
    {GITHUB_SHA: '0'.repeat(40)}, {GITHUB_RUN_ATTEMPT: '2'},
    {CLOUD_RUN_TASK_COUNT: '2'}, {CLOUD_RUN_TASK_INDEX: '1'}, {CLOUD_RUN_TASK_ATTEMPT: '1'},
    {MIP_QIK_NATIVE_RUN_ID: 'unbounded-run'}, {MIP_QIK_NATIVE_LOGIN: 'postgres'},
    {MIP_QIK_INGEST_RUN_KEY: 'short'},
  ]) {
    let calls = 0
    const result = await runOperationalHost({env: {...environment(), ...changes}, source: localSource,
      disposable: true, runNativeHostImpl: async () => {calls++; throw Error('must not execute')}})
    assert.equal(calls, 0, JSON.stringify(changes))
    assert.equal(result.state, 'operational_host_configuration_refused')
    assert.equal(result.needs_reconciliation, false)
  }
})

test('admitted wrapper preserves exact run and source and exposes no raw credential or driver data', async () => {
  const env = environment(); let calls = 0
  const result = await runOperationalHost({env, source: localSource, disposable: true,
    runNativeHostImpl: async config => {
      calls++
      assert.equal(config.runId, env.MIP_QIK_NATIVE_RUN_ID)
      assert.equal(config.expectedLogin, env.MIP_QIK_NATIVE_LOGIN)
      assert.deepEqual(config.allowedFeedUrls, [localSource.feedUrl])
      assert.equal(config.token, env.MIP_QIK_INGEST_RUN_KEY)
      config.assertPlan({collection_authorized: true, sources: [{id: localSource.id, feed_url: localSource.feedUrl}]})
      return {...complete(config), query_error: 'private diagnostic', token: config.token,
        connectionString: config.connectionString, feed_url: localSource.feedUrl}
    }})
  assert.equal(calls, 1)
  assert.equal(result.state, 'completed'); assert.equal(result.needs_reconciliation, false)
  assert.equal(result.inserted, 2)
  for (const sensitive of [env.MIP_QIK_INGEST_RUN_KEY, env.MIP_QIK_NATIVE_DATABASE_URL,
    localSource.feedUrl, 'private diagnostic']) assert.equal(JSON.stringify(result).includes(sensitive), false)
})

test('final operational plan refuses disabled or foreign sources before begin-run callback', () => {
  const config = validateOperationalConfig(environment(), {source: localSource, disposable: true})
  for (const value of [false, undefined, null, 'false', 'true', 1])
    assert.throws(() => config.assertPlan({collection_authorized: value,
      sources: [{id: localSource.id, feed_url: localSource.feedUrl}]}), /source_plan_refused/)
  for (const sources of [[], [{id: localSource.id, feed_url: 'http://127.0.0.1:43191/other'}],
    [{id: localSource.id, feed_url: localSource.feedUrl}, {id: 'other', feed_url: localSource.feedUrl}]])
    assert.throws(() => assertExactSourcePlan({collection_authorized: true, sources}, localSource), /source_plan_refused/)
})

test('ambiguous acknowledgement, failure and backlog never trigger a second execution', async () => {
  for (const outcome of ['throw', 'missing', 'wrong-run', 'expired', 'backlog', 'extraction']) {
    let calls = 0
    const result = await runOperationalHost({env: environment(), source: localSource, disposable: true,
      runNativeHostImpl: async config => {
        calls++
        if (outcome === 'throw') throw Error('secret SQL diagnostic')
        if (outcome === 'missing') return null
        if (outcome === 'wrong-run') return {...complete(config), run_id: 'another-run'}
        if (outcome === 'expired') return {...complete(config), state: 'native_host_failed', needs_reconciliation: true}
        return {...complete(config), state: 'failed', needs_reconciliation: true,
          [outcome === 'backlog' ? 'unresolved' : 'extraction_incomplete']: 1}
      }})
    assert.equal(calls, 1, outcome)
    assert.equal(result.needs_reconciliation, true, outcome)
    assert.notEqual(result.state, 'completed', outcome)
    assert.equal(JSON.stringify(result).includes('secret SQL diagnostic'), false)
  }
})

test('restart while disabled performs no execution and an enabled restart preserves caller-supplied run identity', async () => {
  let calls = 0; const ids = []
  const execute = async config => {calls++; ids.push(config.runId); return complete(config)}
  const env = environment()
  await runOperationalHost({env, source: localSource, disposable: true, runNativeHostImpl: execute})
  await runOperationalHost({env: {...env, MIP_QIK_OPERATIONAL_ENABLED: ''}, source: localSource,
    disposable: true, runNativeHostImpl: execute})
  assert.equal(calls, 1)
  await runOperationalHost({env, source: localSource, disposable: true, runNativeHostImpl: execute})
  assert.deepEqual(ids, [env.MIP_QIK_NATIVE_RUN_ID, env.MIP_QIK_NATIVE_RUN_ID])
  // This wrapper has no restart journal. Existing native begin_run must reject
  // a reused completed run; it must never silently generate a fresh run ID.
})

test('operational boundary carries controlled local RSS through the existing bounded fetch and parser', async () => {
  const {createServer} = await import('node:http')
  const {readFile} = await import('node:fs/promises')
  const {boundedFeedFetcher} = await import('../supabase/qualification/qik-ingest/nativeHost.mjs')
  const {parseFeed, extractClaims} = await import('../supabase/functions/collector-algorithm-shadow-candidate/predecessorV8.js')
  const xml = await readFile(new URL('./fixtures/qik-persistent-caller-feed.xml', import.meta.url), 'utf8')
  let requests = 0, authHeader
  const server = createServer((req, res) => {
    requests++; authHeader = req.headers.authorization
    res.writeHead(200, {'content-type': 'application/rss+xml'}); res.end(xml)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const source = {...localSource, feedUrl: 'http://127.0.0.1:' + server.address().port + '/controlled.xml'}
    const env = {...environment(), MIP_QIK_SOURCE_FEED_URL: source.feedUrl}
    let executions = 0
    const result = await runOperationalHost({env, source, disposable: true,
      runNativeHostImpl: async config => {
        executions++
        config.assertPlan({collection_authorized: true, sources: [{id: source.id, feed_url: source.feedUrl}]})
        const fetchText = boundedFeedFetcher(config)
        const items = parseFeed(await fetchText(source.feedUrl), source.feedUrl)
        assert.equal(items.length, 2)
        assert.ok(items.every(item => item.url.startsWith('https://qualification.invalid/persistent-native-caller/')))
        assert.deepEqual(items.map(item => extractClaims(item.summary).length), [1, 1])
        await assert.rejects(fetchText(source.feedUrl + '?unapproved=1'), /feed_denied/)
        return {...complete(config), inserted: items.length}
      }})
    assert.equal(result.state, 'completed'); assert.equal(result.inserted, 2)
    assert.equal(executions, 1); assert.equal(requests, 1)
    assert.equal(authHeader, undefined, 'database credentials must never become a feed authorization header')
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
