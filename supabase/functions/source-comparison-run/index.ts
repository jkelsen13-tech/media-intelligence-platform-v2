// V2 Source Comparison runner — deterministic projection over existing V2 events.
//
// V2 already has imported, source-backed events and event_articles. This function
// rebuilds only derived comparison records (claims, article_claims, and
// comparison explanations) for existing multi-outlet events. It never writes to
// articles, sources, events, event_articles, graph, arcs, or RLS/grant state.
//
// The V1 full-corpus clusterer is intentionally not invoked here: at V2 scale it
// would be O(n²), duplicate the imported event namespace, and exceed the worker
// budget. Existing event membership is the V2 cluster contract.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  EVENT_PROJECTION_RULE_VERSION,
  pagedSelect,
  runEventProjection,
} from './lib.js'
import lexicon from './loadedLanguageLexicon.json' with { type: 'json' }

const JSON_HEADERS = { 'content-type': 'application/json' }
const PROJECTED_EXPLANATION_PREFIX = `${EVENT_PROJECTION_RULE_VERSION}|`
const PAGE_SIZE = 500
const CHUNK = 100

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function sha256Hex(value: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    .then((buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join(''))
}

async function authorizeWriter(req: Request, supabase: any, serviceKey: string) {
  // Internal callers (ingest-rss) use the service credential; manual V2 import
  // calls use the established, isolated import secret. Neither credential is
  // written to the database in plaintext.
  if (req.headers.get('authorization') === `Bearer ${serviceKey}`) return true
  const supplied = req.headers.get('x-mip-original-import-key')
  if (!supplied) return false
  const suppliedHash = await sha256Hex(supplied)
  const { data, error } = await supabase
    .from('original_source_import_credentials')
    .select('key_hash')
    .eq('credential_name', 'original-source-import')
    .eq('active', true)
    .maybeSingle()
  return !error && !!data && data.key_hash === suppliedHash
}

async function selectInChunks(supabase: any, table: string, cols: string, column: string, ids: string[]) {
  const out: any[] = []
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const { data, error } = await supabase.from(table).select(cols).in(column, ids.slice(offset, offset + CHUNK))
    if (error) return { data: null, error }
    out.push(...(data ?? []))
  }
  return { data: out, error: null }
}

async function deleteInChunks(supabase: any, table: string, column: string, ids: string[]) {
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const { error } = await supabase.from(table).delete().in(column, ids.slice(offset, offset + CHUNK))
    if (error) return error
  }
  return null
}

function dedupeArticleClaims(rows: any[]) {
  const winners = new Map<string, any>()
  for (const row of rows) {
    const key = `${row.claim_key}|${row.article_id}`
    const current = winners.get(key)
    if (!current ||
      row.extraction_confidence > current.extraction_confidence ||
      (row.extraction_confidence === current.extraction_confidence &&
        (row.surface_text.length > current.surface_text.length ||
          (row.surface_text.length === current.surface_text.length && row.surface_text < current.surface_text)))) {
      winners.set(key, row)
    }
  }
  return { winners, rows: rows.filter((row) => winners.get(`${row.claim_key}|${row.article_id}`) === row) }
}

function dedupeProjectionExplanations(rows: any[], winners: Map<string, any>) {
  return rows.filter((row) => {
    const parts = String(row.assertion_id).split(':')
    const articleId = parts.at(-1)
    const ordinal = parts.at(-2)
    const eventId = parts.at(-3)
    const winner = winners.get(`${eventId}:c${ordinal}|${articleId}`)
    return !!winner && String(row.supporting_passage).startsWith(`Surface claim "${winner.surface_text}" grouped under canonical "`)
  })
}

async function buildEventInputs(supabase: any) {
  const [eventsRes, memberRes, outletsRes] = await Promise.all([
    // The imported event namespace is preserved for audit, but Source
    // Comparison may derive claims only after article-level same-event review.
    // This is intentionally narrower than non-timeline eligibility: candidate
    // and quarantined clusters remain invisible to all comparison metrics.
    pagedSelect(
      supabase,
      'events',
      'id,canonical_title,status,comparison_validation_state',
      ['id'],
      PAGE_SIZE,
      (q: any) => q.neq('status', 'timeline_only').eq('comparison_validation_state', 'approved'),
    ),
    pagedSelect(supabase, 'event_articles', 'event_id,article_id', ['event_id', 'article_id'], PAGE_SIZE),
    pagedSelect(supabase, 'articles', 'id,outlet', ['id'], PAGE_SIZE),
  ])
  const firstError = [eventsRes, memberRes, outletsRes].find((result: any) => result.error)?.error
  if (firstError) return { error: firstError, inputs: [] }

  const eventById = new Map((eventsRes.data ?? []).map((event: any) => [event.id, event]))
  const outletByArticleId = new Map((outletsRes.data ?? []).map((article: any) => [article.id, article.outlet]))
  const memberIdsByEvent = new Map<string, string[]>()
  for (const member of memberRes.data ?? []) {
    if (!eventById.has(member.event_id)) continue
    const ids = memberIdsByEvent.get(member.event_id) ?? []
    ids.push(member.article_id)
    memberIdsByEvent.set(member.event_id, ids)
  }
  const eligibleEventIds = [...memberIdsByEvent.entries()]
    .filter(([, articleIds]) => new Set(articleIds.map((articleId) => outletByArticleId.get(articleId)).filter(Boolean)).size >= 2)
    .map(([eventId]) => eventId)
  const eligibleArticleIds = [...new Set(eligibleEventIds.flatMap((eventId) => memberIdsByEvent.get(eventId) ?? []))]
  const articlesRes = await selectInChunks(
    supabase,
    'articles',
    'id,outlet,title,url,summary,body_text,published_at,claims,embedding,unattributed,monoculture,is_digest',
    'id',
    eligibleArticleIds,
  )
  if (articlesRes.error) return { error: articlesRes.error, inputs: [] }
  const articleById = new Map((articlesRes.data ?? []).map((article: any) => [article.id, article]))
  const inputs = eligibleEventIds.map((eventId) => ({
    event: eventById.get(eventId),
    members: (memberIdsByEvent.get(eventId) ?? []).map((articleId) => ({ article: articleById.get(articleId) })).filter((member) => member.article),
  }))
  return { error: null, inputs, eligibleEventCount: eligibleEventIds.length }
}

