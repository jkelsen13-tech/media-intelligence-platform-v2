import test from 'node:test'
import assert from 'node:assert/strict'
import { withNarrowPgSourceSnapshot, createNarrowPgDestination,
  prepareNarrowPgParentCustody, writePreparedParentCustody, sealParentManifest,
  buildScopedNarrowManifest,
  sourceOperationScopeDigest,
  CUSTODY_VERSION, DESTINATION_REF, SOURCE_REF, FIELD_ALLOWLIST } from '../../scripts/mipNieParentCustody.mjs'
import { fingerprintPayload } from '../../scripts/mipLegacyGraphStaging.mjs'

const login = 'nie_fixture_login'
const sha = 'a'.repeat(64)
const id = '11111111-1111-4111-8111-111111111111'
function fakeClient({ projectRef = SOURCE_REF, ssl = true, verified = true,
  rejectBegin = false, rejectCommit = false, rejectRollback = false,
  readbackValue, sourceRows, closure } = {}) {
  const calls = []
  const client = {
    connectionInfo: { projectRef, tlsVerified: verified }, released: false, calls,
    async query(sql, params) {
      assert.equal(this.released, false, 'query after release')
      calls.push({ sql, params })
      if (sql.startsWith('begin') && rejectBegin) throw Error('lost begin acknowledgment')
      if (sql.includes('pg_stat_ssl')) return { rows: [{ session_user: login, current_user: login, ssl }] }
      if (sql.includes('pg_current_snapshot()')) return { rows: [{ isolation: 'repeatable read',
        read_only: 'on', snapshot_state: '1:2:', backend_pid: 123,
        captured_at: '2026-09-23T00:00:00.000Z' }] }
      if (sql === 'commit' && rejectCommit) throw Error('lost commit acknowledgment')
      if (sql === 'rollback' && rejectRollback) throw Error('rollback acknowledgment lost')
      if (sql.includes('row_to_json')) return { rows: sourceRows ? [
        { payload_json: JSON.stringify(sourceRows[sql.includes('public.events') ? 'events' : 'articles']) }
      ] : [{ payload_json: '{"id":"' + id + '"}' }] }
      if (sql.includes('full_parent_inventory')) return { rows: [{ value: closure ?? { event_count: 1 } }] }
      if (sql.includes('nie_parent_enqueue_scoped')) return { rows: [{ value: { job_id: id } }] }
      if (sql.includes('nie_parent_readback_run_scoped')) return { rows: [{ value: readbackValue }] }
      return { rows: [] }
    },
    async release(error) { this.released = true; this.discarded = Boolean(error) },
  }
  return client
}

test('source fence, page and closure share one read-only transaction; escaped methods close', async () => {
  const client = fakeClient()
  let escaped
  const fence = await withNarrowPgSourceSnapshot({ connect: async () => client,
    expectedLogin: login, schemaSha256: sha }, async ({ source, fence, readPage, readClosure }) => {
    escaped = { readPage, readClosure }
    return source.withSnapshot(async snapshot => {
      assert.equal(snapshot.fence.snapshot_id, fence.snapshot_id)
      assert.match(fence.snapshot_id, /^[0-9a-f-]{36}$/)
      assert.equal((await readPage({ source_project_ref: SOURCE_REF, source_table: 'events',
        ids: [id], fields: FIELD_ALLOWLIST.events, after_id: null }))[0], '{"id":"' + id + '"}')
      assert.deepEqual(await readClosure({ source_project_ref: SOURCE_REF,
        membership_table: 'event_articles' }), { event_count: 1 })
      return fence
    })
  })
  assert.equal(client.released, true)
  assert.equal(client.discarded, false)
  assert.equal(client.calls.filter(x => x.sql.startsWith('begin isolation level')).length, 1)
  assert.equal(client.calls.filter(x => x.sql === 'commit').length, 1)
  await assert.rejects(escaped.readClosure({ source_project_ref: SOURCE_REF,
    membership_table: 'event_articles' }), /source_closure_request_invalid/)
  assert.equal(client.calls.at(-1).sql, 'commit')
  assert.equal(fence.schema_sha256, sha)
})

test('source callback failure rolls back and closes escaped methods', async () => {
  const client = fakeClient()
  let escaped
  await assert.rejects(withNarrowPgSourceSnapshot({ connect: async () => client,
    expectedLogin: login, schemaSha256: sha }, async ({ readPage }) => {
    escaped = readPage
    throw Error('synthetic failure')
  }), /synthetic failure/)
  assert.equal(client.calls.at(-1).sql, 'rollback')
  assert.equal(client.released, true)
  await assert.rejects(escaped({ source_project_ref: SOURCE_REF, source_table: 'events',
    ids: [id], fields: FIELD_ALLOWLIST.events }), /source_page_request_invalid/)
})

