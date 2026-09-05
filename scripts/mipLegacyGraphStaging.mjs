import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  GRAPH_EVENT_FAMILY,
  IDENTITY_DECISIONS,
  SOURCE_COMPARISON_EVENT_FAMILY,
  findExistingMapping,
  reconcileIdentity,
} from './mipIdentityReconciliation.mjs'
import {
  MANUS_PROJECT_REF,
  ORIGINAL_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from './mipLedgerTransfer.mjs'

export { MANUS_PROJECT_REF, ORIGINAL_PROJECT_REF, PRODUCTION_PROJECT_REF }

export const STAGING_MIGRATION = '20260905203600_mip_legacy_graph_private_staging.sql'
export const STAGING_RPC = 'mip_legacy_graph_v1'
export const MAX_PAGE_SIZE = 100

export const DEPENDENCY_GROUPS = Object.freeze({
  graph_core: Object.freeze(['nodes', 'edges']),
  graph_evidence: Object.freeze(['sources', 'citations']),
  graph_arcs: Object.freeze(['story_arcs', 'arc_events']),
  graph_entities: Object.freeze(['entities']),
  articles: Object.freeze(['articles']),
  source_comparison: Object.freeze(['events', 'event_articles']),
  review: Object.freeze(['arc_membership_candidates', 'cross_surface_candidates', 'explanations', 'authors']),
  phase3: Object.freeze(['policies', 'policy_documents', 'policy_actors', 'p3_legal_case', 'p3_legal_case_evidence', 'p3_policy', 'p3_policy_track_event']),
})

export const LIVE_DRY_RUN = Object.freeze({
  captured_at: '2026-09-05T20:36:00Z',
  destination: PRODUCTION_PROJECT_REF,
  source_manus: MANUS_PROJECT_REF,
  source_original: ORIGINAL_PROJECT_REF,
  source_gate_a: 'jfnzyvzthzqtczlxhjll',
  ledger: Object.freeze({
    mappings: 3818,
    conflicts: 1504,
    complete: true,
    note: 'Original-to-Manus historical mappings. Not proof that corresponding rows exist in production.',
  }),
  source_counts: Object.freeze({
    nodes: 949,
    edges: 451,
    sources: 366,
    citations: 1274,
    articles: 29782,
    entities: 8856,
    story_arcs: 195,
    arc_events: 93,
    events: 13008,
    event_articles: 13586,
    authors: 694,
    explanations: 51,
    arc_membership_candidates: 980,
    cross_surface_candidates: 21,
    policies: 27,
    policy_documents: 50,
    policy_actors: 37,
    p3_legal_case: 1,
    p3_legal_case_evidence: 8,
    p3_policy: 15,
    p3_policy_track_event: 31,
  }),
  original_counts: Object.freeze({
    nodes: 750,
    edges: 411,
    sources: 340,
    articles: 752,
    story_arcs: 49,
  }),
  production_counts: Object.freeze({
    nodes: 1,
    edges: 0,
    sources: 0,
    citations: 0,
    articles: 4,
    eligible_articles: 3,
    events: 1,
    event_articles: 3,
    story_arcs: 0,
    news_detail_public: 3,
    comparison_public: 1,
    graph_coverage_public: 1,
    investigation_surface_public: 1,
    spatial_projection_v1: 1,
  }),
  mapping_coverage: Object.freeze({
    nodes: Object.freeze({ mapped: 750, remapped: 21, unmapped_manus_native: 199 }),
    edges: Object.freeze({ mapped: 411, remapped: 0, unmapped_manus_native: 40 }),
    sources: Object.freeze({ mapped: 340, remapped: 0 }),
    articles: Object.freeze({ mapped: 752, remapped: 752 }),
    events: Object.freeze({ mapped: 347, remapped: 0 }),
  }),
  family_guards: Object.freeze({
    uuid_overlap_node_event: 0,
    title_overlap_node_event: 665,
    note: 'Title overlap is not identity. Graph nodes and Source Comparison events stay separate families.',
  }),
  manus_orphans: Object.freeze({
    edge_source: 0,
    edge_target: 0,
    source_node: 0,
    citation_article: 0,
    citation_node: 0,
    arc_root: 0,
  }),
  preserved_production: Object.freeze({
    eclipse_node_id: 'acc55cb2-5ac2-4aed-be36-3f576d2bc443',
    eclipse_on_manus: false,
    eclipse_in_ledger: false,
    cyclospora_event_id: '8e4f9812-0afa-4aad-ada8-6fb556da70d9',
    cyclospora_manus_native: true,
  }),
})

const EXACT_JSON_NUMBER = Symbol.for('mip.exactJsonNumber')

export function parseDecimalToken(token) {
  let text = String(token).trim()
  let negative = false
  if (text.startsWith('+')) text = text.slice(1)
  if (text.startsWith('-')) {
    negative = true
    text = text.slice(1)
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (!match) throw new Error(`unsupported JSON number token: ${token}`)
  let digits = `${match[1]}${match[2] ?? ''}`
  let exp = Number(match[3] ?? 0) - (match[2] ?? '').length
  digits = digits.replace(/^0+/, '') || '0'
  if (digits === '0') return { negative: false, digits: '0', exp: 0 }
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1)
    exp += 1
  }
  return { negative, digits, exp }
}

