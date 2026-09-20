import {
  NODE_TYPES,
  EDGE_TYPES,
  EDGE_WEIGHTS,
  DEFAULT_NODE_SHAPE,
  cssToken,
  typeColor,
  edgePlainLabel,
} from './theme'

// Track B Step 2 item 2 (2026-08-17): light-canvas vocabulary.
// Node FILL is white (--bg-panel) — the arc-fill encoding is retired.
// Meaning now rides on: node BORDER color + silhouette = node type;
// edges are neutral grey by default and take their relationship-type
// color only while selected/hover-highlighted. Colors resolve from the
// CSS tokens at draw time (Pass C C1) with the hexes as fallback.
const FALLBACK_NODE_COLOR = '#6e6e66'
const FALLBACK_EDGE_COLOR = '#6e6e66'

// Neutral default edge color; the type color appears on selection only.
function neutralEdgeColor() {
  return cssToken('--cat-grey', FALLBACK_EDGE_COLOR)
}

// Node size scales with connection count: 36px base + 8px per connected
// edge, capped so hubs don't swallow the canvas.
function nodeSize(ele) {
  return Math.min(36 + ele.degree(false) * 8, 110)
}

function nodeFill() {
  return cssToken('--bg-panel', '#ffffff')
}

function nodeColor(ele) {
  const meta = NODE_TYPES[ele.data('type')]
  return meta ? typeColor(meta) : FALLBACK_NODE_COLOR
}

// Step 6 (§4): silhouette keyed off node type — events stay octagons,
// actors round-rectangles, topics barrels, policies diamonds.
function nodeShape(ele) {
  return NODE_TYPES[ele.data('type')]?.shape ?? DEFAULT_NODE_SHAPE
}

function edgeColor(ele) {
  const meta = EDGE_TYPES[ele.data('type')]
  return meta ? typeColor(meta) : FALLBACK_EDGE_COLOR
}

function edgeWidth(ele) {
  return EDGE_WEIGHTS[ele.data('weight')] ?? EDGE_WEIGHTS.medium
}

// §2.7: cap node labels at 40 chars with an ellipsis — full headlines
// never fit on the canvas. The untruncated label stays on the node data
// and is shown in full in the Article Panel.
const LABEL_MAX_CHARS = 40

function nodeLabel(ele) {
  const label = String(ele.data('label') ?? '')
  return label.length > LABEL_MAX_CHARS
    ? `${label.slice(0, LABEL_MAX_CHARS).trimEnd()}…`
    : label
}

export const graphStylesheet = [
  {
    selector: 'node',
    style: {
      shape: nodeShape,
      width: nodeSize,
      height: nodeSize,
      'background-color': nodeFill,
      // C2: octagon borders are the graph's primary visual vocabulary —
      // thicker so they read before zooming in. Border color = node type.
      'border-width': 4,
      'border-color': nodeColor,
      'border-opacity': 1,
      // Labels are gated by zoom level (GraphView toggles the .lbl class):
      // none below 0.6x, top-N hubs 0.6-1.2x, everything above 1.2x.
      label: '',
      // C4: Inter at label weight, with a canvas-colored halo for
      // legibility over edges.
      color: cssToken('--text-primary', '#1a1a17'),
      'font-family': 'Inter, "IBM Plex Sans", system-ui, sans-serif',
      'font-weight': 600,
      'font-size': 11,
      'text-outline-color': cssToken('--bg-page', '#F7F7F4'),
      'text-outline-width': 2,
      'text-outline-opacity': 0.9,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 6,
      'text-wrap': 'wrap',
      'text-max-width': 120,
    },
  },
  {
    selector: 'node.lbl',
    style: {
      label: nodeLabel,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'background-color': cssToken('--bg-selected', '#dce9f7'),
      'border-width': 6,
    },
  },
  {
    selector: 'edge',
    style: {
      width: edgeWidth,
      // Item 2: neutral grey at rest; relationship-type color only on
      // selection / hover highlight (see edge:selected + .highlighted).
      'line-color': neutralEdgeColor,
      'target-arrow-color': neutralEdgeColor,
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.9,
      opacity: 0.75,
      label: '',
      'font-size': 8,
      'font-family': 'Inter, "IBM Plex Sans", system-ui, sans-serif',
      color: cssToken('--text-secondary', '#5c5c55'),
      'text-rotation': 'autorotate',
      'text-background-color': cssToken('--bg-page', '#F7F7F4'),
      'text-background-opacity': 0.7,
      'text-background-padding': 2,
    },
  },
  {
    // Item 4: canvas edge labels use the plain-language phrase
    // ("led to" / "happened before"), never the raw DB label
    // ("sequence: after") — the distinction must not rely on line
    // style or color alone. NOTE: this rule must sit AFTER the base
    // `edge` rule — cytoscape resolves the `label` conflict in file
    // order here, and with `edge.lbl` first the base `label: ''` wins.
    selector: 'edge.lbl',
    style: {
      label: (ele) => edgePlainLabel(ele.data()),
    },
  },
  {
    selector: 'edge:selected',
    style: {
      opacity: 1,
      'z-index': 10,
      'line-color': edgeColor,
      'target-arrow-color': edgeColor,
      width: (ele) => edgeWidth(ele) + 1,
    },
  },
  // Step 7 (§3.2/§3.3): MIP_inferred edges are hypotheses — dashed, no
  // arrowhead (documented edges keep the triangle), and labeled
  // "hypothesis" when edge labels are visible. GraphView flags them with
  // the `inferred` data field; they default to hidden via .edge-hidden.
  {
    selector: 'edge[?inferred]',
    style: {
      'line-style': 'dashed',
      'target-arrow-shape': 'none',
      opacity: 0.6,
    },
  },
  {
    selector: 'edge[?inferred].lbl',
    style: {
      label: 'hypothesis',
    },
  },
  // Receipt provenance is a declaration, not a documentary or causal relationship.
  {
    selector: 'edge[type = "receipt_provenance"]',
    style: {
      'line-style': 'dashed',
      'source-arrow-shape': 'none',
      'target-arrow-shape': 'none',
      opacity: 0.65,
    },
  },
  // This type retains its literal qualifier at readable zoom.
  {
    selector: 'edge[type = "receipt_provenance"].lbl',
    style: { label: (ele) => edgePlainLabel(ele.data()) },
  },
  // Step 7 (§6): reliability / hypothesis filters hide edges without a
  // re-layout; nodes left isolated by the filter stay but dim.
  {
    selector: '.edge-hidden',
    style: {
      display: 'none',
    },
  },
  {
    selector: 'node.isolated-dim',
    style: {
      opacity: 0.25,
    },
  },
  // Hover focus states (§4.2): connected edges full opacity, the rest fades.
  {
    selector: '.dimmed',
    style: {
      opacity: 0.15,
    },
  },
  {
    selector: 'edge.highlighted',
    style: {
      opacity: 1,
      'z-index': 10,
      'line-color': edgeColor,
      'target-arrow-color': edgeColor,
    },
  },
]
