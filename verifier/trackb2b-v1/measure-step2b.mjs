// Verifier trackb2b-v1 (Track B Step 2b pre-build, 2026-08-18).
// Models the addendum Screen 6 design — card nodes + dashed region
// boundaries — headlessly against the LIVE corpus and the app's real layout
// path, for the three outstanding 2026-08-08 verification tests.
// Read-only. Usage: node verifier/trackb2b-v1/measure-step2b.mjs [t1|t2|t3|all]

import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { seedPositions } from '../../src/analysis/layoutSeed.js'
import { splitByConnectivity, placeDisconnectedBand } from '../../src/graph/bandPlacement.js'

cytoscape.use(fcose)

const SUPA = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPA || !KEY) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must target the disposable sandbox.')

// --- Reference design dimensions (see README.md) ---------------------------
const CARD = { w: 160, h: 72 } // 1x text
const HULL_PAD = 40
const REGION_LABEL = { charW: 6.1, h: 15 } // ~12px DOM label at 1x

// Text metrics at 1x: name 12px semibold (~6.8px/char, 2 lines max, 40-char
// truncation carried from styles.js), date 10px, type label 10px.
function cardSizeFor(label, scale) {
  const name = String(label ?? '')
  const truncated = name.length > 40 ? name.slice(0, 39) + '…' : name
  const padX = 24 * scale // icon 20px + gaps, per the reference card
  const lineW = 6.8 * scale
  const innerW = 160 - padX
  const lines = Math.min(2, Math.max(1, Math.ceil((truncated.length * lineW) / innerW)))
  const h = (16 + lines * 15 + 13 + 13 + 10) * scale // padding + name + date + type + padding
  // Auto-grow width if a single unbreakable word or 2 lines still overflow.
  const needW = Math.min(320, Math.max(160, Math.ceil(Math.min(truncated.length, 40) * lineW / 2) + padX))
  return { w: needW, h: Math.ceil(h), overflow: truncated.length * lineW > 2 * (needW - padX) }
}

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

function regionOf(n) {
  if (n.type === 'policy') return 'Policy & courts'
  if (n.type === 'event') return 'Incidents'
  if (n.type === 'actor') return n.metadata?.entity_type === 'organization' ? 'Reporting' : 'Civil society'
  return 'Other'
}

// --- Geometry helpers -------------------------------------------------------
function rectsOverlap(a, b, pad = 0) {
  return !(a.x2 + pad < b.x1 || b.x2 + pad < a.x1 || a.y2 + pad < b.y1 || b.y2 + pad < a.y1)
}
function cardRect(node, w, h) {
  const p = node.position()
  return { x1: p.x - w / 2, y1: p.y - h / 2, x2: p.x + w / 2, y2: p.y + h / 2 }
}
function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}
function pointInHull(pt, hull) {
  let inside = false
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const a = hull[i], b = hull[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
function hullOfCards(nodes, w, h, pad) {
  const pts = []
  nodes.forEach((n) => {
    const r = cardRect(n, w, h)
    pts.push({ x: r.x1 - pad, y: r.y1 - pad }, { x: r.x2 + pad, y: r.y1 - pad },
      { x: r.x1 - pad, y: r.y2 + pad }, { x: r.x2 + pad, y: r.y2 + pad })
  })
  return convexHull(pts)
}
function hullLabelBox(hull, text, scale) {
  const minX = Math.min(...hull.map((p) => p.x))
  const minY = Math.min(...hull.map((p) => p.y))
  const w = text.length * REGION_LABEL.charW * scale
  const h = REGION_LABEL.h * scale
  return { x1: minX, y1: minY - h - 6 * scale, x2: minX + w, y2: minY - 6 * scale }
}
function fitZoomFor(bb, view, padding = 80) {
  return Math.min((view.w - 2 * padding) / (bb.x2 - bb.x1), (view.h - 2 * padding) / (bb.y2 - bb.y1))
}

// --- App-mirrored fcose (after-state params from verifier/v3) ---------------
function buildCy(nodes, edges, { cardScale = 1, repulsion = 12000, crossArc = 320, sameArcLen = null, cardW = null, cardH = null } = {}) {
  const sameArc = (e) => {
    const a = e.source().data('arc_id')
    return a && a === e.target().data('arc_id')
  }
  const WS = { heavy: 0.9, medium: 0.6, light: 0.3 }
  const edgeSim = (e) => {
    const s = Number(e.data('similarity'))
    return Number.isFinite(s) ? Math.min(Math.max(s, 0), 1) : WS[e.data('weight')] ?? WS.medium
  }
  const cy = cytoscape({
    headless: true,
    style: [
      { selector: 'node', style: { width: (n) => cardW ?? cardSizeFor(n.data('label'), cardScale).w, height: (n) => cardH ?? cardSizeFor(n.data('label'), cardScale).h } },
    ],
    elements: {
      nodes: nodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })),
      edges: edges.map((e) => ({ data: e })),
    },
  })
  return { cy, sameArc, edgeSim, repulsion, crossArc }
}

