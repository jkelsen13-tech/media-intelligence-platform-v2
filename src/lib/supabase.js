import { createClient } from '@supabase/supabase-js'
import {
  demoNodes,
  demoEdges,
  demoSources,
  demoArcs,
  demoMilestones,
  demoArcEvents,
} from '../data/demoData.js'
import { canonicalizeTimelineEvents, remapTimelineEdges } from './timelineDedup.js'

// Sandbox safety: V2 only connects to the explicit environment target. When
// either value is absent, makeClient() returns null and the application follows
// its bundled demo-data path. Never add a production URL or key fallback here.
const url = import.meta.env?.VITE_SUPABASE_URL
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY

// Client construction can fail outside the browser (e.g. Node test runs
// without a WebSocket implementation); fall back to the demo-data path.
function makeClient() {
  if (!url || !anonKey) return null
  try {
    return createClient(url, anonKey)
  } catch {
    return null
  }
}

export const supabase = makeClient()

// Doc 13: PostgREST silently truncates any unpaginated select at 1000 rows.
// Keyset-paginate a table by its unique `id` column until a short page
// returns. Keyset (cursor) is preferred over offset because ingest writes
// concurrently — offsets can skip/duplicate rows as inserts shift pages.
// NOTE: `cols` MUST include `id` — the cursor reads it back off the returned
// rows, so a cols list without it silently breaks paging on full tables.
export async function keysetAll(client, table, cols, { filter = (q) => q, pageSize = 1000 } = {}) {
  const out = []
  let last = null
  for (;;) {
    let q = filter(client.from(table).select(cols)).order('id', { ascending: true })
    if (last !== null) q = q.gt('id', last)
    const { data, error } = await q.limit(pageSize)
    if (error) return { data: null, error }
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: out, error: null }
    last = data[data.length - 1].id
  }
}

// Composite-key variant for tables with no `id` column (node_topics PK is
// (node_id, topic_id)). Same guarantees as keysetAll — every row present for
// the duration of the read is returned exactly once, and concurrent inserts
// cannot shift pages the way offset pagination allows. The cursor advances on
// the leading key via .gte(); the handful of overlap rows at the cursor value
// (one node carries at most a dozen topics) is dropped client-side, which
// keeps the filter simple enough for PostgREST's .or() grammar to stay out
// of it. Termination: even if a whole page overlaps the cursor, the cursor
// still advances to the page tail, so the loop always makes progress.
// NOTE: `cols` MUST include every column in `keyCols` — the cursor reads
// them back off the returned rows.
export async function keysetAllComposite(client, table, cols, { keyCols, filter = (q) => q, pageSize = 1000 } = {}) {
  const out = []
  let cursor = null
  for (;;) {
    let q = filter(client.from(table).select(cols))
    for (const c of keyCols) q = q.order(c, { ascending: true })
    if (cursor !== null) q = q.gte(keyCols[0], cursor[0])
    const { data, error } = await q.limit(pageSize)
    if (error) return { data: null, error }
    let page = data ?? []
    if (cursor !== null) {
      page = page.filter(
        (r) =>
          String(r[keyCols[0]]) > String(cursor[0]) ||
          (String(r[keyCols[0]]) === String(cursor[0]) && String(r[keyCols[1]]) > String(cursor[1])),
      )
    }
    out.push(...page)
    if (!data || data.length < pageSize) return { data: out, error: null }
    const tail = data[data.length - 1]
    cursor = keyCols.map((c) => tail[c])
  }
}

// keysetAll pages in id order. Where the original unpaginated read carried a
// server-side ORDER BY, re-apply it client-side over the COMPLETE set so the
// result is byte-identical to what PostgREST would have returned. PostgREST
// defaults: ascending => nulls last, descending => nulls first (unless
// nullsFirst is set explicitly).
export function resortRows(rows, col, { ascending = true, nullsFirst = !ascending } = {}) {
  const key = (r) => (r[col] === null || r[col] === undefined ? null : String(r[col]))
  return [...rows].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka === null && kb === null) return 0
    if (ka === null) return nullsFirst ? -1 : 1
    if (kb === null) return nullsFirst ? 1 : -1
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * (ascending ? 1 : -1)
  })
}

// PostgREST .or() filters break on commas/parens/quotes in user input.
function sanitizeSearch(q) {
  return (q ?? '').replace(/[(),"\\%_]/g, ' ').trim()
}

// Loads the graph from Supabase when configured, otherwise returns the
// bundled demo dataset for an offline/local build only. A configured but empty
// database is an explicit empty live graph — it must never silently mix a real
// News Feed or Timeline with unrelated demonstration nodes and relationships.
// Both paths return { nodes, edges, source } in the shape GraphView expects.
export async function loadGraph({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) {
    return { nodes: demoNodes, edges: demoEdges, source: 'demo' }
  }

  const EDGE_BASE = 'id, source_id, target_id, type, weight, label, similarity'
  // Evidence columns land with the Steps 6–9 backend migration. Try the
  // extended select first; if the columns don't exist yet (PostgREST 400),
  // fall back to the base select so the graph keeps working pre-migration.
  const EDGE_EVIDENCE =
    ', signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes, counterfactual_test, reliability, metadata'

  // Doc 13 site 2: both reads keyset-paginate past the 1000-row ceiling.
  let [nodesRes, edgesRes] = await Promise.all([
    // metadata added 2026-08-18 (mapping-fix track): cardTypeInfo/regionOf
    // read metadata.entity_type; without it every actor fell to the
    // missing-metadata default and rendered "Person" in Civil society
    // regardless of the stored value. Read-path only.
    keysetAll(client, 'nodes', 'id, slug, label, type, description, confidence, summary, occurred_at, arc_id, metadata'),
    keysetAll(client, 'edges', EDGE_BASE + EDGE_EVIDENCE),
  ])
  if (edgesRes.error) {
    edgesRes = await keysetAll(client, 'edges', EDGE_BASE)
  }

  if (nodesRes.error) throw nodesRes.error
  if (edgesRes.error) throw edgesRes.error

  if (nodesRes.data.length === 0) {
    return { nodes: [], edges: [], source: 'supabase' }
  }

  return {
    nodes: nodesRes.data,
    edges: edgesRes.data.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      type: e.type,
      weight: e.weight,
      label: e.label,
      similarity: e.similarity,
      // Optional evidence fields — present only once the backend migration
      // lands; every consumer treats them as possibly undefined.
      signal_source: e.signal_source,
      doc_strength: e.doc_strength,
      claimed_by: e.claimed_by,
      stance: e.stance,
      disputed_by: e.disputed_by,
      alternative_causes: e.alternative_causes,
      counterfactual_test: e.counterfactual_test,
      reliability: e.reliability,
      metadata: e.metadata,
    })),
    source: 'supabase',
  }
}

