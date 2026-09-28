import { MAX_PAGE_SIZE, fingerprintPayload, stableStringify } from './mipLegacyGraphStaging.mjs'
import { FIELD_ALLOWLIST } from './mipNieParentCustody.mjs'

// Pure metadata planning. This module never connects, reads material, or transfers it.
export const PROJECTS = Object.freeze({
  yhb: 'yhbwnrtlqbjtcrrlpbge', nie: 'niejaejtbxgakyrsntxm', qik: 'qikvmopbtijoebdqosyq',
})
export const VERSION = 'historical-article-plan/v1'
export const LIMITS = Object.freeze({ records: 10000, bytes: 128 * 1024 * 1024, page: MAX_PAGE_SIZE })
export const CATEGORIES = Object.freeze([
  'current_articles', 'historical_articles', 'direct_relationships',
  'evidence_citations_claims', 'attribution_provenance', 'referenced_objects',
])
const nie = [...FIELD_ALLOWLIST.articles]
const events = [...FIELD_ALLOWLIST.events]
const membership = ['event_id','article_id','membership_method','membership_confidence','created_at']
const yhb = ['id','feed','outlet','title','url','summary','published_at','fetched_at','outlet_id','author_id','body_text','embedding','claims','arc_id','unattributed','monoculture','is_digest','image_url','image_alt','entities_extracted_at','arc_assign_attempted_at','ingestion_run_id','source_status','source_status_changed_at','source_status_note','arc_assignment_evidence','candidate_generation_attempted_at','candidate_generation_note','reader_state','reader_exclusion_reason']
export const FIELD_CONTRACTS = Object.freeze({
  [PROJECTS.nie]: Object.freeze({
    articles: Object.freeze(nie), events: Object.freeze(events),
    event_articles: Object.freeze(membership),
    articles_canary_sweep_backup_20260809: Object.freeze([...nie]),
    articles_decode_backup_20260726: Object.freeze(['id','title','summary','body_text','image_alt','claims']),
    articles_decode_backup_20260726_r2: Object.freeze(nie.slice(0,21)),
    articles_decode_backup_20260726_r3: Object.freeze(['id','column_name','old_value']),
    articles_pre_d5_backup_20260730: Object.freeze(nie.slice(0,22)),
    articles_review_batch_backup_20260729: Object.freeze(nie.slice(0,22)),
    arc_backup_20260726_articles: Object.freeze(['id','arc_id','arc_assign_attempted_at']),
  }),
  [PROJECTS.yhb]: Object.freeze({
    articles: Object.freeze(yhb), events: Object.freeze([...events,'comparison_validation_state']),
    event_articles: Object.freeze([...membership]),
  }),
})
const sha = /^[a-f0-9]{64}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const sourceRefs = [PROJECTS.nie, PROJECTS.yhb].sort()
function fail(code) { throw Object.assign(new Error(code), { code }) }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('metadata_shape')
}
function hash(value) { if (typeof value !== 'string' || !sha.test(value)) fail('hash_required'); return value }
function id(value) { if (typeof value !== 'string' || !uuid.test(value)) fail('uuid_required'); return value }
function sortedUnique(values, check) {
  if (!Array.isArray(values)) fail('array_required')
  const result = values.map(check).sort()
  if (new Set(result).size !== result.length) fail('duplicate_metadata')
  return result
}
function identity(value) {
  exact(value, ['project','table','source_id','version_sha256'])
  if (!sourceRefs.includes(value.project) || typeof value.table !== 'string'
    || !Object.hasOwn(FIELD_CONTRACTS[value.project], value.table)) fail('unsupported_source_family')
  // source_id is an opaque digest of the native identity tuple, NOT a guessed UUID
  // or payload hash. Historical duplicate rows require distinct occurrence/version IDs.
  return { project: value.project, table: value.table,
    source_id: hash(value.source_id), version_sha256: hash(value.version_sha256) }
}
function key(value) { return stableStringify(value) }
function canonicalIdentities(values) {
  if (!Array.isArray(values)) fail('array_required')
  const result = values.map(identity).sort((a,b) => key(a).localeCompare(key(b)))
  if (new Set(result.map(key)).size !== result.length) fail('duplicate_identity')
  return result
}
export function planHistoricalArticles(input) {
  exact(input, ['version','destination_project','snapshots','records','objects'])
  if (input.version !== VERSION || input.destination_project !== PROJECTS.qik) fail('target_contract')
  if (!Array.isArray(input.snapshots) || input.snapshots.length !== 2) fail('two_source_snapshots_required')
  const snapshots = input.snapshots.map(s => {
    exact(s, ['project','snapshot_sha256','inventory_sha256','root_article_ids','inventoried_categories'])
    if (!sourceRefs.includes(s.project)) fail('source_project')
    return { project: s.project, snapshot_sha256: hash(s.snapshot_sha256),
      inventory_sha256: hash(s.inventory_sha256),
      root_article_ids: sortedUnique(s.root_article_ids, id),
      inventoried_categories: sortedUnique(s.inventoried_categories, c => {
        if (!CATEGORIES.includes(c)) fail('unknown_category'); return c
      }) }
  }).sort((a,b) => a.project.localeCompare(b.project))
  if (new Set(snapshots.map(s => s.project)).size !== 2) fail('two_source_snapshots_required')
  if (!Array.isArray(input.records) || input.records.length > LIMITS.records) fail('record_limit')
  if (!Array.isArray(input.objects) || input.objects.length > LIMITS.records) fail('object_limit')
  const snapshotByProject = new Map(snapshots.map(s => [s.project,s]))
  const records = input.records.map(r => {
    exact(r, ['identity','snapshot_sha256','payload_sha256','payload_bytes','root_article_ids','dependencies'])
    const recordIdentity = identity(r.identity)
    const s = snapshotByProject.get(recordIdentity.project)
    if (hash(r.snapshot_sha256) !== s.snapshot_sha256) fail('snapshot_mismatch')
    if (!Number.isSafeInteger(r.payload_bytes) || r.payload_bytes < 0) fail('byte_count')
    const roots = sortedUnique(r.root_article_ids,id)
    if (!roots.length || roots.some(root => !s.root_article_ids.includes(root))) fail('outside_article_roots')
    return { identity: recordIdentity, snapshot_sha256: s.snapshot_sha256,
      payload_sha256: hash(r.payload_sha256), payload_bytes: r.payload_bytes,
      root_article_ids: roots, dependencies: canonicalIdentities(r.dependencies) }
  }).sort((a,b) => key(a.identity).localeCompare(key(b.identity)))
  const keys = new Set(records.map(r => key(r.identity)))
  if (keys.size !== records.length) fail('duplicate_identity')
  const objects = input.objects.map(o => {
    exact(o, ['project','snapshot_sha256','object_identity_sha256','content_sha256','bytes','article_ids'])
    const s = snapshotByProject.get(o.project)
    if (!s || hash(o.snapshot_sha256) !== s.snapshot_sha256) fail('snapshot_mismatch')
    if (!Number.isSafeInteger(o.bytes) || o.bytes < 0) fail('byte_count')
    const article_ids = sortedUnique(o.article_ids,id)
    if (!article_ids.length || article_ids.some(root => !s.root_article_ids.includes(root))) fail('outside_article_roots')
    return { project:o.project,snapshot_sha256:s.snapshot_sha256,
      object_identity_sha256:hash(o.object_identity_sha256),
      content_sha256:hash(o.content_sha256),bytes:o.bytes,article_ids }
  }).sort((a,b) => key(a).localeCompare(key(b)))
  if (new Set(objects.map(o => key([o.project,o.object_identity_sha256]))).size !== objects.length) fail('duplicate_object')
  const bytes = [...records.map(r=>r.payload_bytes),...objects.map(o=>o.bytes)]
    .reduce((total,n) => total+n,0)
  if (!Number.isSafeInteger(bytes) || bytes > LIMITS.bytes) fail('byte_limit')
  const gaps = []
  for (const s of snapshots) {
    for (const c of CATEGORIES) if (!s.inventoried_categories.includes(c))
      gaps.push({ code:'category_inventory_missing',project:s.project,category:c })
    for (const root of s.root_article_ids) {
      if (!records.some(r => r.identity.project === s.project && r.identity.table === 'articles'
        && r.identity.source_id === fingerprintPayload({ id:root }) && r.root_article_ids.includes(root))) gaps.push({ code:'root_record_missing',project:s.project,article_id:root })
    }
  }
  for (const r of records) for (const d of r.dependencies) if (!keys.has(key(d)))
    gaps.push({ code:'dependency_missing',record:r.identity,dependency:d })
  for (const o of objects) gaps.push({ code:'object_bytes_not_in_custody',project:o.project,
    object_identity_sha256:o.object_identity_sha256 })
  const manifest = { version:VERSION,destination_project:PROJECTS.qik,snapshots,records,objects }
  const manifest_sha256 = fingerprintPayload(manifest)
  const pages = []
  for (const project of sourceRefs) for (const table of Object.keys(FIELD_CONTRACTS[project]).sort()) {
    const selected = records.filter(r=>r.identity.project===project && r.identity.table===table)
    for (let offset=0;offset<selected.length;offset+=LIMITS.page) {
      const rows=selected.slice(offset,offset+LIMITS.page)
      const ordinal=offset/LIMITS.page
      pages.push({ run_id:VERSION+':'+manifest_sha256+':'+project+':'+table+':'+ordinal,
        project,table,ordinal,fields:[...FIELD_CONTRACTS[project][table]],
        rows,sha256:fingerprintPayload(rows) })
    }
  }
  return { manifest,manifest_sha256,pages,bytes,gaps,executable:false,
    custody_contract:{
      destination_schema:'legacy_graph_staging',
      existing_tables:['import_jobs','job_events','staged_records','payload_versions','record_conflicts','nie_event_article_memberships','nie_event_article_versions'],
      retry:'Exact frozen manifest and page hashes only; never substitute a fresh snapshot.',
      write_policy:'Preserve source-qualified versions; conflicts remain pending review; no blind overwrite, auto-processing, public publication, source mutation or deletion.',
      missing_route:'No verified approved private dual-project actual-material execution/credential route or object-byte custody route is established.',
      compatibility:'NIE parent-custody/v1 is event-root/current events+articles only. These article-root/YHB/history/object plans require a qualified executor extension; never dispatch them to existing scoped finish or generic global finish.',
      evidence_limit:'Metadata inventories and hashes are supplied claims, not verified transaction fences or custody receipts. Related families without explicit field contracts require separate schema review; category declarations do not authorize their omission.',
      recovery:'In-memory planner only. Persisted private manifest/receipt custody and ambiguous-commit exact readback must be qualified before transfer; process loss must not silently rebuild membership.',
    } }
}
export function assertHistoricalRetry(previous, nextInput) {
  const next = planHistoricalArticles(nextInput)
  if (!previous || fingerprintPayload(previous.manifest) !== previous.manifest_sha256
    || previous.manifest_sha256 !== next.manifest_sha256) fail('frozen_manifest_changed')
  return next
}
