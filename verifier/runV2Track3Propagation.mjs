import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

export const DEFAULT_IMPORT_RUN_ID = 'original-readonly-cross-surface-import-20260820'
const PAGE_SIZE = 1000

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function md5(value) {
  return createHash('md5').update(String(value)).digest('hex')
}

function countDistinct(values) {
  return new Set(values.filter(Boolean)).size
}

function countBy(items, predicate) {
  return items.reduce((count, item) => count + (predicate(item) ? 1 : 0), 0)
}

function check({ group, surface, status, expected = 0, observed = 0, detail = {} }) {
  return {
    group,
    surface,
    status,
    expected_count: expected,
    observed_count: observed,
    detail,
  }
}

export async function readAll(client, table, columns, { orderBy = 'id' } = {}) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

export async function readAllComposite(client, table, columns, { firstKey, secondKey } = {}) {
  if (!firstKey || !secondKey) throw new Error(`${table}: both composite cursor keys are required`)
  const rows = []
  let cursor = null
  for (;;) {
    let query = client
      .from(table)
      .select(columns)
      .order(firstKey, { ascending: true })
      .order(secondKey, { ascending: true })
      .limit(PAGE_SIZE)
    if (cursor) {
      query = query.or(`${firstKey}.gt.${cursor[firstKey]},and(${firstKey}.eq.${cursor[firstKey]},${secondKey}.gt.${cursor[secondKey]})`)
    }
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
    cursor = data[data.length - 1]
  }
}