export function decimalToPlainText(decimal) {
  if (decimal.digits === '0') return '0'
  const sign = decimal.negative ? '-' : ''
  if (decimal.exp >= 0) return `${sign}${decimal.digits}${'0'.repeat(decimal.exp)}`
  const split = decimal.digits.length + decimal.exp
  if (split > 0) return `${sign}${decimal.digits.slice(0, split)}.${decimal.digits.slice(split)}`
  return `${sign}0.${'0'.repeat(-split)}${decimal.digits}`
}

export function decimalsEqual(left, right) {
  return left.negative === right.negative && left.digits === right.digits && left.exp === right.exp
}

export function canonicalNumberToken(token) {
  const decimal = parseDecimalToken(token)
  const asNumber = Number(`${decimal.negative ? '-' : ''}${decimal.digits}e${decimal.exp}`)
  if (Number.isFinite(asNumber)) {
    const es = JSON.stringify(asNumber)
    try {
      if (decimalsEqual(parseDecimalToken(es), decimal)) return es
    } catch {
      // Fall through to the exact decimal spelling.
    }
  }
  return decimalToPlainText(decimal)
}

export class ExactJsonNumber {
  constructor(token) {
    this[EXACT_JSON_NUMBER] = true
    this.token = String(token)
    this.decimal = parseDecimalToken(this.token)
    this.canonical = canonicalNumberToken(this.token)
  }

  toString() {
    return this.canonical
  }

  toJSON() {
    return this
  }
}

export function isExactJsonNumber(value) {
  return Boolean(value && typeof value === 'object' && value[EXACT_JSON_NUMBER])
}

export function losslessJsonNumber(value) {
  if (isExactJsonNumber(value)) return value.canonical
  if (typeof value === 'bigint') return canonicalNumberToken(value.toString())
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null'
    return JSON.stringify(value)
  }
  throw new Error('losslessJsonNumber requires a number, bigint, or exact JSON number')
}

function emitJsonValue(value, sortedKeys, indent, depth) {
  if (isExactJsonNumber(value) || typeof value === 'bigint' || typeof value === 'number') {
    return losslessJsonNumber(value)
  }
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value !== 'object') return 'null'
  const pad = indent ? indent.repeat(depth) : ''
  const padIn = indent ? indent.repeat(depth + 1) : ''
  const colon = indent ? ': ' : ':'
  const eol = indent ? '\n' : ''
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const parts = value.map((item) => emitJsonValue(item, sortedKeys, indent, depth + 1))
    if (!indent) return `[${parts.join(',')}]`
    return `[${eol}${parts.map((part) => `${padIn}${part}`).join(`,${eol}`)}${eol}${pad}]`
  }
  const keys = Object.keys(value).filter((key) => value[key] !== undefined)
  if (sortedKeys) keys.sort()
  if (keys.length === 0) return '{}'
  const parts = keys.map((key) => `${JSON.stringify(key)}${colon}${emitJsonValue(value[key], sortedKeys, indent, depth + 1)}`)
  if (!indent) return `{${parts.join(',')}}`
  return `{${eol}${parts.map((part) => `${padIn}${part}`).join(`,${eol}`)}${eol}${pad}}`
}

