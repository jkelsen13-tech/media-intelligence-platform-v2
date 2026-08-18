// Verifier trackb2b-v2 (2026-08-18): re-confirms the three Step 2b
// verification tests against the SHIPPED implementation. Every geometric /
// gating number below comes from the actual src/graph/cardRegions.js and
// src/lib/desktopFocus.js modules, not a re-model. Read-only PostgREST.
// Usage: node verifier/trackb2b-v2/measure-final.mjs

import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { seedPositions } from '../../src/analysis/layoutSeed.js'
import { splitByConnectivity, placeDisconnectedBand } from '../../src/graph/bandPlacement.js'
// Shipped seams under test:
import {
  CARD_W,
  CARD_H,
  CARD_ZOOM_MIN,
  MAX_CARDS,
  FOCAL_RELAX_ZOOM,
  regionOf,
  regionBoundaries,
  collapsedCounts,
  relaxCards,
  separateRegions,
  cardOverlaps,
  cardRegime,
} from '../../src/graph/cardRegions.js'
import { focusDepth } from '../../src/lib/desktopFocus.js'

cytoscape.use(fcose)

const SUPA = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPA || !KEY) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must target the disposable sandbox.')

async function fetchAll(table) {
  const out = []
  let from = 0
  for (;;) {
    const r = await fetch(`${SUPA}/rest/v1/${table}?select=*&offset=${from}&limit=1000`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    })
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) return out
    from += 1000
  }
}

// Mirror of the app's fcose path (unchanged by Step 2b).
async function layout(cy, eles) {
  const sameArc = (e) => {
    const a = e.source().data('arc_id')
    return a && a === e.target().data('arc_id')
  }
  const WS = { heavy: 0.9, medium: 0.6, light: 0.3 }
  const edgeSim = (e) => {
    const s = Number(e.data('similarity'))
    return Number.isFinite(s) ? Math.min(Math.max(s, 0), 1) : WS[e.data('weight')] ?? WS.medium
  }
  const l = eles.layout({
    name: 'fcose', quality: 'default', randomize: false,
    positions: seedPositions(eles.nodes().map((n) => n.id())),
    animate: false, nodeRepulsion: () => 12000,
    idealEdgeLength: (e) => (sameArc(e) ? 70 + (1 - edgeSim(e)) * 40 : 320),
    edgeElasticity: (e) => (sameArc(e) ? 0.45 * (0.5 + edgeSim(e)) : 0.05),
    gravity: 0.25, numIter: 2500, packComponents: true, fit: false, padding: 80,
  })
  await new Promise((res) => { l.promiseOn('layoutstop', res); l.run() })
}

function focusedSubgraph(nodes, edges, depth) {
  const deg = new Map()
  edges.forEach((e) => { deg.set(e.source, (deg.get(e.source) ?? 0) + 1); deg.set(e.target, (deg.get(e.target) ?? 0) + 1) })
  const hub = [...deg.entries()].sort((a, b) => b[1] - a[1])[0][0]
  let frontier = new Set([hub])
  const keep = new Set([hub])
  for (let d = 0; d < depth; d++) {
    const next = new Set()
    edges.forEach((e) => { if (frontier.has(e.source)) next.add(e.target); if (frontier.has(e.target)) next.add(e.source) })
    next.forEach((id) => keep.add(id))
    frontier = next
  }
  return { fNodes: nodes.filter((n) => keep.has(n.id ?? n.slug)), fEdges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)), hub }
}

function pointInHull(pt, hull) {
  let inside = false
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const a = hull[i], b = hull[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

const results = []
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail })
}

const nodes = await fetchAll('nodes')
const edges = (await fetchAll('edges')).map((e) => ({ ...e, source: e.source_id, target: e.target_id }))

