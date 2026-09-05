import { createHash } from 'node:crypto'
import { IDENTITY_DECISIONS } from './mipIdentityReconciliation.mjs'

export const ORIGINAL_PROJECT_REF = 'niejaejtbxgakyrsntxm'
export const MANUS_PROJECT_REF = 'yhbwnrtlqbjtcrrlpbge'
export const PRODUCTION_PROJECT_REF = 'qikvmopbtijoebdqosyq'

export const EXPECTED_LEDGER = Object.freeze({
  mappings: 3818,
  conflicts: 1504,
  mapping_sha256: 'df2b375adf8864678847f4eaab5606cd57201e87ad1d0f308bd383fd4b9f3fc3',
  conflict_sha256: '0ac3d6d9083d8c9e1408a53e3c12db8fcc3d31b892f599b45aed95fed39efcb3',
  mapping_tables: Object.freeze({
    arc_events: 70,
    articles: 752,
    citations: 38,
    edges: 411,
    entities: 963,
    events: 347,
    nodes: 750,
    p3_legal_case: 1,
    p3_legal_case_evidence: 8,
    p3_policy: 6,
    p3_policy_track_event: 6,
    policies: 27,
    policy_documents: 50,
    sources: 340,
    story_arcs: 49,
  }),
  conflict_kinds: Object.freeze({
    existing_import_mapping_skipped: {
      n: 752,
      run_key: 'original-readonly-cross-surface-import-20260820',
      recovery_status: 'not_applicable_existing_mapping',
    },
    historical_url_upsert_no_snapshot: {
      n: 752,
      run_key: 'niejaejtbxgakyrsntxm-historical-article-upsert-audit-20260820',
      recovery_status: 'not_restorable_no_pre_import_snapshot',
    },
  }),
})

export const MAPPING_HASH_SQL = `
select encode(
  sha256(convert_to(
    string_agg(source_table || E'\\t' || source_id::text || E'\\t' || target_id::text || E'\\t' || coalesce(source_url, ''), E'\\n' order by source_table, source_id),
    'utf8'
  )),
  'hex'
) as mapping_sha256,
count(*)::int as mapping_count
from public.original_source_import_mappings
where source_project_ref = '${ORIGINAL_PROJECT_REF}'
`

export const CONFLICT_HASH_SQL = `
select encode(
  sha256(convert_to(
    string_agg(
      id::text || E'\\t' || run_key || E'\\t' || source_table || E'\\t' || source_id::text || E'\\t' || coalesce(target_id::text, '') || E'\\t' || conflict_kind || E'\\t' || recovery_status,
      E'\\n' order by id
    ),
    'utf8'
  )),
  'hex'
) as conflict_sha256,
count(*)::int as conflict_count
from public.original_source_import_conflicts
where source_project_ref = '${ORIGINAL_PROJECT_REF}'
`

export const LEDGER_PAGE_TABLES = Object.freeze(Object.keys(EXPECTED_LEDGER.mapping_tables))

export function expandCompactMapping(row) {
  const source_table = row.t ?? row.source_table
  const source_id = row.s ?? row.source_id
  const target_id = row.g ?? row.target_id ?? source_id
  return {
    source_project_ref: row.source_project_ref ?? ORIGINAL_PROJECT_REF,
    source_table,
    source_id,
    target_id,
    source_url: row.u ?? row.source_url ?? null,
    imported_at: row.i ?? row.imported_at,
  }
}

export function expandCompactConflict(row) {
  return {
    id: row.id,
    source_project_ref: row.source_project_ref ?? ORIGINAL_PROJECT_REF,
    run_key: row.rk ?? row.run_key,
    source_table: row.t ?? row.source_table ?? 'articles',
    source_id: row.s ?? row.source_id,
    target_id: row.g ?? row.target_id ?? null,
    source_url: row.u ?? row.source_url ?? null,
    conflict_kind: row.k ?? row.conflict_kind,
    affected_fields: row.af ?? row.affected_fields ?? [],
    recovery_status: row.rs ?? row.recovery_status,
    details: row.d ?? row.details ?? {},
    detected_at: row.i ?? row.detected_at,
  }
}

export function mappingIdentitySql(rows) {
  const normalized = rows.map(expandCompactMapping)
  const payload = JSON.stringify(normalized.map((row) => ({
    t: row.source_table,
    s: row.source_id,
    g: row.target_id,
    u: row.source_url,
    i: row.imported_at,
  })))
  return `
insert into public.original_source_import_mappings (
  source_project_ref, source_table, source_id, target_id, source_url, imported_at
)
select
  '${ORIGINAL_PROJECT_REF}',
  x.t,
  x.s,
  x.g,
  nullif(x.u, ''),
  x.i
from jsonb_to_recordset(${sqlJsonLiteral(payload)}::jsonb)
  as x(t text, s uuid, g uuid, u text, i timestamptz)
on conflict (source_project_ref, source_table, source_id) do nothing
`
}