export function stableStringify(value) {
  return emitJsonValue(value, true, '', 0)
}

export function serializeStagingJson(value) {
  return emitJsonValue(value, false, '', 0)
}

export function stringifyJsonLossless(value, space = null) {
  const indent = space == null ? '' : (typeof space === 'number' ? ' '.repeat(space) : String(space))
  return emitJsonValue(value, false, indent, 0)
}

export function parseJsonLossless(text) {
  const source = String(text)
  let index = 0

  function peek() {
    return source[index]
  }

  function skipWs() {
    while (index < source.length && /[ \t\r\n]/.test(source[index])) index += 1
  }

  function fail(message) {
    throw new Error(`${message} at ${index}`)
  }

  function parseString() {
    if (source[index] !== '"') fail('expected string')
    index += 1
    let result = ''
    while (index < source.length) {
      const char = source[index]
      if (char === '"') {
        index += 1
        return result
      }
      if (char === '\\') {
        const next = source[index + 1]
        const escapes = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
        if (next === 'u') {
          const hex = source.slice(index + 2, index + 6)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('invalid unicode escape')
          result += String.fromCharCode(Number.parseInt(hex, 16))
          index += 6
          continue
        }
        if (!(next in escapes)) fail('invalid escape')
        result += escapes[next]
        index += 2
        continue
      }
      if (char.charCodeAt(0) < 32) fail('unescaped control character')
      result += char
      index += 1
    }
    fail('unterminated string')
  }

  function parseNumber() {
    const start = index
    if (source[index] === '-') index += 1
    if (source[index] === '0') index += 1
    else if (/[1-9]/.test(source[index])) {
      while (/[0-9]/.test(source[index])) index += 1
    } else fail('invalid number')
    if (source[index] === '.') {
      index += 1
      if (!/[0-9]/.test(source[index])) fail('invalid number fraction')
      while (/[0-9]/.test(source[index])) index += 1
    }
    if (source[index] === 'e' || source[index] === 'E') {
      index += 1
      if (source[index] === '+' || source[index] === '-') index += 1
      if (!/[0-9]/.test(source[index])) fail('invalid number exponent')
      while (/[0-9]/.test(source[index])) index += 1
    }
    return new ExactJsonNumber(source.slice(start, index))
  }

  function parseLiteral(literal, value) {
    if (source.slice(index, index + literal.length) !== literal) fail(`expected ${literal}`)
    index += literal.length
    return value
  }

  function parseArray() {
    index += 1
    skipWs()
    const result = []
    if (peek() === ']') {
      index += 1
      return result
    }
    while (index < source.length) {
      result.push(parseValue())
      skipWs()
      if (peek() === ',') {
        index += 1
        skipWs()
        continue
      }
      if (peek() === ']') {
        index += 1
        return result
      }
      fail('expected comma or end of array')
    }
    fail('unterminated array')
  }

  function parseObject() {
    index += 1
    skipWs()
    const result = {}
    if (peek() === '}') {
      index += 1
      return result
    }
    while (index < source.length) {
      skipWs()
      const key = parseString()
      skipWs()
      if (peek() !== ':') fail('expected colon')
      index += 1
      result[key] = parseValue()
      skipWs()
      if (peek() === ',') {
        index += 1
        skipWs()
        continue
      }
      if (peek() === '}') {
        index += 1
        return result
      }
      fail('expected comma or end of object')
    }
    fail('unterminated object')
  }

  function parseValue() {
    skipWs()
    const char = peek()
    if (char === '"') return parseString()
    if (char === '{') return parseObject()
    if (char === '[') return parseArray()
    if (char === 't') return parseLiteral('true', true)
    if (char === 'f') return parseLiteral('false', false)
    if (char === 'n') return parseLiteral('null', null)
    if (char === '-' || /[0-9]/.test(char)) return parseNumber()
    fail('unexpected token')
  }

  const value = parseValue()
  skipWs()
  if (index !== source.length) fail('unexpected trailing content')
  return value
}

