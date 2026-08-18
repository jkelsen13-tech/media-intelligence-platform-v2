import { recordedGeography, recordedTime } from '../lib/graphWorkspaceModel.js'

// Focused-Graph addendum modes. Relationships remains the canvas; Geography
// and Time are honest record lists, not maps or timelines inferred from labels.
export default function GraphModePanel({ mode, nodes, onReturnToRelationships }) {
  const geography = recordedGeography(nodes)
  const chronological = recordedTime(nodes)
  const isGeography = mode === 'geography'

  return (
    <section className="graph-mode-panel" aria-live="polite" aria-label={isGeography ? 'Geography records' : 'Time records'}>
      <div className="graph-mode-panel-head">
        <div>
          <p className="graph-mode-eyebrow">Focused Graph</p>
          <h2>{isGeography ? 'Geography' : 'Time'}</h2>
        </div>
        <button type="button" className="graph-toolbar-btn" onClick={onReturnToRelationships}>
          Return to relationships
        </button>
      </div>
      {isGeography ? (
        geography.length > 0 ? (
          <ul className="graph-mode-list">
            {geography.map((row) => (
              <li key={row.key}>
                <span className="graph-mode-primary">{row.label}</span>
                <span className="graph-mode-secondary">Recorded location: {row.location}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="graph-mode-empty">
            No recorded geographic fields are available for the nodes in this view. Locations are not inferred from labels or source context.
          </p>
        )
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
