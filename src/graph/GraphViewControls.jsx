import { useCallback } from 'react'

// Track B Step 2 item 2 (2026-08-17): plain graph view controls.
// Replaces the drag-nub joystick metaphor with four labeled buttons:
// zoom in, zoom out, Fit (fit the graph to the viewport) and Reset
// (re-run the layout from scratch and fit). Rendered bottom-right in
// the graph stage on all viewport sizes. `dimmed` fades and disables
// the cluster while a mobile bottom sheet (article/policy panel) is
// open so it never sits under the sheet's drag-handle zone.

const ZOOM_IN = 1.25
const ZOOM_OUT = 0.8
const ZOOM_MS = 150

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function GraphViewControls({ cyRef, onReset, dimmed = false }) {
  const zoomBy = useCallback(
    (factor) => {
      if (dimmed) return
      const cy = cyRef.current
      if (!cy || cy.destroyed()) return
      const { width, height } = cy.container().getBoundingClientRect()
      const level = Math.min(
        cy.maxZoom(),
        Math.max(cy.minZoom(), cy.zoom() * factor),
      )
      cy.animate(
        { zoom: { level, renderedPosition: { x: width / 2, y: height / 2 } } },
        { duration: prefersReducedMotion() ? 0 : ZOOM_MS, easing: 'ease-out' },
      )
    },
    [cyRef, dimmed],
  )

  const fit = useCallback(() => {
    if (dimmed) return
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return
    cy.animate(
      { fit: { eles: cy.elements(), padding: 80 } },
      { duration: prefersReducedMotion() ? 0 : 300, easing: 'ease-out' },
    )
  }, [cyRef, dimmed])

  const reset = useCallback(() => {
    if (dimmed) return
    if (onReset) onReset()
  }, [onReset, dimmed])

  return (
    <div
      className={`graph-view-controls${dimmed ? ' dimmed' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="graph-view-btn"
        aria-label="Zoom in"
        disabled={dimmed}
        onClick={() => zoomBy(ZOOM_IN)}
      >
        +
      </button>
      <button
        type="button"
        className="graph-view-btn"
        aria-label="Zoom out"
        disabled={dimmed}
        onClick={() => zoomBy(ZOOM_OUT)}
      >
        −
      </button>
      <button type="button" className="graph-view-btn" disabled={dimmed} onClick={fit}>
        Fit
      </button>
      <button type="button" className="graph-view-btn" disabled={dimmed} onClick={reset}>
        Reset
      </button>
    </div>
  )
}