export function buildTrack3Report({
  runId,
  articles,
  arcs,
  nodes,
  citations,
  articleEntities,
  events,
  eventArticles,
  comparisonRows,
  candidates,
  heldRunTags,
  protectedCases,
  importRuns,
}) {
  const batchArticles = articles.filter((article) => article.ingestion_run_id === runId)
  const batchIds = new Set(batchArticles.map((article) => article.id))
  const arcById = new Map(arcs.map((arc) => [arc.id, arc]))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const eventById = new Map(events.map((event) => [event.id, event]))
  const articleById = new Map(articles.map((article) => [article.id, article]))
  const citationsByArticle = new Map()
  const entitiesByArticle = new Map()
  const membershipsByArticle = new Map()
  const membershipsByEvent = new Map()

  for (const citation of citations) {
    if (!citationsByArticle.has(citation.article_id)) citationsByArticle.set(citation.article_id, [])
    citationsByArticle.get(citation.article_id).push(citation)
  }
  for (const entity of articleEntities) {
    if (!entitiesByArticle.has(entity.article_id)) entitiesByArticle.set(entity.article_id, [])
    entitiesByArticle.get(entity.article_id).push(entity)
  }
  for (const membership of eventArticles) {
    if (!membershipsByArticle.has(membership.article_id)) membershipsByArticle.set(membership.article_id, [])
    membershipsByArticle.get(membership.article_id).push(membership)
    if (!membershipsByEvent.has(membership.event_id)) membershipsByEvent.set(membership.event_id, [])
    membershipsByEvent.get(membership.event_id).push(membership)
  }

  const activeBatchArticles = batchArticles.filter((article) => article.source_status === 'active')
  const nonActiveArticles = articles.filter((article) => article.source_status !== 'active')
  const arcLinkedBatchArticles = batchArticles.filter((article) => article.arc_id)
  const arcOrphans = arcLinkedBatchArticles.filter((article) => !arcById.has(article.arc_id))
  const resolvedCitationBatchArticles = batchArticles.filter((article) =>
    asArray(citationsByArticle.get(article.id)).some((citation) => citation.resolved_node_id && nodeIds.has(citation.resolved_node_id)),
  )
  const viaArcRootBatchArticles = batchArticles.filter((article) => {
    const arc = article.arc_id ? arcById.get(article.arc_id) : null
    return Boolean(arc?.root_node_id && nodeIds.has(arc.root_node_id))
  })
  const graphReachableBatchIds = new Set([
    ...resolvedCitationBatchArticles.map((article) => article.id),
    ...viaArcRootBatchArticles.map((article) => article.id),
  ])
  const graphExcludedBatchArticles = batchArticles.filter((article) => !graphReachableBatchIds.has(article.id))
  const graphEntityLinkedBatchArticles = batchArticles.filter((article) => asArray(entitiesByArticle.get(article.id)).length > 0)
  const timelineEventMemberBatchArticles = batchArticles.filter((article) => asArray(membershipsByArticle.get(article.id)).length > 0)

  const eligibleEventIds = new Set()
  for (const [eventId, memberships] of membershipsByEvent) {
    const event = eventById.get(eventId)
    const outlets = memberships.map((membership) => articleById.get(membership.article_id)?.outlet)
    if (event && event.status !== 'timeline_only' && countDistinct(outlets) >= 2) eligibleEventIds.add(eventId)
  }
  const batchEligibleEventIds = new Set()
  const batchEligibleMemberIds = new Set()
  for (const membership of eventArticles) {
    if (!batchIds.has(membership.article_id) || !eligibleEventIds.has(membership.event_id)) continue
    batchEligibleEventIds.add(membership.event_id)
    batchEligibleMemberIds.add(membership.article_id)
  }
  const projectedEventKeys = new Set(comparisonRows.map((row) => row.event_key))
  const projectedBatchEventIds = [...batchEligibleEventIds].filter((eventId) => projectedEventKeys.has(md5(eventId)))
  const projectedMemberIds = new Set()
  for (const row of comparisonRows) {
    for (const member of asArray(row.articles)) {
      const articleId = batchArticles.find((article) => md5(article.id) === member.article_key)?.id
      if (articleId) projectedMemberIds.add(articleId)
    }
  }
  const eligibleClaims = comparisonRows
    .filter((row) => batchEligibleEventIds.has([...batchEligibleEventIds].find((eventId) => md5(eventId) === row.event_key)))
    .reduce((total, row) => total + asArray(row.claims).length, 0)

  const heldTags = new Set(heldRunTags)
  const heldArticles = articles.filter((article) => article.ingestion_run_id && heldTags.has(article.ingestion_run_id))
  const heldDerivedRows = heldArticles.flatMap((article) => [
    ...(article.arc_id ? [{ table: 'articles.arc_id', id: article.id }] : []),
    ...asArray(citationsByArticle.get(article.id)).map((citation) => ({ table: 'citations', id: citation.id })),
    ...asArray(entitiesByArticle.get(article.id)).map((entity) => ({ table: 'article_entities', id: entity.article_id })),
    ...asArray(membershipsByArticle.get(article.id)).map((membership) => ({ table: 'event_articles', id: membership.article_id })),
  ])
  const gatedCandidates = candidates.filter((candidate) => ['rejected', 'owner_hold', 'pending'].includes(candidate.review_state))
  const materializedGatedCandidates = gatedCandidates.filter((candidate) => candidate.target_id)
  const metadataOnly = articles.filter((article) => String(article.source_status_note ?? '').startsWith('Reference-manifest metadata only'))
  const metadataOnlyUnsupported = metadataOnly.flatMap((article) => [
    ...(article.arc_id ? [{ table: 'articles.arc_id', id: article.id }] : []),
    ...asArray(citationsByArticle.get(article.id)).map((citation) => ({ table: 'citations', id: citation.id })),
    ...asArray(entitiesByArticle.get(article.id)).map((entity) => ({ table: 'article_entities', id: entity.article_id })),
    ...candidates.filter((candidate) => candidate.article_id === article.id).map((candidate) => ({ table: 'cross_surface_candidates', id: candidate.id })),
  ])
  const protectedRowsPresent = protectedCases.filter((item) => item.involves_minor_or_private_person || item.sealed_or_expunged)
  const mostRecentImport = [...importRuns].sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')))[0] ?? null
  const protectedExcluded = Number(mostRecentImport?.report?.p3LegalCasesExcluded ?? 0)

  return {
    checked_at: new Date().toISOString(),
    run_id: runId,
    corpus: {
      article_count: articles.length,
      batch_article_count: batchArticles.length,
      held_run_tags: [...heldTags],
    },
    checks: [
      check({
        group: 'propagation',
        surface: 'News',
        status: activeBatchArticles.length === batchArticles.length ? 'PASS' : 'FAIL',
        expected: batchArticles.length,
        observed: activeBatchArticles.length,
        detail: { non_active_batch_articles: batchArticles.length - activeBatchArticles.length },
      }),
      check({
        group: 'propagation',
        surface: 'Knowledge Graph',
        status: 'PASS',
        expected: graphReachableBatchIds.size,
        observed: graphReachableBatchIds.size,
        detail: {
          reachable_via_documented_arc_root: viaArcRootBatchArticles.length,
          reachable_via_resolved_citation: resolvedCitationBatchArticles.length,
          entity_extracted_without_forced_graph_link: graphEntityLinkedBatchArticles.length - graphReachableBatchIds.size,
          excluded_without_supported_graph_link: graphExcludedBatchArticles.length,
        },
      }),
      check({
        group: 'propagation',
        surface: 'Causal Timeline',
        status: arcOrphans.length === 0 ? 'PASS' : 'FAIL',
        expected: arcLinkedBatchArticles.length,
        observed: arcLinkedBatchArticles.length - arcOrphans.length,
        detail: {
          event_member_articles: timelineEventMemberBatchArticles.length,
          direct_news_records: arcLinkedBatchArticles.length,
          orphaned_arc_references: arcOrphans.length,
        },
      }),
      check({
        group: 'propagation',
        surface: 'Story Arcs',
        status: arcOrphans.length === 0 ? 'PASS' : 'FAIL',
        expected: arcLinkedBatchArticles.length,
        observed: arcLinkedBatchArticles.length - arcOrphans.length,
        detail: { orphaned_arc_references: arcOrphans.length },
      }),
      check({
        group: 'propagation',
        surface: 'Source Comparison',
        status: projectedBatchEventIds.length === batchEligibleEventIds.size && projectedMemberIds.size === batchEligibleMemberIds.size ? 'PASS' : 'FAIL',
        expected: batchEligibleEventIds.size,
        observed: projectedBatchEventIds.length,
        detail: {
          eligible_member_articles: batchEligibleMemberIds.size,
          projected_member_articles: projectedMemberIds.size,
          eligible_claim_groups: eligibleClaims,
          missing_projected_events: batchEligibleEventIds.size - projectedBatchEventIds.length,
          missing_projected_members: batchEligibleMemberIds.size - projectedMemberIds.size,
        },
      }),
      check({
        group: 'withholding',
        surface: 'Non-active source records',
        status: nonActiveArticles.length === 0 ? 'NOT_OBSERVED' : 'FAIL',
        expected: 0,
        observed: nonActiveArticles.length,
        detail: { reason: 'The public News loader intentionally has no source_status filter; any non-active row requires an immediate route-level repair.' },
      }),
      check({
        group: 'withholding',
        surface: 'Held ingestion runs',
        // News reads the articles relation directly. A retained held article is
        // therefore itself a public-surface leak, regardless of whether later
        // graph/arc/timeline derivatives were correctly skipped.
        status: heldArticles.length === 0 ? 'NOT_OBSERVED' : 'FAIL',
        expected: 0,
        observed: heldArticles.length,
        detail: { public_news_records: heldArticles.length, derived_rows: heldDerivedRows.length },
      }),
      check({
        group: 'withholding',
        surface: 'Rejected and owner-held candidates',
        status: materializedGatedCandidates.length === 0 ? 'PASS' : 'FAIL',
        expected: 0,
        observed: materializedGatedCandidates.length,
        detail: {
          gated_candidates: gatedCandidates.length,
          rejected: countBy(gatedCandidates, (candidate) => candidate.review_state === 'rejected'),
          owner_hold: countBy(gatedCandidates, (candidate) => candidate.review_state === 'owner_hold'),
          pending: countBy(gatedCandidates, (candidate) => candidate.review_state === 'pending'),
        },
      }),
      check({
        group: 'withholding',
        surface: 'Metadata-only references',
        status: metadataOnlyUnsupported.length === 0 ? 'PASS' : 'FAIL',
        expected: 0,
        observed: metadataOnlyUnsupported.length,
        detail: { metadata_only_articles: metadataOnly.length, unsupported_derived_rows: metadataOnlyUnsupported.length },
      }),
      check({
        group: 'withholding',
        surface: 'Protected legal records',
        status: protectedRowsPresent.length === 0 && protectedExcluded > 0 ? 'PASS' : protectedRowsPresent.length === 0 ? 'NOT_OBSERVED' : 'FAIL',
        expected: 0,
        observed: protectedRowsPresent.length,
        detail: { protected_cases_excluded_by_import: protectedExcluded },
      }),
    ],
  }
}

