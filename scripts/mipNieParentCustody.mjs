import { createHash, randomUUID } from 'node:crypto'
import { MAX_PAGE_SIZE, fingerprintPayload, parseJsonLossless, serializeStagingJson, stableStringify } from './mipLegacyGraphStaging.mjs'

export const CUSTODY_VERSION = 'nie-parent-custody/v1'
export const SOURCE_REF = 'niejaejtbxgakyrsntxm'
export const DESTINATION_REF = 'qikvmopbtijoebdqosyq'
export const FIELD_ALLOWLIST = Object.freeze({
  events: Object.freeze(['id','canonical_title','occurred_at_start','occurred_at_end','location_text','arc_id','arc_event_id','status','rule_version','created_at']),
  articles: Object.freeze(['id','feed','outlet','title','url','summary','published_at','fetched_at','outlet_id','author_id','body_text','embedding','claims','arc_id','unattributed','monoculture','is_digest','image_url','image_alt','entities_extracted_at','arc_assign_attempted_at','arc_assignment_evidence','source_status','source_status_changed_at','source_status_note','ingestion_run_id','is_pre_ruling','different_causal_chain']),
})
const TABLES = ['events', 'articles']
const SHA = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const MAX_CUSTODY_BYTES = 128 * 1024 * 1024
const CUSTODY_ERROR = Symbol('custody_error')

