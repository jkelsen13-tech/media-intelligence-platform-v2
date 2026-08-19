import { useMemo } from 'react'
import { recordedGeography, recordedTime, summarizeGeography } from '../lib/graphWorkspaceModel.js'
import GeographyGlobe from './GeographyGlobe.jsx'

function labelForPrecision(precision) {
  if (!precision) return 'Precision not recorded'
  return `${precision[0].toUpperCase()}${precision.slice(1)}-level representative point`
}

function locationPlaceKey(row) {
  return row.placeId ?? `${row.place ?? 'location'}:${row.longitude}:${row.latitude}`
}

// Focused-Graph addendum modes. Relationships remains the Cytoscape canvas;
// Geography exposes only source-backed location provenance. City dots are
// representative points, not claimed exact event coordinates.
export default function GraphModePanel({
  mode,
  nodes,
  locationMentions,
  onReturnToRelationships,
  onSelectNode,
  onSelectLocation,
  activeNodeKey = null,
  activePlaceKey = null,
}) {
  const geography = useMemo(() => recordedGeography(nodes, locationMentions), [nodes, locationMentions])
  const geographySummary = useMemo(() => summarizeGeography(nodes, geography), [nodes, geography])
  const chronological = useMemo(() => recordedTime(nodes), [nodes])
  const isGeography = mode === 'geography'
  const selectLocationRecord = (row) => {
    const placeKey = locationPlaceKey(row)
    const nodeKeys = geographySummary.confirmed
      .filter((candidate) => locationPlaceKey(candidate) === placeKey)
      .map((candidate) => candidate.key)
    if (onSelectLocation) {
      onSelectLocation({ placeKey, place: row.place, nodeKeys })
      return
    }
    if (row.key) onSelectNode?.(row.key)
  }

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
            Location markers are shown only when the current graph node has a literal, confirmed source record or human-verified location. Every dot is a broad city-level representative point, not an exact incident coordinate. Drag the globe or use its arrow-key controls to rotate it; select a marker to open its documented graph node.
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
            <GeographyGlobe
              locations={geographySummary.confirmedMappable}
              onSelectNode={onSelectNode}
              onSelectLocation={onSelectLocation}
              activeNodeKey={activeNodeKey}
              activePlaceKey={activePlaceKey}
            />
            <aside className="geography-legend" aria-label="Geographic corroboration legend">
              <p className="graph-mode-eyebrow">Display rule</p>
              <p>
                Public-domain Natural Earth land and country boundaries make the projection legible as a globe. Blue markers denote a location phrase present in a source record and resolved at the stated precision.
              </p>
              <p>
                Marker size reflects only the number of confirmed location mentions collapsed at the same displayed city. It does not rate an event’s importance, reliability, or geographic size.
              </p>
              <p className="geography-legend-note">
                Candidate, ambiguous, and unlocated records remain out of the marker layer. Map coverage is intentionally incomplete while only reviewed, provenance-bearing locations are published.
              </p>
            </aside>
          </div>
          {geographySummary.confirmed.length > 0 ? (
            <ul className="geography-record-list">
              {geographySummary.confirmed.map((row) => (
                <li key={row.id}>
                  <button type="button" className="geography-record" onClick={() => selectLocationRecord(row)}>
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
