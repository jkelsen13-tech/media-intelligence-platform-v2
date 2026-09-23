import { createHash } from 'node:crypto'
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
  if (closure?.membership_count !== manifest.closure.membership_count
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
  const queued = await destination.rpc('enqueue', { run_id: page.run_id, records, mappings: [] })
  if (queued?.run_id !== page.run_id || !queued.job_id) fail('destination_enqueue_mismatch')
  let result = queued
  if (!queued.already_completed) {
    const claimed = await destination.rpc('claim', { run_id: page.run_id })
    if (!claimed || claimed.run_id !== page.run_id || claimed.id !== queued.job_id || !claimed.lease_token
        || claimed.source_project_ref !== SOURCE_REF || claimed.source_table !== page.table
        || claimed.page_sha256 !== fingerprintPayload(records)) fail('destination_claim_unavailable')
    result = await destination.finishParentJob({ job_id: claimed.id, lease_token: claimed.lease_token,
      run_id: page.run_id, page_sha256: claimed.page_sha256 })
    if (result?.job_id !== claimed.id) fail('destination_finish_mismatch')
  }
  assertRpcResult(result, page)
  const readback = await destination.readStaged({ source_project_ref: SOURCE_REF, source_table: page.table, ids: page.expected.map(r => r.id) })
  assertReadback(readback, page)
  return { table: page.table, run_id: page.run_id, count: page.expected.length, page_sha256: page.page_sha256, state: 'verified' }
}
/**
 * Source adapter must keep every readPage call inside ONE read-only repeatable-read
 * transaction and return a pinned transaction attestation. This interface cannot
 * prove connector behavior; the approved private host must qualify it separately.
 * Destination adapter exposes exact-run enqueue/claim, private scoped finish and readStaged.
 * synthetic_test_only is for source-free qualification fixtures, not a security boundary.
 */
export async function executeParentCustody({ manifest, source, destination, authorization }) {
  validateParentManifest(manifest)
  assertAuthorized(manifest, authorization)
  if (typeof source?.withSnapshot !== 'function' || typeof destination?.rpc !== 'function'
      || typeof destination?.readStaged !== 'function' || typeof destination?.finishParentJob !== 'function') fail('adapter_missing')
  const pages = pagePlan(manifest)
  let prepared
  try {
    prepared = await source.withSnapshot(async ({ fence, readPage, readClosure }) => {
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
  } catch (error) {
    return { state: 'not_started', verified_pages: [], code: redactedCode(error, 'source_read_failed'), case: 'source_fence_or_read' }
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

/** Reconstruct current native snapshots from private custody without public writes.
 * The returned lossless JSON is the restorable unit; external FK families remain unresolved.
 */
export async function reconstructParentSnapshots({ manifest, destination }) {
  validateParentManifest(manifest)
  if (typeof destination?.readStaged !== 'function') fail('adapter_missing')
  const snapshots = []
  for (const page of pagePlan(manifest)) {
    const rows = await destination.readStaged({ source_project_ref: SOURCE_REF,
      source_table: page.table, ids: page.expected.map(r => r.id) })
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