function fail(code) { throw Object.assign(new Error(code), { code, [CUSTODY_ERROR]: true }) }
function redactedCode(error, fallback) { return error?.[CUSTODY_ERROR] === true ? error.code : fallback }
function sameKeys(value, fields) {
  return value && !Array.isArray(value) && typeof value === 'object'
    && Object.keys(value).sort().join('|') === [...fields].sort().join('|')
}
function digest(value) { return createHash('sha256').update(stableStringify(value)).digest('hex') }
function manifestBody(manifest) { const { sha256, ...body } = manifest; return body }
export function sealParentManifest(body) {
  const manifest = { ...body }
  return { ...manifest, sha256: digest(manifest) }
}
export function validateParentManifest(manifest) {
  if (!manifest || manifest.version !== CUSTODY_VERSION || manifest.source_project_ref !== SOURCE_REF
      || manifest.destination_project_ref !== DESTINATION_REF || manifest.destination_schema !== 'legacy_graph_staging'
      || manifest.snapshot_kind !== 'current_at_fence' || !manifest.snapshot_id || !Array.isArray(manifest.retained_versions) || manifest.retained_versions.length !== 0
      || !manifest.fence?.method || manifest.fence.method !== 'repeatable_read_read_only_pinned'
      || !manifest.fence?.captured_at || !manifest.schema_sha256 || !SHA.test(manifest.schema_sha256)
      || (manifest.source_group_scope_sha256 !== undefined
        && !SHA.test(manifest.source_group_scope_sha256))
      || !Number.isSafeInteger(manifest.max_bytes) || manifest.max_bytes < 1 || manifest.max_bytes > MAX_CUSTODY_BYTES
      || !manifest.run_prefix || !/^[a-zA-Z0-9._-]{1,40}$/.test(manifest.run_prefix)
      || !Number.isSafeInteger(manifest.closure?.membership_count) || manifest.closure.membership_count < 1
      || !SHA.test(manifest.closure?.membership_keys_sha256 ?? '')
      || manifest.sha256 !== digest(manifestBody(manifest))) fail('manifest_invalid')
  if (Object.keys(manifest.tables ?? {}).sort().join('|') !== TABLES.slice().sort().join('|')) fail('manifest_tables')
  let count = 0
  for (const table of TABLES) {
    const spec = manifest.tables[table]
    if (JSON.stringify(spec?.fields) !== JSON.stringify(FIELD_ALLOWLIST[table])
        || !Array.isArray(spec?.rows) || spec.rows.length < 1
        || !SHA.test(spec.rows_sha256 ?? '') || !SHA.test(spec.keys_sha256 ?? '')) fail('manifest_schema_or_rows')
    let prior = ''
    for (const row of spec.rows) {
      if (!UUID.test(row?.id ?? '') || row.id <= prior || !SHA.test(row.sha256 ?? '')) fail('manifest_row_identity')
      prior = row.id
      count++
    }
    if (spec.rows_sha256 !== digest(spec.rows) || spec.keys_sha256 !== digest(spec.rows.map(r => r.id))) fail('manifest_rows_digest')
  }
  if (count > 10000) fail('manifest_too_many_rows')
  return true
}
function pagePlan(manifest) {
  const pages = []
  for (const table of TABLES) {
    const rows = manifest.tables[table].rows
    for (let start = 0; start < rows.length; start += MAX_PAGE_SIZE) {
      const expected = rows.slice(start, start + MAX_PAGE_SIZE)
      const ordinal = Math.floor(start / MAX_PAGE_SIZE)
      const run_id = `${manifest.run_prefix}.${manifest.sha256}.${table}.${String(ordinal).padStart(4,'0')}`
      if (run_id.length > 120) fail('run_id_length')
      pages.push({ table, expected, run_id, ordinal, page_sha256: digest(expected) })
    }
  }
  return pages
}
function parseRow(raw, fields) {
  if (typeof raw !== 'string') fail('source_lossless_json_required')
  const row = parseJsonLossless(raw)
  if (!sameKeys(row, fields)) fail('source_field_drift')
  return row
}
function verifySourcePage(page, fetched, fields) {
  if (!Array.isArray(fetched) || fetched.length !== page.expected.length) fail('source_row_set_changed')
  return fetched.map((raw, i) => {
    const payload = parseRow(raw, fields)
    const expected = page.expected[i]
    if (payload.id !== expected.id) fail('source_row_set_changed')
    if (fingerprintPayload(payload) !== expected.sha256) fail('source_row_hash_changed')
    return {
      source_project_ref: SOURCE_REF,
      source_table: page.table,
      source_id: expected.id,
      object_family: page.table === 'events' ? 'source_comparison_event' : 'article',
      payload,
      payload_json: serializeStagingJson(payload),
      payload_sha256: expected.sha256,
      source_imported_at: null,
      recovery_status: null,
    }
  })
}
function assertClosure(closure, manifest) {
  if ((closure?.event_count !== undefined && closure.event_count !== manifest.tables.events.rows.length)
      || (closure?.article_count !== undefined && closure.article_count !== manifest.tables.articles.rows.length)
      || (closure?.unapproved_membership_count !== undefined && closure.unapproved_membership_count !== 0)
      || closure?.membership_count !== manifest.closure.membership_count
      || closure.membership_keys_sha256 !== manifest.closure.membership_keys_sha256
      || closure.event_keys_sha256 !== manifest.tables.events.keys_sha256
      || closure.article_keys_sha256 !== manifest.tables.articles.keys_sha256) fail('source_closure_changed')
}
function assertFence(fence, manifest) {
  if (fence?.method !== 'repeatable_read_read_only_pinned' || fence.read_only !== true
      || fence.isolation !== 'repeatable read' || fence.pinned !== true
      || fence.snapshot_id !== manifest.snapshot_id || fence.captured_at !== manifest.fence.captured_at
      || !fence.transaction_id || fence.schema_sha256 !== manifest.schema_sha256) fail('source_fence_invalid')
}
function assertAuthorized(manifest, authorization) {
  if (authorization?.mode === 'synthetic_test_only' && authorization.synthetic_test_only === true
      && authorization.manifest_sha256 === manifest.sha256) return
  if (authorization?.mode !== 'owner_approved' || authorization.manifest_sha256 !== manifest.sha256
      || authorization.private_host !== true || !authorization.permission_basis_id
      || !authorization.retention_contract_id || !authorization.route_id
      || !authorization.cost_boundary_id) fail('real_transfer_not_authorized')
}
function assertRpcResult(result, page) {
  if (result?.run_id !== page.run_id || !Array.isArray(result.results)
      || result.results.length !== page.expected.length || result.state !== 'completed' && !result.already_completed) fail('destination_job_incomplete')
  result.results.forEach((item, i) => {
    if (item.source_id !== page.expected[i].id || item.payload_sha256 !== page.expected[i].sha256
        || item.review_state !== 'pending' || item.conflict_id || item.incoming_version_id) fail('destination_conflict')
  })
}
function assertReadback(rows, page) {
  if (!Array.isArray(rows) || rows.length !== page.expected.length) fail('readback_row_set')
  rows.forEach((row, i) => {
    const expected = page.expected[i]
    if (row.source_project_ref !== SOURCE_REF || row.source_table !== page.table || row.source_id !== expected.id
        || row.payload_sha256 !== expected.sha256 || row.review_state !== 'pending'
        || typeof row.payload_json !== 'string' || !sameKeys(parseJsonLossless(row.payload_json), FIELD_ALLOWLIST[page.table]) || fingerprintPayload(parseJsonLossless(row.payload_json)) !== expected.sha256
        || !Array.isArray(row.versions) || !row.versions.some(v => v.source_project_ref === SOURCE_REF
          && v.source_table === page.table && v.source_id === expected.id
          && v.origin === 'staged_original' && v.payload_sha256 === expected.sha256
          && typeof v.payload_json === 'string' && fingerprintPayload(parseJsonLossless(v.payload_json)) === expected.sha256)) fail('readback_mismatch')
  })
}
async function processPage(destination, page, records) {
  // One destination transaction keeps the queued job invisible to generic workers
  // until the scoped finish has completed. This is separate from the source fence.
  let result
  try { result = await destination.withPageTransaction(async tx => {
    if (typeof tx?.rpc !== 'function' || typeof tx?.finishParentJob !== 'function') fail('destination_transaction_invalid')
    const queued = await tx.rpc('enqueue', { run_id: page.run_id, records, mappings: [] })
    if (queued?.run_id !== page.run_id || !queued.job_id) fail('destination_enqueue_mismatch')
    let finished = queued
    if (!queued.already_completed) {
      const claimed = await tx.rpc('claim', { run_id: page.run_id })
      if (!claimed || claimed.run_id !== page.run_id || claimed.id !== queued.job_id || !claimed.lease_token
          || claimed.source_project_ref !== SOURCE_REF || claimed.source_table !== page.table
          || claimed.page_sha256 !== fingerprintPayload(records)) fail('destination_claim_unavailable')
      finished = await tx.finishParentJob({ job_id: claimed.id, lease_token: claimed.lease_token,
        run_id: page.run_id, page_sha256: claimed.page_sha256 })
      if (finished?.job_id !== claimed.id) fail('destination_finish_mismatch')
    }
    assertRpcResult(finished, page)
    return finished
  }) } catch (error) {
    if (error?.code !== 'commit_outcome_unknown') throw error
    // A lost acknowledgment is never a reason to replay the page. The same
    // narrow LOGIN must prove the exact committed rows on a new connection.
    const rows = await destination.readStaged({ source_project_ref: SOURCE_REF,
      source_table: page.table, run_id: page.run_id, ids: page.expected.map(r => r.id) })
    assertReadback(rows, page)
    return { table: page.table, run_id: page.run_id, count: page.expected.length,
      page_sha256: page.page_sha256, state: 'verified_after_unknown_commit' }
  }
  assertRpcResult(result, page)
  const readback = await destination.readStaged({ source_project_ref: SOURCE_REF, source_table: page.table,
    run_id: page.run_id, ids: page.expected.map(r => r.id) })
  assertReadback(readback, page)
  return { table: page.table, run_id: page.run_id, count: page.expected.length, page_sha256: page.page_sha256, state: 'verified' }
}
/**
 * Source adapter must keep every readPage call inside ONE read-only repeatable-read
 * transaction and return a pinned transaction attestation. This interface cannot
 * prove connector behavior; the approved private host must qualify it separately.
 * Destination adapter holds enqueue, exact-run claim and private scoped finish on one
 * destination connection and transaction; readback occurs after that commit.
 * synthetic_test_only is for source-free qualification fixtures, not a security boundary.
 */