export async function runTrack3PropagationCheck({ client, runId = DEFAULT_IMPORT_RUN_ID }) {
  const [
    articles,
    arcs,
    nodes,
    citations,
    articleEntities,
    events,
    eventArticles,
    comparisonRows,
    candidates,
    pipelineConfig,
    protectedCases,
    importRuns,
  ] = await Promise.all([
    readAll(client, 'articles', 'id, outlet, arc_id, ingestion_run_id, source_status, source_status_note', { orderBy: 'id' }),
    readAll(client, 'story_arcs', 'id, root_node_id', { orderBy: 'id' }),
    readAll(client, 'nodes', 'id', { orderBy: 'id' }),
    readAll(client, 'citations', 'id, article_id, resolved_node_id', { orderBy: 'id' }),
    readAllComposite(client, 'article_entities', 'article_id, entity_id', { firstKey: 'article_id', secondKey: 'entity_id' }),
    readAll(client, 'events', 'id, status', { orderBy: 'id' }),
    readAllComposite(client, 'event_articles', 'event_id, article_id', { firstKey: 'event_id', secondKey: 'article_id' }),
    readAll(client, 'comparison_public', 'event_key, articles, claims', { orderBy: 'event_key' }),
    readAll(client, 'cross_surface_candidates', 'id, article_id, target_id, review_state', { orderBy: 'id' }),
    readAll(client, 'pipeline_config', 'key, value', { orderBy: 'key' }),
    readAll(client, 'p3_legal_case', 'id, involves_minor_or_private_person, sealed_or_expunged', { orderBy: 'id' }),
    readAll(client, 'original_source_import_runs', 'run_key, completed_at, report', { orderBy: 'run_key' }),
  ])
  const heldRunTags = asArray(pipelineConfig.find((row) => row.key === 'held_run_tags')?.value)
  return buildTrack3Report({
    runId,
    articles,
    arcs,
    nodes,
    citations,
    articleEntities,
    events,
    eventArticles,
    comparisonRows,
    candidates,
    heldRunTags,
    protectedCases,
    importRuns,
  })
}

async function main() {
  const url = process.env.MIP_V2_SUPABASE_URL
  const key = process.env.MIP_V2_SUPABASE_SERVICE_ROLE_KEY
  const runId = process.env.MIP_V2_TRACK3_RUN_ID || DEFAULT_IMPORT_RUN_ID
  const outputPath = process.env.MIP_V2_TRACK3_OUTPUT
  if (!url || !key) {
    throw new Error('Set MIP_V2_SUPABASE_URL and MIP_V2_SUPABASE_SERVICE_ROLE_KEY; no credential is stored in this repository.')
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const report = await runTrack3PropagationCheck({ client, runId })
  const output = JSON.stringify(report, null, 2) + '\n'
  if (outputPath) writeFileSync(outputPath, output)
  else process.stdout.write(output)
  if (report.checks.some((entry) => entry.status === 'FAIL')) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
