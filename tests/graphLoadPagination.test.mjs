// Doc 13 site 2 regression test (owner-authorized 2026-08-11):
// loadGraph must return the COMPLETE node/edge sets past the PostgREST
// 1000-row ceiling. The fake below emulates PostgREST exactly on the failure
// axis: every response is capped at 1000 rows no matter what the caller asked
// for. Fixture sizes are >1000 on both tables. Assertions name SPECIFIC rows
// at positions beyond 1000 — a count match alone would not prove the fix
// (Doc 13 acceptance bar), and the assertions run against the arrays the
// Knowledge Graph actually renders (GraphView receives graph.nodes /
// graph.edges unfiltered — App.jsx displayNodes/displayEdges pass-through).

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGraph } from '../src/lib/supabase.js'

// --- Minimal PostgREST emulation -------------------------------------------
// Supports exactly the builder chain keysetAll uses: select/eq/in/gt/order/
// range/limit + await. The 1000-row server cap is applied unconditionally at
// response time — that IS the bug being tested. A select asking for a column
// in `missingCols` returns a 400-style error (the pre-migration evidence-
// columns fallback path).
function fakePostgrest(tables, { missingCols = [] } = {}) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { range: null, limit: null, badCols: false }
      const q = {
        select: (cols) => {
          state.badCols = missingCols.some((c) => String(cols).includes(c))
          return q
        },
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q },
        in: (c, vs) => { const s = new Set(vs); rows = rows.filter((r) => s.has(r[c])); return q },
        gt: (c, v) => { rows = rows.filter((r) => String(r[c]) > String(v)); return q },
        order: (c, { ascending = true } = {}) => {
          rows = [...rows].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
          return q
        },
        range: (f, t) => { state.range = [f, t]; return q },
        limit: (n) => { state.limit = n; return q },
        then: (resolve) => {
          if (state.badCols) return resolve({ data: null, error: { code: '42703', message: 'column does not exist' } })
          let r = rows
          if (state.range) r = r.slice(state.range[0], state.range[1] + 1)
          else if (state.limit) r = r.slice(0, state.limit)
          r = r.slice(0, 1000) // PostgREST max-rows cap — the bug under test
          resolve({ data: r, error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')

// --- Fixture: both graph tables past the ceiling ----------------------------
const N_NODES = 1200
const N_EDGES = 1500

function buildTables() {
  const nodes = []
  for (let i = 1; i <= N_NODES; i++) {
    nodes.push({ id: `n-${pad(i)}`, slug: `evt-x${i}`, label: `Node ${i}`, type: 'event', description: `d${i}`, confidence: 0.8, summary: null, occurred_at: '2026-07-01', arc_id: null })
  }
  const edges = []
  for (let i = 1; i <= N_EDGES; i++) {
    // Edge i connects two real nodes (ids wrap at N_NODES) so the deepest
    // rows of the edges table still join to rendered nodes.
    edges.push({ id: `e-${pad(i)}`, source_id: `n-${pad(((i - 1) % N_NODES) + 1)}`, target_id: `n-${pad((i % N_NODES) + 1)}`, type: 'causal', weight: 1, label: `edge ${i}`, similarity: null })
  }
  return { nodes, edges }
}

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('nodes').select('id')
  assert.equal(data.length, 1000)
  const { data: ed } = await db.from('edges').select('id')
  assert.equal(ed.length, 1000)
})

test('loadGraph returns the complete graph past 1000 rows on both tables', async () => {
  const graph = await loadGraph({ supabaseClient: fakePostgrest(buildTables()) })
  assert.equal(graph.source, 'supabase')

  // nodes: all 1200 rendered, including SPECIFIC rows a truncated read drops
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  assert.equal(nodeIds.size, N_NODES)
  assert.ok(nodeIds.has(`n-${pad(1001)}`), 'node at position 1001 missing')
  assert.ok(nodeIds.has(`n-${pad(N_NODES)}`), 'final node missing')

  // edges: mapped to the shape GraphView renders (source/target), all 1500
  const edgeIds = new Set(graph.edges.map((e) => e.id))
  assert.equal(edgeIds.size, N_EDGES)
  assert.ok(edgeIds.has(`e-${pad(1001)}`), 'edge at position 1001 missing')
  assert.ok(edgeIds.has(`e-${pad(N_EDGES)}`), 'final edge missing')

  // Render-level proof: the edge at position 1500 connects n-000300 →
  // n-000301 (ids wrap at N_NODES) — both must be renderable nodes with
  // their mapped source/target intact.
  const last = graph.edges.find((e) => e.id === `e-${pad(N_EDGES)}`)
  assert.equal(last.source, `n-${pad(300)}`)
  assert.equal(last.target, `n-${pad(301)}`)
  assert.ok(nodeIds.has(last.source) && nodeIds.has(last.target), 'edge beyond 1000 lost its endpoint nodes')

  // The deepest node (position 1200 — beyond the old cap) actually appears
  // in the rendered edge set, not just the node list.
  assert.ok(
    graph.edges.some((e) => e.source === `n-${pad(N_NODES)}` || e.target === `n-${pad(N_NODES)}`),
    'node beyond position 1000 has no rendered incident edge',
  )

  // Every rendered edge endpoint resolves to a rendered node — no dangling
  // references from a partial read (cytoscape would silently drop those).
  for (const e of graph.edges) {
    assert.ok(nodeIds.has(e.source), `edge ${e.id} source ${e.source} not in rendered nodes`)
    assert.ok(nodeIds.has(e.target), `edge ${e.id} target ${e.target} not in rendered nodes`)
  }
})

test('pre-migration fallback: evidence-column 400 still returns ALL edges', async () => {
  // Evidence columns absent → extended select errors on every page → base
  // select must also paginate, not revert to a single capped read.
  const db = fakePostgrest(buildTables(), { missingCols: ['signal_source'] })
  const graph = await loadGraph({ supabaseClient: db })
  const edgeIds = new Set(graph.edges.map((e) => e.id))
  assert.equal(edgeIds.size, N_EDGES)
  assert.ok(edgeIds.has(`e-${pad(1001)}`), 'fallback path dropped edge at position 1001')
  assert.ok(edgeIds.has(`e-${pad(N_EDGES)}`), 'fallback path dropped final edge')
})


test('configured empty Supabase returns an explicit empty graph, never bundled demo content', async () => {
  const graph = await loadGraph({ supabaseClient: fakePostgrest({ nodes: [], edges: [] }) })
  assert.equal(graph.source, 'supabase')
  assert.deepEqual(graph.nodes, [])
  assert.deepEqual(graph.edges, [])
})