async function prepareParentPages(manifest, source) {
  if (typeof source?.withSnapshot !== 'function') fail('adapter_missing')
  const pages = pagePlan(manifest)
  const prepared = await source.withSnapshot(async ({ fence, readPage, readClosure }) => {
      assertFence(fence, manifest)
      if (typeof readPage !== 'function' || typeof readClosure !== 'function') fail('source_reader_missing')
      assertClosure(await readClosure({ source_project_ref: SOURCE_REF, membership_table: 'event_articles' }), manifest)
      const fetched = []
      let bytes = 0
      for (const page of pages) {
        const rows = await readPage({ source_project_ref: SOURCE_REF, source_table: page.table,
          ids: page.expected.map(r => r.id), fields: FIELD_ALLOWLIST[page.table], after_id: page.ordinal ? pages.filter(p => p.table === page.table)[page.ordinal - 1].expected.at(-1).id : null })
        if (!Array.isArray(rows)) fail('source_page_invalid')
        bytes += rows.reduce((n, row) => n + Buffer.byteLength(String(row), 'utf8'), 0)
        if (bytes > manifest.max_bytes) fail('source_bytes_exceeded')
        fetched.push(verifySourcePage(page, rows, FIELD_ALLOWLIST[page.table]))
      }
      return fetched
    })
  return { manifest, prepared }
}
export async function writePreparedParentCustody({ preparedCustody, destination, authorization }) {
  const { manifest, prepared } = preparedCustody ?? {}
  validateParentManifest(manifest)
  assertAuthorized(manifest, authorization)
  if (authorization.mode === 'owner_approved'
      && (!SHA.test(preparedCustody?.operation_scope_sha256 ?? '')
        || preparedCustody.operation_mode !== 'owner_approved'
        || !UUID.test(preparedCustody.operation_id ?? '')
        || authorization.operation_scope_sha256 !== preparedCustody.operation_scope_sha256
        || authorization.operation_id !== preparedCustody.operation_id
        || !authorization.scope_provisioning_receipt_id)) fail('operation_scope_not_bound')
  if (typeof destination?.rpc !== 'function' || typeof destination?.readStaged !== 'function'
      || typeof destination?.withPageTransaction !== 'function' || !Array.isArray(prepared)) fail('adapter_missing')
  const pages = pagePlan(manifest)
  if (prepared.length !== pages.length) fail('prepared_page_set_changed')
  for (let i = 0; i < pages.length; i++) {
    if (!Array.isArray(prepared[i]) || prepared[i].length !== pages[i].expected.length) fail('prepared_page_set_changed')
    for (let j = 0; j < prepared[i].length; j++) {
      const record = prepared[i][j], expected = pages[i].expected[j]
      if (record?.source_id !== expected.id || record.source_table !== pages[i].table
          || record.source_project_ref !== SOURCE_REF
          || fingerprintPayload(record.payload) !== expected.sha256) fail('prepared_payload_changed')
    }
  }
  const verified_pages = []
  for (let i = 0; i < pages.length; i++) {
    try { verified_pages.push(await processPage(destination, pages[i], prepared[i])) }
    catch (error) {
      return { state: 'incomplete', verified_pages, pending_run_id: pages[i].run_id,
        code: redactedCode(error, 'destination_or_readback_failed'), case: `${pages[i].table}:${pages[i].ordinal}` }
    }
  }
  return { state: 'readback_verified', verified_pages, snapshot_id: manifest.snapshot_id,
    manifest_sha256: manifest.sha256, rows: verified_pages.reduce((n,p) => n + p.count, 0) }
}
export async function executeParentCustody({ manifest, source, destination, authorization }) {
  validateParentManifest(manifest)
  assertAuthorized(manifest, authorization)
  let preparedCustody
  try { preparedCustody = await prepareParentPages(manifest, source) }
  catch (error) {
    return { state: 'not_started', verified_pages: [], code: redactedCode(error, 'source_read_failed'), case: 'source_fence_or_read' }
  }
  return writePreparedParentCustody({ preparedCustody, destination, authorization })
}