export function hydrateStagingRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record
  if (typeof record.payload_json === 'string') {
    return { ...record, payload: parseJsonLossless(record.payload_json) }
  }
  return record
}

export function fingerprintPayload(payload) {
  return createHash('sha256').update(stableStringify(payload ?? {})).digest('hex')
}

export function objectFamily(sourceTable, payload = {}) {
  if (sourceTable === 'events') return SOURCE_COMPARISON_EVENT_FAMILY
  if (sourceTable === 'nodes') {
    if (payload.type === 'event') return GRAPH_EVENT_FAMILY
    if (payload.type) return `graph_${payload.type}`
    return 'graph_node'
  }
  const tableFamilies = {
    edges: 'graph_edge',
    sources: 'graph_source',
    citations: 'graph_citation',
    story_arcs: 'graph_arc',
    arc_events: 'graph_arc_event',
    entities: 'graph_entity',
    articles: 'article',
    event_articles: 'source_comparison_membership',
    arc_membership_candidates: 'review_record',
    cross_surface_candidates: 'review_record',
    explanations: 'review_record',
    authors: 'review_record',
  }
  return tableFamilies[sourceTable] ?? 'unclassified'
}

export function normalizeSourceRecord(record) {
  const source = hydrateStagingRecord(record)
  if (!source?.source_project_ref || !source.source_table || !source.source_id) {
    throw new Error('source identity requires project, table, and id')
  }
  if (source.reader_state != null || source.comparison_validation_state != null || source.publish != null) {
    throw new Error('staging cannot carry publication directives')
  }
  const payload = source.payload ?? source
  const family = source.object_family ?? objectFamily(source.source_table, payload)
  if (source.source_table === 'events' && family !== SOURCE_COMPARISON_EVENT_FAMILY) {
    throw new Error('Source Comparison events cannot be labeled as graph objects')
  }
  if (source.source_table === 'nodes' && family === SOURCE_COMPARISON_EVENT_FAMILY) {
    throw new Error('graph nodes cannot be labeled as Source Comparison events')
  }
  const identityId = source.source_id ?? payload.id ?? null
  const edgeSource = source.endpoint_source_id ?? payload.endpoint_source_id ?? payload.source_node_id
    ?? (payload.source_id && payload.source_id !== identityId ? payload.source_id : null)
  const edgeTarget = source.endpoint_target_id ?? payload.endpoint_target_id ?? payload.target_node_id
    ?? (payload.target_id && payload.target_id !== identityId ? payload.target_id : null)
  const relationshipType = source.relationship_type ?? payload.relationship_type
    ?? (source.source_table === 'edges' ? payload.type ?? null : null)
  return {
    source_project_ref: source.source_project_ref,
    source_table: source.source_table,
    source_id: source.source_id,
    object_family: family,
    payload,
    payload_json: serializeStagingJson(payload),
    payload_sha256: source.payload_sha256 ?? fingerprintPayload(payload),
    source_url: source.source_url ?? source.url ?? payload.url ?? null,
    source_imported_at: source.source_imported_at ?? payload.created_at ?? null,
    recovery_status: source.recovery_status ?? null,
    proposed_target_id: source.proposed_target_id ?? source.target_id ?? null,
    title: source.title ?? payload.title ?? payload.label ?? payload.canonical_title ?? payload.headline,
    url: source.url ?? payload.url,
    label: source.label ?? payload.label,
    canonical_title: source.canonical_title ?? payload.canonical_title,
    body_text: source.body_text ?? payload.body_text ?? payload.summary ?? payload.description,
    published_at: source.published_at ?? payload.published_at ?? payload.occurred_at,
    endpoint_source_id: edgeSource ?? null,
    endpoint_target_id: edgeTarget ?? null,
    relationship_type: relationshipType ?? null,
    mapping: compactMapping(source.mapping, source),
  }
}