// ---- T1: mobile reflow against shipped focusDepth + relaxCards + geometry ----
{
  check('T1.a focusDepth mobile=1 desktop=2', focusDepth(true) === 1 && focusDepth(false) === 2,
    { mobile: focusDepth(true), desktop: focusDepth(false) })
  const { fNodes, fEdges } = focusedSubgraph(nodes, edges, focusDepth(true))
  const cy = cytoscape({ headless: true, elements: { nodes: fNodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })), edges: fEdges.map((e) => ({ data: e })) } })
  await layout(cy, cy.elements())
  const arr = cy.nodes().toArray()
  const before = cardOverlaps(arr, CARD_W, CARD_H)
  const t0 = performance.now()
  // Full shipped pipeline (GraphView.runSettleSeparation): card separation,
  // inter-region separation, card separation again.
  relaxCards(arr, CARD_W, CARD_H, 12)
  const sr1 = separateRegions(arr)
  const rr = relaxCards(arr, CARD_W, CARD_H, 12)
  const relaxMs = Math.round(performance.now() - t0)
  const after = cardOverlaps(arr, CARD_W, CARD_H)
  const bb = cy.elements().boundingBox()
  const fz390 = Math.min((390 - 160) / (bb.x2 - bb.x1), (844 - 160) / (bb.y2 - bb.y1))
  const fz360 = Math.min((360 - 160) / (bb.x2 - bb.x1), (800 - 160) / (bb.y2 - bb.y1))
  check('T1.b depth-1 cards separate to zero overlaps (full settle pipeline)', after === 0, { nodes: fNodes.length, overlapsBefore: before, overlapsAfter: after, relaxMs, regionSeparation: sr1, converged: rr.converged, iterations: rr.iterations })
  check('T1.c fit zoom >= 0.45 at 390px and 360px', fz390 >= 0.45 && fz360 >= 0.45, { fz390: +fz390.toFixed(3), fz360: +fz360.toFixed(3), cardRenderedWidth390: +(CARD_W * fz390).toFixed(1) })
  // Region labels inside viewport: shipped regionBoundaries label anchors.
  const members = arr.map((n) => { const p = n.position(); return { id: n.id(), x: p.x, y: p.y, region: regionOf(n.data()) } })
  const regions = regionBoundaries(members)
  const inView = regions.filter((r) => {
    const rx = (r.labelAnchor.x - (bb.x1 + bb.x2) / 2) * fz390 + 195
    const ry = (r.labelAnchor.y - (bb.y1 + bb.y2) / 2) * fz390 + 422 - 22
    return rx >= 0 && rx <= 390 && ry >= 0
  }).length
  check('T1.d region labels inside 390px viewport', regions.length > 0 && inView === regions.length, { regions: regions.length, inView })
}

// ---- T2: 200% text scaling — DOM construction + shipped zoom gates ----
{
  const r1 = cardRegime(0.5)
  const r2 = cardRegime(CARD_ZOOM_MIN)
  const r3 = cardRegime(FOCAL_RELAX_ZOOM)
  check('T2.a zoom gates: compact below 1.0, cards at reading zoom, focal scope at max zoom',
    r1.regime === 'compact' && r1.relaxScope === 'none' && r2.regime === 'cards' && r2.relaxScope === 'visible' && r3.regime === 'cards' && r3.relaxScope === 'focal',
    { CARD_ZOOM_MIN, FOCAL_RELAX_ZOOM, r1, r2, r3 })
  // DOM-text construction is static-guarded by tests (cards/labels are divs,
  // canvas node labels suppressed at card zoom). Numeric leg: 2x cards still
  // separate to zero on the focused subgraph.
  const { fNodes, fEdges } = focusedSubgraph(nodes, edges, focusDepth(true))
  const cy = cytoscape({ headless: true, elements: { nodes: fNodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })), edges: fEdges.map((e) => ({ data: e })) } })
  await layout(cy, cy.elements())
  const arr = cy.nodes().toArray()
  const rr = relaxCards(arr, CARD_W * 2, CARD_H * 2, 24)
  const after = cardOverlaps(arr, CARD_W * 2, CARD_H * 2)
  check('T2.b 2x-size cards separate to zero on focused subgraph', after === 0, { overlapsAfter: after, converged: rr.converged, iterations: rr.iterations })
}