/** Reconstruct current native snapshots from private custody without public writes.
 * The returned lossless JSON is the restorable unit; external FK families remain unresolved.
 */
export async function reconstructParentSnapshots({ manifest, destination }) {
  validateParentManifest(manifest)
  if (typeof destination?.readStaged !== 'function') fail('adapter_missing')
  const snapshots = []
  for (const page of pagePlan(manifest)) {
    const rows = await destination.readStaged({ source_project_ref: SOURCE_REF,
      source_table: page.table, run_id: page.run_id, ids: page.expected.map(r => r.id) })
    assertReadback(rows, page)
    rows.forEach((row, i) => snapshots.push({
      source_project_ref: SOURCE_REF, source_table: page.table,
      source_id: page.expected[i].id, snapshot_id: manifest.snapshot_id,
      snapshot_kind: 'current_at_fence', payload_sha256: page.expected[i].sha256,
      payload_json: row.payload_json, version_origin: 'staged_original',
    }))
  }
  return { state: 'reconstructed_current_snapshots', manifest_sha256: manifest.sha256, snapshots }
}

// A connect() implementation must return a direct PostgreSQL client with
// query(sql, params) and release()/end(). It is injected by the private host;
// this module creates no credentials, network endpoint or scheduled caller.
async function closeClient(client, discard = false) {
  if (typeof client?.release === 'function') await client.release(discard)
  else if (typeof client?.end === 'function') await client.end()
}
async function checkedClient(connect, expectedLogin, requireTls, expectedProjectRef) {
  const client = await connect()
  if (!client || typeof client.query !== 'function') fail('pg_client_invalid')
  try {
    const result = await client.query(`select session_user as session_user,
      current_user as current_user,
      coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) as ssl`)
    const row = result?.rows?.[0]
    if (!row || row.session_user !== expectedLogin || row.current_user !== expectedLogin
        || (requireTls && (row.ssl !== true || client.connectionInfo?.tlsVerified !== true
          || client.connectionInfo?.projectRef !== expectedProjectRef))) fail('pg_identity_or_tls_invalid')
    return client
  } catch (error) { await closeClient(client, true); throw error }
}

