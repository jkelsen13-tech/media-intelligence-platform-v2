import { useState } from 'react'
import { NODE_TYPES, EDGE_TYPES, EDGE_WEIGHTS, RELIABILITY_MIN, RELIABILITY_MAX } from './theme'

// Collapse toggle: mobile viewports start collapsed so the legend doesn't
// cover the graph on load; tapping the chip expands it back.
function startsCollapsed() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(max-width: 1200px)').matches
}

// Map a cytoscape silhouette (theme.js NODE_TYPES[].shape) to the CSS
// shape-icon class rendered in the legend (see index.css .legend-shape--*).
function legendShapeClass(shape) {
  switch (shape) {
    case 'round-rectangle':
      return 'legend-shape--round'
    case 'diamond':
      return 'legend-shape--diamond'
    case 'barrel':
      return 'legend-shape--barrel'
    default:
      return 'legend-shape--octagon'
  }
}

function typeSwatchStyle({ cssVar, color }) {
  return { borderColor: cssVar ? `var(${cssVar})` : color }
}

export default function Legend() {
  const [collapsed, setCollapsed] = useState(startsCollapsed)

  if (collapsed) {
    return (
      <button
        type="button"
        className="legend legend-collapsed"
        onClick={() => setCollapsed(false)}
        aria-expanded={false}
        aria-label="Expand legend"
      >
        <span className="legend-shape legend-shape--octagon" style={{ borderColor: 'var(--border-strong)' }} />
        Legend
      </button>
    )
  }

  const reliabilitySteps = []
  for (let n = RELIABILITY_MIN; n <= RELIABILITY_MAX; n++) reliabilitySteps.push(n)

  return (
    <aside className="legend">
      <div className="legend-header">
        <button
          type="button"
          className="legend-toggle"
          onClick={() => setCollapsed(true)}
          aria-expanded={true}
          aria-label="Collapse legend"
        >
          Legend ▾
        </button>
      </div>
      <section>
        <h3>Nodes</h3>
        {Object.entries(NODE_TYPES).map(([key, meta]) => (
          <div key={key} className="legend-row">
            <span
              className={`legend-shape ${legendShapeClass(meta.shape)}`}
              style={typeSwatchStyle(meta)}
            />
            {meta.label}
          </div>
        ))}
      </section>
      <section>
        <h3>Edges</h3>
        <p className="legend-note">
          Edges are neutral grey until selected — a selected or hovered
          relationship shows its type color. The label in quotes is the
          plain-language phrase drawn on the canvas:
        </p>
        {Object.entries(EDGE_TYPES).map(([key, { cssVar, label, plain }]) => (
          <div key={key} className="legend-row">
            <span className="legend-line" style={{ background: `var(${cssVar})` }} />
            {label} — “{plain}”
          </div>
        ))}
        {/* Step 7 (§3.3): line style encodes provenance. */}
        <div className="legend-row">
          <span className="legend-line" style={{ background: 'var(--cat-grey)' }} />
          Sourced
        </div>
        <div className="legend-row">
          <span className="legend-line legend-line--dashed" />
          MIP hypothesis
        </div>
        {/* Item 4: the causal/sequence distinction stated in words, so
            it never depends on color or line style alone. */}
        <p className="legend-note">
          Causal claims one event led to another. Sequence claims only
          that one happened before the other — no causation is claimed.
        </p>
      </section>
      <section>
        <h3>Weight</h3>
        {Object.entries(EDGE_WEIGHTS).map(([key, px]) => (
          <div key={key} className="legend-row">
            <span className="legend-line" style={{ background: 'var(--cat-grey)', height: px }} />
            {key}
          </div>
        ))}
      </section>
      <section>
        <h3>Reliability</h3>
        <div className="legend-row legend-reliability">
          {reliabilitySteps.map((n) => (
            <span key={n} className="legend-rel-pip num" data-rel={n}>
              {n}
            </span>
          ))}
          <span className="legend-rel-note">1 = highest</span>
        </div>
      </section>
      <section>
        <p className="legend-note">
          Border color &amp; shape = node type; node fill is neutral.
        </p>
      </section>
    </aside>
  )
}