function compactMapping(mapping, record) {
  if (!mapping?.source_project_ref || !mapping.source_table || !mapping.source_id || !mapping.target_id) {
    return null
  }
  if (
    mapping.source_project_ref !== record.source_project_ref
    || mapping.source_table !== record.source_table
    || mapping.source_id !== record.source_id
  ) {
    return null
  }
  return {
    source_project_ref: mapping.source_project_ref,
    source_table: mapping.source_table,
    source_id: mapping.source_id,
    target_id: mapping.target_id,
    source_url: mapping.source_url ?? null,
  }
}

function resolvingDecision(decision) {
  return decision === IDENTITY_DECISIONS.insert
    || decision === IDENTITY_DECISIONS.mapped
    || decision === IDENTITY_DECISIONS.skip_existing_mapping
}

export function inferPlanningContext(records = [], context = {}) {
  const existingMappings = [...(context.existingMappings ?? context.mappings ?? [])]
  for (const record of records) {
    const mapping = compactMapping(record?.mapping, record ?? {})
    if (mapping && !findExistingMapping(existingMappings, mapping)) {
      existingMappings.push(mapping)
    }
  }
  return {
    ...context,
    existingMappings,
  }
}

export function findFamilyTarget(record, catalog = {}) {
  const graphIds = new Set(catalog.graphEventIds ?? [])
  const comparisonIds = new Set(catalog.comparisonEventIds ?? [])
  if (record.source_table === 'nodes' && comparisonIds.has(record.source_id)) {
    return { id: record.source_id, object_family: SOURCE_COMPARISON_EVENT_FAMILY }
  }
  if (record.source_table === 'events' && graphIds.has(record.source_id)) {
    return { id: record.source_id, object_family: GRAPH_EVENT_FAMILY }
  }
  const publicRow = (catalog.publicRows ?? []).find((row) => (
    row.table === record.source_table && row.id === record.source_id
  ))
  if (publicRow) {
    return {
      id: publicRow.id,
      object_family: objectFamily(publicRow.table, publicRow),
      ...publicRow,
    }
  }
  return catalog.targets?.[`${record.source_table}:${record.source_id}`] ?? null
}

export function planRecord(record, context = {}) {
  const source = normalizeSourceRecord(record)
  const target = findFamilyTarget(source, context)
  const mapped = findExistingMapping(context.existingMappings ?? [], source)
  const reconciled = reconcileIdentity({
    source: {
      ...source,
      object_family: source.object_family,
      target_id: mapped?.target_id ?? source.proposed_target_id,
    },
    target,
    existingMappings: context.existingMappings ?? [],
    existingConflicts: context.existingConflicts ?? [],
  })
  return {
    ...source,
    decision: reconciled.decision,
    proposed_target_id: reconciled.mapping?.target_id ?? source.proposed_target_id,
    conflict: reconciled.conflict,
    mapping: reconciled.mapping,
  }
}

export function validateRecordEndpoints(record, context = {}) {
  const source = normalizeSourceRecord(record)
  const stagedIds = context.stagedIds ?? {}
  const publicIds = context.publicIds ?? {}
  const comparisonIds = new Set(context.comparisonEventIds ?? [])
  const required = []
  if (source.source_table === 'edges') {
    required.push(['endpoint_source', source.endpoint_source_id, 'nodes'])
    required.push(['endpoint_target', source.endpoint_target_id, 'nodes'])
  } else if (source.source_table === 'sources') {
    required.push(['node', source.payload.node_id, 'nodes'])
  } else if (source.source_table === 'citations') {
    required.push(['article', source.payload.article_id, 'articles'])
    if (source.payload.resolved_node_id) required.push(['resolved_node', source.payload.resolved_node_id, 'nodes'])
  } else if (source.source_table === 'story_arcs' && source.payload.root_node_id) {
    required.push(['root_node', source.payload.root_node_id, 'nodes'])
  } else if (source.source_table === 'arc_events') {
    required.push(['arc', source.payload.arc_id, 'story_arcs'])
  }
  const checks = required.map(([role, endpointId, table]) => {
    if (!endpointId) return { role, endpoint_id: null, resolved: false, resolution: 'missing' }
    if (table === 'nodes' && comparisonIds.has(endpointId)) {
      return { role, endpoint_id: endpointId, resolved: false, resolution: 'source_comparison_event_not_graph_node' }
    }
    const staged = (stagedIds[table] ?? new Set()).has(endpointId)
    const published = (publicIds[table] ?? new Set()).has(endpointId)
    return {
      role,
      endpoint_id: endpointId,
      resolved: staged || published,
      resolution: staged ? 'staged' : published ? 'public' : 'missing',
    }
  })
  return {
    source_id: source.source_id,
    source_table: source.source_table,
    checks,
    orphan: checks.some((row) => !row.resolved),
  }
}