/** Direct-connection source transaction. The caller must construct and approve
 * the current manifest inside this callback, then finish all source reads
 * before it returns. A second transaction cannot reuse this fence.
 */
export async function withNarrowPgSourceSnapshot({ connect, expectedLogin, requireTls = true,
  schemaSha256 }, callback) {
  if (typeof connect !== 'function' || typeof callback !== 'function'
      || !expectedLogin || !SHA.test(schemaSha256 ?? '')) fail('source_connection_contract')
  const client = await checkedClient(connect, expectedLogin, requireTls, SOURCE_REF)
  let begun = false
  let beginAcknowledged = false
  let active = false
  let discard = false
  let committing = false
  try {
    begun = true
    await client.query('begin isolation level repeatable read read only')
    beginAcknowledged = true
    const state = (await client.query(`select current_setting('transaction_isolation') as isolation,
      current_setting('transaction_read_only') as read_only,
      pg_current_snapshot()::text as snapshot_state,
      pg_backend_pid() as backend_pid,
      transaction_timestamp() as captured_at`)).rows?.[0]
    if (state?.isolation !== 'repeatable read' || state.read_only !== 'on'
        || !state.snapshot_state || !state.captured_at || !state.backend_pid) fail('source_snapshot_not_pinned')
    const fenceId = randomUUID()
    const fence = Object.freeze({ method: 'repeatable_read_read_only_pinned',
      read_only: true, isolation: 'repeatable read', pinned: true,
      snapshot_id: fenceId,
      transaction_id: `${state.backend_pid}:${fenceId}`,
      snapshot_state: String(state.snapshot_state),
      captured_at: new Date(state.captured_at).toISOString(), schema_sha256: schemaSha256 })
    active = true
    const readPage = async ({ source_project_ref, source_table, ids, fields, after_id }) => {
      if (!active || source_project_ref !== SOURCE_REF || !TABLES.includes(source_table)
          || JSON.stringify(fields) !== JSON.stringify(FIELD_ALLOWLIST[source_table])
          || !Array.isArray(ids) || ids.length < 1 || ids.length > MAX_PAGE_SIZE
          || ids.some(id => !UUID.test(id)) || ids.some((id, i) => i > 0 && id <= ids[i-1])
          || (after_id !== null && after_id !== undefined && (!UUID.test(after_id) || ids[0] <= after_id))) fail('source_page_request_invalid')
      const columnSql = FIELD_ALLOWLIST[source_table].map(column => `"${column}"`).join(',')
      const sql = `select row_to_json(source_row)::text as payload_json from
        (select ${columnSql} from public.${source_table}
         where id = any($1::uuid[]) order by id) source_row`
      const result = await client.query(sql, [ids])
      return result.rows.map(row => row.payload_json)
    }
    const readClosure = async ({ source_project_ref, membership_table }) => {
      if (!active || source_project_ref !== SOURCE_REF || membership_table !== 'event_articles') fail('source_closure_request_invalid')
      const result = await client.query('select nie_parent_access.full_parent_inventory() as value')
      return result.rows?.[0]?.value
    }
    const source = { withSnapshot: async fn => {
      if (!active || typeof fn !== 'function') fail('source_snapshot_closed')
      return fn({ fence, readPage, readClosure })
    } }
    const result = await callback({ source, fence, readPage, readClosure })
    active = false
    committing = true
    await client.query('commit')
    return result
  } catch (error) {
    active = false
    discard = committing || !beginAcknowledged
    if (begun) { try { await client.query('rollback') } catch { discard = true } }
    throw error
  } finally { active = false; await closeClient(client, discard) }
}