async function runLayout(cy, eles, opts) {
  const t0 = performance.now()
  const layout = eles.layout({
    name: 'fcose',
    quality: 'default',
    randomize: false,
    positions: seedPositions(eles.nodes().map((n) => n.id())),
    animate: false,
    nodeRepulsion: () => opts.repulsion,
    idealEdgeLength: (e) => (opts.sameArc(e)
      ? (opts.sameArcLen ?? 70) + (1 - opts.edgeSim(e)) * 40
      : opts.crossArc),
    edgeElasticity: (e) => (opts.sameArc(e) ? 0.45 * (0.5 + opts.edgeSim(e)) : 0.05),
    gravity: 0.25,
    numIter: 2500,
    packComponents: true,
    fit: false,
    padding: 80,
  })
  await new Promise((res) => { layout.promiseOn('layoutstop', res); layout.run() })
  return performance.now() - t0
}

function countCardOverlaps(cy, scale, cardW = null, cardH = null, filter = null) {
  const nodes = (filter ? cy.nodes().filter(filter) : cy.nodes()).toArray()
  const rects = nodes.map((n) => {
    const s = cardSizeFor(n.data('label'), scale)
    return cardRect(n, cardW ?? s.w, cardH ?? s.h)
  })
  let hits = 0
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (rectsOverlap(rects[i], rects[j])) hits++
  return hits
}

function regionReport(cy, scale) {
  const byRegion = new Map()
  cy.nodes().forEach((n) => {
    const r = regionOf(n.data())
    if (!byRegion.has(r)) byRegion.set(r, [])
    byRegion.get(r).push(n)
  })
  const t0 = performance.now()
  const regions = []
  for (const [name, members] of byRegion) {
    if (members.length < 2) continue
    const cardW = Math.max(...members.map((n) => cardSizeFor(n.data('label'), scale).w))
    const cardH = Math.max(...members.map((n) => cardSizeFor(n.data('label'), scale).h))
    const hull = hullOfCards(members, cardW, cardH, HULL_PAD)
    regions.push({ name, count: members.length, hull, label: hullLabelBox(hull, name, scale) })
  }
  const hullMs = performance.now() - t0
  // Containment purity: no hull encloses a non-member node CENTER.
  let purityViolations = 0
  const all = cy.nodes().toArray()
  for (const reg of regions) {
    const memberIds = new Set(byRegion.get(reg.name).map((n) => n.id()))
    for (const n of all) {
      if (memberIds.has(n.id())) continue
      if (pointInHull(n.position(), reg.hull)) purityViolations++
    }
  }
  // Inter-region hull overlap (sampled vertex containment, both directions).
  let hullOverlaps = 0
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i].hull, b = regions[j].hull
      if (a.some((p) => pointInHull(p, b)) || b.some((p) => pointInHull(p, a))) hullOverlaps++
    }
  // Region label overlaps.
  let labelOverlaps = 0
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++)
      if (rectsOverlap(regions[i].label, regions[j].label)) labelOverlaps++
  return { regions: regions.map((r) => ({ name: r.name, count: r.count, labelBox: r.label })), hullMs: +hullMs.toFixed(1), purityViolations, hullOverlaps, labelOverlaps }
}