export function conflictIdentitySql(rows) {
  const normalized = rows.map(expandCompactConflict)
  const payload = JSON.stringify(normalized.map((row) => ({
    id: row.id,
    rk: row.run_key,
    t: row.source_table,
    s: row.source_id,
    g: row.target_id,
    u: row.source_url,
    k: row.conflict_kind,
    af: row.affected_fields,
    rs: row.recovery_status,
    d: row.details,
    i: row.detected_at,
  })))
  return `
insert into public.original_source_import_conflicts (
  id, source_project_ref, run_key, source_table, source_id, target_id,
  source_url, conflict_kind, affected_fields, recovery_status, details, detected_at
)
select
  x.id,
  '${ORIGINAL_PROJECT_REF}',
  x.rk,
  x.t,
  x.s,
  x.g,
  nullif(x.u, ''),
  x.k,
  coalesce(x.af, '{}'::text[]),
  x.rs,
  coalesce(x.d, '{}'::jsonb),
  x.i
from jsonb_to_recordset(${sqlJsonLiteral(payload)}::jsonb)
  as x(id uuid, rk text, t text, s uuid, g uuid, u text, k text, af text[], rs text, d jsonb, i timestamptz)
on conflict (source_project_ref, run_key, source_table, source_id, conflict_kind) do nothing
`
}

function sqlJsonLiteral(value) {
  if (value.includes('$json$')) {
    throw new Error('ledger page contains the dollar-quote terminator')
  }
  return `$json$${value}$json$`
}

export async function applyLedgerPage(db, { mappings = [], conflicts = [] } = {}) {
  if (mappings.length) await db.exec(mappingIdentitySql(mappings))
  if (conflicts.length) await db.exec(conflictIdentitySql(conflicts))
  return {
    mappings: mappings.length,
    conflicts: conflicts.length,
  }
}

export function hashMappingRows(rows) {
  const normalized = rows.map(expandCompactMapping)
  const body = normalized
    .map((row) => [row.source_table, row.source_id, row.target_id, row.source_url ?? ''].join('\t'))
    .sort()
    .join('\n')
  return createHash('sha256').update(body).digest('hex')
}

export function hashConflictRows(rows) {
  const normalized = rows.map(expandCompactConflict)
  const body = [...normalized]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((row) => [row.id, row.run_key, row.source_table, row.source_id, row.target_id ?? '', row.conflict_kind, row.recovery_status].join('\t'))
    .join('\n')
  return createHash('sha256').update(body).digest('hex')
}

export function assertLedgerPageSafe(page, { graphEventIds = [], comparisonEventIds = [] } = {}) {
  const mappings = (page.mappings ?? []).map(expandCompactMapping)
  for (const row of mappings) {
    if (row.source_table === 'events' && graphEventIds.includes(row.source_id)) {
      throw new Error(`${IDENTITY_DECISIONS.family_mismatch}: graph event ${row.source_id} cannot be a Source Comparison mapping`)
    }
    if (row.source_table === 'nodes' && comparisonEventIds.includes(row.source_id)) {
      throw new Error(`${IDENTITY_DECISIONS.family_mismatch}: Source Comparison event ${row.source_id} cannot be a graph-node mapping`)
    }
    if (!row.source_id || !row.target_id || !row.source_table) {
      throw new Error('mapping rows require source_table, source_id, and target_id')
    }
  }
  for (const row of (page.conflicts ?? []).map(expandCompactConflict)) {
    const expected = EXPECTED_LEDGER.conflict_kinds[row.conflict_kind]
    if (!expected) throw new Error(`unknown conflict_kind ${row.conflict_kind}`)
    if (row.recovery_status !== expected.recovery_status) {
      throw new Error(`recovery_status must stay ${expected.recovery_status}`)
    }
    if (row.run_key !== expected.run_key) {
      throw new Error(`run_key must stay ${expected.run_key}`)
    }
  }
  return true
}

export function ledgerWatermarkPayload({ table, count, last_source_id = null, sha256 = null }) {
  return {
    source_project_ref: MANUS_PROJECT_REF,
    channel: `ledger.${table}`,
    watermark: {
      count,
      last_source_id,
      sha256,
      destination: PRODUCTION_PROJECT_REF,
      cutover: 'not_switched',
    },
  }
}