/** Construct the manifest only from preapproved IDs and the active source
 * snapshot. Selected-root closure is checked before any qik authority exists.
 */
export async function buildScopedNarrowManifest({ fence, readPage, readClosure },
  { approvedIds, runPrefix, maxBytes = MAX_CUSTODY_BYTES, sourceGroupScopeSha256 }) {
  if (!fence?.pinned || typeof readPage !== 'function' || typeof readClosure !== 'function'
      || !approvedIds || !/^[a-zA-Z0-9._-]{1,40}$/.test(runPrefix ?? '')
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_CUSTODY_BYTES
      || (sourceGroupScopeSha256 !== undefined && !SHA.test(sourceGroupScopeSha256))) fail('manifest_builder_scope_invalid')
  const tables = {}
  let bytes = 0, total = 0
  for (const table of TABLES) {
    const ids = approvedIds[table]
    if (!Array.isArray(ids) || ids.length < 1 || ids.some((id, i) =>
      !UUID.test(id) || (i > 0 && id <= ids[i - 1]))) fail('manifest_builder_ids_invalid')
    total += ids.length
    if (total > 10000) fail('manifest_too_many_rows')
    const rows = []
    for (let start = 0; start < ids.length; start += MAX_PAGE_SIZE) {
      const pageIds = ids.slice(start, start + MAX_PAGE_SIZE)
      const rawRows = await readPage({ source_project_ref: SOURCE_REF, source_table: table,
        ids: pageIds, fields: FIELD_ALLOWLIST[table], after_id: start ? ids[start - 1] : null })
      if (!Array.isArray(rawRows) || rawRows.length !== pageIds.length) fail('source_row_set_changed')
      for (let i = 0; i < rawRows.length; i++) {
        bytes += Buffer.byteLength(String(rawRows[i]), 'utf8')
        if (bytes > maxBytes) fail('source_bytes_exceeded')
        const row = parseRow(rawRows[i], FIELD_ALLOWLIST[table])
        if (row.id !== pageIds[i]) fail('source_row_set_changed')
        rows.push({ id: row.id, sha256: fingerprintPayload(row) })
      }
    }
    tables[table] = { fields: FIELD_ALLOWLIST[table], rows,
      rows_sha256: digest(rows), keys_sha256: digest(ids) }
  }
  const closure = await readClosure({ source_project_ref: SOURCE_REF, membership_table: 'event_articles' })
  if (!Number.isSafeInteger(closure?.membership_count) || closure.membership_count < 1
      || closure.unapproved_membership_count !== 0
      || closure.event_count !== approvedIds.events.length
      || closure.article_count !== approvedIds.articles.length
      || closure.event_keys_sha256 !== tables.events.keys_sha256
      || closure.article_keys_sha256 !== tables.articles.keys_sha256
      || !SHA.test(closure.membership_keys_sha256 ?? '')) fail('source_closure_changed')
  const manifest = sealParentManifest({
    version: CUSTODY_VERSION, source_project_ref: SOURCE_REF,
    destination_project_ref: DESTINATION_REF, destination_schema: 'legacy_graph_staging',
    snapshot_kind: 'current_at_fence', snapshot_id: fence.snapshot_id,
    retained_versions: [], closure: { membership_count: closure.membership_count,
      membership_keys_sha256: closure.membership_keys_sha256 },
    fence: { method: fence.method, captured_at: fence.captured_at },
    schema_sha256: fence.schema_sha256, max_bytes: maxBytes, run_prefix: runPrefix,
    ...(sourceGroupScopeSha256 === undefined ? {} : { source_group_scope_sha256:sourceGroupScopeSha256 }),
    tables,
  })
  validateParentManifest(manifest)
  return manifest
}