export function planPage(records, context = {}) {
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_PAGE_SIZE) {
    throw new Error('page must contain 1-100 records')
  }
  const hydrated = records.map((record) => hydrateStagingRecord(record))
  const planning = inferPlanningContext(hydrated, context)
  const planned = hydrated.map((record) => planRecord(record, planning))
  const orphanIds = new Set()
  let changed = true
  let passes = 0
  while (changed && passes < MAX_PAGE_SIZE + 2) {
    changed = false
    passes += 1
    const stagedIds = { ...(planning.stagedIds ?? {}) }
    for (const row of planned) {
      if (resolvingDecision(row.decision) && !orphanIds.has(row.source_id)) {
        stagedIds[row.source_table] = new Set(stagedIds[row.source_table] ?? [])
        stagedIds[row.source_table].add(row.source_id)
      }
    }
    for (const row of planned) {
      const endpoints = validateRecordEndpoints(row, { ...planning, stagedIds })
      row.endpoints = endpoints
      const nowOrphan = Boolean(endpoints.orphan)
      if (nowOrphan !== orphanIds.has(row.source_id)) {
        changed = true
        if (nowOrphan) orphanIds.add(row.source_id)
        else orphanIds.delete(row.source_id)
      }
    }
  }
  return planned
}

export function assertPageNotPublishing(page) {
  for (const row of page) {
    if (row.payload?.reader_state === 'eligible' && row.source_table === 'nodes') {
      throw new Error('graph staging cannot mark nodes eligible')
    }
    if (row.publish === true || row.payload?.publish === true) {
      throw new Error('publication directives are rejected')
    }
  }
  return true
}

export function dryRunManifest(inventory = LIVE_DRY_RUN, page = []) {
  const groups = {}
  for (const [group, tables] of Object.entries(DEPENDENCY_GROUPS)) {
    groups[group] = Object.fromEntries(tables.map((table) => [table, inventory.source_counts?.[table] ?? 0]))
  }
  const planned = page.length ? page : []
  const quarantined = planned.filter((row) => row.decision === IDENTITY_DECISIONS.conflict
    || row.decision === IDENTITY_DECISIONS.family_mismatch
    || row.decision === IDENTITY_DECISIONS.title_only
    || row.endpoints?.orphan)
  return {
    dry_run: true,
    applied_live: false,
    source: 'captured_inventory',
    inventory,
    dependency_groups: groups,
    unresolved: {
      family_title_collisions: inventory.family_guards?.title_overlap_node_event ?? 0,
      family_uuid_collisions: inventory.family_guards?.uuid_overlap_node_event ?? 0,
      historical_gaps: inventory.ledger?.conflicts ?? 0,
      unmapped_manus_nodes: inventory.mapping_coverage?.nodes?.unmapped_manus_native ?? 0,
      unmapped_manus_edges: inventory.mapping_coverage?.edges?.unmapped_manus_native ?? 0,
      page_quarantined: quarantined.length,
    },
    publication_impact: {
      current_public_nodes: inventory.production_counts?.nodes ?? 0,
      current_public_edges: inventory.production_counts?.edges ?? 0,
      current_news_detail_public: inventory.production_counts?.news_detail_public ?? 0,
      current_comparison_public: inventory.production_counts?.comparison_public ?? 0,
      if_inserted_into_public_nodes: (inventory.production_counts?.nodes ?? 0) + (inventory.source_counts?.nodes ?? 0)
        - (inventory.preserved_production?.eclipse_on_manus ? 1 : 0),
      blocked_reason: 'public.nodes and public.edges currently SELECT USING (true). Unreviewed legacy rows stay in private staging.',
      copy_versus_publish: 'separate',
    },
    apply_instructions: {
      apply_migration: false,
      apply_live_import: false,
      next: 'ChatGPT reviews this PR and coordinates live application of the staging migration only. Graph publication remains a later reviewed step.',
    },
  }
}

