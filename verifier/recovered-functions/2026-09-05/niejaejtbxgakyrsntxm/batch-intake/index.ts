import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// batch-intake (Doc 07 Item 2a) — gated, run-scoped manifest intake.
//
// - POST only. Fail-closed key gate: if BATCH_INTAKE_RUN_KEY is not set in
//   Edge Function secrets, ALL requests get 503 ("writer disabled"), same
//   pattern as source-comparison-run / graph-analysis-run. Owner sets the
//   secret directly in Supabase; the value never appears in chat or repo.
// - dry_run mode: validates + dedups + reports what it WOULD insert. No rows.
// - Embeddings computed via the EXISTING production embedding path:
//   Supabase.ai.Session with the pipeline_config embedding_model (gte-small),
//   identical to ingest-rss embed() (mean_pool + normalize, 8000-char slice).
// - ingestion_run_id is REQUIRED on every request; inserts are tagged with
//   it. A tag that already exists on any article is rejected unless
//   allow_append is explicitly set (G3-1: tag present and unique per run).
// - Hard ceiling: a single request may carry at most MAX_ARTICLES (300).
//   The run's real ceiling is the manifest itself; this is the backstop.
// - This function does NO arc work. Arc processing is backfill-legacy's
//   scoped mode (?run=<tag>), keeping intake and processing separate.
// - v2 (2026-08-08, Doc 07 canary): ManifestArticle accepts optional
//   is_pre_ruling / different_causal_chain flags (default false); they are
//   written to the articles columns added by migration
//   add_pre_ruling_tag_columns_to_articles. All other behavior unchanged.
// ---------------------------------------------------------------------------

const MAX_ARTICLES = 300

interface ManifestArticle {
  title: string
  url: string
  summary?: string | null
  published_at?: string | null
  outlet: string
  byline?: string | null
  // v2 (Doc 07 canary): optional pre-ruling context flags. Absent => false.
  is_pre_ruling?: boolean
  different_causal_chain?: boolean
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}

let aiSession: any = null
function getSession(model: string) {
  if (!aiSession) {
    // @ts-ignore Supabase.ai is provided by the edge runtime
    aiSession = new Supabase.ai.Session(model)
  }
  return aiSession
}

