// Source Comparison (03_BACKLOG Item 1) — pipeline runner. Owner-authorized Batch 2, 2026-08-06.
//
// Manually invoked, service-role only. Reads articles + article_entities
// (read-only), runs the deterministic sc-v1 pipeline, and writes ONLY to the
// Item 1 tables (events, claims, article_claims, event_articles) plus Phase 2
// explanation rows (assertion_type event_membership / claim_grouping,
// rule_version sc-v1|<method>). It NEVER writes to articles, nodes, edges,
// story_arcs, arc_events, or any other production table.
// Rebuild semantics: before writing, it deletes its own prior sc-v1 rows
// (events/claims with rule_version 'sc-v1', their dependent rows, and
// explanations with assertion_type in (event_membership, claim_grouping) and
// rule_version LIKE 'sc-v1|%'). No cron, no trigger: runs only when called.
//
// Auth: fail-closed shared secret. Requires header
//   x-source-comparison-key: <SOURCE_COMPARISON_RUN_KEY>
// and refuses to run at all if the secret is not configured.
// Body: {"dry_run": true} computes and returns stats without writing.
//
// Memory fix (owner-authorized 2026-08-09, WORKER_RESOURCE_LIMIT remediation):
// the corpus reads are PAGED in id-ordered chunks instead of one unpaginated
// select. A single full-corpus response (728+ articles incl. body_text +
// embedding, 1490+ article_entities) exceeded the Edge Function worker's
// resource ceiling (HTTP 546). body_text and embedding remain selected in
// full: the pipeline genuinely requires them (syndication body-hash +
// thin-extraction labeling; embedding-cosine clustering). Page size defaults
// to SOURCE_COMPARISON_PAGE_SIZE env (fallback 100, clamped 1..1000) and may
// be overridden per-invocation via body {"page_size": N} for ceiling probes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runPipeline, parseEmbedding, RULE_VERSION } from './lib.js'
import lexicon from './loadedLanguageLexicon.json' with { type: 'json' }

const JSON_HEADERS = { 'content-type': 'application/json' }
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

const ARTICLE_COLS = 'id,outlet,title,url,summary,body_text,published_at,claims,embedding,unattributed,monoculture,is_digest'
const ENTITY_COLS = 'article_id,entity_id'

function resolvePageSize(raw: unknown): number {
  const env = Number(Deno.env.get('SOURCE_COMPARISON_PAGE_SIZE') ?? 100)
  const fallback = Number.isFinite(env) && env > 0 ? Math.floor(env) : 100
  const req = Number(raw)
  const chosen = Number.isFinite(req) && req > 0 ? Math.floor(req) : fallback
  return Math.max(1, Math.min(chosen, 1000))
}

// Paged read over a table using a total-order sort (no row can be skipped or
// duplicated across pages). Accumulates the full result set; per-page response
// bodies stay bounded, which is what keeps the worker under its memory ceiling.
async function pagedSelect(
  supabase: ReturnType<typeof createClient>,
  table: string,
  cols: string,
  orderCols: string[],
  pageSize: number,
): Promise<{ data: any[] | null; error: { message: string } | null }> {
  const out: any[] = []
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select(cols)
    for (const c of orderCols) q = q.order(c)
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    out.push(...(data || []))
    if (!data || data.length < pageSize) return { data: out, error: null }
  }
}

// --- dedupe begin ---
// Insert-time dedupe (owner-authorized 2026-08-09, Option A, live-run repair):
// the pipeline may legitimately group two DISTINCT surface texts from the same
// article into one claim group, but the DB constraints are one row per
// (claim, article) — article_claims_claim_id_article_id_version_key, and the
// same duplicates would collide on explanation assertion_ids.
// Winner per (claim_key, article_id): highest extraction_confidence; tiebreak
// longer surface_text; then lexicographically smallest surface_text.
// The SAME winner set filters the claim_grouping explanation rows, so
// article_claims and explanations always agree on which row survived.
function dedupeArticleClaims(rows: any[]): { winners: Map<string, any>; rows: any[] } {
  const winners = new Map<string, any>()
  for (const r of rows) {
    const k = r.claim_key + '|' + r.article_id
    const cur = winners.get(k)
    if (!cur ||
        r.extraction_confidence > cur.extraction_confidence ||
        (r.extraction_confidence === cur.extraction_confidence &&
          (r.surface_text.length > cur.surface_text.length ||
            (r.surface_text.length === cur.surface_text.length && r.surface_text < cur.surface_text)))) {
      winners.set(k, r)
    }
  }
  return { winners, rows: rows.filter((r) => winners.get(r.claim_key + '|' + r.article_id) === r) }
}

