import { useEffect, useMemo, useRef } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { graphStylesheet } from './styles'
import GraphViewControls from './GraphViewControls'
import { cssToken } from './theme'
import { seedPositions } from '../analysis/layoutSeed'
import { splitByConnectivity, placeDisconnectedBand } from './bandPlacement'
import {
  CARD_W,
  CARD_H,
  CARD_ZOOM_MIN,
  MAX_CARDS,
  FOCAL_RELAX_RADIUS_PX,
  REGION_META,
  regionOf,
  cardTypeInfo,
  cardName,
  regionBoundaries,
  collapsedCounts,
  relaxCards,
  separateRegions,
  cardRegime,
} from './cardRegions'

cytoscape.use(fcose)

// G-ALG-1: opt-in deterministic layout. `?layout=deterministic` seeds every
// node with its stable phyllotaxis position (FNV-1a id hash) and runs fCoSE
// with randomize:false, so the same graph renders the same geometry on every
// visit and every machine. Default (flag absent) is byte-for-byte unchanged.
function deterministicLayoutRequested() {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('layout') === 'deterministic'
  )
}

// --- Arc-weighted force helpers (fcose supports function values) ----------

// True when both endpoints carry an arc_id and they match.
function sameArc(edge) {
  const a = edge.source().data('arc_id')
  return a && a === edge.target().data('arc_id')
}

const WEIGHT_SIMILARITY = { heavy: 0.9, medium: 0.6, light: 0.3 }

// Read the existing edge similarity (0..1); fall back to the weight bucket.
function edgeSim(edge) {
  const s = Number(edge.data('similarity'))
  if (Number.isFinite(s)) return Math.min(Math.max(s, 0), 1)
  return WEIGHT_SIMILARITY[edge.data('weight')] ?? WEIGHT_SIMILARITY.medium
}

// Same-arc edges are pulled short (shorter for higher similarity);
// cross-arc edges are held long so arcs separate into clusters.
function idealEdgeLength(edge) {
  const sim = edgeSim(edge)
  return sameArc(edge) ? 70 + (1 - sim) * 40 : 320
}

// Strong springs inside an arc, weak springs across arcs. Cross-arc
// separation comes from nodeRepulsion acting on distant endpoints.
function edgeElasticity(edge) {
  const sim = edgeSim(edge)
  return sameArc(edge) ? 0.45 * (0.5 + sim) : 0.05
}

// Shared fcose options. `firstRun` randomizes positions and runs the full
// iteration budget; reheat runs (post-drag) keep current positions and fit.
// `positions` (G-ALG-1, only ever passed under ?layout=deterministic) pins
// the seed geometry and forces randomize:false.
function fcoseOptions({ firstRun, positions }) {
  return {
    name: 'fcose',
    quality: 'default',
    randomize: positions ? false : firstRun,
    ...(positions ? { positions } : {}),
    animate: true,
    animationDuration: firstRun ? 800 : 600,
    nodeRepulsion: () => 12000,
    idealEdgeLength,
    edgeElasticity,
    gravity: 0.25,
    numIter: firstRun ? 2500 : 1200,
    packComponents: true,
    fit: firstRun,
    padding: 80,
  }
}

// --- Pass C C3: background grid -------------------------------------------
// Thin graph-paper lines fixed to the CANVAS coordinate space: drawn on a
// synced <canvas> under the cytoscape layers, redrawn from pan/zoom so the
// grid pans and zooms with the graph rather than the viewport.
const GRID_SPACING = 48 // model px between lines

function drawGrid(canvas, cy) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const zoom = cy.zoom()
  const pan = cy.pan()
  const step = GRID_SPACING * zoom
  if (step < 8) return // too dense to read; fade out at far zoom
  ctx.strokeStyle = cssToken(
    '--graph-grid',
    'rgba(26, 26, 23, 0.08)', // light-canvas fallback; dark token overrides
  )
  ctx.lineWidth = 1
  ctx.beginPath()
  // First grid line at/left-of the viewport's left edge, in screen space.
  const x0 = ((pan.x % step) + step) % step
  for (let x = x0; x <= w; x += step) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  const y0 = ((pan.y % step) + step) % step
  for (let y = y0; y <= h; y += step) {
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  ctx.stroke()
}

// --- Pass C C4: radial label declutter ------------------------------------
// Additive local perturbation on top of fcose — NOT a re-layout. When the
// user zooms/pans toward a focal node (labeled node nearest the viewport
// center), labeled neighbors whose label boxes collide with the focal label
// are pushed radially outward just enough to clear the collision; strength
// scales with proximity. Everything eases (260ms) and eases back on
// zoom-out/pan-away. Honors prefers-reduced-motion.
const DECLUTTER_RADIUS_PX = 320 // rendered-px search radius around focus
const DECLUTTER_DURATION = 260

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function labelBox(node) {
  // Rendered bounding box of just the label text.
  return node.renderedBoundingBox({ includeLabels: true, includeNodes: false })
}

