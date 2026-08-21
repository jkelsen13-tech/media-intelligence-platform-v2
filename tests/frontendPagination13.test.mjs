// Doc 13 sites 1/3/5 regression test (owner-authorized 2026-08-11, fix banked
// in 4ca5b0f): the frontend loaders must return COMPLETE result sets past the
// PostgREST 1000-row ceiling. The fake below emulates PostgREST exactly on the
// failure axis: every response is capped at 1000 rows no matter what the
// caller asked for. Fixture sizes are >1000 on every table under test and the
// assertions name SPECIFIC rows at positions beyond 1000 — a count match
// alone would not prove the fix (Doc 13 acceptance bar).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadTopics, loadArcs, loadTimeline, loadOutlets } from '../src/lib/supabase.js'

// --- Minimal PostgREST emulation -------------------------------------------
// Supports the builder chains the Doc 13 read paths use: select/eq/in/gt/gte/
// not/order/range/limit/maybeSingle + await. Multi-column ORDER BY is applied
// as ONE combined stable sort at resolve time (PostgREST semantics). The
// 1000-row server cap is applied unconditionally — that IS the bug under test.
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
        maybeSingle: () => {
          const r = rows[0] ?? null
          return Promise.resolve({ data: r, error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const nodeTopics = []
  for (let i = 1; i <= 1300; i++) nodeTopics.push({ node_id: `nd-${pad(i)}`, topic_id: 'tp-01', confidence: 0.9 })
  const db = fakePostgrest({ node_topics: nodeTopics })
  const { data } = await db.from('node_topics').select('node_id, topic_id')
  assert.equal(data.length, 1000)
})

// --- Site 1: loadTopics node_topics composite-PK pagination -----------------
test('site 1: loadTopics returns ALL node_topics rows past 1000 (composite PK, no id column)', async () => {
  const topics = [
    { id: 'tp-01', slug: 'politics', name: 'Politics', parent_id: null },
    { id: 'tp-02', slug: 'conflict', name: 'Conflict', parent_id: null },
  ]
  const nodeTopics = []
  for (let i = 1; i <= 1300; i++) {
    nodeTopics.push({ node_id: `nd-${pad(i)}`, topic_id: i % 2 === 0 ? 'tp-01' : 'tp-02', confidence: 0.9 })
  }
  const out = await loadTopics({ supabaseClient: fakePostgrest({ topics, node_topics: nodeTopics }) })
  assert.ok(out, 'loadTopics returned null — feature-detect misfired')
  const keys = new Set(out.nodeTopics.map((r) => `${r.node_id}|${r.topic_id}`))
  assert.equal(out.nodeTopics.length, 1300)
  // Named rows beyond position 1000 — a truncated read drops exactly these.
  assert.ok(keys.has(`nd-${pad(1001)}|tp-02`), 'node_topics row at position 1001 missing')
  assert.ok(keys.has(`nd-${pad(1300)}|tp-01`), 'final node_topics row missing')
})

// --- loadArcs: story_arcs / arc_events / public milestone projection past 1000 ---
test('loadArcs returns all arcs past 1000, display order last_update_at desc re-applied', async () => {
  const storyArcs = []
  for (let i = 1; i <= 1200; i++) {
    storyArcs.push({
      id: `arc-${pad(i)}`, slug: `arc-${pad(i)}`, title: `Arc ${i}`, category: 'Politics',
      category_confidence: null, category_evidence: null, status: 'active', root_node_id: null,
      coverage_gap: null, summary: null, started_at: '2026-01-01',
      last_update_at: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
    })
  }
  // 1100 arc_events rows: the read must paginate too. All attach to the
  // DEEPEST arc — if the read truncates, that arc's derived status is wrong.
  const arcEvents = []
  for (let i = 1; i <= 1100; i++) {
    arcEvents.push({ id: `ae-${pad(i)}`, arc_id: `arc-${pad(1200)}`, occurred_at: '2999-01-01' })
  }
  const out = await loadArcs({ supabaseClient: fakePostgrest({ story_arcs: storyArcs, arc_events: arcEvents, arc_milestones_public: [] }) })
  assert.equal(out.length, 1200)
  const ids = new Set(out.map((a) => a.id))
  assert.ok(ids.has(`arc-${pad(1001)}`), 'story_arcs row at position 1001 missing')
  assert.ok(ids.has(`arc-${pad(1200)}`), 'final story_arcs row missing')
  // Display order re-applied client-side over the COMPLETE set: strictly
  // non-increasing last_update_at.
  for (let i = 1; i < out.length; i++) {
    assert.ok(String(out[i - 1].last_update_at) >= String(out[i].last_update_at), `order broken at index ${i}`)
  }
  // Deep-arc derived status proves the arc_events read was complete:
  // 1100 events all dated far-future → 'active' for arc-001200 only.
  assert.equal(out.find((a) => a.id === `arc-${pad(1200)}`).derived_status, 'active')
  assert.equal(out.find((a) => a.id === `arc-${pad(500)}`).derived_status, null)
})

// --- Site 3: loadTimeline five reads past 1000 ------------------------------
test('site 3: loadTimeline returns all event nodes past 1000, occurred_at asc nulls-last', async () => {
  const nodes = []
  for (let i = 1; i <= 1300; i++) {
    nodes.push({
      id: `n-${pad(i)}`, slug: `evt-${pad(i)}x`, label: `Event ${i}`, type: 'event',
      description: `d${i}`, confidence: 0.8, summary: null,
      occurred_at: `2026-03-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
      arc_id: null,
    })
  }
  // Non-event label rows push the SECOND nodes read past the ceiling too.
  for (let i = 1301; i <= 1500; i++) {
    nodes.push({ id: `n-${pad(i)}`, slug: `inst-${pad(i)}`, label: `Institution ${i}`, type: 'institution' })
  }
  const edges = [
    { id: 'e-1', source_id: `n-${pad(1)}`, target_id: `n-${pad(1300)}`, type: 'causal', weight: 1, label: null },
    { id: 'e-2', source_id: `n-${pad(1001)}`, target_id: `n-${pad(1300)}`, type: 'sequence', weight: 1, label: null },
  ]
  const db = fakePostgrest({ nodes, edges, articles: [], story_arcs: [] })
  const out = await loadTimeline({ supabaseClient: db })
  assert.equal(out.events.length, 1300)
  const ids = new Set(out.events.map((e) => e.id))
  assert.ok(ids.has(`n-${pad(1001)}`), 'event node at position 1001 missing')
  assert.ok(ids.has(`n-${pad(1300)}`), 'final event node missing')
  // occurred_at ascending, nulls last — re-applied over the complete set.
  const dates = out.events.map((e) => e.occurred_at)
  for (let i = 1; i < dates.length; i++) {
    assert.ok(String(dates[i - 1]) <= String(dates[i]), `timeline order broken at index ${i}`)
  }
  // Labels read complete past 1000: the deep institution node resolves.
  const labelIds = new Set(out.labels.map((l) => l.id))
  assert.ok(labelIds.has(`n-${pad(1400)}`), 'labels read dropped node beyond 1000')
  // The causal/sequence edge whose SOURCE sits beyond 1000 survives remap.
  assert.ok(out.relationEdges.some((e) => e.id === 'e-2' && e.source === `n-${pad(1001)}`))
})

// --- Site 5: loadOutlets past 1000 ------------------------------------------
test('site 5: loadOutlets sees outlets that only exist beyond row 1000', async () => {
  const articles = []
  for (let i = 1; i <= 1500; i++) {
    articles.push({ id: `art-${pad(i)}`, outlet: i === 1500 ? 'DeepOutlet' : `Outlet ${(i % 40) + 1}`, reader_state: 'eligible' })
  }
  const out = await loadOutlets({ supabaseClient: fakePostgrest({ articles }) })
  assert.equal(out.length, 41)
  assert.ok(out.includes('DeepOutlet'), 'outlet that exists only at position 1500 missing')
  assert.deepEqual(out, [...out].sort())
})

// --- Structure pins: the Doc 13 read paths stay paginated -------------------
test('structure: frontend loaders use keyset pagination on every Doc 13 table', () => {
  const src = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
  // Site 1: composite-PK pagination for node_topics.
  assert.match(src, /keysetAllComposite\(client, 'node_topics', 'node_id, topic_id, confidence'/)
  // loadArcs: all three arc tables.
  assert.match(src, /keysetAll\(client, 'story_arcs', 'id, slug, title/)
  assert.match(src, /keysetAll\(client, 'arc_events', 'id, arc_id, occurred_at'\)/)
  assert.match(src, /keysetAll\(client, 'arc_milestones_public', 'id, arc_id, status'\)/)
  // Site 3: timeline reads (event nodes, edges, labels, articles, story_arcs).
  assert.match(src, /keysetAll\(client, 'articles', 'id, title, summary, published_at, outlet, arc_id'\)/)
  assert.match(src, /keysetAll\(client, 'story_arcs', 'id, title'\)/)
  // Site 5: outlets read.
  assert.match(src, /keysetAll\(client, 'articles', 'id, outlet'/)
  // No raw unpaginated selects remain on the Doc 13 frontend tables inside
  // these loaders (bounded lookups elsewhere — loadSources, loadArcDetail —
  // are eq-scoped single-node reads, out of Doc 13 scope).
  assert.equal(src.includes("from('node_topics').select"), false)
})
