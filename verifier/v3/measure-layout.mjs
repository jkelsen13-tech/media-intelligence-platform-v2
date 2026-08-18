// Verifier v3 harness (Track B Step 2, 2026-08-10): headless layout metrics.
// Measures the two owner-required numbers BEFORE and AFTER the band change,
// at identical iteration counts and a fixed fit-zoom assumption:
//   1) label-box collision count (approx label boxes: 6.1px/char, 13px line,
//      120px wrap, 40-char truncation — same policy as graph styles)
//   2) bounding-box area per node
// Read-only: fetches live nodes/edges via PostgREST with the publishable key,
// runs fcose headless with deterministic seeds (randomize:false) so runs are
// comparable. BEFORE = old params, no band. AFTER = new params + band.
//
// Usage: node verifier/v3/measure-layout.mjs [before|after]  (default: both)

import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { seedPositions } from '../../src/analysis/layoutSeed.js'
import { splitByConnectivity, placeDisconnectedBand } from '../../src/graph/bandPlacement.js'

cytoscape.use(fcose)

const SUPA = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPA || !KEY) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must target the disposable sandbox.')
const VIEW = { w: 1600, h: 900 } // fit-zoom assumption, landscape

const PARAMS = {
  before: { nodeRepulsion: 8000, crossArc: 260, padding: 60, band: false },
  after: { nodeRepulsion: 12000, crossArc: 320, padding: 80, band: true },
}

async function fetchAll(table) {
  const out = []
  let from = 0
  for (;;) {
    const r = await fetch(
      `${SUPA}/rest/v1/${table}?select=*&offset=${from}&limit=1000`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
    )
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) return out
    from += 1000
  }
}

function approxLabelBox(node, zoom) {
  const label = String(node.data('label') ?? node.data('title') ?? node.id())
  const truncated = label.length > 40 ? label.slice(0, 39) + '…' : label
  const charsPerLine = Math.max(1, Math.floor(120 / 6.1))
  const lines = Math.ceil(truncated.length / charsPerLine)
  const w = Math.min(120, truncated.length * 6.1) * zoom
  const h = lines * 13 * zoom
  const p = node.position()
  return { x1: p.x * zoom - w / 2, y1: p.y * zoom + 20 * zoom, x2: p.x * zoom + w / 2, y2: p.y * zoom + 20 * zoom + h }
}

function overlaps(a, b) {
  return !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1)
}

function countCollisions(cy, zoom, topHubsOnly) {
  if (zoom < 0.6) return 0 // label policy: no labels below 0.6x
  let nodes = cy.nodes().toArray()
  if (topHubsOnly) {
    nodes = nodes
      .sort((a, b) => b.degree(false) - a.degree(false))
      .slice(0, 20)
  }
  const boxes = nodes.map((n) => approxLabelBox(n, zoom))
  let hits = 0
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (overlaps(boxes[i], boxes[j])) hits++
  return hits
}

function fitZoom(bb, padding) {
  return Math.min(
    (VIEW.w - 2 * padding) / (bb.x2 - bb.x1),
    (VIEW.h - 2 * padding) / (bb.y2 - bb.y1),
  )
}

async function run(mode) {
  const P = PARAMS[mode]
  const rawNodes = await fetchAll('nodes')
  const rawEdges = await fetchAll('edges')
  // Mirror the app's mapping (src/lib/supabase.js): edges expose
  // source/target derived from source_id/target_id.
  const nodes = rawNodes
  const edges = rawEdges.map((e) => ({ ...e, source: e.source_id, target: e.target_id }))
  const { connected, disconnected } = splitByConnectivity(nodes, edges)

  const sameArc = (e) => {
    const a = e.source().data('arc_id')
    return a && a === e.target().data('arc_id')
  }
  // Same similarity buckets and per-edge functions as GraphView.jsx.
  const WEIGHT_SIMILARITY = { heavy: 0.9, medium: 0.6, light: 0.3 }
  const edgeSim = (e) => {
    const s = Number(e.data('similarity'))
    if (Number.isFinite(s)) return Math.min(Math.max(s, 0), 1)
    return WEIGHT_SIMILARITY[e.data('weight')] ?? WEIGHT_SIMILARITY.medium
  }
  const cy = cytoscape({
    headless: true,
    elements: {
      nodes: nodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })),
      edges: edges.map((e) => ({ data: e })),
    },
  })
  const eles =
    P.band && disconnected.length > 0
      ? cy.nodes().filter((n) => !disconnected.some((d) => String(d.id ?? d.slug) === n.id())).union(cy.edges())
      : cy.elements()
  const layout = eles.layout({
    name: 'fcose',
    quality: 'default',
    randomize: false,
    positions: seedPositions(
      (P.band ? connected : nodes).map((n) => String(n.id ?? n.slug)),
    ),
    animate: false,
    nodeRepulsion: () => P.nodeRepulsion,
    idealEdgeLength: (e) => {
      const sim = edgeSim(e)
      return sameArc(e) ? 70 + (1 - sim) * 40 : P.crossArc
    },
    edgeElasticity: (e) => {
      const sim = edgeSim(e)
      return sameArc(e) ? 0.45 * (0.5 + sim) : 0.05
    },
    gravity: 0.25,
    numIter: 2500,
    packComponents: true,
    fit: false,
    padding: P.padding,
  })
  await new Promise((res) => {
    layout.promiseOn('layoutstop', res)
    layout.run()
  })

  if (P.band && disconnected.length > 0) {
    const bb = eles.nodes().boundingBox()
    const placed = placeDisconnectedBand(
      disconnected.map((n) => ({ id: String(n.id ?? n.slug), arc_id: n.arc_id })),
      { clusterBox: bb, aspect: VIEW.w / VIEW.h },
    )
    placed.forEach((p, id) => cy.getElementById(id).position(p))
  }

  const bbAll = cy.elements().boundingBox()
  const bbConn = eles.nodes().boundingBox()
  const area = (bbAll.x2 - bbAll.x1) * (bbAll.y2 - bbAll.y1)
  const fz = fitZoom(bbAll, P.padding)
  const result = {
    mode,
    nodes: nodes.length,
    edges: edges.length,
    disconnected: disconnected.length,
    bb: { w: Math.round(bbAll.x2 - bbAll.x1), h: Math.round(bbAll.y2 - bbAll.y1) },
    clusterOnlyBb: {
      w: Math.round(bbConn.x2 - bbConn.x1),
      h: Math.round(bbConn.y2 - bbConn.y1),
      fitZoom: +fitZoom(bbConn, P.padding).toFixed(3),
    },
    areaPerNode: Math.round(area / nodes.length),
    fitZoom: +fz.toFixed(3),
    'labelCollisions_fitPolicy_topHubs': countCollisions(cy, fz, true),
    'labelCollisions_zoom0.9_topHubs': countCollisions(cy, 0.9, true),
    'labelCollisions_zoom1.2_all': countCollisions(cy, 1.2, false),
  }
  console.log(JSON.stringify(result, null, 2))
}

const which = process.argv[2]
if (which === 'before' || which === 'after') await run(which)
else {
  await run('before')
  await run('after')
}
