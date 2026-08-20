import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SOURCE_PROJECT_REF = 'niejaejtbxgakyrsntxm'
const IMPORT_RUN_KEY = 'original-readonly-cross-surface-import-20260820'

async function refreshV2SourceComparison(targetUrl: string, targetServiceKey: string) {
  const response = await fetch(`${targetUrl}/functions/v1/source-comparison-run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${targetServiceKey}`,
    },
    body: JSON.stringify({ mode: 'event_projection' }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`source comparison projection failed: ${payload?.error ?? response.status}`)
  return payload
}
const PAGE_SIZE = 100
const WRITE_BATCH_SIZE = 500

type Row = Record<string, any>

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// A snapshot is represented by deterministic hashes, never by copying source
// payloads into the run ledger. This lets operators prove which read-only
// source material a run saw without storing a second private-source export.
function stableJson(value: any): any {
  if (Array.isArray(value)) return value.map(stableJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]))
  }
  return value
}

async function buildSourceSnapshot(sourceTables: Record<string, Row[]>) {
  const tables: Record<string, { row_count: number, checksum: string }> = {}
  for (const table of Object.keys(sourceTables).sort()) {
    const rowManifest = (sourceTables[table] ?? []).map((row) => JSON.stringify(stableJson(row))).sort()
    tables[table] = { row_count: rowManifest.length, checksum: await sha256(JSON.stringify(rowManifest)) }
  }
  const source_snapshot_checksum = await sha256(JSON.stringify({ source_project_ref: SOURCE_PROJECT_REF, tables }))
  return {
    source_snapshot_id: `${SOURCE_PROJECT_REF}:${source_snapshot_checksum.slice(0, 24)}`,
    source_snapshot_checksum,
    snapshot_checksum_method: 'sha256:canonical-json-table-manifest:v1',
    tables,
  }
}

function originMeta(metadata: any, sourceId: string) {
  return {
    ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
    original_source: { project_ref: SOURCE_PROJECT_REF, source_id: sourceId, import_run: IMPORT_RUN_KEY },
  }
}

function edgeMetadataWithMappedReferences(metadata: any, sourceEdgeId: string, maps: MappingState) {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  const sourceIds = {
    ...(typeof base.article_id === 'string' ? { article_id: base.article_id } : {}),
    ...(typeof base.entity_id === 'string' ? { entity_id: base.entity_id } : {}),
  }
  const mappedMetadata = {
    ...base,
    ...(sourceIds.article_id ? { article_id: mapped(maps, 'articles', sourceIds.article_id) } : {}),
    ...(sourceIds.entity_id ? { entity_id: mapped(maps, 'entities', sourceIds.entity_id) } : {}),
  }
  return {
    ...mappedMetadata,
    original_source: {
      project_ref: SOURCE_PROJECT_REF,
      source_id: sourceEdgeId,
      import_run: IMPORT_RUN_KEY,
      ...(Object.keys(sourceIds).length ? { edge_metadata_source_ids: sourceIds } : {}),
    },
  }
}

function sourceUrl() {
  return `https://${SOURCE_PROJECT_REF}.supabase.co/rest/v1`
}