test('destination transaction methods close after commit and ambiguous commit', async () => {
  for (const rejectCommit of [false, true]) {
    const client = fakeClient({ projectRef: 'qikvmopbtijoebdqosyq', rejectCommit })
    const destination = createNarrowPgDestination({ connect: async () => client,
      expectedLogin: login })
    let escaped
    const work = destination.withPageTransaction(async tx => {
      escaped = tx
      return tx.rpc('enqueue', { run_id: 'synthetic-run', records: [{ id }] })
    })
    if (rejectCommit) await assert.rejects(work, /commit_outcome_unknown/)
    else assert.deepEqual(await work, { job_id: id })
    assert.equal(client.released, true)
    assert.equal(client.discarded, rejectCommit)
    await assert.rejects(escaped.rpc('claim', { run_id: 'synthetic-run' }),
      /destination_transaction_closed/)
    assert.equal(client.calls.at(-1).sql, rejectCommit ? 'rollback' : 'commit')
  }
})

test('failed rollback discards uncertain source connection instead of returning it to pool', async () => {
  const client = fakeClient({ rejectRollback: true })
  await assert.rejects(withNarrowPgSourceSnapshot({ connect: async () => client,
    expectedLogin: login, schemaSha256: sha }, async () => {
    throw Error('source callback failed')
  }), /source callback failed/)
  assert.equal(client.released, true)
  assert.equal(client.discarded, true)
})

test('failed destination rollback destroys uncertain pooled connection', async () => {
  const client = fakeClient({ projectRef: 'qikvmopbtijoebdqosyq', rejectRollback: true })
  const destination = createNarrowPgDestination({ connect: async () => client,
    expectedLogin: login })
  await assert.rejects(destination.withPageTransaction(async () => {
    throw Error('writer failed')
  }), /writer failed/)
  assert.equal(client.released, true)
  assert.equal(client.discarded, true)
})

test('lost BEGIN acknowledgment discards client even if rollback appears to succeed', async () => {
  for (const projectRef of [SOURCE_REF, DESTINATION_REF]) {
    const client = fakeClient({ projectRef, rejectBegin: true })
    const invocation = projectRef === SOURCE_REF
      ? withNarrowPgSourceSnapshot({ connect: async () => client,
        expectedLogin: login, schemaSha256: sha }, async () => {})
      : createNarrowPgDestination({ connect: async () => client,
        expectedLogin: login }).withPageTransaction(async () => {})
    await assert.rejects(invocation, /lost begin acknowledgment/)
    assert.equal(client.calls.at(-1).sql, 'rollback')
    assert.equal(client.discarded, true)
  }
})

test('encrypted transport alone cannot satisfy verified endpoint contract', async () => {
  const client = fakeClient({ verified: false })
  await assert.rejects(withNarrowPgSourceSnapshot({ connect: async () => client,
    expectedLogin: login, schemaSha256: sha }, async () => {}), /pg_identity_or_tls_invalid/)
  assert.equal(client.released, true)
})

test('readback uses fresh authenticated connection and exact run/source row set', async () => {
  const expected = [{ source_id: id, source_table: 'events', payload_json: '{"id":"' + id + '"}' }]
  const clients = []
  const destination = createNarrowPgDestination({ connect: async () => {
    const client = fakeClient({ projectRef: 'qikvmopbtijoebdqosyq', readbackValue: expected })
    clients.push(client)
    return client
  }, expectedLogin: login })
  const rows = await destination.readStaged({ source_project_ref: SOURCE_REF,
    source_table: 'events', run_id: 'approved-run', ids: [id] })
  assert.deepEqual(rows, expected)
  assert.equal(clients.length, 1)
  assert.equal(clients[0].released, true)
  assert.deepEqual(clients[0].calls.at(-1).params, ['approved-run'])
  await assert.rejects(destination.readStaged({ source_project_ref: SOURCE_REF,
    source_table: 'events', run_id: 'approved-run', ids: ['bad'] }), /readback_request_invalid/)
  assert.equal(clients.length, 1)
  await assert.rejects(destination.withPageTransaction(tx => tx.rpc('delete_job', { run_id: 'approved-run' })),
    /destination_action_denied/)
  assert.equal(clients.length, 2)
  assert.equal(clients[1].calls.at(-1).sql, 'rollback')
})