function boxesOverlap(a, b, pad = 4) {
  return !(
    a.x2 + pad < b.x1 ||
    b.x2 + pad < a.x1 ||
    a.y2 + pad < b.y1 ||
    b.y2 + pad < a.y1
  )
}

export default function GraphView({
  nodes,
  edges,
  onSelect,
  panelOpen,
  // Step 7: reliability threshold (1–4, 1 = show all) + hypothesis toggle.
  minReliability = 1,
  showInferred = false,
  // Step 7: edge tap → evidence popover.
  onEdgeSelect,
  // Fade the view controls while a mobile bottom sheet is open.
  controlsDimmed = false,
  // Mobile uses the hub list/search and tap panels as its readable graph
  // navigation. Inline relationship labels remain desktop-only; at 390px the
  // focused node is the only allowed detail card, never a field of overlapping
  // boxes.
  isMobile = false,
  // On mobile, the selected hub becomes the sole eligible detail card; null
  // leaves a full graph as compact shapes only.
  focusNodeId = null,
  // Step 2b: full-corpus node list (for region "+N" collapsed counts) and
  // whether this render is a focused view (region boundaries are
  // focused-view-only, owner-ruled adjustment 4).
  allNodes = null,
  focused = false,
}) {
  const containerRef = useRef(null)
  const gridRef = useRef(null)
  const regionCanvasRef = useRef(null)
  const cardsLayerRef = useRef(null)
  const regionLabelLayerRef = useRef(null)
  const bandLabelRef = useRef(null)
  const cyRef = useRef(null)
  // Item 2: Reset button re-runs the initial layout (assigned in effect).
  const resetLayoutRef = useRef(null)

  useEffect(() => {
    // Track B Step 2: zero-edge (fully disconnected) nodes are NOT part of
    // the fcose element set — they would otherwise be component-packed into
    // the connected cluster and read as noise. fcose lays out the connected
    // nodes only; singletons are then placed deterministically in a
    // peripheral band (positional grouping only, no fabricated edges).
    const { connected, disconnected } = splitByConnectivity(nodes, edges)
    const runBand = disconnected.length > 0 && connected.length > 0
    const connectedIds = new Set(connected.map((n) => String(n.id ?? n.slug)))
    const bandIds = disconnected.map((n) => ({ id: String(n.id ?? n.slug), arc_id: n.arc_id }))

    const cy = cytoscape({
      container: containerRef.current,
      style: graphStylesheet,
      elements: {
        nodes: nodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })),
        // `inferred` flags MIP_inferred hypothesis edges for the stylesheet
        // (dashed, no arrow, "hypothesis" label).
        edges: edges.map((e) => ({
          data: { ...e, inferred: e.claimed_by === 'MIP_inferred' },
        })),
      },
      // With a band, the constructor layout is a no-op preset; fcose runs
      // manually on the connected collection below.
      layout: runBand
        ? { name: 'preset' }
        : {
            ...fcoseOptions({
              firstRun: true,
              positions: deterministicLayoutRequested()
                ? seedPositions(nodes.map((n) => String(n.id ?? n.slug)))
                : undefined,
            }),
            // fit:false here — fcose's own end-fit fires before the
            // simulation has fully settled, so it fits the pre-settle
            // positions and leaves the settled graph outside the viewport
            // (focused subgraphs rendered at zoom ~2.5-2.9, mostly
            // off-canvas). The one-shot layoutstop handler below fits the
            // settled graph instead (mirrors the band path's own fit).
            fit: false,
          },
      minZoom: 0.2,
      maxZoom: 3,
      // Tier 5: cytoscape never sees wheel events (they are intercepted in
      // capture phase below and normalized per input device), so the single
      // wheelSensitivity knob is no longer what governs wheel zoom.
      wheelSensitivity: 1,
    })

    // --- Tier 5: device-normalized wheel zoom ---
    // A single sensitivity cannot serve all three wheel sources: a standard
    // mouse emits large discrete notches, a trackpad two-finger scroll emits
    // a stream of tiny pixel deltas, and a trackpad pinch emits ctrl+wheel.
    // Treating them identically is jumpy on trackpads and sluggish on mice.
    // The capture-phase handler below stops the event before cytoscape's own
    // wheel listener and applies a device-appropriate, cursor-centered step.
    // Touch pinch is unaffected — touch gestures produce no wheel events.
    const graphContainer = containerRef.current
    const onWheelZoom = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (cy.destroyed()) return
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY // lines -> px
      let factor
      if (e.ctrlKey) {
        // Trackpad pinch: rapid small ctrl+wheel stream.
        factor = Math.exp(-delta * 0.008)
      } else if (Math.abs(delta) >= 50) {
        // Standard mouse notch: one fixed, predictable step per notch.
        factor = delta < 0 ? 1.2 : 1 / 1.2
      } else {
        // Trackpad two-finger scroll: proportional, damped.
        factor = Math.exp(-delta * 0.0028)
      }
      const rect = graphContainer.getBoundingClientRect()
      cy.zoom({
        level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
        renderedPosition: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      })
    }
    graphContainer.addEventListener('wheel', onWheelZoom, { passive: false, capture: true })

    // --- Track B Step 2: fcose on connected nodes; singleton band after ---
    // The band-placement layoutstop handler is registered BEFORE the
    // declutter section's captureRest handler, so rest positions are
    // captured only after band positions are set (never mid-flight).
    // Item 3: without a band, fit once when the initial layout settles
    // (constructor fcose runs with fit:false; see above). One-shot, so
    // later drag-reheat layoutstops never yank the user's viewport.
    if (!runBand) {
      cy.one('layoutstop', () => {
        if (!cy.destroyed()) cy.fit(undefined, 80)
      })
    }
    const updateBandLabel = () => {
      const el = bandLabelRef.current
      if (!el) return
      if (!runBand) {
        el.style.display = 'none'
        return
      }
      // Anchor the label above the band's top-left node, in rendered px.
      let minX = Infinity
      let minY = Infinity
      cy.nodes().forEach((n) => {
        if (connectedIds.has(n.id())) return
        const p = n.position()
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
      })
      if (!Number.isFinite(minX)) {
        el.style.display = 'none'
        return
      }
      const zoom = cy.zoom()
      const pan = cy.pan()
      el.style.display = 'block'
      el.style.transform = `translate(${minX * zoom + pan.x}px, ${minY * zoom + pan.y - 34}px)`
    }

    if (runBand) {
      const connEles = cy
        .nodes()
        .filter((n) => connectedIds.has(n.id()))
        .union(cy.edges())
      // fit:false here — the layout's own end-of-run fit would only cover
      // connEles and would override the full fit (cluster + band) that the
      // layoutstop handler performs after band placement.
      const connOpts = {
        ...fcoseOptions({
          firstRun: true,
          positions: deterministicLayoutRequested()
            ? seedPositions(connected.map((n) => String(n.id ?? n.slug)))
            : undefined,
        }),
        fit: false,
      }
      cy.one('layoutstop', () => {
        const bb = cy
          .nodes()
          .filter((n) => connectedIds.has(n.id()))
          .boundingBox()
        const aspect = cy.width() / Math.max(1, cy.height())
        // Cap the band's span so the full graph (cluster + gap + band)
        // still fits when the fit-zoom clamps at minZoom. Landscape caps
        // band height; portrait caps band width.
        const minZoom = cy.minZoom()
        const maxRows = Math.floor(
          (cy.height() / minZoom - (bb.y2 - bb.y1) - 220) / 48,
        )
        const maxCols = Math.floor(
          (cy.width() / minZoom - (bb.x2 - bb.x1) - 220) / 48,
        )
        const placed = placeDisconnectedBand(bandIds, {
          clusterBox: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2, w: bb.w, h: bb.h },
          aspect,
          maxRows,
          maxCols,
        })
        placed.forEach((p, id) => {
          const node = cy.getElementById(id)
          if (node.nonempty()) node.position(p)
        })
        updateBandLabel()
        cy.fit(undefined, 80)
      })
      connEles.layout(connOpts).run()
    }
    cy.on('zoom pan resize', updateBandLabel)

    // --- C3: grid layer, synced to viewport changes ---
    const gridCanvas = gridRef.current
    const redrawGrid = () => {
      if (gridCanvas) drawGrid(gridCanvas, cy)
    }
    cy.on('zoom pan resize', redrawGrid)
    cy.on('layoutstop', redrawGrid)

    // --- Label policy by zoom level ---
    // < 0.6x: no labels. 0.6-1.2x: top-N nodes by degree centrality only.
    // > 1.2x: all nodes and edges. A tapped node keeps its label at any zoom.
    const LABEL_HUB_COUNT = 20
    const topHubs = cy
      .nodes()
      .sort((a, b) => b.degree(false) - a.degree(false))
      .slice(0, LABEL_HUB_COUNT)
    const manualLabels = new Set()
    // Mobile keeps at most one explicit detail target. The active node is the
    // only permitted card; every surrounding node stays a compact shape so
    // mobile boxes can never overlap.
    let mobileActiveNodeId = isMobile ? focusNodeId : null

    const applyLabels = () => {
      const z = cy.zoom()
      cy.elements().removeClass('lbl')
      // Step 2b: cards engage only in FOCUSED views (owner-ruled adjustments
      // 2+4). The full-corpus opt-in keeps the shipped label policy at every
      // zoom — compact shapes, hub labels 0.6-1.2x, all labels above 1.2x.
      // A 390px canvas cannot support persistent relationship labels or a
      // field of DOM cards without collisions. Mobile begins with the named
      // hub list and retains search, node taps, the relationship list, and
      // evidence panels. Only the one node the reader selected may show a
      // card; all surrounding nodes remain compact at every zoom.
      const cardMode = focused && !isMobile && z >= CARD_ZOOM_MIN
      if (isMobile) {
        if (mobileActiveNodeId) {
          const n = cy.getElementById(mobileActiveNodeId)
          if (n.nonempty()) n.addClass('lbl')
        }
        return
      }
      if (cardMode) {
        // DOM cards carry node text; canvas node labels stay off so text
        // never double-renders. Edges keep their shipped 1.2x gating.
        if (z >= 1.2) cy.edges().addClass('lbl')
      } else if (z >= 1.2) {
        cy.elements().addClass('lbl')
      } else if (z >= 0.6) {
        topHubs.forEach((n) => n.addClass('lbl'))
      }
      manualLabels.forEach((id) => {
        if (cardMode) return // card zoom in a focused view: card carries it
        const n = cy.getElementById(id)
        if (n.nonempty()) n.addClass('lbl')
      })
    }
    cy.one('layoutstop', applyLabels)
    cy.on('zoom', applyLabels)
    cy.on('tap', 'node', (evt) => {
      manualLabels.add(evt.target.id())
      mobileActiveNodeId = evt.target.id()
      applyLabels()
    })

    // --- C4: radial label declutter ---
    // Rest positions are the fcose output (captured after every layout
    // settle); displacement targets are offsets from those positions.
    const restPositions = new Map() // id -> {x, y}
    const displaced = new Set() // ids currently pushed out
    const captureRest = () => {
      restPositions.clear()
      cy.nodes().forEach((n) => {
        restPositions.set(n.id(), { ...n.position() })
      })
    }
    cy.on('layoutstop', captureRest)

    const restoreNode = (node) => {
      const rest = restPositions.get(node.id())
      if (!rest) return
      displaced.delete(node.id())
      if (prefersReducedMotion()) {
        node.position(rest)
      } else {
        node.animate({ position: rest }, { duration: DECLUTTER_DURATION, easing: 'ease-out' })
      }
    }

    const declutter = () => {
      const labeled = cy.nodes('.lbl')
      if (labeled.length === 0) return
      // Focal node: labeled node nearest the viewport center.
      const cw = cy.width()
      const ch = cy.height()
      const cx = cw / 2
      const cyC = ch / 2
      let focal = null
      let focalDist = Infinity
      labeled.forEach((n) => {
        const rp = n.renderedPosition()
        const d = Math.hypot(rp.x - cx, rp.y - cyC)
        if (d < focalDist) {
          focalDist = d
          focal = n
        }
      })
      if (!focal || focalDist > DECLUTTER_RADIUS_PX) {
        // Panned/zoomed away from any labeled node: everyone eases home.
        displaced.forEach((id) => {
          const n = cy.getElementById(id)
          if (n.nonempty()) restoreNode(n)
        })
        return
      }
      const focalBox = labelBox(focal)
      const focalRest = restPositions.get(focal.id()) ?? focal.position()
      const zoom = cy.zoom()
      const keep = new Set([focal.id()])
      labeled.forEach((n) => {
        if (n.id() === focal.id()) return
        const rp = n.renderedPosition()
        const frp = focal.renderedPosition()
        const dist = Math.hypot(rp.x - frp.x, rp.y - frp.y)
        if (dist > DECLUTTER_RADIUS_PX) return // outside the radius: untouched
        if (!boxesOverlap(focalBox, labelBox(n))) return
        // Overlapping neighbor: push radially away from the focal node's
        // REST position; closer nodes move more.
        const rest = restPositions.get(n.id()) ?? n.position()
        let dx = rest.x - focalRest.x
        let dy = rest.y - focalRest.y
        const len = Math.hypot(dx, dy)
        if (len < 1e-3) {
          dx = 1
          dy = 0
        } else {
          dx /= len
          dy /= len
        }
        const proximity = 1 - dist / DECLUTTER_RADIUS_PX // 0..1, closer = more
        // §2.7: stronger repulsion so labels don't pile up at high zoom —
        // roughly 2.4x the previous push, still distance-scaled.
        const push = (120 + 260 * proximity) / zoom // model px
        const target = { x: rest.x + dx * push, y: rest.y + dy * push }
        keep.add(n.id())
        displaced.add(n.id())
        if (prefersReducedMotion()) {
          n.position(target)
        } else {
          n.animate({ position: target }, { duration: DECLUTTER_DURATION, easing: 'ease-out' })
        }
      })
      // Anything displaced last pass that no longer collides eases back.
      ;[...displaced].forEach((id) => {
        if (keep.has(id)) return
        const n = cy.getElementById(id)
        if (n.nonempty()) restoreNode(n)
      })
    }

    let declutterTimer = null
    const scheduleDeclutter = () => {
      clearTimeout(declutterTimer)
      declutterTimer = setTimeout(declutter, 140)
    }
    cy.on('zoom pan', scheduleDeclutter)
    cy.on('layoutstop', scheduleDeclutter)

    // --- Step 2b: DOM card layer + dashed region boundaries ---------------
    // Cards and region labels are DOM (owner-ruled adjustment 1): browser
    // text scaling applies natively, which canvas text cannot do. Boundary
    // dashes are drawn on a canvas UNDER the cytoscape canvas (same layer as
    // the grid), so a boundary can never obscure an edge (adjustment: edges
    // take priority). Boundaries render in focused views only (adjustment 4).
    const TYPE_ICONS = {
      diamond: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
      document: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 1.5 h6.5 l2.5 2.5 v10.5 h-9 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1.5 v2.5 h2.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
      octagon: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 1.5 h6 L14.5 5 v6 L11 14.5 H5 L1.5 11 V5 Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
      circle: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="5.4" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.8 14.2 c0.6-3 2.8-4.4 5.2-4.4 s4.6 1.4 5.2 4.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    }

    const cardEls = new Map() // node id -> card div (reused across frames)

    const clearCards = () => {
      cardEls.forEach((el) => el.remove())
      cardEls.clear()
    }

    const buildCard = (node) => {
      const d = node.data()
      const info = cardTypeInfo(d)
      const el = document.createElement('div')
      el.className = 'graph-card'
      el.dataset.nodeId = node.id()
      // Visual duplicate of the canvas node; the EdgeList table is the
      // nonvisual equivalent (02B acceptance), so the card is aria-hidden.
      el.setAttribute('aria-hidden', 'true')
      const date = d.occurred_at ? String(d.occurred_at).slice(0, 10) : ''
      el.innerHTML =
        `<span class="graph-card-icon">${TYPE_ICONS[info.icon] ?? TYPE_ICONS.document}</span>` +
        `<span class="graph-card-name"></span>` +
        (date ? `<span class="graph-card-date"></span>` : '') +
        `<span class="graph-card-type"></span>`
      el.querySelector('.graph-card-name').textContent = cardName(d.label)
      if (date) el.querySelector('.graph-card-date').textContent = date
      el.querySelector('.graph-card-type').textContent = info.typeLabel
      el.addEventListener('click', () => {
        if (cy.destroyed()) return
        if (onEdgeSelect) onEdgeSelect(null)
        node.select()
        if (onSelect) onSelect(node.data())
      })
      return el
    }

    const drawRegions = () => {
      const canvas = regionCanvasRef.current
      const labelLayer = regionLabelLayerRef.current
      if (!canvas || !labelLayer) return
      const ctx = canvas.getContext('2d')
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      labelLayer.textContent = ''
      if (!focused) return // adjustment 4: focused views only
      const zoom = cy.zoom()
      const pan = cy.pan()
      const members = []
      cy.nodes().forEach((n) => {
        const region = regionOf(n.data())
        if (!region) return
        const p = n.position()
        members.push({ id: n.id(), x: p.x, y: p.y, region })
      })
      const shownIds = new Set(members.map((m) => m.id))
      const collapsed = collapsedCounts(allNodes ?? nodes, shownIds)
      const regions = regionBoundaries(members)
      for (const r of regions) {
        const meta = REGION_META[r.region]
        if (!meta) continue
        const color = cssToken(meta.cssVar, meta.color)
        // Dashed, thin, no fill — dashes + label carry the region with all
        // accent color removed (universal design test).
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 5])
        ctx.beginPath()
        r.points.forEach((p, i) => {
          const x = p.x * zoom + pan.x
          const y = p.y * zoom + pan.y
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.stroke()
        ctx.setLineDash([])
        // Region label — always visible, DOM so text scaling applies.
        const label = document.createElement('div')
        label.className = 'graph-region-label'
        label.textContent = meta.label
        label.style.transform = `translate(${r.labelAnchor.x * zoom + pan.x}px, ${r.labelAnchor.y * zoom + pan.y - 22}px)`
        labelLayer.appendChild(label)
        // "+N" badge at the region's top-right for collapsed members.
        const hidden = collapsed.get(r.region) ?? 0
        if (hidden > 0) {
          const maxX = Math.max(...r.points.map((p) => p.x))
          const minY = Math.min(...r.points.map((p) => p.y))
          const badge = document.createElement('div')
          badge.className = 'graph-region-badge'
          badge.textContent = `+${hidden}`
          badge.title = `${hidden} more ${meta.label} nodes not shown in this focused view`
          // Right of the top-right vertex, vertically centered on the hull
          // edge — never collides with the top-left region label, even on
          // narrow hulls.
          badge.style.transform = `translate(${maxX * zoom + pan.x + 8}px, ${minY * zoom + pan.y - 10}px)`
          labelLayer.appendChild(badge)
        }
      }
    }

    const updateCards = () => {
      const layer = cardsLayerRef.current
      if (!layer) return
      const z = cy.zoom()
      const { regime } = cardRegime(z)
      const mobileFocusCard = isMobile && focused && mobileActiveNodeId != null
      if (!focused || (isMobile ? !mobileFocusCard : regime !== 'cards')) {
        if (cardEls.size > 0) clearCards()
        return
      }
      const cw = cy.width()
      const ch = cy.height()
      const pad = 60 // rendered-px margin so cards entering the viewport don't pop
      const pan = cy.pan()
      const visible = []
      cy.nodes().forEach((n) => {
        const rp = n.renderedPosition()
        if (rp.x < -pad || rp.x > cw + pad || rp.y < -pad || rp.y > ch + pad) return
        visible.push(n)
      })
      // Safety cap: beyond MAX_CARDS the densest nodes by degree keep cards;
      // the rest stay compact shapes (their text is unreadable at that
      // density anyway — the relationship list remains the full equivalent).
      visible.sort((a, b) => b.degree(false) - a.degree(false))
      const active = mobileFocusCard ? cy.getElementById(mobileActiveNodeId) : null
      const carded =
        active?.nonempty()
          ? [active]
          : visible.slice(0, MAX_CARDS)
      const keep = new Set(carded.map((n) => n.id()))
      cardEls.forEach((el, id) => {
        if (!keep.has(id)) {
          el.remove()
          cardEls.delete(id)
        }
      })
      for (const n of carded) {
        let el = cardEls.get(n.id())
        if (!el) {
          el = buildCard(n)
          cardEls.set(n.id(), el)
          layer.appendChild(el)
        }
        const rp = n.renderedPosition()
        const cardScale = isMobile ? 1 : Math.min(z, 1.6)
        el.style.transform = `translate(${rp.x}px, ${rp.y}px) translate(-50%, -50%) scale(${cardScale})`
        el.classList.toggle('selected', n.selected())
        // Defensive mobile gate: only the declared focus node may remain
        // visible as a card. The CSS rule backs this up across asynchronous
        // layout/zoom frames, so stale neighbors cannot overlap it.
        el.classList.toggle('mobile-active', isMobile && n.id() === mobileActiveNodeId)
      }
    }

    // relaxCards wiring (adjustment 3): on settle, separate the carded set;
    // on pan/zoom, debounced, scoped to visible cards — focal-scoped at
    // max-zoom hub views where the visible set can still be hundreds.
    const runRelax = () => {
      const z = cy.zoom()
      const { regime, relaxScope } = cardRegime(z)
      if (!focused || isMobile || regime !== 'cards' || relaxScope === 'none') return
      const cw = cy.width()
      const ch = cy.height()
      const cx = cw / 2
      const cyC = ch / 2
      let scope = []
      cy.nodes().forEach((n) => {
        const rp = n.renderedPosition()
        if (relaxScope === 'focal') {
          if (Math.hypot(rp.x - cx, rp.y - cyC) > FOCAL_RELAX_RADIUS_PX) return
        } else {
          const pad = 60
          if (rp.x < -pad || rp.x > cw + pad || rp.y < -pad || rp.y > ch + pad) return
        }
        scope.push(n)
      })
      if (scope.length > MAX_CARDS) scope = scope.sort((a, b) => b.degree(false) - a.degree(false)).slice(0, MAX_CARDS)
      if (scope.length < 2) return
      separateVisible(scope)
    }

    // Card separation, then inter-region separation (hull purity), then a
    // final card pass — region nudges can re-open card overlaps.
    const separateVisible = (scope) => {
      relaxCards(scope)
      separateRegions(scope)
      relaxCards(scope)
      updateCards()
      drawRegions()
    }

    // Region boundaries need pure geometry at EVERY zoom, not just card
    // zooms — so in focused views the separation pass runs at layout settle
    // regardless of the card regime (cards themselves stay zoom-gated).
    const runSettleSeparation = () => {
      if (!focused || isMobile) return
      let scope = cy.nodes().toArray()
      if (scope.length > MAX_CARDS) {
        scope = scope.sort((a, b) => b.degree(false) - a.degree(false)).slice(0, MAX_CARDS)
      }
      if (scope.length < 2) return
      separateVisible(scope)
    }

    let relaxTimer = null
    const scheduleRelax = () => {
      clearTimeout(relaxTimer)
      relaxTimer = setTimeout(runRelax, 140)
    }

    const updateOverlays = () => {
      updateCards()
      drawRegions()
      applyLabels()
    }
    cy.on('zoom pan resize', updateOverlays)
    cy.on('zoom pan', scheduleRelax)
    cy.on('layoutstop', () => {
      updateOverlays()
      runSettleSeparation()
    })
    cy.on('select unselect', 'node', updateCards)


    if (onSelect) {
      // Node taps select the node; edge taps are routed to the docked
      // relationship panel (item 5) instead of the article panel.
      cy.on('tap', 'node', (evt) => {
        if (onEdgeSelect) onEdgeSelect(null)
        onSelect(evt.target.data())
      })
      cy.on('tap', 'edge', (evt) => {
        if (onEdgeSelect) {
          const e = evt.target
          const mid = e.midpoint()
          const pan = cy.pan()
          const zoom = cy.zoom()
          onEdgeSelect({
            edge: e.data(),
            position: {
              x: mid.x * zoom + pan.x,
              y: mid.y * zoom + pan.y,
            },
          })
        }
      })
      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          if (onEdgeSelect) onEdgeSelect(null)
          onSelect(null)
        }
      })
    }

    // Hover focus (concept doc §4.2): hovering a node brings its edges to
    // full opacity and fades everything else.
    cy.on('mouseover', 'node', (evt) => {
      const neighborhood = evt.target.closedNeighborhood()
      cy.elements().not(neighborhood).addClass('dimmed')
      neighborhood.connectedEdges().addClass('highlighted')
    })
    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('dimmed highlighted')
    })

    // Drag perturbs, never pins: when a node is released, reheat the
    // simulation from current positions so the graph settles again.
    // Nodes are never locked (no node.lock(), no autolock).
    // Band singletons are excluded from reheats the same way they are
    // excluded from the first layout (they are not in connEles), so a
    // drag can never scatter the band.
    cy.on('dragfree', 'node', () => {
      const eles = runBand
        ? cy
            .nodes()
            .filter((n) => connectedIds.has(n.id()))
            .union(cy.edges())
        : cy.elements()
      eles.layout(fcoseOptions({ firstRun: false })).run()
    })

    // §4.4: the article panel shrinks the canvas container (flex), so the
    // cytoscape instance must be told its size changed — otherwise it keeps
    // rendering at the stale extent and the graph looks covered/shifted.
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            cy.resize()
            redrawGrid()
          })
        : null
    resizeObserver?.observe(containerRef.current)

    // Item 2: plain Reset control — re-run the initial layout on the same
    // element set the constructor used (connected set when a band exists),
    // then fit. Band singletons re-place via the layoutstop handler above.
    resetLayoutRef.current = () => {
      if (cy.destroyed()) return
      const eles = runBand
        ? cy
            .nodes()
            .filter((n) => connectedIds.has(n.id()))
            .union(cy.edges())
        : cy.elements()
      eles
        .layout({
          ...fcoseOptions({
            firstRun: true,
            positions: deterministicLayoutRequested()
              ? seedPositions(
                  (runBand ? connected : nodes).map((n) => String(n.id ?? n.slug)),
                )
              : undefined,
          }),
          // Non-band: fit on settle (one-shot), same as the initial layout.
          fit: runBand,
        })
        .run()
      if (!runBand) {
        cy.one('layoutstop', () => {
          if (!cy.destroyed()) cy.fit(undefined, 80)
        })
      }
    }

    redrawGrid()
    cyRef.current = cy
    return () => {
      resetLayoutRef.current = null
      graphContainer.removeEventListener('wheel', onWheelZoom, { capture: true })
      clearTimeout(declutterTimer)
      clearTimeout(relaxTimer)
      clearCards()
      resizeObserver?.disconnect()
      cy.destroy()
    }
  }, [nodes, edges, onSelect, isMobile, focusNodeId])

  // Step 7 (§6): reliability + hypothesis filtering. Toggling classes on
  // the existing instance avoids a full re-layout; edges with no
  // reliability value always pass. Nodes left fully isolated by the
  // filter stay on the canvas but dim (keeps context visible).
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return
    cy.edges().forEach((e) => {
      const rel = Number(e.data('reliability'))
      const below = Number.isFinite(rel) && rel < minReliability
      const inferredOff = e.data('inferred') && !showInferred
      e.toggleClass('edge-hidden', below || inferredOff)
    })
    cy.nodes().forEach((n) => {
      const total = n.degree(false)
      if (total === 0) {
        n.removeClass('isolated-dim')
        return
      }
      const visible = n
        .connectedEdges()
        .filter((e) => !e.hasClass('edge-hidden')).length
      n.toggleClass('isolated-dim', visible === 0)
    })
  }, [minReliability, showInferred, nodes, edges])

  // Panel open/close: after the container settles at its new width, refit
  // the graph into the remaining viewport so nothing sits under the panel.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return
    const timer = setTimeout(() => {
      cy.resize()
      cy.animate(
        { fit: { eles: cy.elements(), padding: 80 } },
        { duration: prefersReducedMotion() ? 0 : 300, easing: 'ease-out' },
      )
    }, 60)
    return () => clearTimeout(timer)
  }, [panelOpen])

  // Tier 5: keyboard zoom. The canvas is tab-focusable; +/− zoom around the
  // viewport center and 0 fits the graph (the GraphViewControls +/−/Fit
  // buttons remain the on-screen keyboard-operable equivalents).
  const onGraphKeyDown = (e) => {
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return
    const { width, height } = cy.container().getBoundingClientRect()
    const center = { x: width / 2, y: height / 2 }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      cy.zoom({ level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * 1.2)), renderedPosition: center })
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      cy.zoom({ level: Math.max(cy.minZoom(), cy.zoom() / 1.2), renderedPosition: center })
    } else if (e.key === '0') {
      e.preventDefault()
      cy.fit(undefined, 80)
    }
  }

  // Count for the band label text (the effect owns actual placement).
  const disconnectedCount = useMemo(
    () => splitByConnectivity(nodes, edges).disconnected.length,
    [nodes, edges],
  )

  // Package 3 item 19: an isolated focus is evidence state, not a visual
  // failure. The reader is told plainly that no documented relationships are
  // present and is directed to the node inspector where attached articles and
  // node-level source records are shown. No edge is inferred to fill the gap.
  const isolatedFocusNode = useMemo(() => {
    if (!focusNodeId) return null
    const node = nodes.find((n) => String(n.id ?? n.slug) === String(focusNodeId))
    if (!node) return null
    const nodeKey = node.id ?? node.slug
    return edges.some((edge) => edge.source === nodeKey || edge.target === nodeKey) ? null : node
  }, [focusNodeId, nodes, edges])

  return (
    <div className="graph-canvas-wrap">
      <canvas ref={gridRef} className="graph-grid" aria-hidden="true" />
      <canvas ref={regionCanvasRef} className="graph-regions" aria-hidden="true" />
      <div
        ref={containerRef}
        className="graph-canvas"
        tabIndex={0}
        role="application"
        aria-label="Knowledge graph canvas. Plus and minus keys zoom, zero fits the graph."
        onKeyDown={onGraphKeyDown}
      />
      <div ref={regionLabelLayerRef} className="graph-region-labels" aria-hidden="true" />
      <div ref={cardsLayerRef} className="graph-cards" aria-hidden="true" />
      <div
        ref={bandLabelRef}
        className="graph-band-label"
        style={{ display: 'none' }}
        aria-hidden="true"
      >
        No documented connections ({disconnectedCount})
      </div>
      {isolatedFocusNode && (
        <aside className="graph-isolated-reader" aria-live="polite" aria-label="Isolated node evidence state">
          <strong>{isolatedFocusNode.label}</strong>
          <p>No documented relationships are recorded for this node.</p>
          <p>Attached articles and node-level source records remain available without inferring a connection.</p>
          <button type="button" onClick={() => onSelect?.(isolatedFocusNode)}>
            Open node evidence
          </button>
        </aside>
      )}
      <GraphViewControls
        cyRef={cyRef}
        onReset={() => resetLayoutRef.current?.()}
        dimmed={controlsDimmed}
      />
    </div>
  )
}
