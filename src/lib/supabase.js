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
import { resolveV2SupabaseUrl } from './supabaseOrigin.js'

// Sandbox safety: V2 only connects to the explicit environment target. When
// either value is absent, makeClient() returns null and the application follows
// its bundled demo-data path. Never add a production URL or key fallback here.
// Fail closed: leftover Manus / paused-original hosts must never be used.
// Compare hashed project refs so the production bundle never contains those
// leftover ids as contiguous literals (live JS host check).
// World View allowlists the V2 API plus the confirmed Pages client origin.
// makeClient still requires the env URL to be the V2 API (Trust wiring).
const FORBIDDEN_SUPABASE_REF_HASHES = Object.freeze([-280454185, -97341801])

function djb2(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

function supabaseProjectRef(value) {
  const lower = String(value).toLowerCase()
  const marker = '.supabase.co'
  const idx = lower.indexOf(marker)
  if (idx < 0) return ''
  const before = lower.slice(0, idx)
  const sep = Math.max(before.lastIndexOf('/'), before.lastIndexOf('@'))
  return before.slice(sep + 1)
}

export function isForbiddenSupabaseUrl(value) {
  if (!value) return false
  const ref = supabaseProjectRef(value)
  return ref.length > 0 && FORBIDDEN_SUPABASE_REF_HASHES.includes(djb2(ref))
}

const url = import.meta.env?.VITE_SUPABASE_URL
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY

// Client construction can fail outside the browser (e.g. Node test runs
// without a WebSocket implementation); fall back to the demo-data path.
function makeClient() {
  if (!url || !anonKey) return null
  if (isForbiddenSupabaseUrl(url)) return null
  if (!resolveV2SupabaseUrl(url).ok) return null
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

// PostgREST schema-cache gaps (missing table / missing column) versus other
// errors (RLS, network, 500). World View fail-closes missing public.edges
// with an honest edgesUnavailable flag; News/Graph/Arcs/Timeline reuse that
// contract instead of throwing a red exception on every App load.
const POSTGREST_SCHEMA_GAP_CODES = new Set(['PGRST204', 'PGRST205', '42P01', '42703'])

export function isPostgrestSchemaGap(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  if (POSTGREST_SCHEMA_GAP_CODES.has(code)) return true
  const message = String(error.message ?? error.details ?? error.hint ?? '')
  if (/schema cache/i.test(message)) return true
  if (/Could not find the table /i.test(message)) return true
  if (/Could not find the '[^']+' column/i.test(message)) return true
  if (/column .+ does not exist/i.test(message)) return true
  if (/relation .+ does not exist/i.test(message)) return true
  return false
}

// Privilege / GRANT misses on public.articles (PostgREST 42501, PGRST301,
// or a permission-denied / insufficient-privilege message). Distinct from
// schema-cache gaps: the table exists, the anon/publishable role cannot
// SELECT it. News fail-closes to honest empty — never a red exception,
// never invented rows, never a GRANT/RLS write.
const POSTGREST_PERMISSION_DENIED_CODES = new Set(['42501', 'PGRST301'])

export function isPostgrestPermissionDenied(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  if (POSTGREST_PERMISSION_DENIED_CODES.has(code)) return true
  const message = String(error.message ?? error.details ?? error.hint ?? '')
  if (/permission denied/i.test(message)) return true
  if (/insufficient privilege/i.test(message)) return true
  return false
}

export function articlesUnavailableReason(error) {
  if (isPostgrestPermissionDenied(error)) return 'permission_denied'
  return null
}

// .single() on an eligible-only articles read (client filter or Trust RLS)
// returns PGRST116 / 0 rows when the id is pending_review, withheld, or
// absent. That is an honest empty miss — not a red exception and not a
// reason to invent or display the withheld row.
export function isPostgrestNoRow(error) {
  if (!error) return false
  if (String(error.code ?? '') === 'PGRST116') return true
  const message = String(error.message ?? error.details ?? '')
  if (/result contains 0 rows/i.test(message)) return true
  if (/Cannot coerce the result to a single JSON object/i.test(message)) return true
  if (/^not found$/i.test(message)) return true
  return false
}

function emptyArticlesUnavailable(error) {
  return {
    articles: [],
    total: 0,
    articlesUnavailable: articlesUnavailableReason(error) ?? 'permission_denied',
  }
}

// HEAD-only PostgREST privilege misses can arrive as `{ message: '' }` with
// no code. Confirm against a 1-row articles SELECT before fail-closing;
// unclassified empties and 500s still throw.
function isEmptyPostgrestError(error) {
  if (!error) return false
  return !String(error.code ?? '') && !String(error.message ?? error.details ?? error.hint ?? '')
}

async function confirmArticlesPermissionDenied(client, errors) {
  const list = (Array.isArray(errors) ? errors : [errors]).filter(Boolean)
  if (list.some((error) => isPostgrestPermissionDenied(error))) return true
  if (!client || !list.some((error) => isEmptyPostgrestError(error))) return false
  const probe = await client.from('articles').select('id').limit(1)
  return isPostgrestPermissionDenied(probe.error)
}

export function edgesUnavailableMessage(error) {
  return error?.message ?? String(error)
}

// Same missing-edges contract as loadWorldViewGraph: never throw, never
// invent rows. Any edges read error → empty data + edgesUnavailable.
export async function readEdgesOrUnavailable(client, cols, options) {
  try {
    const res = await keysetAll(client, 'edges', cols, options)
    if (res.error) {
      return { data: [], error: res.error, edgesUnavailable: edgesUnavailableMessage(res.error) }
    }
    return { data: res.data ?? [], error: null, edgesUnavailable: null }
  } catch (err) {
    return { data: [], error: err, edgesUnavailable: edgesUnavailableMessage(err) }
  }
}

const GRAPH_EDGE_BASE = 'id, source_id, target_id, type, weight, label, similarity'
const GRAPH_EDGE_EVIDENCE =
  ', signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes, counterfactual_test, reliability, metadata'

export async function readGraphEdgesOrUnavailable(client, options) {
  let res = await readEdgesOrUnavailable(client, GRAPH_EDGE_BASE + GRAPH_EDGE_EVIDENCE, options)
  if (res.edgesUnavailable) {
    res = await readEdgesOrUnavailable(client, GRAPH_EDGE_BASE, options)
  }
  return res
}

function mapGraphEdgeRows(rows) {
  return (rows ?? []).map((e) => ({
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    type: e.type,
    weight: e.weight,
    label: e.label,
    similarity: e.similarity,
    signal_source: e.signal_source,
    doc_strength: e.doc_strength,
    claimed_by: e.claimed_by,
    stance: e.stance,
    disputed_by: e.disputed_by,
    alternative_causes: e.alternative_causes,
    counterfactual_test: e.counterfactual_test,
    reliability: e.reliability,
    metadata: e.metadata,
  }))
}

// story_arcs on live V2 is an id-only stub. Never select title. Extra
// display columns are attempted only by loadArcs; a schema-cache miss is
// empty/unavailable, not a crash, and stub rows are treated as no-arc.
const STORY_ARCS_ID_ONLY = 'id'
const STORY_ARCS_DISPLAY_COLS =
  'id, slug, category, category_confidence, category_evidence, status, display_kind, root_node_id, coverage_gap, summary, started_at, last_update_at'

// Loads the graph from Supabase when configured, otherwise returns the
// bundled demo dataset for an offline/local build only. A configured but empty
// database is an explicit empty live graph — it must never silently mix a real
// News Feed or Timeline with unrelated demonstration nodes and relationships.
// Both paths return { nodes, edges, source } in the shape GraphView expects.
export async function loadGraph({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) {
    return { nodes: demoNodes, edges: demoEdges, source: 'demo', edgesUnavailable: null }
  }

  // Doc 13 site 2: both reads keyset-paginate past the 1000-row ceiling.
  // Missing public.edges is the World View contract: empty edges +
  // edgesUnavailable, never a throw that paints News Feed red.
  const [nodesRes, edgesRead] = await Promise.all([
    // metadata added 2026-08-18 (mapping-fix track): cardTypeInfo/regionOf
    // read metadata.entity_type; without it every actor fell to the
    // missing-metadata default and rendered "Person" in Civil society
    // regardless of the stored value. Read-path only.
    keysetAll(client, 'nodes', 'id, slug, label, type, description, confidence, summary, occurred_at, arc_id, metadata'),
    readGraphEdgesOrUnavailable(client),
  ])

  if (nodesRes.error) throw nodesRes.error

  if ((nodesRes.data ?? []).length === 0) {
    return {
      nodes: [],
      edges: [],
      source: 'supabase',
      edgesUnavailable: edgesRead.edgesUnavailable,
    }
  }

  return {
    nodes: nodesRes.data,
    edges: edgesRead.edgesUnavailable ? [] : mapGraphEdgeRows(edgesRead.data),
    source: 'supabase',
    edgesUnavailable: edgesRead.edgesUnavailable,
  }
}

// Reader-facing coverage disclosure. These aggregates account only for stored
// published/review states; they are deliberately not a graph-completeness or
// reliability score. A missing projection is an honest no-disclosure state,
// allowing older V2 database revisions to continue rendering the graph.
export async function loadGraphCoverage({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return null
  try {
    const { data, error } = await client
      .from('graph_coverage_public')
      .select('article_count,articles_with_published_node,articles_without_published_node,pending_graph_candidate_count,published_node_count,documented_relationship_count')
      .maybeSingle()
    if (error || !data) return null
    return {
      articleCount: data.article_count,
      articlesWithPublishedNode: data.articles_with_published_node,
      articlesWithoutPublishedNode: data.articles_without_published_node,
      pendingGraphCandidates: data.pending_graph_candidate_count,
      publishedNodeCount: data.published_node_count,
      documentedRelationshipCount: data.documented_relationship_count,
    }
  } catch {
    return null
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
    if (error) {
      if (isPostgrestSchemaGap(error)) return null
      throw error
    }
    if (data?.category) return data.category
  }
  if (node.id) {
    const { data, error } = await supabase
      .from('story_arcs')
      .select('category')
      .eq('root_node_id', node.id)
      .limit(1)
    if (error) {
      if (isPostgrestSchemaGap(error)) return null
      throw error
    }
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
const PUBLIC_DORMANT_ARC_DAYS = 14

export async function loadArcs({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) {
    return {
      arcs: demoArcs.map((a) => ({
        ...a,
        derived_status: deriveArcStatus(
          demoArcEvents.filter((e) => e.arc_slug === a.slug),
          demoMilestones.filter((m) => m.arc_slug === a.slug),
        ),
      })),
      arcsUnavailable: null,
    }
  }
  const [arcsRes, eventsRes, milestonesRes] = await Promise.all([
    // Doc 13: all three arc tables keyset-paginate past the 1000-row ceiling;
    // the story_arcs display order (last_update_at desc, PostgREST default
    // nulls-first) is re-applied client-side over the complete set. id is
    // included in every cols list: the keyset cursor reads it back off the
    // returned rows, so a cols list without it silently breaks paging.
    // title is never selected: live V2 story_arcs is an id-only stub.
    keysetAll(client, 'story_arcs', STORY_ARCS_DISPLAY_COLS)
      .then((r) => (r.data ? { ...r, data: resortRows(r.data, 'last_update_at', { ascending: false }) } : r)),
    keysetAll(client, 'arc_events', 'id, arc_id, occurred_at'),
    keysetAll(client, 'arc_milestones_public', 'id, arc_id, status'),
  ])
  if (arcsRes.error) {
    if (isPostgrestSchemaGap(arcsRes.error)) {
      return { arcs: [], arcsUnavailable: arcsRes.error.message ?? String(arcsRes.error) }
    }
    throw arcsRes.error
  }
  if (eventsRes.error && !isPostgrestSchemaGap(eventsRes.error)) throw eventsRes.error
  if (milestonesRes.error && !isPostgrestSchemaGap(milestonesRes.error)) throw milestonesRes.error
  // The public route must not read operational pipeline_config. Its prior
  // denied-read fallback was the documented 14-day value, retained here
  // explicitly so anonymous behavior is deterministic and request-free.
  const dormantDays = PUBLIC_DORMANT_ARC_DAYS
  const eventsByArc = new Map()
  for (const e of eventsRes.error ? [] : eventsRes.data) {
    const arr = eventsByArc.get(e.arc_id) ?? []
    arr.push(e)
    eventsByArc.set(e.arc_id, arr)
  }
  const milestonesByArc = new Map()
  for (const m of milestonesRes.error ? [] : milestonesRes.data) {
    const arr = milestonesByArc.get(m.arc_id) ?? []
    arr.push(m)
    milestonesByArc.set(m.arc_id, arr)
  }
  // Id-only stub rows have no slug/category/summary — treat as no-arc.
  const displayArcs = (arcsRes.data ?? []).filter((a) => a.slug || a.category || a.summary || a.started_at)
  return {
    arcs: displayArcs.map((a) => ({
      ...a,
      title: null,
      derived_status: deriveArcStatus(eventsByArc.get(a.id), milestonesByArc.get(a.id), dormantDays),
    })),
    arcsUnavailable: displayArcs.length === 0 && (arcsRes.data ?? []).length > 0
      ? 'story_arcs is an id-only stub; stub rows are treated as no-arc'
      : null,
  }
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
      .from('arc_milestones_public')
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
// article, via the existing narrow comparison_public projection only. The
// projection is event-keyed and carries opaque article keys, so this helper
// joins the already-public article URL to the projected member URL. Returns
// [{ eventId, title }] (deduped); no matching projected event means no link.
export async function loadArticleComparisonEvents(articleId, { supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client || !articleId) return []
  try {
    const { data: article, error: articleError } = await client
      .from('articles')
      .select('url')
      .eq('id', articleId)
      .maybeSingle()
    if (articleError || !article?.url) return []

    const matches = []
    const seen = new Set()
    const pageSize = 100
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await client
        .from('comparison_public')
        .select('event_key, canonical_title, articles')
        .order('event_key', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) return []
      for (const event of data ?? []) {
        const isMember = (Array.isArray(event.articles) ? event.articles : [])
          .some((member) => member.article_url === article.url)
        if (!isMember || seen.has(event.event_key)) continue
        seen.add(event.event_key)
        matches.push({ eventId: event.event_key, title: event.canonical_title })
      }
      if (!data || data.length < pageSize) return matches
    }
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
      edgesUnavailable: null,
    }
  }
  // Doc 13 site 3: all five timeline reads keyset-paginate past the 1000-row
  // ceiling; the event-node display order (occurred_at asc, nulls last) is
  // re-applied client-side over the complete set.
  const [nodesRes, edgesRead, labelsRes, articlesRes, arcsRes] = await Promise.all([
    keysetAll(client, 'nodes', 'id, slug, label, description, confidence, summary, occurred_at, arc_id', {
      filter: (q) => q.eq('type', 'event'),
    }).then((r) => (r.data ? { ...r, data: resortRows(r.data, 'occurred_at', { ascending: true, nullsFirst: false }) } : r)),
    // Causal AND sequential relations — the UI must preserve the distinction
    // (Tier 4 acceptance: "preserve causal versus sequential labels").
    // doc_strength added 2026-08-18 (Track B Step 3 item 4, read-path only):
    // the Screen 5 connector engine requires confirmed-grade strength before
    // any gap may be labeled "Source-supported causal link".
    // Missing public.edges uses the World View contract: empty + flag.
    readEdgesOrUnavailable(client, 'id, source_id, target_id, type, weight, label, doc_strength', {
      filter: (q) => q.in('type', ['causal', 'sequence']),
    }),
    keysetAll(client, 'nodes', 'id, slug, label'),
    // Doc 05 pairs 2/3: art- slug 8-hex suffix = article id 8-hex prefix.
    // The same complete read supplies explicit News-record timeline entries
    // for every article carrying an arc assignment. Publication dates remain
    // publication dates; the UI labels these as News records, not events.
    keysetAll(client, 'articles', 'id, title, summary, published_at, outlet, arc_id'),
    // Never select story_arcs.title. Id-only stub rows are no-arc.
    keysetAll(client, 'story_arcs', STORY_ARCS_ID_ONLY),
  ])
  if (nodesRes.error) throw nodesRes.error
  if (labelsRes.error) throw labelsRes.error
  if (articlesRes.error) throw articlesRes.error
  // Optional denied/missing arc metadata must not block an otherwise valid
  // global timeline read. Schema-cache gaps and permission-denied stay
  // empty; unexpected server errors still reject.
  if (
    arcsRes.error &&
    !isPostgrestSchemaGap(arcsRes.error) &&
    !isPostgrestPermissionDenied(arcsRes.error)
  ) {
    throw arcsRes.error
  }
  const arcRows = arcsRes.error ? [] : arcsRes.data
  const { events, canonicalOf, suppressed } = canonicalizeTimelineEvents(nodesRes.data)
  const { articleIdBySuffix, arcTitleById } = buildTimelineCrossLinks(
    nodesRes.data,
    canonicalOf,
    articlesRes.data,
    arcRows,
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
    edgesUnavailable: edgesRead.edgesUnavailable,
    relationEdges: remapTimelineEdges(
      (edgesRead.data ?? []).map((e) => ({
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
    client.from('articles').select('id', { count: 'exact', head: true }).eq('reader_state', 'eligible'),
    client
      .from('articles')
      .select('fetched_at')
      .eq('reader_state', 'eligible')
      .order('fetched_at', { ascending: false, nullsFirst: false })
      .limit(1),
  ])
  if (countRes.error || latestRes.error) {
    if (await confirmArticlesPermissionDenied(client, [countRes.error, latestRes.error])) {
      return { count: null, latestFetchedAt: null }
    }
    throw [latestRes.error, countRes.error].find((error) => error && !isEmptyPostgrestError(error))
      || countRes.error
      || latestRes.error
  }
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
    .eq('reader_state', 'eligible')
    .gt('fetched_at', isoTs)
  if (error) {
    if (await confirmArticlesPermissionDenied(client, error)) return null
    throw error
  }
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
    filter: (q) => q.eq('reader_state', 'eligible').not('outlet', 'is', null),
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
    keysetAll(client, 'articles', 'id, outlet', { filter: (q) => q.eq('reader_state', 'eligible').not('outlet', 'is', null) }),
    keysetAll(client, 'outlets', 'id, name, country, parent_ownership'),
  ])
  if (articlesRes.error) {
    if (isPostgrestPermissionDenied(articlesRes.error)) return []
    throw articlesRes.error
  }
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

// Applies the concrete News filters shared by the paged feed and its separate
// source-metric read. Source metrics intentionally omit a selected outlet so
// their list remains a comparison of the current non-vendor filter context.
function applyNewsArticleFilters(query, { q, outlet, outlets, status, feeds, topicTerms, publishedAfter, publishedBefore } = {}) {
  // Reader eligibility is a quality gate, not a source-reliability score. The
  // withheld/pending rows remain retained in the base table for review but do
  // not affect reader counts, filters, or source metrics.
  query = query.eq('reader_state', 'eligible')
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
    const topicClauses = safeTopicTerms.flatMap((topicTerm) => [
      `title.ilike.%${topicTerm}%`,
      `summary.ilike.%${topicTerm}%`,
    ])
    query = query.or(topicClauses.join(','))
  }
  if (publishedAfter) query = query.gte('published_at', publishedAfter)
  if (publishedBefore) query = query.lte('published_at', publishedBefore)
  if (status === 'arc') query = query.not('arc_id', 'is', null)
  if (status === 'unattributed') query = query.eq('unattributed', true)
  if (status === 'monoculture') query = query.eq('monoculture', true)
  return query
}

// Complete, keyset-paginated source-metric population for the current News
// context. It excludes a selected outlet intentionally: publisher selection is
// an interaction target, not a condition that should zero every other vendor.
export async function loadFilteredSourceMetricRows(filters = {}, { supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return []
  const { outlet: _selectedOutlet, ...contextFilters } = filters
  const { data, error } = await keysetAll(client, 'articles', 'id, outlet, published_at', {
    filter: (query) => applyNewsArticleFilters(query, contextFilters),
  })
  if (error) {
    if (isPostgrestPermissionDenied(error)) return []
    throw error
  }
  return data ?? []
}

// Narrow author-byline lookup. `authors_public` is the only anonymous author
// contract: its `id` joins an article's stored `author_id` and its `name` is
// the exact public byline that News renders. The private `authors` relation is
// never joined by a browser query.
export async function loadPublicAuthorNameMap(authorIds, { supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  const ids = [...new Set((authorIds ?? []).filter(Boolean))]
  if (!client || ids.length === 0) return new Map()
  const { data, error } = await client.from('authors_public').select('id, name').in('id', ids)
  if (error) throw error
  return new Map((data ?? []).filter((row) => row.id && row.name).map((row) => [row.id, row.name]))
}

// Paged, searchable article stream across all outlets. `outlets`, `feeds`,
// and `topicTerms` are optional working filters. Topic terms are explicitly
// title/summary matches rather than a claim of a complete article taxonomy.
export async function loadArticles({ q, outlet, outlets, status, feeds, topicTerms, publishedAfter, publishedBefore, limit = 30, offset = 0, supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return { articles: [], total: 0, articlesUnavailable: null }
  // Trust may GRANT SELECT + eligible-only RLS on public.articles. A future
  // GRANT miss still fail-closes here (42501 → empty + permission_denied).
  // A successful 0-row eligible read is honest empty, not an error. NASA
  // pending_review stays withheld: never invent, never mutate reader_state.
  // Do not join story_arcs for title. Live V2 story_arcs is an id-only stub;
  // stub arcs are no-arc and arc_title stays null.
  let query = client
    .from('articles')
    .select(
      'id, title, url, summary, published_at, outlet, monoculture, unattributed, arc_id, author_id',
      { count: 'exact' },
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('fetched_at', { ascending: false })
    .range(offset, offset + limit - 1)

  query = applyNewsArticleFilters(query, { q, outlet, outlets, status, feeds, topicTerms, publishedAfter, publishedBefore })

  const { data, error, count } = await query
  if (error) {
    if (isPostgrestPermissionDenied(error)) return emptyArticlesUnavailable(error)
    throw error
  }
  const rows = data ?? []
  const authorNames = await loadPublicAuthorNameMap(rows.map((article) => article.author_id), { supabaseClient: client })
  return {
    articles: rows.map((a) => ({
      ...a,
      author_name: authorNames.get(a.author_id) ?? null,
      author_id: undefined,
      arc_title: null,
      story_arcs: undefined,
    })),
    total: count ?? rows.length,
    articlesUnavailable: null,
  }
}

// Full detail for one article: claims + provenance citations.
export async function loadArticleDetail(id, { supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) return null
  const [artRes, citRes, newsDetailRes] = await Promise.all([
    client
      .from('articles')
      .select('id, title, url, summary, published_at, outlet, claims, monoculture, unattributed, author_id')
      .eq('id', id)
      .eq('reader_state', 'eligible')
      .single(),
    client
      .from('citations')
      .select('cited_entity, cited_type, documentation_strength')
      .eq('article_id', id)
      .order('documentation_strength', { ascending: false, nullsFirst: false }),
    // The security-barrier projection is the only anonymous contract for
    // reviewed claim text and linked evidence in an expanded News record.
    client
      .from('news_detail_public')
      .select('article_id, reviewed_claims')
      .eq('article_id', id)
      .maybeSingle(),
  ])
  if (artRes.error) {
    if (isPostgrestPermissionDenied(artRes.error)) {
      return { articlesUnavailable: articlesUnavailableReason(artRes.error) }
    }
    if (isPostgrestNoRow(artRes.error)) {
      return { articleMissing: true, articlesUnavailable: null }
    }
    throw artRes.error
  }
  if (citRes.error) throw citRes.error
  if (newsDetailRes.error) throw newsDetailRes.error
  const authorNames = await loadPublicAuthorNameMap([artRes.data.author_id], { supabaseClient: client })

  const storedClaims = Array.isArray(artRes.data.claims) ? artRes.data.claims : []
  const reviewedClaims = (newsDetailRes.data?.reviewed_claims ?? []).map((row) => ({
    kind: 'substantive',
    text: row.surface_text || row.canonical_text || 'Reviewed claim text not recorded.',
    stance: 'asserts',
    loaded_language: [],
    provenance: 'reviewed_claim_record',
    auditability_state: row.auditability_state ?? 'unverified_against_retained_source',
    auditability_note: row.auditability_note ?? 'No exact retained publisher excerpt supports this public claim surface.',
    evidence_source_field: row.evidence_source_field ?? null,
    evidence_excerpt: row.evidence_excerpt ?? null,
  }))
  const seenClaimText = new Set()
  const claims = [...reviewedClaims, ...storedClaims].filter((claim) => {
    const key = `${claim.kind ?? 'substantive'}|${String(claim.text ?? '').trim().toLowerCase()}`
    if (!key || seenClaimText.has(key)) return false
    seenClaimText.add(key)
    return true
  })
  const seenEvidence = new Set()
  const evidenceRecords = (newsDetailRes.data?.reviewed_claims ?? [])
    .flatMap((row) => (Array.isArray(row.evidence_records) ? row.evidence_records : []))
    .filter((row) => {
      const key = `${row.evidence_type ?? ''}|${row.evidence_url ?? ''}`
      if (!row.evidence_url || seenEvidence.has(key)) return false
      seenEvidence.add(key)
      return true
    })
  return {
    ...artRes.data,
    claims,
    author_name: authorNames.get(artRes.data.author_id) ?? null,
    author_id: undefined,
    arc_title: null,
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
  if (!supabase || !arcId) return { edges: [], labels: new Map(), edgesUnavailable: null }
  const nodesRes = await keysetAll(supabase, 'nodes', 'id, slug, label', {
    filter: (q) => q.eq('arc_id', arcId),
  })
  if (nodesRes.error) throw nodesRes.error
  const nodeRows = nodesRes.data ?? []
  const labels = new Map(nodeRows.map((n) => [n.id ?? n.slug, n.label]))
  if (nodeRows.length === 0) return { edges: [], labels, edgesUnavailable: null }
  const keys = nodeRows.map((n) => n.id ?? n.slug)
  const edgesRead = await readEdgesOrUnavailable(supabase, 'id, source_id, target_id, type, weight, label, doc_strength', {
    filter: (q) => q.or(`source_id.in.(${keys.join(',')}),target_id.in.(${keys.join(',')})`),
  })
  const edgeRows = edgesRead.data ?? []
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
    edgesUnavailable: edgesRead.edgesUnavailable,
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