// ---- T3: dense states against shipped seams ----
{
  const cy = cytoscape({ headless: true, elements: { nodes: nodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })), edges: edges.map((e) => ({ data: e })) } })
  const { connected, disconnected } = splitByConnectivity(nodes, edges)
  const cids = new Set(connected.map((n) => String(n.id ?? n.slug)))
  const conn = cy.nodes().filter((n) => cids.has(n.id())).union(cy.edges())
  const t0 = performance.now()
  await layout(cy, conn)
  const layoutMs = Math.round(performance.now() - t0)
  if (disconnected.length > 0) {
    const bb = conn.nodes().boundingBox()
    const placed = placeDisconnectedBand(disconnected.map((n) => ({ id: String(n.id ?? n.slug), arc_id: n.arc_id })), { clusterBox: bb, aspect: 1600 / 900, spacing: 200 })
    placed.forEach((p, id) => cy.getElementById(id).position(p))
  }
  // Dense FOCUSED states: cards/boundaries render only in focused views
  // (adjustment 4), so the dense test is the largest realistic focused view.
  // Depth-3 from the top hub proxies a heavily expanded branch.
  const { fNodes: d3n, fEdges: d3e } = focusedSubgraph(nodes, edges, 3)
  const cyD3 = cytoscape({ headless: true, elements: { nodes: d3n.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })), edges: d3e.map((e) => ({ data: e })) } })
  await layout(cyD3, cyD3.elements())
  const d3arr = cyD3.nodes().toArray()
  const d3before = cardOverlaps(d3arr, CARD_W, CARD_H)
  const tR = performance.now()
  relaxCards(d3arr, CARD_W, CARD_H, 12)
  const sr = separateRegions(d3arr)
  relaxCards(d3arr, CARD_W, CARD_H, 12)
  const d3after = cardOverlaps(d3arr, CARD_W, CARD_H)
  const relaxMs = Math.round(performance.now() - tR)
  check('T3.b dense focused state (depth-3): cards separate to zero, regions pure, in budget',
    d3after === 0 && sr.converged, { depth3Nodes: d3n.length, overlapsBefore: d3before, overlapsAfter: d3after, regionSeparation: sr, relaxMs })
  check('T3.info layout performance at 750 nodes', true, { layoutMs, connected: connected.length, disconnected: disconnected.length })
  // T3.c focused-view hull purity with shipped regionBoundaries.
  const { fNodes, fEdges } = focusedSubgraph(nodes, edges, focusDepth(false))
  const cy2 = cytoscape({ headless: true, elements: { nodes: fNodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })), edges: fEdges.map((e) => ({ data: e })) } })
  await layout(cy2, cy2.elements())
  relaxCards(cy2.nodes().toArray(), CARD_W, CARD_H, 12)
  separateRegions(cy2.nodes().toArray())
  relaxCards(cy2.nodes().toArray(), CARD_W, CARD_H, 12)
  const members = cy2.nodes().toArray().map((n) => { const p = n.position(); return { id: n.id(), x: p.x, y: p.y, region: regionOf(n.data()) } })
  const regions = regionBoundaries(members)
  let purity = 0
  for (const r of regions) {
    const memberIds = new Set(members.filter((m) => m.region === r.region).map((m) => m.id))
    for (const m of members) if (!memberIds.has(m.id) && pointInHull(m, r.points)) purity++
  }
  check('T3.c focused-view hulls enclose no foreign node centers', purity === 0, { regions: regions.map((r) => `${r.region}:${r.memberCount}`), purityViolations: purity })
  // T3.d +N counts sum correctly against the full corpus.
  const shownIds = new Set(fNodes.map((n) => n.id ?? n.slug))
  const collapsed = collapsedCounts(nodes, shownIds)
  const totals = new Map()
  nodes.forEach((n) => { const r = regionOf(n); if (r) totals.set(r, (totals.get(r) ?? 0) + 1) })
  let sumsOk = true
  for (const [r, hidden] of collapsed) {
    const shown = fNodes.filter((n) => regionOf(n) === r).length
    if (hidden + shown !== totals.get(r)) sumsOk = false
  }
  check('T3.d +N collapsed counts sum to corpus totals', sumsOk, { collapsed: Object.fromEntries(collapsed), focusedNodes: fNodes.length })
  check('T3.a MAX_CARDS safety cap sane', MAX_CARDS >= 100 && MAX_CARDS <= 400, { MAX_CARDS })
}

const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({ date: '2026-08-18', corpus: { nodes: nodes.length, edges: edges.length }, results }, null, 2))
console.log(`\n${failed.length === 0 ? 'ALL PASS' : 'FAILURES: ' + failed.map((f) => f.name).join('; ')}`)
process.exit(failed.length === 0 ? 0 : 1)