async function rebuildProjection(supabase: any, cfg: any, dryRun: boolean) {
  const prepared = await buildEventInputs(supabase)
  if (prepared.error) return { error: `event projection input read failed: ${prepared.error.message}` }
  const plan = runEventProjection(prepared.inputs, cfg, lexicon)
  const deduped = dedupeArticleClaims(plan.article_claims)
  const articleClaims = deduped.rows
  const explanations = dedupeProjectionExplanations(plan.explanations, deduped.winners)
  const stats = {
    ...plan.stats,
    eligible_events: prepared.eligibleEventCount ?? 0,
    membership_gate: 'approved event memberships only',
    article_claims_deduped: articleClaims.length,
    explanations_deduped: explanations.length,
    primary_evidence_links: 0,
    primary_evidence_note: 'No explicit primary-record URLs are stored in the V2 citation schema; no evidence link is fabricated.',
  }
  if (dryRun) return { data: { dry_run: true, rule_version: EVENT_PROJECTION_RULE_VERSION, ...stats } }

  const { data: oldClaimRows, error: oldClaimError } = await pagedSelect(
    supabase,
    'claims',
    'id',
    ['id'],
    PAGE_SIZE,
    (q: any) => q.eq('rule_version', EVENT_PROJECTION_RULE_VERSION),
  )
  if (oldClaimError) return { error: `projected-claim cleanup lookup failed: ${oldClaimError.message}` }
  const oldClaimIds = (oldClaimRows ?? []).map((row: any) => row.id)
  for (const [table, column] of [['claim_evidence_links', 'claim_id'], ['article_claims', 'claim_id']] as const) {
    const error = await deleteInChunks(supabase, table, column, oldClaimIds)
    if (error) return { error: `${table} cleanup failed: ${error.message}` }
  }
  const claimDeleteError = await deleteInChunks(supabase, 'claims', 'id', oldClaimIds)
  if (claimDeleteError) return { error: `claims cleanup failed: ${claimDeleteError.message}` }
  const { error: explanationDeleteError } = await supabase.from('explanations').delete()
    .eq('is_current', true).like('rule_version', `${PROJECTED_EXPLANATION_PREFIX}%`)
  if (explanationDeleteError) return { error: `explanations cleanup failed: ${explanationDeleteError.message}` }

  const claimIdByKey = new Map<string, string>()
  for (const claim of plan.claims) {
    const { claim_key, ...row } = claim
    const { data, error } = await supabase.from('claims').insert(row).select('id').single()
    if (error) return { error: `claim insert failed: ${error.message}` }
    claimIdByKey.set(claim_key, data.id)
  }
  const surfaceRows = articleClaims.map((row: any) => ({
    claim_id: claimIdByKey.get(row.claim_key),
    article_id: row.article_id,
    surface_text: row.surface_text,
    extraction_method: row.extraction_method,
    extraction_confidence: row.extraction_confidence,
    stance: row.stance,
    loaded_language: row.loaded_language,
    version: 1,
    is_current: true,
  }))
  for (let offset = 0; offset < surfaceRows.length; offset += 500) {
    const { error } = await supabase.from('article_claims').insert(surfaceRows.slice(offset, offset + 500))
    if (error) return { error: `article_claims insert failed: ${error.message}` }
  }
  const recomputedAt = new Date().toISOString()
  for (let offset = 0; offset < explanations.length; offset += 500) {
    const { error } = await supabase.from('explanations').insert(
      explanations.slice(offset, offset + 500).map((row: any) => ({ ...row, recomputed_at: recomputedAt })),
    )
    if (error) return { error: `explanations insert failed: ${error.message}` }
  }
  return { data: { dry_run: false, rule_version: EVENT_PROJECTION_RULE_VERSION, ...stats } }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Missing target service configuration' })
  const supabase = createClient(supabaseUrl, serviceKey)
  if (!await authorizeWriter(req, supabase, serviceKey)) return json(401, { error: 'unauthorized' })

  let body: any = {}
  try { body = (await req.json()) || {} } catch { /* empty body uses projection default */ }
  if (body?.mode && body.mode !== 'event_projection') {
    return json(400, { error: 'V2 supports event_projection only; full reclustering is intentionally disabled at this corpus scale.' })
  }
  const { data: cfgRows, error: cfgError } = await supabase.from('pipeline_config')
    .select('key,value').in('key', ['claim_group_confidence_floor'])
  if (cfgError) return json(500, { error: `config read failed: ${cfgError.message}` })
  const cfg = { groupFloor: Number(cfgRows?.find((row: any) => row.key === 'claim_group_confidence_floor')?.value ?? 0.6) }
  const result = await rebuildProjection(supabase, cfg, !!body?.dry_run)
  return result.error ? json(500, { error: result.error }) : json(200, result.data)
})