// Deterministic post-layout card-separation pass (same family as the
// existing C4 radial declutter): push overlapping card rects apart along the
// least-overlap axis until none overlap or the iteration budget runs out.
export function relaxCards(nodeArr, w, h, pad = 12, maxIter = 500) {
  for (let it = 0; it < maxIter; it++) {
    let moved = 0
    for (let i = 0; i < nodeArr.length; i++) {
      for (let j = i + 1; j < nodeArr.length; j++) {
        const a = nodeArr[i].position(), b = nodeArr[j].position()
        const ox = (w + pad) - Math.abs(a.x - b.x)
        const oy = (h + pad) - Math.abs(a.y - b.y)
        if (ox <= 0 || oy <= 0) continue
        if (ox < oy) { const d = (a.x <= b.x ? -1 : 1) * ox / 2; nodeArr[i].position({ x: a.x + d, y: a.y }); nodeArr[j].position({ x: b.x - d, y: b.y }) }
        else { const d = (a.y <= b.y ? -1 : 1) * oy / 2; nodeArr[i].position({ x: a.x, y: a.y + d }); nodeArr[j].position({ x: b.x, y: b.y - d }) }
        moved++
      }
    }
    if (moved === 0) return { iterations: it, converged: true }
  }
  return { iterations: maxIter, converged: false }
}

function overlapsAmong(nodeArr, w, h) {
  let hits = 0
  for (let i = 0; i < nodeArr.length; i++)
    for (let j = i + 1; j < nodeArr.length; j++) {
      const a = nodeArr[i].position(), b = nodeArr[j].position()
      if (Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h) hits++
    }
  return hits
}

// --- The three tests ---------------------------------------------------------
async function load() {
  const rawNodes = await fetchAll('nodes')
  const rawEdges = await fetchAll('edges')
  const edges = rawEdges.map((e) => ({ ...e, source: e.source_id, target: e.target_id }))
  return { nodes: rawNodes, edges }
}

// Focused subgraph: top hub by degree, depth-2 neighborhood (mirrors
// desktopFocus.js default + the app's hub expansion).
function focusedSubgraph(nodes, edges, depth = 2) {
  const deg = new Map()
  edges.forEach((e) => {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
  })
  const hub = [...deg.entries()].sort((a, b) => b[1] - a[1])[0][0]
  let frontier = new Set([hub])
  const keep = new Set([hub])
  for (let d = 0; d < depth; d++) {
    const next = new Set()
    edges.forEach((e) => {
      if (frontier.has(e.source)) next.add(e.target)
      if (frontier.has(e.target)) next.add(e.source)
    })
    next.forEach((id) => keep.add(id))
    frontier = next
  }
  const fNodes = nodes.filter((n) => keep.has(n.id ?? n.slug))
  const fEdges = edges.filter((e) => keep.has(e.source) && keep.has(e.target))
  return { fNodes, fEdges, hub }
}