// Geography lens: source-span-backed location rows only. The queried
// `geographic_places` relation includes an explicit precision level; no
// coordinates are inferred in the browser. Feature-detection keeps pre-schema
// environments and offline builds usable, and failure remains isolated from
// the graph itself.
export async function loadNodeLocations({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return []
  try {
    const { data, error } = await keysetAll(
      client,
      'node_location_mentions',
      'id, node_id, article_id, event_id, place_id, mention_text, text_field, location_role, literal_status, resolution_method, review_state, remaining_uncertainty, geographic_places(canonical_name, country_code, admin1_name, latitude, longitude, precision, gazetteer_provider, gazetteer_id)',
    )
    if (error) return []
    return (data ?? []).map((row) => ({
      ...row,
      place: Array.isArray(row.geographic_places) ? row.geographic_places[0] ?? null : row.geographic_places ?? null,
      geographic_places: undefined,
    }))
  } catch {
    return []
  }
}

// Step 10 (§7.4): policy detail for the Consequence view. The `policies`
// table (and policy_actors / policy_topics) may not exist yet — every
// query is feature-detected and failures degrade to empty values so the
// panel can still render from graph edges alone. The consequence edges
// themselves come from the already-loaded graph (they carry the evidence
// columns selected in loadGraph).
export async function loadPolicyDetail(policyNodeId) {
  const out = { policy: null, actors: [], topics: [] }
  if (!supabase || !policyNodeId) return out
  try {
    const { data, error } = await supabase
      .from('policies')
      .select(
        'id, name, jurisdiction, instrument_type, enacted_date, effective_date, status, source_url, full_text_url, external_id, metadata',
      )
      .eq('id', policyNodeId)
      .maybeSingle()
    if (error) return out // table likely absent — policy nodes just lack detail
    out.policy = data
  } catch {
    return out
  }
  try {
    const { data, error } = await supabase
      .from('policy_actors')
      .select('actor_id, role')
      .eq('policy_id', policyNodeId)
    if (!error) out.actors = data ?? []
  } catch {}
  try {
    const { data, error } = await supabase
      .from('policy_topics')
      .select('topic_id')
      .eq('policy_id', policyNodeId)
    if (!error) out.topics = data ?? []
  } catch {}
  return out
}

// Step 8 (§5): topic taxonomy. The `topics` / `node_topics` tables may not
// exist yet — feature-detect them and return null so the UI can hide the
// Topics affordance instead of breaking.
export async function loadTopics({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return null
  try {
    const [topicsRes, nodeTopicsRes] = await Promise.all([
      // topics is the FIXED, code-defined topic tree (bounded by nature);
      // node_topics grows one row per node x topic and must paginate. It has
      // NO id column — PK is (node_id, topic_id) — so it pages by the
      // composite key, not keysetAll's id cursor.
      client.from('topics').select('id, slug, name, parent_id'),
      keysetAllComposite(client, 'node_topics', 'node_id, topic_id, confidence', { keyCols: ['node_id', 'topic_id'] }),
    ])
    if (topicsRes.error || nodeTopicsRes.error) return null
    return { topics: topicsRes.data ?? [], nodeTopics: nodeTopicsRes.data ?? [] }
  } catch {
    return null
  }
}

// Category tag for the article panel (§4.4): nodes carry no category column,
// so the tag comes from the story arc the node belongs to (nodes.arc_id,
// falling back to an arc rooted at this node). Returns null when the node
// is in no arc — the panel then shows the neutral Unclassified tag.
export async function loadNodeCategory(node) {
  if (!node) return null
  if (!supabase) {
    const arc = demoArcs.find((a) => a.id === node.arc_id || a.slug === node.arc_id)
    return arc?.category ?? null
  }
  if (node.arc_id) {
    const { data, error } = await supabase
      .from('story_arcs')
      .select('category')
      .eq('id', node.arc_id)
      .maybeSingle()
    if (error) throw error
    if (data?.category) return data.category
  }
  if (node.id) {
    const { data, error } = await supabase
      .from('story_arcs')
      .select('category')
      .eq('root_node_id', node.id)
      .limit(1)
    if (error) throw error
    return data?.[0]?.category ?? null
  }
  return null
}

// Actor-panel derivation (targeted patch): actor/institution nodes carry no
// category column and often have no rows in `sources` (sources attach to the
// event nodes). When the panel's direct lookups come up empty, derive the
// display category and source list from the node's connected EVENT nodes.
export async function loadActorDerivation(eventNodeIds) {
  const out = { category: null, sources: [] }
  if (!supabase) return out
  const ids = [...new Set((eventNodeIds ?? []).filter(Boolean))]
  if (ids.length === 0) return out
  try {
    const { data: evNodes, error: evErr } = await supabase
      .from('nodes')
      .select('id, arc_id')
      .in('id', ids)
    if (evErr) return out
    const arcIds = [...new Set((evNodes ?? []).map((n) => n.arc_id).filter(Boolean))]
    if (arcIds.length > 0) {
      const { data: arcs } = await supabase
        .from('story_arcs')
        .select('category')
        .in('id', arcIds)
      // Most common category wins; a real category always beats unclassified.
      const counts = new Map()
      for (const a of arcs ?? []) counts.set(a.category, (counts.get(a.category) ?? 0) + 1)
      out.category =
        [...counts.entries()].sort((x, y) => {
          const ux = x[0] === 'unclassified' ? 0 : 1
          const uy = y[0] === 'unclassified' ? 0 : 1
          return uy - ux || y[1] - x[1]
        })[0]?.[0] ?? null
    }
    const { data: srcs } = await supabase
      .from('sources')
      .select('id, outlet, headline, url, published_at')
      .in('node_id', ids)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(15)
    out.sources = srcs ?? []
  } catch {
    // derivation is best-effort — panel degrades to its original empty state
  }
  return out
}

// Sources backing a single node (article panel source list).
// nodeKey is the node uuid (supabase) or slug (demo data).
export async function loadSources(nodeKey) {
  if (!supabase) {
    return demoSources.filter((s) => s.node_slug === nodeKey)
  }
  const { data, error } = await supabase
    .from('sources')
    .select('id, outlet, headline, url, published_at')
    .eq('node_id', nodeKey)
    .order('published_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data
}

// Track B Step 2 item 5: resolve an explanation row's source_ids into a
// NAMED source list for the docked relationship panel. Ids may point at
// articles or policy_documents (the explanations table does not record
// which), so both tables are probed. Ids that resolve nowhere are kept as
// explicit unresolved entries — a dropped id would silently understate the
// recorded sourcing, and fabrication is worse than an honest gap.
export async function loadEdgeSources(sourceIds) {
  const ids = (sourceIds ?? []).filter(Boolean)
  if (!supabase || ids.length === 0) return []
  const quoted = ids.map((id) => `"${id}"`).join(',')
  const [articlesRes, docsRes] = await Promise.all([
    supabase
      .from('articles')
      .select('id, outlet, title, url, published_at')
      .filter('id', 'in', `(${quoted})`),
    supabase
      .from('policy_documents')
      .select('id, title, url, source, published_at')
      .filter('id', 'in', `(${quoted})`),
  ])
  if (articlesRes.error) throw articlesRes.error
  if (docsRes.error) throw docsRes.error
  const byId = new Map()
  for (const a of articlesRes.data ?? []) {
    byId.set(a.id, {
      kind: 'article',
      id: a.id,
      name: a.outlet ?? 'Unknown outlet',
      title: a.title ?? '(untitled)',
      url: a.url ?? null,
      publishedAt: a.published_at ? String(a.published_at).slice(0, 10) : null,
    })
  }
  for (const d of docsRes.data ?? []) {
    byId.set(d.id, {
      kind: 'document',
      id: d.id,
      name: d.source ? humanizeSourceName(d.source) : 'Source document',
      title: d.title ?? '(untitled)',
      url: d.url ?? null,
      publishedAt: d.published_at ? String(d.published_at).slice(0, 10) : null,
    })
  }
  // Preserve the recorded order; unresolved ids stay visible as honest gaps.
  return ids.map((id) => byId.get(id) ?? { kind: 'unresolved', id })
}

function humanizeSourceName(source) {
  return String(source)
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// A4 — Arc status derivation. The stored story_arcs.status column is a weak
// signal; the UI dot is wired to status derived from real signals instead:
//   - resolved: the arc has milestones and every milestone is in a
//     terminal state (confirmed or failed — §2.5.4 four-state taxonomy;
//     legacy confirmed_complete / confirmed_failed also count),
//   - dormant:  newest arc_event is older than `dormantDays`,
//   - active:   recent arc_events with unresolved milestones,
//   - null:     no real signal (no events, no milestones) — show no dot.
export function deriveArcStatus(events, milestones, dormantDays = 14) {
  const ms = milestones ?? []
  const resolvedStates = new Set(['confirmed', 'failed', 'confirmed_complete', 'confirmed_failed'])
  if (ms.length > 0 && ms.every((m) => resolvedStates.has(m.status))) return 'resolved'
  const dates = (events ?? [])
    .map((e) => e.occurred_at)
    .filter(Boolean)
    .sort()
  const lastEvent = dates.length ? dates[dates.length - 1] : null
  if (!lastEvent) {
    if (ms.length === 0) return null
    // Milestones open but no dated events at all — nothing recent to track.
    return 'dormant'
  }
  const ageDays = (Date.now() - new Date(lastEvent).getTime()) / 86400000
  return ageDays > dormantDays ? 'dormant' : 'active'
}

// All story arcs, newest activity first, with derived status attached.
export async function loadArcs({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) {
    return demoArcs.map((a) => ({
      ...a,
      derived_status: deriveArcStatus(
        demoArcEvents.filter((e) => e.arc_slug === a.slug),
        demoMilestones.filter((m) => m.arc_slug === a.slug),
      ),
    }))
  }
  const [arcsRes, eventsRes, milestonesRes, cfgRes] = await Promise.all([
    // Doc 13: all three arc tables keyset-paginate past the 1000-row ceiling;
    // the story_arcs display order (last_update_at desc, PostgREST default
    // nulls-first) is re-applied client-side over the complete set. id is
    // included in every cols list: the keyset cursor reads it back off the
    // returned rows, so a cols list without it silently breaks paging.
    keysetAll(client, 'story_arcs', 'id, slug, title, category, category_confidence, category_evidence, status, root_node_id, coverage_gap, summary, started_at, last_update_at')
      .then((r) => (r.data ? { ...r, data: resortRows(r.data, 'last_update_at', { ascending: false }) } : r)),
    keysetAll(client, 'arc_events', 'id, arc_id, occurred_at'),
    keysetAll(client, 'arc_milestones', 'id, arc_id, status'),
    client.from('pipeline_config').select('value').eq('key', 'status_dormant_days').maybeSingle(),
  ])
  if (arcsRes.error) throw arcsRes.error
  if (eventsRes.error) throw eventsRes.error
  if (milestonesRes.error) throw milestonesRes.error
  const dormantDays = Number(cfgRes.data?.value ?? 14) || 14
  const eventsByArc = new Map()
  for (const e of eventsRes.data) {
    const arr = eventsByArc.get(e.arc_id) ?? []
    arr.push(e)
    eventsByArc.set(e.arc_id, arr)
  }
  const milestonesByArc = new Map()
  for (const m of milestonesRes.data) {
    const arr = milestonesByArc.get(m.arc_id) ?? []
    arr.push(m)
    milestonesByArc.set(m.arc_id, arr)
  }
  return arcsRes.data.map((a) => ({
    ...a,
    derived_status: deriveArcStatus(eventsByArc.get(a.id), milestonesByArc.get(a.id), dormantDays),
  }))
}

// Milestones + consequence events for one arc.
export async function loadArcDetail(arcKey) {
  if (!supabase) {
    return {
      milestones: demoMilestones.filter((m) => m.arc_slug === arcKey),
      events: demoArcEvents.filter((e) => e.arc_slug === arcKey),
    }
  }
  const [milestonesRes, eventsRes] = await Promise.all([
    supabase
      .from('arc_milestones')
      .select('id, title, status, notes, updated_at')
      .eq('arc_id', arcKey)
      .order('updated_at', { ascending: true }),
    supabase
      .from('arc_events')
      .select('id, title, category, confidence, occurred_at, description')
      .eq('arc_id', arcKey)
      .order('occurred_at', { ascending: true, nullsFirst: false }),
  ])
  if (milestonesRes.error) throw milestonesRes.error
  if (eventsRes.error) throw eventsRes.error
  return { milestones: milestonesRes.data, events: eventsRes.data }
}

// Doc 05 pairs 1–3 support: build the suffix → article-id map (8-hex art-
// slug suffix = article id prefix; the same suffix groups evt-/art- mirrors,
// so it also resolves canonical evt- cards to their article) and an
// arc-id → arc-title map. Both return Maps; empty when joins resolve to
// nothing — honest degradation, never a fabricated destination.
export function buildTimelineCrossLinks(allEventNodes, canonicalOf, articleRows, arcRows) {
  const articleIdBySuffix = new Map()
  const idByPrefix = new Map()
  for (const a of articleRows ?? []) idByPrefix.set(String(a.id).slice(0, 8), a.id)
  // Map by GROUP suffix (shared by evt-/art- mirrors): any art- node in a
  // group gives the whole group its article. Walk art- nodes, resolve their
  // canonical card's suffix.
  for (const n of allEventNodes ?? []) {
    const slug = n.slug ?? ''
    if (!slug.startsWith('art-')) continue
    const articleId = idByPrefix.get(slug.slice(-8))
    if (!articleId) continue
    const canonicalId = canonicalOf?.get(n.id ?? n.slug) ?? (n.id ?? n.slug)
    const canonical = (allEventNodes ?? []).find((x) => (x.id ?? x.slug) === canonicalId)
    if (canonical) articleIdBySuffix.set((canonical.slug ?? '').slice(-8), articleId)
  }
  const arcTitleById = new Map((arcRows ?? []).map((a) => [a.id, a.title]))
  return { articleIdBySuffix, arcTitleById }
}

// Doc 05 pair 3 (News → Timeline): the timeline focus key for an article is
// its id's 8-hex prefix, IF an event node exists with a slug ending in that
// suffix (art- node or its evt- twin — same dedup group key). Returns null
// when no timeline event covers this article — the link then does not render.
export async function loadArticleTimelineKey(articleId) {
  if (!supabase || !articleId) return null
  const prefix = String(articleId).slice(0, 8)
  try {
    const { data: eventRows, error: eventError } = await supabase
      .from('nodes')
      .select('id, slug')
      .eq('type', 'event')
      .like('slug', `%${prefix}`)
      .limit(1)
    if (!eventError && eventRows && eventRows.length > 0) return prefix

    // If no graph event mirror exists but the article already belongs to an
    // arc, return the explicit article-record key instead of withholding the
    // Timeline destination. This creates no event assertion.
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id, arc_id')
      .eq('id', articleId)
      .maybeSingle()
    if (articleError || !article?.arc_id) return null
    return `article-${article.id}`
  } catch {
    return null
  }
}

// Doc 05 pair 5 (News → Source Comparison): comparison events covering an
// article, via event_articles and via article_claims → claims. Returns
// [{ eventId, title }] (deduped); empty when the article is in no comparison
// event — the link then does not render.
export async function loadArticleComparisonEvents(articleId) {
  if (!supabase || !articleId) return []
  try {
    const [memberRes, claimRes] = await Promise.all([
      supabase.from('event_articles').select('event_id').eq('article_id', articleId),
      supabase.from('article_claims').select('claim_id').eq('article_id', articleId).eq('is_current', true),
    ])
    if (memberRes.error) return []
    const eventIds = new Set((memberRes.data ?? []).map((r) => r.event_id))
    if (!claimRes.error && (claimRes.data ?? []).length > 0) {
      const claimIds = [...new Set(claimRes.data.map((r) => r.claim_id))]
      const { data: claimRows, error: cErr } = await supabase
        .from('claims')
        .select('event_id')
        .in('id', claimIds)
      if (!cErr) for (const c of claimRows ?? []) eventIds.add(c.event_id)
    }
    if (eventIds.size === 0) return []
    const { data: evRows, error: eErr } = await supabase
      .from('events')
      .select('id, canonical_title')
      .in('id', [...eventIds])
    if (eErr) return []
    return (evRows ?? []).map((e) => ({ eventId: e.id, title: e.canonical_title }))
  } catch {
    return []
  }
}

// Causal timeline: event nodes with dates plus causal/sequence edges between
// them. `labels` covers ALL node types so edges that point at non-event nodes
// (institutions, anomalies, documents) resolve to a label, not a raw uuid.
// Dedup: Tier 4 deterministic evt-/art- mirror rule — see lib/timelineDedup.js.
export async function loadTimeline({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) {
    const demoEvents = demoNodes.filter((n) => n.type === 'event')
    const { events, canonicalOf, suppressed } = canonicalizeTimelineEvents(demoEvents)
    return {
      events,
      suppressed,
      relationEdges: remapTimelineEdges(
        demoEdges
          .filter((e) => e.type === 'causal' || e.type === 'sequence')
          .map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, weight: e.weight, label: e.label, doc_strength: e.doc_strength ?? null })),
        canonicalOf,
      ),
      labels: demoNodes.map((n) => ({ id: n.id ?? n.slug, slug: n.slug, label: n.label })),
    }
  }
  // Doc 13 site 3: all five timeline reads keyset-paginate past the 1000-row
  // ceiling; the event-node display order (occurred_at asc, nulls last) is
  // re-applied client-side over the complete set.
  const [nodesRes, edgesRes, labelsRes, articlesRes, arcsRes] = await Promise.all([
    keysetAll(client, 'nodes', 'id, slug, label, description, confidence, summary, occurred_at, arc_id', {
      filter: (q) => q.eq('type', 'event'),
    }).then((r) => (r.data ? { ...r, data: resortRows(r.data, 'occurred_at', { ascending: true, nullsFirst: false }) } : r)),
    // Causal AND sequential relations — the UI must preserve the distinction
    // (Tier 4 acceptance: "preserve causal versus sequential labels").
    // doc_strength added 2026-08-18 (Track B Step 3 item 4, read-path only):
    // the Screen 5 connector engine requires confirmed-grade strength before
    // any gap may be labeled "Source-supported causal link".
    keysetAll(client, 'edges', 'id, source_id, target_id, type, weight, label, doc_strength', {
      filter: (q) => q.in('type', ['causal', 'sequence']),
    }),
    keysetAll(client, 'nodes', 'id, slug, label'),
    // Doc 05 pairs 2/3: art- slug 8-hex suffix = article id 8-hex prefix.
    // The same complete read supplies explicit News-record timeline entries
    // for every article carrying an arc assignment. Publication dates remain
    // publication dates; the UI labels these as News records, not events.
    keysetAll(client, 'articles', 'id, title, summary, published_at, outlet, arc_id'),
    // Doc 05 pair 1: arc titles for event nodes that carry arc_id.
    keysetAll(client, 'story_arcs', 'id, title'),
  ])
  if (nodesRes.error) throw nodesRes.error
  if (edgesRes.error) throw edgesRes.error
  if (labelsRes.error) throw labelsRes.error
  if (articlesRes.error) throw articlesRes.error
  if (arcsRes.error) throw arcsRes.error
  const { events, canonicalOf, suppressed } = canonicalizeTimelineEvents(nodesRes.data)
  const { articleIdBySuffix, arcTitleById } = buildTimelineCrossLinks(
    nodesRes.data,
    canonicalOf,
    articlesRes.data,
    arcsRes.data,
  )
  return {
    // Cross-link fields are additive and optional: article_id only when the
    // art- suffix join resolves, arc_id straight from the node row.
    events: events.map((evt) => ({
      ...evt,
      article_id: articleIdBySuffix.get((evt.slug ?? '').slice(-8)) ?? null,
    })),
    // Additive reporting-record layer: no synthetic graph nodes, relationships,
    // or occurrence dates. These rows make every News article already assigned
    // to an arc reachable in the Timeline, even when no event node exists.
    articleRecords: articlesRes.data.filter((article) => article.arc_id),
    suppressed,
    arcTitles: arcTitleById,
    relationEdges: remapTimelineEdges(
      edgesRes.data.map((e) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: e.type,
        weight: e.weight,
        label: e.label,
        doc_strength: e.doc_strength ?? null,
      })),
      canonicalOf,
    ),
    labels: labelsRes.data,
  }
}