function dedupeExplanations(explanations: any[], winners: Map<string, any>): any[] {
  const PREFIX = 'sc:claim_grouping:'
  const groups = new Map<string, any[]>()
  for (const e of explanations) {
    if (e.assertion_type !== 'claim_grouping') continue
    if (!groups.has(e.assertion_id)) groups.set(e.assertion_id, [])
    groups.get(e.assertion_id)!.push(e)
  }
  const keep = new Set<any>()
  for (const [aid, rows] of groups) {
    if (rows.length === 1) { keep.add(rows[0]); continue }
    const rest = aid.slice(PREFIX.length)
    const cut = rest.lastIndexOf(':')
    const w = winners.get(rest.slice(0, cut) + '|' + rest.slice(cut + 1))
    if (!w) throw new Error('dedupe: no article_claims winner for ' + aid)
    const matches = rows.filter((e) => e.supporting_passage.startsWith(
      'Surface claim "' + w.surface_text + '" grouped under canonical "'))
    if (matches.length !== 1) {
      throw new Error('dedupe: explanation winner match failed for ' + aid + ' (' + matches.length + ' matches)')
    }
    keep.add(matches[0])
  }
  return explanations.filter((e) => e.assertion_type !== 'claim_grouping' || keep.has(e))
}
// --- dedupe end ---

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const expected = Deno.env.get('SOURCE_COMPARISON_RUN_KEY')
  if (!expected) return json(503, { error: 'SOURCE_COMPARISON_RUN_KEY not configured; writer disabled' })
  if (req.headers.get('x-source-comparison-key') !== expected) return json(401, { error: 'unauthorized' })

  let body: any = {}
  try { body = (await req.json()) || {} } catch { /* empty body = write run */ }
  const dryRun = !!body?.dry_run
  const pageSize = resolvePageSize(body?.page_size)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Config from pipeline_config (locked values; owner-tunable without migration)
  const { data: cfgRows, error: cfgErr } = await supabase.from('pipeline_config')
    .select('key,value').in('key', [
      'event_cluster_similarity_threshold', 'event_cluster_window_days',
      'claim_group_confidence_floor', 'event_membership_confidence_floor'])
  if (cfgErr) return json(500, { error: `config read failed: ${cfgErr.message}` })
  const cfgVal = (k: string, d: number) => Number(cfgRows?.find((r: any) => r.key === k)?.value ?? d)
  const cfg = {
    similarityThreshold: cfgVal('event_cluster_similarity_threshold', 0.82),
    windowDays: cfgVal('event_cluster_window_days', 3),
    groupFloor: cfgVal('claim_group_confidence_floor', 0.6),
    membershipFloor: cfgVal('event_membership_confidence_floor', 0.55),
    minSharedEntities: 2,
  }

  const { data: articleRows, error: aErr } = await pagedSelect(supabase, 'articles', ARTICLE_COLS, ['id'], pageSize)
  if (aErr) return json(500, { error: `articles read failed: ${aErr.message}` })
  const { data: entityPairs, error: eErr } = await pagedSelect(supabase, 'article_entities', ENTITY_COLS, ['article_id', 'entity_id'], pageSize)
  if (eErr) return json(500, { error: `article_entities read failed: ${eErr.message}` })

  const articles = (articleRows || []).map((a: any) => ({ ...a, embedding: parseEmbedding(a.embedding) }))
  const plan = runPipeline(articles, entityPairs || [], cfg, lexicon)

  // Option A dedupe (fail-closed): single shared winner logic for both tables.
  let dedupedAC: any[] = plan.article_claims
  let dedupedExp: any[] = plan.explanations
  try {
    const d = dedupeArticleClaims(plan.article_claims)
    dedupedAC = d.rows
    dedupedExp = dedupeExplanations(plan.explanations, d.winners)
  } catch (e) {
    return json(500, { error: `dedupe failed: ${(e as Error).message}` })
  }

  const stats = { ...plan.stats, comparisons: undefined, comparison_sample: plan.stats.comparisons.slice(0, 5), page_size: pageSize,
    article_claims_deduped: dedupedAC.length, explanations_deduped: dedupedExp.length }
  if (dryRun) return json(200, { dry_run: true, rule_version: RULE_VERSION, ...stats })

  // Rebuild: clear own sc-v1 namespace only, in dependency order.
  // (article_claims/event_articles carry no rule_version; scope through the
  // sc-v1 events/claims they belong to.)
  // IN-lists are chunked: a single .in() with hundreds of UUIDs exceeds the
  // PostgREST URL length limit (Bad Request) — hit live 2026-08-09 with 839
  // claim ids. Chunking deletes the identical row set, just batched.
  const deleteInChunks = async (table: string, col: string, ids: string[], label: string) => {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from(table).delete().in(col, ids.slice(i, i + 100))
      if (error) return json(500, { error: `${label} cleanup failed: ${error.message}` })
    }
    return null
  }
  {
    const eventIds = (await supabase.from('events').select('id').eq('rule_version', RULE_VERSION)).data?.map((r: any) => r.id) || []
    if (eventIds.length) {
      let r = await deleteInChunks('event_articles', 'event_id', eventIds, 'event_articles')
      if (r) return r
      // The claims id select carries the event ids in its query string too —
      // same URL ceiling — so it is chunked identically.
      const claimIdsChunked: string[] = []
      for (let i = 0; i < eventIds.length; i += 100) {
        const { data } = await supabase.from('claims').select('id').in('event_id', eventIds.slice(i, i + 100))
        claimIdsChunked.push(...(data?.map((r: any) => r.id) || []))
      }
      if (claimIdsChunked.length) {
        r = await deleteInChunks('article_claims', 'claim_id', claimIdsChunked, 'article_claims')
        if (r) return r
        r = await deleteInChunks('claims', 'id', claimIdsChunked, 'claims')
        if (r) return r
      }
      r = await deleteInChunks('events', 'id', eventIds, 'events')
      if (r) return r
    }
  }
  {
    const { error } = await supabase.from('explanations').delete()
      .in('assertion_type', ['event_membership', 'claim_grouping']).like('rule_version', RULE_VERSION + '|%')
    if (error) return json(500, { error: `explanations cleanup failed: ${error.message}` })
  }

  // Write: events first, then resolve keys to ids
  const keyToEventId = new Map<string, string>()
  for (const ev of plan.events) {
    const { event_key, ...row } = ev as any
    const { data, error } = await supabase.from('events').insert(row).select('id').single()
    if (error) return json(500, { error: `event insert failed: ${error.message}` })
    keyToEventId.set(event_key, data.id)
  }
  const keyToClaimId = new Map<string, string>()
  for (const c of plan.claims) {
    const { claim_key, event_key, ...row } = c as any
    const { data, error } = await supabase.from('claims')
      .insert({ ...row, event_id: keyToEventId.get(event_key) }).select('id').single()
    if (error) return json(500, { error: `claim insert failed: ${error.message}` })
    keyToClaimId.set(claim_key, data.id)
  }
  for (const t of ['event_articles', 'article_claims'] as const) {
    const src = t === 'article_claims' ? dedupedAC : (plan as any)[t]
    const rows = src.map((r: any) => t === 'event_articles'
      ? { event_id: keyToEventId.get(r.event_key), article_id: r.article_id, membership_method: r.membership_method, membership_confidence: r.membership_confidence }
      : { claim_id: keyToClaimId.get(r.claim_key), article_id: r.article_id, surface_text: r.surface_text, extraction_method: r.extraction_method, extraction_confidence: r.extraction_confidence, stance: r.stance, loaded_language: r.loaded_language })
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(t).insert(rows.slice(i, i + 500))
      if (error) return json(500, { error: `${t} insert failed: ${error.message}` })
    }
  }
  for (let i = 0; i < dedupedExp.length; i += 500) {
    const { error } = await supabase.from('explanations').insert(dedupedExp.slice(i, i + 500))
    if (error) return json(500, { error: `explanations insert failed: ${error.message}` })
  }

  return json(200, { dry_run: false, rule_version: RULE_VERSION, ...stats })
})