async function fetchSourceAll(table: string, sourceKey: string, order = 'id'): Promise<Row[]> {
  const rows: Row[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(`${sourceUrl()}/${table}`)
    url.searchParams.set('select', '*')
    url.searchParams.set('order', `${order}.asc`)
    url.searchParams.set('limit', String(PAGE_SIZE))
    url.searchParams.set('offset', String(offset))
    const response = await fetch(url, {
      headers: { apikey: sourceKey, Authorization: `Bearer ${sourceKey}`, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`source read ${table}: HTTP ${response.status}`)
    const page = await response.json()
    if (!Array.isArray(page)) throw new Error(`source read ${table}: non-array response`)
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

type MappingState = Map<string, string> & { pending?: Map<string, Row> }

async function getMappings(target: any): Promise<MappingState> {
  const rows = await existingBy(target, 'original_source_import_mappings', 'source_table, source_id, target_id', [['source_project_ref', SOURCE_PROJECT_REF]])
  const out = new Map<string, string>() as MappingState
  for (const row of rows) out.set(`${row.source_table}:${row.source_id}`, row.target_id)
  out.pending = new Map<string, Row>()
  return out
}

async function remember(_target: any, mappings: MappingState, table: string, sourceId: string, targetId: string, url: string | null = null) {
  const key = `${table}:${sourceId}`
  if (mappings.get(key) === targetId) return
  mappings.set(key, targetId)
  mappings.pending?.set(key, {
    source_project_ref: SOURCE_PROJECT_REF,
    source_table: table,
    source_id: sourceId,
    target_id: targetId,
    source_url: url,
  })
}

async function flushMappings(target: any, mappings: MappingState) {
  const pending = [...(mappings.pending?.values() ?? [])]
  await batched(pending, async (chunk) => {
    await insertRows(target, 'original_source_import_mappings', chunk, 'source_project_ref,source_table,source_id')
  })
  mappings.pending?.clear()
}

function checkpointCounts(report: Row) {
  return Object.fromEntries(Object.entries(report).filter(([, value]) => typeof value === 'number'))
}

async function checkpointImportStage(target: any, stage: string, checkpoints: Row[], report: Row) {
  const completed_at = new Date().toISOString()
  checkpoints.push({ stage, completed_at, counts: checkpointCounts(report) })
  const { error } = await target.from('original_source_import_runs').update({
    current_stage: stage,
    stage_checkpoints: checkpoints,
    report,
    updated_at: completed_at,
  }).eq('run_key', IMPORT_RUN_KEY)
  if (error) throw new Error(`import checkpoint ${stage}: ${error.message}`)
}

async function importStage(target: any, maps: MappingState, stage: string, checkpoints: Row[], report: Row, work: () => Promise<void>) {
  await work()
  // Flush after every completed stage: a retry can reuse durable source-to-
  // target identity mappings instead of replaying an earlier stage blindly.
  await flushMappings(target, maps)
  await checkpointImportStage(target, stage, checkpoints, report)
}

function mapped(mappings: Map<string, string>, table: string, sourceId: string | null | undefined) {
  if (!sourceId) return null
  return mappings.get(`${table}:${sourceId}`) ?? sourceId
}

async function batched<T>(values: T[], fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < values.length; i += WRITE_BATCH_SIZE) await fn(values.slice(i, i + WRITE_BATCH_SIZE))
}

async function insertRows(target: any, table: string, rows: Row[], onConflict?: string) {
  if (!rows.length) return
  const { error } = await target.from(table).upsert(rows, onConflict ? { onConflict } : undefined)
  if (error) throw new Error(`${table}: ${error.message}`)
}

async function insertOnlyRows(target: any, table: string, rows: Row[]) {
  if (!rows.length) return
  const { error } = await target.from(table).insert(rows)
  if (error) throw new Error(`${table}: ${error.message}`)
}

async function recordArticleConflicts(target: any, conflicts: Row[]) {
  if (!conflicts.length) return
  await batched(conflicts, async (chunk) => {
    await insertRows(target, 'original_source_import_conflicts', chunk,
      'source_project_ref,run_key,source_table,source_id,conflict_kind')
  })
}

async function assertImporterCredential(target: any, req: Request) {
  const credential = req.headers.get('x-mip-original-import-key')
  if (!credential) return false
  const digest = await sha256(credential)
  const { data, error } = await target
    .from('original_source_import_credentials')
    .select('key_hash, active')
    .eq('credential_name', 'original-source-import')
    .maybeSingle()
  if (error || !data?.active) return false
  return digest === data.key_hash
}

async function existingBy(target: any, table: string, fields: string, filters: Array<[string, string]> = []) {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    let query = target.from(table).select(fields)
    for (const [column, value] of filters) query = query.eq(column, value)
    const { data, error } = await query.range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

async function importArcs(target: any, source: Row[], maps: Map<string, string>, report: any) {
  const existing = new Map((await existingBy(target, 'story_arcs', 'id, slug')).map((r) => [r.slug, r.id]))
  for (const row of source) {
    let targetId = maps.get(`story_arcs:${row.id}`) ?? existing.get(row.slug)
    if (!targetId) {
      const payload = {
        id: row.id, slug: row.slug, title: row.title, category: row.category,
        status: row.status, coverage_gap: row.coverage_gap, summary: row.summary,
        started_at: row.started_at, last_update_at: row.last_update_at,
        category_confidence: row.category_confidence, category_evidence: row.category_evidence,
        title_article_count: row.title_article_count ?? 0,
      }
      await insertRows(target, 'story_arcs', [payload])
      targetId = row.id
      report.storyArcsInserted++
    }
    await remember(target, maps, 'story_arcs', row.id, targetId)
  }
}

async function importArticles(target: any, source: Row[], maps: MappingState, report: any) {
  const existingRows = await existingBy(target, 'articles', 'id, url')
  const existingByUrl = new Map(existingRows.filter((row) => row.url).map((row) => [row.url, row.id]))
  const existingIds = new Set(existingRows.map((row) => row.id))
  const insertedArticleIds = new Set<string>()
  const conflicts: Row[] = []
  const payload: Row[] = []

  for (const row of source) {
    const mappedId = maps.get(`articles:${row.id}`)
    const urlTargetId = existingByUrl.get(row.url)
    const idAlreadyExists = existingIds.has(row.id)
    const baseConflict = {
      source_project_ref: SOURCE_PROJECT_REF,
      run_key: IMPORT_RUN_KEY,
      source_table: 'articles',
      source_id: row.id,
      source_url: row.url,
      affected_fields: [],
      details: { policy: 'insert-only; existing Version Two article fields are never updated' },
    }

    if (mappedId) {
      conflicts.push({
        ...baseConflict, target_id: mappedId, conflict_kind: 'existing_import_mapping_skipped',
        recovery_status: 'not_applicable_existing_mapping',
      })
      report.articlesSkippedExisting++
      report.articleConflictsLogged++
      continue
    }
    if (urlTargetId) {
      conflicts.push({
        ...baseConflict, target_id: urlTargetId, conflict_kind: 'existing_url_skipped',
        recovery_status: 'not_applicable_existing_url',
      })
      await remember(target, maps, 'articles', row.id, urlTargetId, row.url)
      report.articlesSkippedExisting++
      report.articleConflictsLogged++
      continue
    }
    if (idAlreadyExists) {
      conflicts.push({
        ...baseConflict, target_id: row.id, conflict_kind: 'existing_id_skipped',
        recovery_status: 'manual_review_required_identifier_collision',
      })
      await remember(target, maps, 'articles', row.id, row.id, row.url)
      report.articlesSkippedExisting++
      report.articleConflictsLogged++
      continue
    }

    payload.push({
      id: row.id, feed: row.feed, outlet: row.outlet, title: row.title, url: row.url,
      summary: row.summary, published_at: row.published_at, fetched_at: row.fetched_at,
      body_text: row.body_text, claims: row.claims ?? [], unattributed: row.unattributed ?? false,
      monoculture: row.monoculture ?? false, is_digest: row.is_digest ?? false,
      image_url: row.image_url, image_alt: row.image_alt,
      entities_extracted_at: row.entities_extracted_at, arc_assign_attempted_at: row.arc_assign_attempted_at,
      arc_assignment_evidence: row.arc_assignment_evidence,
      source_status: row.source_status ?? 'active', source_status_changed_at: row.source_status_changed_at,
      source_status_note: `Imported read-only from original project ${SOURCE_PROJECT_REF}; source article ${row.id}`,
      ingestion_run_id: IMPORT_RUN_KEY,
    })
    insertedArticleIds.add(row.id)
    await remember(target, maps, 'articles', row.id, row.id, row.url)
    report.articlesInserted++
  }

  await batched(payload, async (chunk) => insertOnlyRows(target, 'articles', chunk))
  await recordArticleConflicts(target, conflicts)

  // Only newly inserted articles receive Arc membership. Existing Version Two
  // rows are deliberately not enriched or reassigned by this importer.
  const articleIdsByArc = new Map<string, string[]>()
  for (const row of source) {
    if (!insertedArticleIds.has(row.id)) continue
    const arcId = mapped(maps, 'story_arcs', row.arc_id)
    if (!arcId) continue
    const ids = articleIdsByArc.get(arcId) ?? []
    ids.push(row.id)
    articleIdsByArc.set(arcId, ids)
  }
  for (const [arcId, articleIds] of articleIdsByArc) {
    await batched(articleIds, async (ids) => {
      const { error } = await target.from('articles').update({ arc_id: arcId }).in('id', ids)
      if (error) throw error
    })
  }
}

async function importNodes(target: any, source: Row[], maps: MappingState, report: any) {
  const existing = new Map((await existingBy(target, 'nodes', 'id, slug')).map((r) => [r.slug, r.id]))
  const payload: Row[] = []
  for (const row of source) {
    const targetId = maps.get(`nodes:${row.id}`) ?? existing.get(row.slug) ?? row.id
    if (!maps.has(`nodes:${row.id}`) && !existing.has(row.slug)) {
      payload.push({
        id: targetId, slug: row.slug, label: row.label, type: row.type, description: row.description,
        confidence: row.confidence, summary: row.summary, occurred_at: row.occurred_at,
        metadata: originMeta(row.metadata, row.id), created_at: row.created_at, updated_at: row.updated_at,
        arc_id: mapped(maps, 'story_arcs', row.arc_id),
      })
      report.nodesInserted++
    }
    await remember(target, maps, 'nodes', row.id, targetId)
  }
  await batched(payload, async (chunk) => insertRows(target, 'nodes', chunk))
}

// Arc roots are source-record relationships, not inferred graph links. Arcs are
// imported before nodes, so this runs only after node mappings are durable. It
// preserves an existing V2 root and reports an unmapped source reference rather
// than guessing or synthesizing a replacement.
async function restoreArcRoots(target: any, source: Row[], maps: MappingState, report: any) {
  for (const row of source) {
    if (!row.root_node_id) continue
    const arcId = mapped(maps, 'story_arcs', row.id)
    const rootNodeId = mapped(maps, 'nodes', row.root_node_id)
    if (!arcId || !rootNodeId) {
      report.arcRootsSkippedUnmapped++
      continue
    }
    const { data, error } = await target
      .from('story_arcs')
      .update({ root_node_id: rootNodeId })
      .eq('id', arcId)
      .is('root_node_id', null)
      .select('id')
    if (error) throw error
    report.arcRootsRestored += data?.length ?? 0
  }
}

async function importEntities(target: any, source: Row[], maps: MappingState, report: any) {
  const existing = new Map((await existingBy(target, 'entities', 'id, normalized_name')).map((r) => [r.normalized_name, r.id]))
  const payload: Row[] = []
  for (const row of source) {
    const targetId = maps.get(`entities:${row.id}`) ?? existing.get(row.normalized_name) ?? row.id
    if (!maps.has(`entities:${row.id}`) && !existing.has(row.normalized_name)) {
      payload.push({ ...row, id: targetId })
      report.entitiesInserted++
    }
    await remember(target, maps, 'entities', row.id, targetId)
  }
  await batched(payload, async (chunk) => insertRows(target, 'entities', chunk))
}

async function importArcEvents(target: any, source: Row[], maps: MappingState, report: any) {
  const payload: Row[] = []
  for (const row of source) {
    if (maps.has(`arc_events:${row.id}`)) continue
    const arcId = mapped(maps, 'story_arcs', row.arc_id)
    if (!arcId) continue
    payload.push({ ...row, id: row.id, arc_id: arcId })
    await remember(target, maps, 'arc_events', row.id, row.id)
    report.arcEventsInserted++
  }
  await batched(payload, async (chunk) => insertRows(target, 'arc_events', chunk, 'id'))
}

async function importEvents(target: any, source: Row[], maps: MappingState, report: any) {
  const payload: Row[] = []
  for (const row of source) {
    if (maps.has(`events:${row.id}`)) continue
    payload.push({
      ...row, id: row.id, arc_id: mapped(maps, 'story_arcs', row.arc_id),
      arc_event_id: mapped(maps, 'arc_events', row.arc_event_id),
      // Original event status is preserved. The comparison read path separately
      // excludes only Timeline-only records and requires multiple outlets.
      rule_version: `original-readonly-import|${row.id}`,
    })
    await remember(target, maps, 'events', row.id, row.id)
    report.eventsInserted++
  }
  await batched(payload, async (chunk) => insertRows(target, 'events', chunk, 'id'))
}

async function importEventArticles(target: any, source: Row[], maps: Map<string, string>, report: any) {
  const payload = source.map((row) => ({
    event_id: mapped(maps, 'events', row.event_id),
    article_id: mapped(maps, 'articles', row.article_id),
    membership_method: row.membership_method,
    membership_confidence: row.membership_confidence,
    created_at: row.created_at,
  })).filter((row) => row.event_id && row.article_id)
  await batched(payload, async (chunk) => {
    await insertRows(target, 'event_articles', chunk, 'event_id,article_id')
    report.eventArticlesLinked += chunk.length
  })
}

async function importEdges(target: any, source: Row[], maps: MappingState, report: any) {
  const payload: Row[] = []
  for (const row of source) {
    if (maps.has(`edges:${row.id}`)) continue
    const sourceId = mapped(maps, 'nodes', row.source_id)
    const targetId = mapped(maps, 'nodes', row.target_id)
    if (!sourceId || !targetId) { report.edgesSkippedUnmapped++; continue }
    payload.push({ ...row, id: row.id, source_id: sourceId, target_id: targetId, metadata: edgeMetadataWithMappedReferences(row.metadata, row.id, maps) })
    await remember(target, maps, 'edges', row.id, row.id)
    report.edgesInserted++
  }
  await batched(payload, async (chunk) => insertRows(target, 'edges', chunk, 'id'))
}

async function importSources(target: any, source: Row[], maps: MappingState, report: any) {
  const payload: Row[] = []
  for (const row of source) {
    if (maps.has(`sources:${row.id}`)) continue
    const nodeId = mapped(maps, 'nodes', row.node_id)
    if (!nodeId) { report.sourcesSkippedUnmapped++; continue }
    payload.push({ ...row, id: row.id, node_id: nodeId })
    await remember(target, maps, 'sources', row.id, row.id, row.url ?? null)
    report.sourcesInserted++
  }
  await batched(payload, async (chunk) => insertRows(target, 'sources', chunk, 'id'))
}

async function importCitations(target: any, source: Row[], maps: MappingState, report: any) {
  const payload: Row[] = []
  for (const row of source) {
    if (maps.has(`citations:${row.id}`)) continue
    const articleId = mapped(maps, 'articles', row.article_id)
    if (!articleId) { report.citationsSkippedUnmapped++; continue }
    payload.push({ ...row, id: row.id, article_id: articleId, resolved_node_id: mapped(maps, 'nodes', row.resolved_node_id) })
    await remember(target, maps, 'citations', row.id, row.id)
    report.citationsInserted++
  }
  await batched(payload, async (chunk) => insertRows(target, 'citations', chunk, 'id'))
}

async function importArticleEntities(target: any, source: Row[], maps: Map<string, string>, report: any) {
  const payload = source.map((row) => ({
    ...row, article_id: mapped(maps, 'articles', row.article_id), entity_id: mapped(maps, 'entities', row.entity_id),
  })).filter((row) => row.article_id && row.entity_id)
  await batched(payload, async (chunk) => {
    await insertRows(target, 'article_entities', chunk, 'article_id,entity_id')
    report.articleEntitiesLinked += chunk.length
  })
}

async function importPolicies(target: any, source: Row[], maps: MappingState, report: any) {
  const payload: Row[] = []
  for (const row of source) {
    const policyId = maps.get(`policies:${row.id}`) ?? row.id
    if (!maps.has(`policies:${row.id}`)) {
      payload.push({ ...row, id: policyId, metadata: originMeta(row.metadata, row.id) })
      report.policiesInserted++
    }
    await remember(target, maps, 'policies', row.id, policyId)
  }
  await batched(payload, async (chunk) => insertRows(target, 'policies', chunk))
}

async function importPolicyDocs(target: any, source: Row[], maps: MappingState, report: any) {
  const payload: Row[] = []
  for (const row of source) {
    if (maps.has(`policy_documents:${row.id}`)) continue
    payload.push({ ...row, id: row.id, policy_id: mapped(maps, 'policies', row.policy_id) })
    await remember(target, maps, 'policy_documents', row.id, row.id, row.url ?? null)
    report.policyDocumentsInserted++
  }
  await batched(payload, async (chunk) => insertRows(target, 'policy_documents', chunk, 'id'))
}

async function importPolicyActors(target: any, source: Row[], maps: Map<string, string>, report: any) {
  const existing = new Set((await existingBy(target, 'policy_actors', 'policy_id, entity_id'))
    .map((row) => `${row.policy_id}:${row.entity_id}`))
  const payload = source.map((row) => ({
    ...row, policy_id: mapped(maps, 'policies', row.policy_id), entity_id: mapped(maps, 'entities', row.entity_id),
  })).filter((row) => row.policy_id && row.entity_id && !existing.has(`${row.policy_id}:${row.entity_id}`))
  await batched(payload, async (chunk) => {
    await insertRows(target, 'policy_actors', chunk)
    report.policyActorsLinked += chunk.length
  })
}

async function importPolicyTopics(target: any, source: Row[], maps: Map<string, string>, report: any) {
  const targetTopics = new Map((await existingBy(target, 'topics', 'id, slug')).map((r) => [r.id, r.id]))
  const existing = new Set((await existingBy(target, 'policy_topics', 'policy_id, topic_id'))
    .map((row) => `${row.policy_id}:${row.topic_id}`))
  const payload = source.map((row) => ({ ...row, policy_id: mapped(maps, 'policies', row.policy_id), topic_id: targetTopics.get(row.topic_id) ?? null }))
    .filter((row) => row.policy_id && row.topic_id && !existing.has(`${row.policy_id}:${row.topic_id}`))
  await batched(payload, async (chunk) => {
    await insertRows(target, 'policy_topics', chunk)
    report.policyTopicsLinked += chunk.length
  })
}

async function importP3Policies(target: any, source: Row[], maps: MappingState, report: any) {
  const existing = new Map((await existingBy(target, 'p3_policy', 'id, name')).map((r) => [r.name, r.id]))
  const payload: Row[] = []
  for (const row of source) {
    const targetId = maps.get(`p3_policy:${row.id}`) ?? existing.get(row.name) ?? row.id
    if (!maps.has(`p3_policy:${row.id}`) && !existing.has(row.name)) {
      payload.push({ ...row, id: targetId })
      report.p3PoliciesInserted++
    }
    await remember(target, maps, 'p3_policy', row.id, targetId)
  }
  await batched(payload, async (chunk) => insertRows(target, 'p3_policy', chunk))
}

async function importP3TrackEvents(target: any, source: Row[], maps: MappingState, report: any) {
  const payload: Row[] = []
  for (const row of source) {
    if (maps.has(`p3_policy_track_event:${row.id}`)) continue
    const policyId = mapped(maps, 'p3_policy', row.policy_id)
    if (!policyId) { report.p3TracksSkippedUnmapped++; continue }
    payload.push({ ...row, id: row.id, policy_id: policyId, source_id: mapped(maps, 'sources', row.source_id) })
    await remember(target, maps, 'p3_policy_track_event', row.id, row.id)
    report.p3TracksInserted++
  }
  await batched(payload, async (chunk) => insertRows(target, 'p3_policy_track_event', chunk, 'id'))
}

async function importP3Legal(target: any, cases: Row[], evidence: Row[], maps: MappingState, report: any) {
  const safeCases = cases.filter((row) => !row.involves_minor_or_private_person && !row.sealed_or_expunged)
  const casePayload: Row[] = []
  for (const row of safeCases) {
    if (!maps.has(`p3_legal_case:${row.id}`)) {
      casePayload.push({ ...row, id: row.id })
      report.p3LegalCasesInserted++
    }
    await remember(target, maps, 'p3_legal_case', row.id, row.id)
  }
  await batched(casePayload, async (chunk) => insertRows(target, 'p3_legal_case', chunk, 'id'))
  const evidencePayload: Row[] = []
  for (const row of evidence) {
    // Do not fall back to a source case id: evidence can be linked only when
    // its case passed the protected-person and sealing exclusions above.
    const caseId = maps.get(`p3_legal_case:${row.case_id}`)
    if (!caseId || maps.has(`p3_legal_case_evidence:${row.id}`)) continue
    evidencePayload.push({ ...row, id: row.id, case_id: caseId, source_id: mapped(maps, 'sources', row.source_id) })
    await remember(target, maps, 'p3_legal_case_evidence', row.id, row.id, row.source_url ?? null)
    report.p3LegalEvidenceInserted++
  }
  await batched(evidencePayload, async (chunk) => insertRows(target, 'p3_legal_case_evidence', chunk, 'id'))
  report.p3LegalCasesExcluded = cases.length - safeCases.length
}

Deno.serve(async (req: Request) => {
  const targetUrl = Deno.env.get('SUPABASE_URL')
  const targetServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!targetUrl || !targetServiceKey) return Response.json({ error: 'target service credentials unavailable' }, { status: 500 })
  const target = createClient(targetUrl, targetServiceKey)
  if (!(await assertImporterCredential(target, req))) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sourceKey = typeof body?.source_anon_key === 'string' ? body.source_anon_key : ''
  if (!sourceKey) return Response.json({ error: 'source_anon_key is required for read-only export' }, { status: 400 })

  const report: any = {
    sourceProject: SOURCE_PROJECT_REF, runKey: IMPORT_RUN_KEY, articlesInserted: 0,
    articlesSkippedExisting: 0, articleConflictsLogged: 0,
    storyArcsInserted: 0, nodesInserted: 0, arcRootsRestored: 0, arcRootsSkippedUnmapped: 0, entitiesInserted: 0, arcEventsInserted: 0, eventsInserted: 0,
    eventArticlesLinked: 0, edgesInserted: 0, edgesSkippedUnmapped: 0, sourcesInserted: 0, sourcesSkippedUnmapped: 0,
    citationsInserted: 0, citationsSkippedUnmapped: 0, articleEntitiesLinked: 0, policiesInserted: 0,
    policyDocumentsInserted: 0, policyActorsLinked: 0, policyTopicsLinked: 0, p3PoliciesInserted: 0,
    p3TracksInserted: 0, p3TracksSkippedUnmapped: 0, p3LegalCasesInserted: 0, p3LegalEvidenceInserted: 0,
    p3LegalCasesExcluded: 0, errors: [] as string[],
  }

  const checkpoints: Row[] = []
  try {
    const { error: runError } = await target.from('original_source_import_runs').upsert({
      source_project_ref: SOURCE_PROJECT_REF,
      run_key: IMPORT_RUN_KEY,
      status: 'running',
      current_stage: 'source_read_pending',
      stage_checkpoints: checkpoints,
      report,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'run_key' })
    if (runError) throw runError

    const [arcs, articles, nodes, entities, arcEvents, events, eventArticles, edges, sources, citations, articleEntities, policies, policyDocs, policyActors, policyTopics, p3Policies, p3Tracks, p3Cases, p3Evidence] = await Promise.all([
      fetchSourceAll('story_arcs', sourceKey), fetchSourceAll('articles', sourceKey), fetchSourceAll('nodes', sourceKey),
      fetchSourceAll('entities', sourceKey), fetchSourceAll('arc_events', sourceKey), fetchSourceAll('events', sourceKey),
      fetchSourceAll('event_articles', sourceKey, 'event_id'), fetchSourceAll('edges', sourceKey), fetchSourceAll('sources', sourceKey),
      fetchSourceAll('citations', sourceKey), fetchSourceAll('article_entities', sourceKey, 'article_id'), fetchSourceAll('policies', sourceKey),
      fetchSourceAll('policy_documents', sourceKey), fetchSourceAll('policy_actors', sourceKey, 'policy_id'), fetchSourceAll('policy_topics', sourceKey, 'policy_id'),
      fetchSourceAll('p3_policy', sourceKey), fetchSourceAll('p3_policy_track_event', sourceKey, 'policy_id'),
      fetchSourceAll('p3_legal_case', sourceKey), fetchSourceAll('p3_legal_case_evidence', sourceKey, 'case_id'),
    ])

    const snapshot = await buildSourceSnapshot({
      story_arcs: arcs, articles, nodes, entities, arc_events: arcEvents, events, event_articles: eventArticles,
      edges, sources, citations, article_entities: articleEntities, policies, policy_documents: policyDocs,
      policy_actors: policyActors, policy_topics: policyTopics, p3_policy: p3Policies,
      p3_policy_track_event: p3Tracks, p3_legal_case: p3Cases, p3_legal_case_evidence: p3Evidence,
    })
    report.sourceSnapshot = snapshot
    const { error: snapshotError } = await target.from('original_source_import_runs').update({
      source_snapshot_id: snapshot.source_snapshot_id,
      source_snapshot_checksum: snapshot.source_snapshot_checksum,
      snapshot_checksum_method: snapshot.snapshot_checksum_method,
      report,
      updated_at: new Date().toISOString(),
    }).eq('run_key', IMPORT_RUN_KEY)
    if (snapshotError) throw snapshotError
    await checkpointImportStage(target, 'source_snapshot_loaded', checkpoints, report)

    const maps = await getMappings(target)
    await importStage(target, maps, 'story_arcs', checkpoints, report, () => importArcs(target, arcs, maps, report))
    await importStage(target, maps, 'articles', checkpoints, report, () => importArticles(target, articles, maps, report))
    await importStage(target, maps, 'nodes', checkpoints, report, () => importNodes(target, nodes, maps, report))
    await importStage(target, maps, 'arc_root_mapping', checkpoints, report, () => restoreArcRoots(target, arcs, maps, report))
    await importStage(target, maps, 'entities', checkpoints, report, () => importEntities(target, entities, maps, report))
    await importStage(target, maps, 'arc_events', checkpoints, report, () => importArcEvents(target, arcEvents, maps, report))
    await importStage(target, maps, 'events', checkpoints, report, () => importEvents(target, events, maps, report))
    await importStage(target, maps, 'event_articles', checkpoints, report, () => importEventArticles(target, eventArticles, maps, report))
    await importStage(target, maps, 'edges', checkpoints, report, () => importEdges(target, edges, maps, report))
    await importStage(target, maps, 'sources', checkpoints, report, () => importSources(target, sources, maps, report))
    await importStage(target, maps, 'citations', checkpoints, report, () => importCitations(target, citations, maps, report))
    await importStage(target, maps, 'article_entities', checkpoints, report, () => importArticleEntities(target, articleEntities, maps, report))
    await importStage(target, maps, 'policies', checkpoints, report, () => importPolicies(target, policies, maps, report))
    await importStage(target, maps, 'policy_documents', checkpoints, report, () => importPolicyDocs(target, policyDocs, maps, report))
    await importStage(target, maps, 'policy_actors', checkpoints, report, () => importPolicyActors(target, policyActors, maps, report))
    await importStage(target, maps, 'policy_topics', checkpoints, report, () => importPolicyTopics(target, policyTopics, maps, report))
    await importStage(target, maps, 'p3_policy', checkpoints, report, () => importP3Policies(target, p3Policies, maps, report))
    await importStage(target, maps, 'p3_policy_track_event', checkpoints, report, () => importP3TrackEvents(target, p3Tracks, maps, report))
    await importStage(target, maps, 'p3_legal', checkpoints, report, () => importP3Legal(target, p3Cases, p3Evidence, maps, report))
    report.sourceComparisonProjection = await refreshV2SourceComparison(targetUrl, targetServiceKey)
    await checkpointImportStage(target, 'source_comparison_projection', checkpoints, report)

    await target.from('original_source_import_runs').update({
      status: 'completed',
      current_stage: 'completed',
      completed_at: new Date().toISOString(),
      stage_checkpoints: checkpoints,
      report,
      updated_at: new Date().toISOString(),
    }).eq('run_key', IMPORT_RUN_KEY)
    return Response.json({ ok: true, ...report })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    report.errors.push(detail)
    await target.from('original_source_import_runs').update({
      status: 'failed',
      current_stage: 'failed',
      completed_at: new Date().toISOString(),
      stage_checkpoints: checkpoints,
      report,
      updated_at: new Date().toISOString(),
    }).eq('run_key', IMPORT_RUN_KEY)
    return Response.json({ ok: false, ...report }, { status: 500 })
  }
})
