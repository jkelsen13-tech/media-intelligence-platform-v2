// 04-ADD verifier v1 — hard-count check against the live database.
// Read-only (publishable key, RLS read-only) via PostgREST. Recomputes the
// canonical grouping exactly the way the app does and asserts
// 362 = 271 + 26 + 65, every event exactly once.
// Usage: node verifier/v1/count-check.mjs
import { canonicalizeTimelineEvents } from '../../src/lib/timelineDedup.js'
import { buildArcSections, buildMirrorArcMap, verifyExactlyOnce } from '../../src/lib/arcGroupedTimeline.js'

const sandboxUrl = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!sandboxUrl || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must target the disposable sandbox.')
const base = `${sandboxUrl}/rest/v1`

async function table(path) {
  const res = await fetch(`${base}/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

const t0 = performance.now()
const [nodes, articles, arcs] = await Promise.all([
  table('nodes?select=id,slug,label,occurred_at,arc_id&type=eq.event'),
  table('articles?select=id,arc_id'),
  table('story_arcs?select=id,title,category,started_at'),
])

const { events } = canonicalizeTimelineEvents(nodes)
const articleArcBySuffix = new Map()
for (const a of articles) {
  if (a.arc_id) articleArcBySuffix.set(String(a.id).slice(0, 8), a.arc_id)
}
const arcsById = new Map(
  arcs.map((a) => [
    a.id,
    { title: a.title, category: a.category, started_at: a.started_at, endAt: null, status: null },
  ]),
)
const grouped = buildArcSections(events, arcsById, articleArcBySuffix, buildMirrorArcMap(nodes, events))
const check = verifyExactlyOnce(grouped, events.length)
const ms = Math.round(performance.now() - t0)

const result = {
  rawEventNodes: nodes.length,
  canonicalEvents: events.length,
  direct: grouped.counts.direct,
  derivable: grouped.counts.derivable,
  unclassified: grouped.counts.unclassified,
  sectionCount: grouped.counts.sectionCount,
  exactlyOnceOk: check.ok,
  duplicates: check.duplicates,
  expectedSplit: { total: 362, direct: 271, derivable: 26, unclassified: 65 },
  splitMatches:
    events.length === 362 &&
    grouped.counts.direct === 271 &&
    grouped.counts.derivable === 26 &&
    grouped.counts.unclassified === 65,
  computeMs: ms,
  checkedAt: new Date().toISOString(),
}
console.log(JSON.stringify(result, null, 2))
process.exit(check.ok && result.splitMatches ? 0 : 1)