async function t1({ nodes, edges }) {
  const out = { test: 'T1 mobile reflow', variants: {} }
  const variants = {
    'A_depth2_card160_shipped-params': { depth: 2, cardW: 160, cardH: 72, repulsion: 12000, crossArc: 320, sameArcLen: null },
    'B_depth2_card160_card-params': { depth: 2, cardW: 160, cardH: 72, repulsion: 30000, crossArc: 480, sameArcLen: 200 },
    'C_depth1_card160_card-params': { depth: 1, cardW: 160, cardH: 72, repulsion: 30000, crossArc: 480, sameArcLen: 200 },
    'D_depth2_card120_card-params': { depth: 2, cardW: 120, cardH: 56, repulsion: 20000, crossArc: 420, sameArcLen: 150 },
  }
  for (const [name, v] of Object.entries(variants)) {
    const { fNodes, fEdges, hub } = focusedSubgraph(nodes, edges, v.depth)
    const { cy, sameArc, edgeSim } = buildCy(fNodes, fEdges, { cardScale: 1, repulsion: v.repulsion, crossArc: v.crossArc, cardW: v.cardW, cardH: v.cardH })
    await runLayout(cy, cy.elements(), { sameArc, edgeSim, repulsion: v.repulsion, crossArc: v.crossArc, sameArcLen: v.sameArcLen })
    const nodeArr = cy.nodes().toArray()
    const overlapsBefore = overlapsAmong(nodeArr, v.cardW, v.cardH)
    const t0 = performance.now()
    const relaxResult = relaxCards(nodeArr, v.cardW, v.cardH)
    const relaxMs = Math.round(performance.now() - t0)
    const overlapsAfter = overlapsAmong(nodeArr, v.cardW, v.cardH)
    const bb = cy.elements().boundingBox()
    const rec = { focusedNodes: fNodes.length, focusedEdges: fEdges.length, hub, overlapsBefore, relax: relaxResult, relaxMs, overlapsAfter }
    for (const view of [{ w: 390, h: 844 }, { w: 360, h: 800 }]) {
      const fz = Math.min(fitZoomFor(bb, view), 3)
      const reg = regionReport(cy, 1)
      const labelsInViewport = reg.regions.filter((r) => {
        const zx = fz, cx = (bb.x1 + bb.x2) / 2, cyy = (bb.y1 + bb.y2) / 2
        const rx1 = (r.labelBox.x1 - cx) * zx + view.w / 2
        const rx2 = (r.labelBox.x2 - cx) * zx + view.w / 2
        const ry1 = (r.labelBox.y1 - cyy) * zx + view.h / 2
        return rx1 >= 0 && rx2 <= view.w && ry1 >= 0
      }).length
      rec[`view_${view.w}`] = {
        fitZoom: +fz.toFixed(3),
        cardRenderedWidth: +(v.cardW * fz).toFixed(1),
        regionCount: reg.regions.length,
        regionLabelsInViewport: labelsInViewport,
        regionLabelOverlaps: reg.labelOverlaps,
      }
    }
    out.variants[name] = rec
  }
  return out
}

async function t2({ nodes, edges }) {
  const { fNodes, fEdges } = focusedSubgraph(nodes, edges)
  const { cy, sameArc, edgeSim } = buildCy(fNodes, fEdges, { cardScale: 2, repulsion: 30000, crossArc: 480 })
  await runLayout(cy, cy.elements(), { sameArc, edgeSim, repulsion: 30000, crossArc: 480, sameArcLen: 200 })
  // (a) fixed-card overflow at 2x
  let overflow = 0
  fNodes.forEach((n) => { if (cardSizeFor(n.label, 2).overflow) overflow++ })
  const bb = cy.elements().boundingBox()
  const reg2 = regionReport(cy, 2)
  const reg1 = regionReport(cy, 1)
  const arr2 = cy.nodes().toArray()
  const w2 = Math.max(...fNodes.map((n) => cardSizeFor(n.label, 2).w))
  const h2 = Math.max(...fNodes.map((n) => cardSizeFor(n.label, 2).h))
  const before2 = overlapsAmong(arr2, w2, h2)
  const t0 = performance.now()
  const rr2 = relaxCards(arr2, w2, h2)
  const relaxMs2 = Math.round(performance.now() - t0)
  return {
    test: 'T2 200% text scaling',
    fixedCardOverflowNodes: overflow,
    fixedCardTotal: fNodes.length,
    autoGrown: {
      maxCard: { w: w2, h: h2 },
      cardOverlaps: before2,
      relax: rr2,
      relaxMs: relaxMs2,
      overlapsAfterRelax: overlapsAmong(arr2, w2, h2),
      fitZoomDesktop1600x900: +fitZoomFor(bb, { w: 1600, h: 900 }).toFixed(3),
      fitZoomMobile390x844: +fitZoomFor(bb, { w: 390, h: 844 }).toFixed(3),
    },
    regionLabelsAt2x: { count: reg2.regions.length, overlaps: reg2.labelOverlaps },
    regionLabelsAt1xForBaseline: { overlaps: reg1.labelOverlaps },
  }
}

