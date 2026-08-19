import { useMemo } from 'react'
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import { recordedGeography, recordedTime, summarizeGeography } from '../lib/graphWorkspaceModel.js'

const GLOBE_SIZE = 310
const GLOBE_CENTER = Object.freeze([98, -39]) // centers the initial view over the seeded U.S. locations

function labelForPrecision(precision) {
  if (!precision) return 'Precision not recorded'
  return `${precision[0].toUpperCase()}${precision.slice(1)}-level representative point`
}

function Globe({ locations, onSelectNode }) {
  const { spherePath, graticulePath, markers } = useMemo(() => {
    const projection = geoOrthographic()
      .translate([GLOBE_SIZE / 2, GLOBE_SIZE / 2])
      .scale(GLOBE_SIZE * 0.45)
      .rotate(GLOBE_CENTER)
      .clipAngle(90)
      .precision(0.3)
    const path = geoPath(projection)
    return {
      spherePath: path({ type: 'Sphere' }),
      graticulePath: path(geoGraticule10()),
      markers: (locations ?? [])
        .map((row) => {
          const point = projection([row.longitude, row.latitude])
          return point ? { ...row, x: point[0], y: point[1] } : null
        })
        .filter(Boolean),
    }
  }, [locations])

  return (
    <figure className="geography-globe" aria-labelledby="geography-globe-caption">
      <svg viewBox={`0 0 ${GLOBE_SIZE} ${GLOBE_SIZE}`} role="img" aria-labelledby="geography-globe-title geography-globe-desc">
        <title id="geography-globe-title">Confirmed city-level location representatives</title>
        <desc id="geography-globe-desc">
          A static orthographic globe showing only literal, confirmed, source-record or human-verified city-level location mentions in the current graph focus.
        </desc>
        <path className="geography-globe-sphere" d={spherePath ?? undefined} />
        <path className="geography-globe-graticule" d={graticulePath ?? undefined} />
        {markers.map((row) => (
          <g
            key={row.id}
            className="geography-globe-marker"
            role="button"
            tabIndex={0}
            aria-label={`Open ${row.label}, located at ${row.place}; ${labelForPrecision(row.precision)}`}
            onClick={() => onSelectNode?.(row.key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectNode?.(row.key)
              }
            }}
          >
            <circle className="geography-globe-marker-halo" cx={row.x} cy={row.y} r="8" />
            <circle className="geography-globe-marker-dot" cx={row.x} cy={row.y} r="3.8" />
          </g>
        ))}
      </svg>
      <figcaption id="geography-globe-caption">
        {markers.length > 0
          ? `${markers.length} confirmed city-level representative ${markers.length === 1 ? 'point' : 'points'} in this focus.`
          : 'No confirmed mappable representative points in this focus.'}
      </figcaption>
    </figure>
  )
}

// Focused-Graph addendum modes. Relationships remains the Cytoscape canvas;
// Geography exposes only source-backed location provenance. City dots are
// representative points, not claimed exact event coordinates.
export default function GraphModePanel({ mode, nodes, locationMentions, onReturnToRelationships, onSelectNode }) {
  const geography = useMemo(() => recordedGeography(nodes, locationMentions), [nodes, locationMentions])
  const geographySummary = useMemo(() => summarizeGeography(nodes, geography), [nodes, geography])
  const chronological = useMemo(() => recordedTime(nodes), [nodes])
  const isGeography = mode === 'geography'

  return (
    <section className="graph-mode-panel" aria-live="polite" aria-label={isGeography ? 'Geography records' : 'Time records'}>
      <div className="graph-mode-panel-head">
        <div>
          <p className="graph-mode-eyebrow">Focused Graph</p>
          <h2>{isGeography ? 'Geographic corroboration' : 'Time'}</h2>
        </div>
        <button type="button" className="graph-toolbar-btn" onClick={onReturnToRelationships}>
          Return to relationships
        </button>
      </div>
      {isGeography ? (
        <div className="geography-mode-content">
          <p className="geography-mode-intro">
            Location markers are shown only when the current graph node has a literal, confirmed source record or human-verified location. Every dot below is a broad city-level representative point, not an exact incident coordinate.
          </p>
          <dl className="geography-state-counts">
            <div>
              <dt>Confirmed locations</dt>
              <dd>{geographySummary.confirmed.length}</dd>
              <span>literal source records or human verification</span>
            </div>
            <div>
              <dt>Automated candidates</dt>
              <dd>{geographySummary.automatedCandidates.length}</dd>
              <span>withheld from the globe pending review</span>
            </div>
            <div>
              <dt>No documented location</dt>
              <dd>{geographySummary.unlocatedNodeCount}</dd>
              <span>not guessed from labels or outlet context</span>
            </div>
          </dl>
          <div className="geography-layout">
            <Globe locations={geographySummary.confirmedMappable} onSelectNode={onSelectNode} />
            <aside className="geography-legend" aria-label="Geographic corroboration legend">
              <p className="graph-mode-eyebrow">Display rule</p>
              <p>
                Blue markers denote a location phrase present in a source record and resolved at the stated precision. Candidate, ambiguous, and unlocated records remain out of the marker layer.
              </p>
              <p className="geography-legend-note">
                Map coverage is intentionally incomplete while only reviewed, provenance-bearing locations are published.
              </p>
            </aside>
          </div>
          {geographySummary.confirmed.length > 0 ? (
            <ul className="geography-record-list">
              {geographySummary.confirmed.map((row) => (
                <li key={row.id}>
                  <button type="button" className="geography-record" onClick={() => onSelectNode?.(row.key)}>
                    <span className="geography-record-marker" aria-hidden="true" />
                    <span className="geography-record-content">
                      <span className="graph-mode-primary">{row.place}</span>
                      <span className="geography-record-node">{row.label}</span>
                      <span className="graph-mode-secondary">
                        Source text: {row.mentionText ? `“${row.mentionText}” in ${row.textField}` : 'Recorded source span'} · {labelForPrecision(row.precision)}
                      </span>
                      {row.remainingUncertainty && <span className="geography-record-uncertainty">{row.remainingUncertainty}</span>}
                    </span>
                    <span className="geography-record-state">Confirmed</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="graph-mode-empty">
              No confirmed source-backed location records are available for the nodes in this view. Locations are not inferred from headlines, labels, outlet context, or automated candidates.
            </p>
          )}
        </div>
      ) : chronological.length > 0 ? (
        <ol className="graph-mode-list">
          {chronological.map((row) => (
            <li key={row.key}>
              <span className="graph-mode-primary">{row.label}</span>
              <span className="graph-mode-secondary">
                {row.occurredAt ? `Recorded date: ${row.occurredAt.slice(0, 10)}` : 'No recorded date'}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="graph-mode-empty">No nodes are available for a time-ordered view.</p>
      )}
    </section>
  )
}