// IDENTICAL semantics to ingest-rss embed(): same session, same pooling,
// same normalization, same 8000-char slice. Do not diverge — Tier 1 cosine
// arc matching assumes one embedding space.
async function embed(text: string, model: string): Promise<number[]> {
  const session = getSession(model)
  const out = await session.run(text.slice(0, 8000), { mean_pool: true, normalize: true })
  const vec = Array.isArray(out) ? out : out?.embedding ?? out?.embeddings?.[0]
  if (!vec) throw new Error('embedding failed')
  return Array.from(vec as Iterable<number>)
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const expected = Deno.env.get('BATCH_INTAKE_RUN_KEY')
  if (!expected) return json({ error: 'BATCH_INTAKE_RUN_KEY not configured; writer disabled' }, 503)
  if (req.headers.get('x-batch-intake-key') !== expected) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const runId = String(body?.ingestion_run_id ?? '').trim()
  if (!runId) return json({ error: 'ingestion_run_id is required' }, 400)
  if (runId.length > 120) return json({ error: 'ingestion_run_id too long' }, 400)

  const dryRun = body?.dry_run === true
  const allowAppend = body?.allow_append === true
  const articles: ManifestArticle[] = Array.isArray(body?.articles) ? body.articles : []
  if (articles.length === 0) return json({ error: 'articles must be a non-empty array' }, 400)
  if (articles.length > MAX_ARTICLES) {
    return json({ error: `hard ceiling: ${articles.length} articles exceeds ${MAX_ARTICLES} per request` }, 400)
  }

  const report: any = {
    ranAt: new Date().toISOString(),
    ingestion_run_id: runId,
    dry_run: dryRun,
    received: articles.length,
    invalid: [] as any[],
    duplicateUrls: [] as string[],
    tagAlreadyUsed: 0,
    inserted: 0,
    embeddingFailures: [] as string[],
    errors: [] as string[],
  }

  // G3-1: tag uniqueness — refuse to mix into an existing run unless told to.
  const { count: tagCount, error: tagErr } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .eq('ingestion_run_id', runId)
  if (tagErr) return json({ error: `tag check failed: ${tagErr.message}` }, 500)
  report.tagAlreadyUsed = tagCount ?? 0
  if ((tagCount ?? 0) > 0 && !allowAppend) {
    return json({ error: `ingestion_run_id '${runId}' already tags ${tagCount} articles; set allow_append:true to extend that run deliberately` , ...report }, 409)
  }

  // Validate shape.
  const valid: ManifestArticle[] = []
  for (const a of articles) {
    if (!a || typeof a.title !== 'string' || !a.title.trim() || typeof a.url !== 'string' || !a.url.trim() || typeof a.outlet !== 'string' || !a.outlet.trim()) {
      report.invalid.push({ title: a?.title ?? null, reason: 'title/url/outlet required' })
      continue
    }
    valid.push(a)
  }

  // Dedup against existing corpus by URL (batch-scoped chunks).
  const urls = valid.map((a) => a.url)
  const existing = new Set<string>()
  for (let i = 0; i < urls.length; i += 150) {
    const { data, error } = await supabase.from('articles').select('url').in('url', urls.slice(i, i + 150))
    if (error) return json({ error: `dedup check failed: ${error.message}` }, 500)
    for (const r of data ?? []) existing.add(r.url)
  }
  const fresh = valid.filter((a) => {
    if (existing.has(a.url)) {
      report.duplicateUrls.push(a.url)
      return false
    }
    return true
  })
  // Dedup inside the manifest itself.
  const seen = new Set<string>()
  const toInsert = fresh.filter((a) => {
    if (seen.has(a.url)) {
      report.duplicateUrls.push(a.url)
      return false
    }
    seen.add(a.url)
    return true
  })

  report.wouldInsert = toInsert.length
  if (dryRun) return json({ ok: true, ...report })

  // Embedding model from pipeline_config — the single production path.
  const { data: cfgRow } = await supabase.from('pipeline_config').select('value').eq('key', 'embedding_model').maybeSingle()
  const EMBED_MODEL = String(cfgRow?.value ?? 'gte-small')

  for (const a of toInsert) {
    try {
      const summary = (a.summary ?? '').slice(0, 2000) || null
      const analysisText = `${a.title}. ${summary ?? ''}`
      const embedding = await embed(analysisText, EMBED_MODEL)

      // Resolve outlet (create if genuinely new — outlets is a small
      // reference table; articles.outlet_id follows ingest-rss semantics).
      const { data: outletRow } = await supabase.from('outlets').select('id').eq('name', a.outlet).maybeSingle()
      let outletId = outletRow?.id ?? null
      if (!outletId) {
        const { data: created, error: outErr } = await supabase.from('outlets').insert({ name: a.outlet }).select('id').single()
        if (outErr) throw new Error(`outlet '${a.outlet}': ${outErr.message}`)
        outletId = created.id
      }

      const { error: insErr } = await supabase.from('articles').insert({
        feed: slugify(a.outlet),
        outlet: a.outlet,
        outlet_id: outletId,
        title: a.title.slice(0, 500),
        url: a.url,
        summary: summary ? summary.slice(0, 500) : null,
        body_text: summary,
        published_at: a.published_at ?? null,
        embedding: `[${embedding.join(',')}]`,
        ingestion_run_id: runId,
        is_pre_ruling: a.is_pre_ruling === true,
        different_causal_chain: a.different_causal_chain === true,
      })
      if (insErr) throw insErr
      report.inserted++
    } catch (err) {
      report.errors.push(`${a.url}: ${String(err)}`)
    }
  }

  return json({ ok: report.errors.length === 0, ...report })
})