async function t3({ nodes, edges }) {
  const out = { test: 'T3 dense/expanded full corpus', nodes: nodes.length, edges: edges.length }
  const { connected, disconnected } = splitByConnectivity(nodes, edges)
  out.connected = connected.length
  out.disconnected = disconnected.length
  for (const params of [
    { name: 'shipped', repulsion: 12000, crossArc: 320, sameArcLen: null },
    { name: 'card-aware', repulsion: 30000, crossArc: 480, sameArcLen: 200 },
    { name: 'card-aware-strong', repulsion: 60000, crossArc: 560, sameArcLen: 240 },
  ]) {
    const { cy, sameArc, edgeSim } = buildCy(nodes, edges, { cardScale: 1, ...params })
    const connectedIds = new Set(connected.map((n) => String(n.id ?? n.slug)))
    const connEles = cy.nodes().filter((n) => connectedIds.has(n.id())).union(cy.edges())
    const ms = await runLayout(cy, connEles, { sameArc, edgeSim, ...params })
    if (disconnected.length > 0) {
      const bb = connEles.nodes().boundingBox()
      const placed = placeDisconnectedBand(
        disconnected.map((n) => ({ id: String(n.id ?? n.slug), arc_id: n.arc_id })),
        // Card-aware band pitch: 48px was calibrated to the old 36px nodes.
        { clusterBox: bb, aspect: 1600 / 900, spacing: 200 },
      )
      placed.forEach((p, id) => cy.getElementById(id).position(p))
    }
    const reg = regionReport(cy, 1)
    const bbAll = cy.elements().boundingBox()
    const inBand = (n) => !connectedIds.has(n.id())
    // Zoom-gated reading model: below the shipped 0.6 label threshold no text
    // renders at all, so compact shapes suffice there; cards only exist at
    // zooms where text is legible. Measure the card regime at the zooms a
    // reader actually uses, centered on the top hub.
    const deg = new Map()
    edges.forEach((e) => { deg.set(e.source, (deg.get(e.source) ?? 0) + 1); deg.set(e.target, (deg.get(e.target) ?? 0) + 1) })
    const hubId = [...deg.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const hp = cy.getElementById(hubId).position()
    const gated = {}
    for (const [vn, vw, vh, z] of [['desktop1600_z3', 1600, 900, 3], ['desktop1600_z2', 1600, 900, 2], ['mobile390_z2', 390, 844, 2], ['mobile390_z1', 390, 844, 1]]) {
      const mw = vw / z, mh = vh / z
      const vis = cy.nodes().filter((n) => { const p = n.position(); return Math.abs(p.x - hp.x) < mw / 2 && Math.abs(p.y - hp.y) < mh / 2 }).toArray()
      const before = overlapsAmong(vis, 160, 72)
      const t0 = performance.now()
      const rr = relaxCards(vis, 160, 72)
      gated[vn] = { zoom: z, visibleNodes: vis.length, overlapsBefore: before, overlapsAfter: overlapsAmong(vis, 160, 72), relax: rr, relaxMs: Math.round(performance.now() - t0) }
    }
    out[params.name] = {
      layoutMs: Math.round(ms),
      cardOverlaps: countCardOverlaps(cy, 1),
      overlapsConnectedOnly: countCardOverlaps(cy, 1, null, null, (n) => connectedIds.has(n.id())),
      overlapsBandOnly: countCardOverlaps(cy, 1, null, null, inBand),
      zoomGatedReading: gated,
      hullMs: reg.hullMs,
      purityViolations: reg.purityViolations,
      interRegionHullOverlaps: reg.hullOverlaps,
      regionLabelOverlaps: reg.labelOverlaps,
      regionSizes: reg.regions.map((r) => `${r.name}:${r.count}`),
      fitZoomDesktop: +fitZoomFor(bbAll, { w: 1600, h: 900 }).toFixed(3),
      fitZoomMobile390: +fitZoomFor(bbAll, { w: 390, h: 844 }).toFixed(3),
      bb: { w: Math.round(bbAll.x2 - bbAll.x1), h: Math.round(bbAll.y2 - bbAll.y1) },
    }
  }
  return out
}

const data = await load()
const which = process.argv[2] ?? 'all'
const results = []
if (which === 't1' || which === 'all') results.push(await t1(data))
if (which === 't2' || which === 'all') results.push(await t2(data))
if (which === 't3' || which === 'all') results.push(await t3(data))
console.log(JSON.stringify(results, null, 2))