export function sourceOperationScopeDigest({ approvedIds, runPrefix, maxBytes = MAX_CUSTODY_BYTES }) {
  if (!approvedIds || !/^[a-zA-Z0-9._-]{1,40}$/.test(runPrefix ?? '')
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_CUSTODY_BYTES) fail('source_operation_scope_invalid')
  let total = 0
  for (const table of TABLES) {
    const ids = approvedIds[table]
    if (!Array.isArray(ids) || ids.length < 1 || ids.some((id, i) =>
      !UUID.test(id) || (i > 0 && id <= ids[i - 1]))) fail('source_operation_scope_invalid')
    total += ids.length
  }
  if (total > 10000) fail('source_operation_scope_invalid')
  return digest({ source_project_ref: SOURCE_REF, destination_project_ref: DESTINATION_REF,
    fields: FIELD_ALLOWLIST, approved_ids: approvedIds, run_prefix: runPrefix,
    max_bytes: maxBytes })
}
/** Pre-read authority is tied to the exact approved IDs and field contract.
 * A trusted supervisor may issue the runtime manifest SHA after this
 * preauthorization and source COMMIT, without waiting for a human in-job.
 */
export async function prepareNarrowPgParentCustody({ sourceConnection, approvedIds,
  runPrefix, maxBytes = MAX_CUSTODY_BYTES, operationAuthorization }) {
  const scopeSha256 = sourceOperationScopeDigest({ approvedIds, runPrefix, maxBytes })
  if (operationAuthorization?.scope_sha256 !== scopeSha256
      || operationAuthorization.source_login !== sourceConnection?.expectedLogin
      || operationAuthorization.source_project_ref !== SOURCE_REF
      || operationAuthorization.destination_project_ref !== DESTINATION_REF) fail('source_operation_not_authorized')
  if (operationAuthorization.mode === 'synthetic_test_only') {
    if (operationAuthorization.synthetic_test_only !== true) fail('source_operation_not_authorized')
  } else if (operationAuthorization.mode !== 'owner_approved'
      || operationAuthorization.private_host !== true
      || !SHA.test(operationAuthorization.source_group_scope_sha256 ?? '')
      || !UUID.test(operationAuthorization.operation_id ?? '')
      || !operationAuthorization.host_id || !operationAuthorization.permission_basis_id
      || !operationAuthorization.retention_contract_id || !operationAuthorization.route_id
      || !operationAuthorization.cost_boundary_id) fail('source_operation_not_authorized')
  const preparedCustody = await withNarrowPgSourceSnapshot(sourceConnection, async context => {
    const manifest = await buildScopedNarrowManifest(context, { approvedIds, runPrefix, maxBytes,
      sourceGroupScopeSha256:operationAuthorization.source_group_scope_sha256 })
    return prepareParentPages(manifest, context.source)
  })
  return { ...preparedCustody, operation_scope_sha256: scopeSha256,
    operation_id: operationAuthorization.operation_id ?? null,
    operation_mode: operationAuthorization.mode }
}

