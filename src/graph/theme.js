// Shared visual vocabulary for the knowledge graph.
// Node types and edge relationship types map to fixed colors so the graph
// reads consistently everywhere (canvas, legend, future detail panels).
//
// Pass C (§3 C1): the CSS custom properties in src/styles/tokens.css are the
// single source of truth. Cytoscape can't resolve var() inside canvas, so JS
// reads the computed value at draw time via cssToken(); the FALLBACK hexes
// below mirror tokens.css for pre-CSS / test environments. DOM inline styles
// use the `cssVar` reference directly (Legend, ArticlePanel, ArcsView).

export function cssToken(name, fallback) {
  if (typeof window === 'undefined' || !window.getComputedStyle) return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// Step 6 (§4): node type also determines the silhouette. Events KEEP the
// octagon. Actors read as people/orgs → round-rectangle. Topics get a tag/
// barrel silhouette and policies a diamond, prepared for when those node
// types land in the data. `shape` is the cytoscape shape name; the legend
// renders the matching CSS icon via `legendShapeClass` in Legend.jsx.
export const NODE_TYPES = {
  event: { color: '#4d9aff', cssVar: '--cat-blue', label: 'Event', shape: 'octagon' }, // blue
  actor: { color: '#9ca3af', cssVar: '--cat-grey', label: 'Actor', shape: 'round-rectangle' }, // grey
  institution: { color: '#ffb01f', cssVar: '--cat-amber', label: 'Institution', shape: 'octagon' }, // amber
  document: { color: '#2fdc6f', cssVar: '--cat-green', label: 'Document', shape: 'octagon' }, // green
  anomaly: { color: '#ff5252', cssVar: '--cat-red', label: 'Anomaly', shape: 'octagon' }, // red
  // Upcoming node types — wired to tokens (--cat-teal/--cat-violet, both themes).
  topic: { color: '#2dd4bf', cssVar: '--cat-teal', label: 'Topic', shape: 'barrel' }, // teal
  policy: { color: '#a78bfa', cssVar: '--cat-violet', label: 'Policy', shape: 'diamond' }, // violet
}

export const DEFAULT_NODE_SHAPE = 'octagon'

// Step 7 (§6): edge provenance. `claimed_by === 'MIP_inferred'` marks a
// machine-inferred hypothesis edge (dashed, no arrow, toggleable, default
// off). Sourced values are source_document | analysis | reporting (solid).
export const INFERRED_CLAIMED_BY = 'MIP_inferred'

// Reliability is a 1–4 integer where 1 = highest reliability. The graph
// filter shows edges with reliability >= threshold; edges with no
// reliability value always pass the filter.
export const RELIABILITY_MIN = 1
export const RELIABILITY_MAX = 4

export const EDGE_TYPES = {
  // Private display-only link, not documentary evidence or an accepted relation.
  receipt_provenance: { color: '#9ca3af', cssVar: '--cat-grey', label: 'Receipt-declared provenance (unverified)', plain: 'receipt-declared provenance (unverified)' },
  causal: { color: '#4d9aff', cssVar: '--cat-blue', label: 'Causal', plain: 'led to' }, // blue
  actor: { color: '#9ca3af', cssVar: '--cat-grey', label: 'Actor', plain: 'involves' }, // grey
  financial: { color: '#ffb01f', cssVar: '--cat-amber', label: 'Financial', plain: 'funded' }, // amber
  conflict: { color: '#ff5252', cssVar: '--cat-red', label: 'Conflict', plain: 'in conflict with' }, // red
  documentary: { color: '#2fdc6f', cssVar: '--cat-green', label: 'Documentary', plain: 'documented in' }, // green
  // Live edge vocabulary (2026-08-17 census: 330 actor / 80 sequence /
  // 1 constrained_by). Colors show only on selection/hover (item 2).
  sequence: { color: '#a78bfa', cssVar: '--cat-violet', label: 'Sequence', plain: 'happened before' }, // violet
  constrained_by: { color: '#2dd4bf', cssVar: '--cat-teal', label: 'Constrained by', plain: 'constrained by' }, // teal
}

// Track B Step 2 item 4 (2026-08-17): plain-language edge labels.
// The causal-vs-sequence distinction must read from WORDS, not line
// style or color alone: causal claims one event LED TO another;
// sequence claims temporal order only — the source happened before the
// target, explicitly no causation (see the Tier 3 three-way branch in
// the ingestion pipeline: sequence = temporal connective or weak
// citation, never a causal claim). `plain` is the verb phrase drawn on
// the canvas, in the relationship list, in both timeline views, and in
// the docked relationship panel (item 5). The raw DB label (e.g.
// "sequence: after") stays
// visible as the "Relation" row in the relationship panel — it is extraction
// detail, not the display label.
export function edgePlainLabel(edge) {
  if (!edge) return ''
  const meta = EDGE_TYPES[edge.type]
  if (meta?.plain) return meta.plain
  // Unknown type: humanize the raw label (strip a "type: " prefix) so
  // the canvas never shows machine vocabulary; last resort is the key.
  const raw = edge.label != null ? String(edge.label).replace(/^[a-z_]+:\s*/i, '').trim() : ''
  return raw || String(edge.type ?? '')
}

// Story-arc categories (§4.4 category tag). Colors come from the same token
// palette as the graph vocabulary; Unclassified stays neutral grey (Pass A).
export const CATEGORY_TYPES = {
  institutional_accountability: {
    cssVar: '--cat-blue',
    color: '#4d9aff',
    label: 'Institutional Accountability',
  },
  geopolitical_consequence: {
    cssVar: '--cat-amber',
    color: '#ffb01f',
    label: 'Geopolitical Consequence',
  },
  economic_policy: { cssVar: '--cat-green', color: '#2fdc6f', label: 'Economic Policy' },
  legislative_regulatory: {
    cssVar: '--cat-red',
    color: '#ff5252',
    label: 'Legislative / Regulatory',
  },
  unclassified: { cssVar: '--cat-grey', color: '#9ca3af', label: 'Unclassified' },
}

// Resolved canvas color for a NODE_TYPES/EDGE_TYPES entry.
export function typeColor(meta) {
  if (!meta?.cssVar) return meta?.color ?? '#6b7280'
  return cssToken(meta.cssVar, meta.color)
}

// Edge weight → line thickness in px.
export const EDGE_WEIGHTS = {
  heavy: 5,
  medium: 3,
  light: 1.5,
}