// ---------- News Feed ----------

// Track B Step 4 (Screen 1): corpus metadata for the header label replacing
// "data: supabase" — exact article count + latest fetch timestamp, both
// live tokens (owner ruling: real relative age, absolute date past 24h —
// a static corpus must never read as freshly updated).
export async function loadCorpusMeta({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return { count: null, latestFetchedAt: null }
  const [countRes, latestRes] = await Promise.all([
    client.from('articles').select('id', { count: 'exact', head: true }),
    client
      .from('articles')
      .select('fetched_at')
      .order('fetched_at', { ascending: false, nullsFirst: false })
      .limit(1),
  ])
  if (countRes.error) throw countRes.error
  if (latestRes.error) throw latestRes.error
  return {
    count: countRes.count ?? null,
    latestFetchedAt: latestRes.data?.[0]?.fetched_at ?? null,
  }
}

// Track B Step 4 (owner ruling #1): exact count of articles fetched after a
// browser-local last-visit marker. Head-only exact-count request.
export async function loadNewSinceCount(isoTs, { supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client || !isoTs) return null
  const { count, error } = await client
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .gt('fetched_at', isoTs)
  if (error) throw error
  return count ?? null
}

// Track B Step 4 (Screen 1 cards): one citations read serving BOTH the
// provenance footer (cited_type discriminator — court_doc/agency_release =
// primary filing, per owner ruling #6) and the per-card Graph chip existence
// signal (any citation with resolved_node_id). Keyset-paginated (Doc 13).
// Returns Map<articleId, { citedTypes: string[], hasGraphLink: boolean,
// firstNodeId: string|null }> — firstNodeId is the first citation-resolved
// node, so the per-card Graph chip can open the graph AT that node rather
// than implying a link it cannot navigate to.
export async function loadArticleCitationMap({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return new Map()
  const { data, error } = await keysetAll(client, 'citations', 'id, article_id, cited_type, resolved_node_id')
  if (error) throw error
  const map = new Map()
  for (const c of data ?? []) {
    if (!c.article_id) continue
    if (!map.has(c.article_id)) map.set(c.article_id, { citedTypes: [], hasGraphLink: false, firstNodeId: null })
    const entry = map.get(c.article_id)
    if (c.cited_type) entry.citedTypes.push(c.cited_type)
    if (c.resolved_node_id) {
      entry.hasGraphLink = true
      if (!entry.firstNodeId) entry.firstNodeId = c.resolved_node_id
    }
  }
  return map
}

// Track B Step 4 (event grouping, "N outlets reporting"): article -> event
// membership. event_articles has no id column — composite-key pagination
// (Doc 13). Returns Map<articleId, { eventId, title }>; title null when the
// event row is unreadable (honest degradation — group still renders).
export async function loadEventGrouping({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return new Map()
  const [membersRes, eventsRes] = await Promise.all([
    keysetAllComposite(client, 'event_articles', 'event_id, article_id', { keyCols: ['event_id', 'article_id'] }),
    keysetAll(client, 'events', 'id, canonical_title'),
  ])
  if (membersRes.error) throw membersRes.error
  if (eventsRes.error) throw eventsRes.error
  const titleByEvent = new Map((eventsRes.data ?? []).map((e) => [e.id, e.canonical_title ?? null]))
  const map = new Map()
  for (const m of membersRes.data ?? []) {
    if (!m.article_id || !m.event_id) continue
    map.set(m.article_id, { eventId: m.event_id, title: titleByEvent.get(m.event_id) ?? null })
  }
  return map
}

// Track B Step 4 (source attribution line): outlet name -> region (country)
// from the outlets table; articles carry no region column. Bounded table,
// keyset-paginated anyway per Doc 13 discipline.
export async function loadOutletRegions({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return new Map()
  const { data, error } = await keysetAll(client, 'outlets', 'id, name, country')
  if (error) throw error
  const map = new Map()
  for (const o of data ?? []) {
    if (o.name && o.country) map.set(o.name, o.country)
  }
  return map
}

// Distinct outlet names present in the article stream (for filter chips).
export async function loadOutlets({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return []
  // Doc 13: the outlet filter list read keyset-paginates past the 1000-row
  // ceiling; dedupe/sort happen client-side below, unchanged.
  const { data, error } = await keysetAll(client, 'articles', 'id, outlet', {
    filter: (q) => q.not('outlet', 'is', null),
  })
  if (error) throw error
  const names = [...new Set(data.map((r) => r.outlet))]
  names.sort()
  return names
}

// News source directory used by the working Region and source-order controls.
// `articleCount` is corpus representation, not audience popularity. The outlets
// table supplies publisher-provided context only; it does not imply a platform
// endorsement or a composite reliability score.
export async function loadOutletDirectory({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return []
  const [articlesRes, outletsRes] = await Promise.all([
    keysetAll(client, 'articles', 'id, outlet', { filter: (q) => q.not('outlet', 'is', null) }),
    keysetAll(client, 'outlets', 'id, name, country, parent_ownership'),
  ])
  if (articlesRes.error) throw articlesRes.error
  if (outletsRes.error) throw outletsRes.error
  const countByName = new Map()
  for (const row of articlesRes.data ?? []) {
    if (!row.outlet) continue
    countByName.set(row.outlet, (countByName.get(row.outlet) ?? 0) + 1)
  }
  const metadataByName = new Map((outletsRes.data ?? []).filter((row) => row.name).map((row) => [row.name, row]))
  return [...countByName.entries()].map(([name, articleCount]) => {
    const metadata = metadataByName.get(name)
    return {
      name,
      articleCount,
      country: metadata?.country ?? null,
      parentOwnership: metadata?.parent_ownership ?? null,
    }
  })
}

// Paged, searchable article stream across all outlets. `outlets`, `feeds`,
// and `topicTerms` are optional working filters. Topic terms are explicitly
// title/summary matches rather than a claim of a complete article taxonomy.
export async function loadArticles({ q, outlet, outlets, status, feeds, topicTerms, publishedAfter, publishedBefore, limit = 30, offset = 0 } = {}) {
  if (!supabase) return { articles: [], total: 0 }
  let query = supabase
    .from('articles')
    .select(
      'id, title, url, summary, published_at, outlet, monoculture, unattributed, arc_id, authors(name), story_arcs!articles_arc_id_fkey(title)',
      { count: 'exact' },
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('fetched_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const term = sanitizeSearch(q)
  if (term) {
    query = query.or(
      `title.ilike.%${term}%,summary.ilike.%${term}%,body_text.ilike.%${term}%`,
    )
  }
  if (outlet) query = query.eq('outlet', outlet)
  if (Array.isArray(outlets) && outlets.length > 0) query = query.in('outlet', outlets)
  if (Array.isArray(feeds) && feeds.length > 0) query = query.in('feed', feeds)
  const safeTopicTerms = [...new Set((topicTerms ?? []).map(sanitizeSearch).filter(Boolean))]
  if (safeTopicTerms.length > 0) {
    const topicClauses = safeTopicTerms.flatMap((term) => [
      `title.ilike.%${term}%`,
      `summary.ilike.%${term}%`,
    ])
    query = query.or(topicClauses.join(','))
  }
  if (publishedAfter) query = query.gte('published_at', publishedAfter)
  if (publishedBefore) query = query.lte('published_at', publishedBefore)
  if (status === 'arc') query = query.not('arc_id', 'is', null)
  if (status === 'unattributed') query = query.eq('unattributed', true)
  if (status === 'monoculture') query = query.eq('monoculture', true)

  const { data, error, count } = await query
  if (error) throw error
  return {
    articles: data.map((a) => ({
      ...a,
      author_name: a.authors?.name ?? null,
      arc_title: a.story_arcs?.title ?? null,
      authors: undefined,
      story_arcs: undefined,
    })),
    total: count ?? data.length,
  }
}

// Full detail for one article: claims + provenance citations.
export async function loadArticleDetail(id) {
  if (!supabase) return null
  const [artRes, citRes, articleClaimsRes] = await Promise.all([
    supabase
      .from('articles')
      .select('id, title, url, summary, published_at, outlet, claims, monoculture, unattributed, authors(name), story_arcs!articles_arc_id_fkey(title)')
      .eq('id', id)
      .single(),
    supabase
      .from('citations')
      .select('cited_entity, cited_type, documentation_strength')
      .eq('article_id', id)
      .order('documentation_strength', { ascending: false, nullsFirst: false }),
    // Some reviewed cross-surface records were written through article_claims
    // and claim_evidence_links before News acquired an extraction display.
    // Read those records directly so the News detail does not misleadingly
    // report an extraction gap where a source-backed reviewed claim exists.
    supabase
      .from('article_claims')
      .select('claim_id, surface_text, stance, loaded_language, claims(canonical_text, claim_kind, status)')
      .eq('article_id', id)
      .eq('is_current', true),
  ])
  if (artRes.error) throw artRes.error
  if (citRes.error) throw citRes.error
  if (articleClaimsRes.error) throw articleClaimsRes.error

  const storedClaims = Array.isArray(artRes.data.claims) ? artRes.data.claims : []
  const reviewedClaims = (articleClaimsRes.data ?? []).map((row) => ({
    kind: 'substantive',
    text: row.surface_text || row.claims?.canonical_text || 'Reviewed claim text not recorded.',
    stance: row.stance ?? 'asserts',
    loaded_language: Array.isArray(row.loaded_language) ? row.loaded_language : [],
    provenance: 'reviewed_claim_record',
    claim_id: row.claim_id,
    claim_kind: row.claims?.claim_kind ?? null,
  }))
  const seenClaimText = new Set()
  const claims = [...storedClaims, ...reviewedClaims].filter((claim) => {
    const key = `${claim.kind ?? 'substantive'}|${String(claim.text ?? '').trim().toLowerCase()}`
    if (!key || seenClaimText.has(key)) return false
    seenClaimText.add(key)
    return true
  })
  const reviewedClaimIds = [...new Set(reviewedClaims.map((claim) => claim.claim_id).filter(Boolean))]
  let evidenceRecords = []
  if (reviewedClaimIds.length > 0) {
    const { data, error } = await supabase
      .from('claim_evidence_links')
      .select('claim_id, evidence_url, evidence_type')
      .in('claim_id', reviewedClaimIds)
    if (!error) {
      const seenEvidence = new Set()
      evidenceRecords = (data ?? []).filter((row) => {
        const key = `${row.evidence_type ?? ''}|${row.evidence_url ?? ''}`
        if (!row.evidence_url || seenEvidence.has(key)) return false
        seenEvidence.add(key)
        return true
      })
    }
  }
  return {
    ...artRes.data,
    claims,
    author_name: artRes.data.authors?.name ?? null,
    arc_title: artRes.data.story_arcs?.title ?? null,
    citations: citRes.data ?? [],
    evidenceRecords,
  }
}

// ---------- Cross-view graph integration ----------

// Graph nodes an article is connected to via its resolved citations.
export async function loadArticleGraphLinks(articleId) {
  if (!supabase) return []
  const { data: cits, error } = await supabase
    .from('citations')
    .select('cited_entity, cited_type, resolved_node_id')
    .eq('article_id', articleId)
    .not('resolved_node_id', 'is', null)
  if (error) throw error
  if (!cits.length) return []
  const ids = [...new Set(cits.map((c) => c.resolved_node_id))]
  const { data: nodes, error: nErr } = await supabase
    .from('nodes')
    .select('id, label, type')
    .in('id', ids)
  if (nErr) throw nErr
  const byId = new Map((nodes ?? []).map((n) => [n.id, n]))
  return cits.map((c) => ({
    nodeId: c.resolved_node_id,
    label: byId.get(c.resolved_node_id)?.label ?? c.cited_entity,
    type: byId.get(c.resolved_node_id)?.type ?? null,
    citedEntity: c.cited_entity,
    citedType: c.cited_type,
  }))
}

// Articles backing a graph node: citations resolved to it, plus articles
// attached to any arc rooted at this node.
export async function loadNodeArticles(nodeId) {
  if (!supabase || !nodeId) return []
  const [citRes, arcRes] = await Promise.all([
    supabase
      .from('citations')
      .select('article_id')
      .eq('resolved_node_id', nodeId),
    supabase.from('story_arcs').select('id').eq('root_node_id', nodeId),
  ])
  if (citRes.error) throw citRes.error
  if (arcRes.error) throw arcRes.error

  const ids = new Set((citRes.data ?? []).map((r) => r.article_id))
  const arcIds = (arcRes.data ?? []).map((r) => r.id)
  if (arcIds.length > 0) {
    const { data: arcArts, error: aErr } = await supabase
      .from('articles')
      .select('id')
      .in('arc_id', arcIds)
    if (aErr) throw aErr
    for (const a of arcArts ?? []) ids.add(a.id)
  }
  if (ids.size === 0) return []

  const { data, error } = await supabase
    .from('articles')
    .select('id, title, outlet, published_at, url')
    .in('id', [...ids])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(30)
  if (error) throw error
  return data
}

// ---------- Location corroboration (companion-app feature) ----------
// Formerly "Sky verification" — renamed per 02A Amendment B; identifiers and
// the `sky_verifications` table keep the deprecated legacy name until a
// separate migration plan renames them (see docs/LOCATION_CORROBORATION.md).

const SKY_COLUMNS =
  'id, article_id, arc_id, observed_azimuth_deg, observed_altitude_deg, captured_at, centroid_lat, centroid_lng, confidence_radius_km, sensor_quality, angular_error_deg, image_hash, method'

// Flag gate (2026-08-17, owner-authorized hardening): the render path below
// predates the withhold-flag convention — until now, any row landing in
// sky_verifications would have gone live on every surface instantly.
// pipeline_config.location_corroboration must be exactly boolean true;
// false, missing, or unreadable all fail closed (same withhold posture as
// phase3_beta / source_comparison_beta / account_ui / track_b_light_theme).
// Rollback = set the flag false (one SQL update) — no redeploy required.

/** Pure resolution: exactly boolean true -> enabled; everything else -> gated. */
export function resolveLocationCorroboration(flagValue) {
  return flagValue === true
}

/** Flag read. Withhold posture: any error or non-true value gates the path. */
export async function loadLocationCorroborationFlag() {
  if (!supabase) return false
  try {
    const { data, error } = await supabase
      .from('pipeline_config')
      .select('value')
      .eq('key', 'location_corroboration')
      .maybeSingle()
    if (error) return false
    return resolveLocationCorroboration(data?.value)
  } catch {
    return false
  }
}

// Latest sky_verifications row (legacy table name) for one article. The table may be absent
// (or simply have no rows — it's a native-companion feature): any error
// feature-detects to null and the UI renders nothing.
export async function loadSkyVerification(articleId) {
  if (!supabase || !articleId) return null
  if (!(await loadLocationCorroborationFlag())) return null // flag gate — fail closed
  try {
    const { data, error } = await supabase
      .from('sky_verifications')
      .select(SKY_COLUMNS)
      .eq('article_id', articleId)
      .order('captured_at', { ascending: false, nullsFirst: false })
      .limit(1)
    if (error) return null
    return data?.[0] ?? null
  } catch {
    return null
  }
}

// Latest location corroboration across the articles backing a graph node
// (citation-resolved + arc-attached), so the node panel can surface the
// same badge and credibility boost.
export async function loadSkyVerificationForNode(nodeId) {
  if (!supabase || !nodeId) return null
  if (!(await loadLocationCorroborationFlag())) return null // flag gate — fail closed
  try {
    const [citRes, arcRes] = await Promise.all([
      supabase.from('citations').select('article_id').eq('resolved_node_id', nodeId),
      supabase.from('story_arcs').select('id').eq('root_node_id', nodeId),
    ])
    if (citRes.error) return null
    const ids = new Set((citRes.data ?? []).map((r) => r.article_id))
    if (!arcRes.error) {
      const arcIds = (arcRes.data ?? []).map((r) => r.id)
      if (arcIds.length > 0) {
        const { data: arcArts, error } = await supabase
          .from('articles')
          .select('id')
          .in('arc_id', arcIds)
        if (!error) for (const a of arcArts ?? []) ids.add(a.id)
      }
    }
    if (ids.size === 0) return null
    const { data, error } = await supabase
      .from('sky_verifications')
      .select(SKY_COLUMNS)
      .in('article_id', [...ids])
      .order('captured_at', { ascending: false, nullsFirst: false })
      .limit(1)
    if (error) return null
    return data?.[0] ?? null
  } catch {
    return null
  }
}

// Articles attached to a story arc. Complete keyset read: the Timeline and
// Evidence tab must not silently stop at 50 assigned News records.
export async function loadArcArticles(arcId) {
  if (!supabase || !arcId) return []
  const result = await keysetAll(
    supabase,
    'articles',
    'id, title, summary, outlet, published_at, url, arc_id',
    { filter: (query) => query.eq('arc_id', arcId) },
  )
  if (result.error) throw result.error
  return resortRows(result.data ?? [], 'published_at', { ascending: false, nullsFirst: false })
}

// Track B Step 3 item 4 (Screen 5 Connections tab + footer count): every
// edge touching a node owned by this arc (nodes.arc_id), all types, with
// doc_strength so the connector engine and the connections list see the
// same record. Read-path only; both reads keyset-paginate (Doc 13).
// Returns { edges, labels } with edges mapped to { id, source, target,
// type, weight, label, doc_strength } — empty when the arc owns no nodes.
export async function loadArcConnections(arcId) {
  if (!supabase || !arcId) return { edges: [], labels: new Map() }
  const nodesRes = await keysetAll(supabase, 'nodes', 'id, slug, label', {
    filter: (q) => q.eq('arc_id', arcId),
  })
  if (nodesRes.error) throw nodesRes.error
  const nodeRows = nodesRes.data ?? []
  const labels = new Map(nodeRows.map((n) => [n.id ?? n.slug, n.label]))
  if (nodeRows.length === 0) return { edges: [], labels }
  const keys = nodeRows.map((n) => n.id ?? n.slug)
  const edgesRes = await keysetAll(supabase, 'edges', 'id, source_id, target_id, type, weight, label, doc_strength', {
    filter: (q) => q.or(`source_id.in.(${keys.join(',')}),target_id.in.(${keys.join(',')})`),
  })
  if (edgesRes.error) throw edgesRes.error
  const edgeRows = edgesRes.data ?? []
  // Label BOTH endpoints: an edge's far end can be a node outside the arc,
  // and an endpoint must never render as a raw uuid.
  const missing = [...new Set(edgeRows.flatMap((e) => [e.source_id, e.target_id]))].filter(
    (k) => !labels.has(k),
  )
  if (missing.length > 0) {
    const farRes = await keysetAll(supabase, 'nodes', 'id, slug, label', {
      filter: (q) => q.in('id', missing),
    })
    if (farRes.error) throw farRes.error
    for (const n of farRes.data ?? []) labels.set(n.id ?? n.slug, n.label)
  }
  return {
    edges: edgeRows.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      type: e.type,
      weight: e.weight,
      label: e.label,
      doc_strength: e.doc_strength ?? null,
    })),
    labels,
  }
}

// Track B Step 3 item 4 (Screen 5 expansion): on-demand excerpt legs for a
// timeline entry's resolved article — summary, outlet, published_at. The
// detail card quotes the excerpt ONLY when all attribution legs resolve
// (timelineEngine entryDetailView). Null when absent/unreadable.
export async function loadArticleExcerpt(articleId) {
  if (!supabase || !articleId) return null
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, summary, outlet, published_at')
      .eq('id', articleId)
      .maybeSingle()
    if (error) return null
    return data ?? null
  } catch {
    return null
  }
}