/** Direct-connection destination. Each page uses a single transaction.
 * Readback opens a new connection as the same authenticated login after commit.
 */
export function createNarrowPgDestination({ connect, expectedLogin, requireTls = true }) {
  if (typeof connect !== 'function' || !expectedLogin) fail('destination_connection_contract')
  const rpc = async () => fail('destination_transaction_required')
  const withPageTransaction = async callback => {
    const client = await checkedClient(connect, expectedLogin, requireTls, DESTINATION_REF)
    let begun = false
    let beginAcknowledged = false
    let active = false
    let discard = false
    let committing = false
    try {
      begun = true
      await client.query('begin')
      beginAcknowledged = true
      active = true
      const tx = {
        rpc: async (action, input) => {
          if (!active) fail('destination_transaction_closed')
          let sql, params
          if (action === 'enqueue' && Array.isArray(input?.records) && (!input.mappings || input.mappings.length === 0)) {
            sql = 'select legacy_graph_staging.nie_parent_enqueue_scoped($1,$2::jsonb) as value'
            params = [input.run_id, serializeStagingJson(input.records)]
          } else if (action === 'claim') {
            sql = 'select legacy_graph_staging.nie_parent_claim_scoped($1) as value'
            params = [input?.run_id]
          } else fail('destination_action_denied')
          return (await client.query(sql, params)).rows?.[0]?.value
        },
        finishParentJob: async ({ job_id, lease_token, run_id, page_sha256 }) => {
          if (!active) fail('destination_transaction_closed')
          return (await client.query(`select legacy_graph_staging.nie_parent_finish_scoped(
            $1::uuid,$2::uuid,$3,$4) as value`,
          [job_id, lease_token, run_id, page_sha256])).rows?.[0]?.value
        },
      }
      const result = await callback(tx)
      active = false
      committing = true
      try { await client.query('commit') }
      catch { fail('commit_outcome_unknown') }
      return result
    } catch (error) {
      active = false
      discard = committing || !beginAcknowledged
      if (begun) { try { await client.query('rollback') } catch { discard = true } }
      throw error
    } finally { active = false; await closeClient(client, discard) }
  }
  const readStaged = async ({ source_project_ref, source_table, run_id, ids }) => {
    if (source_project_ref !== SOURCE_REF || !TABLES.includes(source_table)
        || typeof run_id !== 'string' || !Array.isArray(ids) || ids.length < 1
        || ids.length > MAX_PAGE_SIZE || ids.some(id => !UUID.test(id))) fail('readback_request_invalid')
    const client = await checkedClient(connect, expectedLogin, requireTls, DESTINATION_REF)
    let readbackOk = false
    try {
      const value = (await client.query(
        'select legacy_graph_staging.nie_parent_readback_run_scoped($1) as value',
        [run_id])).rows?.[0]?.value
      if (!Array.isArray(value) || value.length !== ids.length
          || value.some((row, i) => row.source_id !== ids[i] || row.source_table !== source_table)) fail('readback_row_set')
      readbackOk = true
      return value
    } finally { await closeClient(client, !readbackOk) }
  }
  return { expectedLogin, endpointHost:connect.endpointHost, requireTls,
    rpc, withPageTransaction, readStaged }
}
