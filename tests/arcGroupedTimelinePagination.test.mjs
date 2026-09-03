// Doc 13 site 4 regression test (owner-authorized 2026-08-11, fix banked in
// 4ca5b0f): the grouped timeline loader runs the SAME read set as the flat
// timeline loader plus arc_events/arc_milestones — all seven keyset reads
// must return complete sets past the PostgREST 1000-row ceiling so the two
// views can never disagree. (2026-08-18 Package 1 arc-grouped addition:
// articles now also selects outlet, and event_articles joined the read set
// via keysetAllComposite — eight reads total — for the per-event outlet
// count; the completeness bar is unchanged.) The fake emulates PostgREST exactly on the
// failure axis: every response is capped at 1000 rows unconditionally.
// Assertions name SPECIFIC rows beyond position 1000 (Doc 13 acceptance bar).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadArcGroupedTimeline, verifyExactlyOnce } from '../src/lib/arcGroupedTimeline.js'
import { loadTimeline } from '../src/lib/supabase.js'

function fakePostgrest(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { range: null, limit: null, orders: [] }
      const q = {
        select: () => q,
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q },
        in: (c, vs) => { const s = new Set(vs); rows = rows.filter((r) => s.has(r[c])); return q },
        gt: (c, v) => { rows = rows.filter((r) => String(r[c]) > String(v)); return q },
        gte: (c, v) => { rows = rows.filter((r) => String(r[c]) >= String(v)); return q },
        not: (c, op, v) => {
          if (op === 'is' && v === null) rows = rows.filter((r) => r[c] !== null && r[c] !== undefined)
          return q
        },
        order: (c, { ascending = true } = {}) => { state.orders.push([c, ascending]); return q },
        range: (f, t) => { state.range = [f, t]; return q },
        limit: (n) => { state.limit = n; return q },
        _resolve(resolve) {
          let r = rows
          // PostgREST semantics: the FIRST .order() is the primary key, each
          // later call a tiebreaker — one comparator over the whole chain.
          if (state.orders.length) {
            r = [...r].sort((a, b) => {
              for (const [c, asc] of state.orders) {
                const ka = String(a[c] ?? '')
                const kb = String(b[c] ?? '')
                if (ka !== kb) return (ka < kb ? -1 : 1) * (asc ? 1 : -1)
              }
              return 0
            })
          }
          if (state.range) r = r.slice(state.range[0], state.range[1] + 1)
          else if (state.limit) r = r.slice(0, state.limit)
          r = r.slice(0, 1000) // PostgREST max-rows cap — the bug under test
          resolve({ data: r, error: null })
        },
        then: (resolve) => q._resolve(resolve),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')

// 1200 event nodes across 1200 arcs; 1100 arc_events all on the deepest arc;
// 1050 projected milestone rows all 'confirmed' on the second-deepest arc. Unique slug
// suffixes → timelineDedup suppresses nothing (each event is its own group).
function buildTables() {
  const storyArcs = []
  for (let i = 1; i <= 1200; i++) {
    storyArcs.push({ id: `arc-${pad(i)}`, title: `Arc ${i}`, category: 'Politics', started_at: '2026-01-01' })
  }
  const nodes = []
  for (let i = 1; i <= 1200; i++) {
    nodes.push({
      id: `n-${pad(i)}`, slug: `evt-${pad(i)}y`, label: `Event ${i}`, type: 'event',
      description: `d${i}`, confidence: 0.8, summary: null,
      occurred_at: `2026-04-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
      arc_id: `arc-${pad(i)}`,
    })
  }
  const arcEvents = []
  for (let i = 1; i <= 1100; i++) {
    arcEvents.push({ id: `ae-${pad(i)}`, arc_id: `arc-${pad(1200)}`, occurred_at: '2999-01-01' })
  }
  const arcMilestones = []
  for (let i = 1; i <= 1050; i++) {
    arcMilestones.push({ id: `am-${pad(i)}`, arc_id: `arc-${pad(1199)}`, status: 'confirmed' })
  }
  const edges = [
    { id: 'e-1', source_id: `n-${pad(1001)}`, target_id: `n-${pad(1200)}`, type: 'causal', weight: 1, label: null },
  ]
  return { nodes, edges, articles: [], story_arcs: storyArcs, arc_events: arcEvents, arc_milestones_public: arcMilestones }
}

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('story_arcs').select('id')
  assert.equal(data.length, 1000)
  const { data: ae } = await db.from('arc_events').select('id')
  assert.equal(ae.length, 1000)
})

test('site 4: loadArcGroupedTimeline renders every event and arc past 1000', async () => {
  const out = await loadArcGroupedTimeline({ supabaseClient: fakePostgrest(buildTables()) })
  const total = out.grouped.sections.reduce((n, s) => n + s.events.length, 0) + out.grouped.unclassified.length
  assert.equal(total, 1200)
  assert.equal(out.grouped.sections.length, 1200)
  // Named rows beyond position 1000: the deepest event renders in its arc
  // section, and the exactly-once invariant holds over the complete set.
  const deep = out.grouped.sections.find((s) => s.arcId === `arc-${pad(1100)}`)
  assert.ok(deep, 'arc section beyond position 1000 missing')
  assert.ok(deep.events.some((e) => e.id === `n-${pad(1100)}`), 'event beyond position 1000 missing from its section')
  const check = verifyExactlyOnce(out.grouped, 1200)
  assert.equal(check.ok, true, `duplicates: ${check.duplicates}`)
  // arc_events read complete (1100 rows): the deepest arc derives 'active'
  // (far-future occurred_at → recent). The narrow milestone projection reads
  // complete (1050 rows): arc-001199 derives 'resolved' — a truncated read would
  // leave it 'dormant'/null instead.
  const active = out.grouped.sections.find((s) => s.arcId === `arc-${pad(1200)}`)
  assert.equal(active.statusLabel, 'Ongoing')
  const resolved = out.grouped.sections.find((s) => s.arcId === `arc-${pad(1199)}`)
  assert.equal(resolved.statusLabel, 'Resolved')
  // Relation edge whose source sits beyond 1000 survives the remap.
  assert.ok(out.relationEdges.some((e) => e.id === 'e-1' && e.source === `n-${pad(1001)}`))
})

test('site 4: flat and grouped views agree on deep rows (identical read set)', async () => {
  const db1 = fakePostgrest(buildTables())
  const db2 = fakePostgrest(buildTables())
  const flat = await loadTimeline({ supabaseClient: db1 })
  const grouped = await loadArcGroupedTimeline({ supabaseClient: db2 })
  const flatIds = new Set(flat.events.map((e) => e.id))
  const groupedIds = new Set()
  for (const s of grouped.grouped.sections) for (const e of s.events) groupedIds.add(e.id)
  for (const e of grouped.grouped.unclassified) groupedIds.add(e.id)
  assert.deepEqual([...groupedIds].sort(), [...flatIds].sort())
  // The named deep rows are where the two views would first disagree.
  for (const id of [`n-${pad(1001)}`, `n-${pad(1200)}`]) {
    assert.ok(flatIds.has(id) && groupedIds.has(id), `views disagree on ${id}`)
  }
})

test('structure: grouped loader keyset-paginates all eight reads', () => {
  const src = readFileSync(new URL('../src/lib/arcGroupedTimeline.js', import.meta.url), 'utf8')
  assert.match(src, /keysetAll\(supabase, 'nodes', 'id, slug, label, description, confidence, summary, occurred_at, arc_id'/)
  // doc_strength added 2026-08-18 (Track B Step 3 item 4, read-path only):
  // the Screen 5 connector engine requires confirmed-grade strength before
  // any gap may be labeled "Source-supported causal link".
  assert.match(src, /keysetAll\(supabase, 'edges', 'id, source_id, target_id, type, weight, label, doc_strength'/)
  assert.match(src, /keysetAll\(supabase, 'nodes', 'id, slug, label'\)/)
  // Expanded metadata supports both outlet counts and explicit, source-backed
  // News-record rows for articles assigned to an arc.
  assert.match(src, /keysetAll\(supabase, 'articles', 'id, title, summary, published_at, arc_id, outlet'\)/)
  assert.match(src, /keysetAll\(supabase, 'story_arcs', 'id, category, started_at'\)/)
  assert.doesNotMatch(src, /keysetAll\(supabase, 'story_arcs', 'id, title, category, started_at'\)/)
  assert.match(src, /keysetAll\(supabase, 'arc_events', 'id, arc_id, occurred_at'\)/)
  assert.match(src, /keysetAll\(supabase, 'arc_milestones_public', 'id, arc_id, status'\)/)
  // Package 1 arc-grouped addition: event memberships for the outlet index,
  // composite-PK keyset (same helper as loadEventGrouping).
  assert.match(src, /keysetAllComposite\(supabase, 'event_articles', 'event_id, article_id'/)
})