test('manifest and payload prepare under one source fence, commit before any destination write', async () => {
  const sourceRows = Object.fromEntries(['events','articles'].map((table, index) =>
    [table, Object.fromEntries(FIELD_ALLOWLIST[table].map(field =>
      [field, field === 'id' ? (index ? '22222222-2222-4222-8222-222222222222' : id) : null]))]))
  const closure = { event_count: 1, article_count: 1, membership_count: 1,
    unapproved_membership_count: 0,
    event_keys_sha256: fingerprintPayload([sourceRows.events.id]),
    article_keys_sha256: fingerprintPayload([sourceRows.articles.id]),
    membership_keys_sha256: fingerprintPayload([[sourceRows.events.id, sourceRows.articles.id]]) }
  const client = fakeClient({ sourceRows, closure })
  const approvedIds = { events: [sourceRows.events.id], articles: [sourceRows.articles.id] }
  const operationAuthorization = { mode: 'synthetic_test_only', synthetic_test_only: true,
    source_login: login, source_project_ref: SOURCE_REF,
    destination_project_ref: DESTINATION_REF,
    scope_sha256: sourceOperationScopeDigest({ approvedIds, runPrefix: 'n3.synthetic' }) }
  const preparedCustody = await prepareNarrowPgParentCustody({ sourceConnection: {
    connect: async () => client, expectedLogin: login, schemaSha256: sha },
    approvedIds, runPrefix: 'n3.synthetic', operationAuthorization })
  assert.equal(client.calls.at(-1).sql, 'commit')
  assert.equal(client.released, true)
  let destinationCalled = false
  const destination = { rpc: async () => {}, readStaged: async () => [],
    withPageTransaction: async () => { destinationCalled = true; throw Error('synthetic destination stop') } }
  await assert.rejects(writePreparedParentCustody({ preparedCustody, destination,
    authorization: { mode: 'owner_approved', manifest_sha256: preparedCustody.manifest.sha256,
      private_host: true, permission_basis_id: 'approved', retention_contract_id: 'approved',
      route_id: 'approved', cost_boundary_id: 'approved', operation_id: null,
      operation_scope_sha256: preparedCustody.operation_scope_sha256,
      scope_provisioning_receipt_id: 'approved' } }),
  /operation_scope_not_bound/)
  assert.equal(destinationCalled, false)
  const result = await writePreparedParentCustody({ preparedCustody, destination,
    authorization: { mode: 'synthetic_test_only', synthetic_test_only: true,
      manifest_sha256: preparedCustody.manifest.sha256 } })
  assert.equal(destinationCalled, true)
  assert.equal(result.state, 'incomplete')
  preparedCustody.prepared[0][0].payload.canonical_title = 'changed'
  destinationCalled = false
  await assert.rejects(writePreparedParentCustody({ preparedCustody, destination,
    authorization: { mode: 'synthetic_test_only', synthetic_test_only: true,
      manifest_sha256: preparedCustody.manifest.sha256 } }), /prepared_payload_changed/)
  assert.equal(destinationCalled, false)
})

test('source commit uncertainty returns no prepared custody and discards connection', async () => {
  const commitClient = fakeClient({ rejectCommit: true })
  await assert.rejects(withNarrowPgSourceSnapshot({ connect: async () => commitClient,
    expectedLogin: login, schemaSha256: sha }, async () => 'prepared'),
  /lost commit acknowledgment/)
  assert.equal(commitClient.discarded, true)
})

test('missing or mismatched operation authority refuses connection before payload reads', async () => {
  let connected = false
  const approvedIds = { events: [id], articles: ['22222222-2222-4222-8222-222222222222'] }
  const sourceConnection = { connect: async () => { connected = true; return fakeClient() },
    expectedLogin: login, schemaSha256: sha }
  await assert.rejects(prepareNarrowPgParentCustody({ sourceConnection, approvedIds,
    runPrefix: 'n3.synthetic', operationAuthorization: { mode: 'owner_approved',
      scope_sha256: 'b'.repeat(64), source_login: login,
      source_project_ref: SOURCE_REF, destination_project_ref: DESTINATION_REF } }),
  /source_operation_not_authorized/)
  assert.equal(connected, false)
  await assert.rejects(prepareNarrowPgParentCustody({ sourceConnection, approvedIds,
    runPrefix: 'n3.synthetic', operationAuthorization: { mode: 'owner_approved',
      scope_sha256: sourceOperationScopeDigest({ approvedIds, runPrefix: 'n3.synthetic' }),
      source_login: login, source_project_ref: SOURCE_REF,
      destination_project_ref: DESTINATION_REF, operation_id: id,
      private_host: true, host_id: 'reviewed', permission_basis_id: 'reviewed',
      route_id: 'reviewed', cost_boundary_id: 'reviewed' } }),
  /source_operation_not_authorized/)
  assert.equal(connected, false)
})