function destinationPublicRows(destinationRecords = []) {
  return destinationRecords.map((row) => ({
    table: row.table ?? row.source_table ?? row.rel,
    id: row.id ?? row.source_id,
    ...row,
  }))
}

function destinationPublicIds(destinationRecords = []) {
  const ids = {}
  for (const row of destinationPublicRows(destinationRecords)) {
    if (!row.table || !row.id) continue
    ids[row.table] = new Set(ids[row.table] ?? [])
    ids[row.table].add(row.id)
  }
  return ids
}

export function executeDryRun({
  source_records,
  destination_records = [],
  mappings = [],
  conflicts = [],
  comparison_event_ids = [],
  graph_event_ids = [],
} = {}) {
  if (!Array.isArray(source_records) || source_records.length < 1) {
    throw new Error('executable dry-run requires source records')
  }
  if (!Array.isArray(destination_records)) {
    throw new Error('executable dry-run requires destination records')
  }
  if (!Array.isArray(mappings)) {
    throw new Error('executable dry-run requires saved identity mappings')
  }
  const sources = source_records.map((record) => hydrateStagingRecord(record))
  const destinations = destination_records.map((record) => hydrateStagingRecord(record))
  const planned = planPage(sources, {
    publicRows: destinationPublicRows(destinations),
    publicIds: destinationPublicIds(destinations),
    existingMappings: mappings,
    existingConflicts: conflicts,
    comparisonEventIds: comparison_event_ids,
    graphEventIds: graph_event_ids,
  })
  assertPageNotPublishing(planned)
  const quarantined = planned.filter((row) => row.decision === IDENTITY_DECISIONS.conflict
    || row.decision === IDENTITY_DECISIONS.family_mismatch
    || row.decision === IDENTITY_DECISIONS.title_only
    || row.endpoints?.orphan)
  return {
    dry_run: true,
    applied_live: false,
    source: 'supplied_source_destination_and_mappings',
    planned,
    decisions: planned.reduce((acc, row) => {
      acc[row.decision] = (acc[row.decision] ?? 0) + 1
      return acc
    }, {}),
    unresolved: {
      page_quarantined: quarantined.length,
      family_mismatches: planned.filter((row) => row.decision === IDENTITY_DECISIONS.family_mismatch).length,
      mapping_skips: planned.filter((row) => row.decision === IDENTITY_DECISIONS.skip_existing_mapping).length,
      orphans: planned.filter((row) => row.endpoints?.orphan).length,
    },
    publication_impact: {
      current_public_nodes: (destinationPublicIds(destinations).nodes ?? new Set()).size,
      current_public_edges: (destinationPublicIds(destinations).edges ?? new Set()).size,
      copy_versus_publish: 'separate',
    },
  }
}

export function enqueueSql(runId, records, context = {}) {
  if (typeof runId !== 'string' || !runId.trim() || runId.length > 120) throw new Error('run_id required')
  const hydrated = records.map((record) => hydrateStagingRecord(record))
  const planning = inferPlanningContext(hydrated, context)
  const planned = planPage(hydrated, planning)
  assertPageNotPublishing(planned)
  const mappings = planning.existingMappings.map((row) => ({
    source_project_ref: row.source_project_ref,
    source_table: row.source_table,
    source_id: row.source_id,
    target_id: row.target_id,
    source_url: row.source_url ?? null,
  }))
  return {
    planned,
    sql: 'select public.mip_legacy_graph_v1($1,$2::jsonb) result',
    params: ['enqueue', serializeStagingJson({
      run_id: runId,
      mappings,
      records: planned.map((row) => ({
        source_project_ref: row.source_project_ref,
        source_table: row.source_table,
        source_id: row.source_id,
        object_family: row.object_family,
        payload: row.payload,
        payload_json: row.payload_json,
        payload_sha256: row.payload_sha256,
        source_url: row.source_url,
        source_imported_at: row.source_imported_at,
        proposed_target_id: row.mapping?.target_id ?? row.proposed_target_id,
        recovery_status: row.recovery_status,
        mapping: row.mapping,
        endpoint_source_id: row.endpoint_source_id,
        endpoint_target_id: row.endpoint_target_id,
        relationship_type: row.relationship_type,
      })),
    })],
  }
}

async function rpcOn(db, action, input = {}) {
  return (await db.query(
    'select public.mip_legacy_graph_v1($1,$2::jsonb) result',
    [action, serializeStagingJson(input)],
  )).rows[0].result
}

export async function applyStagingPage(db, { run_id, records, ...context }) {
  const prepared = enqueueSql(run_id, records, context)
  const queued = (await db.query(prepared.sql, prepared.params)).rows[0].result
  if (queued.already_completed) return queued
  const job = await rpcOn(db, 'claim', { run_id })
  if (!job) throw new Error('no claimable staging job')
  return rpcOn(db, 'finish', { job_id: job.id, lease_token: job.lease_token })
}

export function createStagingRpc({ url, key, fetchImpl = fetch }) {
  const target = `https://${PRODUCTION_PROJECT_REF}.supabase.co`
  if (url?.replace(/\/$/, '') !== target) throw new Error('legacy graph staging target must be the current V2 project')
  if (!key) throw new Error('MIP_STAGING_SERVICE_KEY is required in the server environment')
  return async (action, input = {}) => {
    const response = await fetchImpl(`${target}/rest/v1/rpc/${STAGING_RPC}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: serializeStagingJson({ p_action: action, p_input: input }),
      signal: AbortSignal.timeout(25000),
    })
    const text = await response.text().catch(() => '')
    const body = text ? parseJsonLossless(text) : null
    if (!response.ok) throw Object.assign(new Error('staging operation failed'), { code: `http_${response.status}` })
    return body
  }
}

export async function runBoundedWorker(rpc, { maxJobs = 10 } = {}) {
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > MAX_PAGE_SIZE) {
    throw new Error('maxJobs must be 1-100')
  }
  const report = { completed: [], failed: [], interrupted: [] }
  for (let i = 0; i < maxJobs; i += 1) {
    const job = await rpc('claim', {})
    if (!job) break
    try {
      report.completed.push(await rpc('finish', { job_id: job.id, lease_token: job.lease_token }))
    } catch (error) {
      const code = error.code ?? 'worker_error'
      try {
        const state = await rpc('fail', { job_id: job.id, lease_token: job.lease_token, code, retryable: true })
        report.interrupted.push({ job_id: job.id, state, code })
      } catch {
        report.failed.push({ job_id: job.id, code: 'check_durable_job_state' })
      }
    }
  }
  return report
}

async function main() {
  const [command, file] = process.argv.slice(2)
  if (command === 'dry-run' && file) {
    const input = parseJsonLossless(await readFile(file, 'utf8'))
    process.stdout.write(`${stringifyJsonLossless(executeDryRun(input), 2)}\n`)
    return
  }
  if (command === 'plan' && file) {
    const input = parseJsonLossless(await readFile(file, 'utf8'))
    if (input.source_records || input.destination_records || input.mappings) {
      process.stdout.write(`${stringifyJsonLossless(executeDryRun({
        source_records: input.source_records ?? input.records ?? input,
        destination_records: input.destination_records ?? [],
        mappings: input.mappings ?? [],
        conflicts: input.conflicts ?? [],
        comparison_event_ids: input.comparison_event_ids ?? [],
        graph_event_ids: input.graph_event_ids ?? [],
      }), 2)}\n`)
      return
    }
    const planned = planPage(input.records ?? input)
    process.stdout.write(`${stringifyJsonLossless({ dry_run: true, planned: planned.length, manifest: dryRunManifest(LIVE_DRY_RUN, planned) }, 2)}\n`)
    return
  }
  if (command === 'manifest') {
    process.stdout.write(`${stringifyJsonLossless(dryRunManifest(), 2)}\n`)
    return
  }
  throw new Error('usage: node scripts/mipLegacyGraphStaging.mjs dry-run <page.json>|plan <page.json>|manifest')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
