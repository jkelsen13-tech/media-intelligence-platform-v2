import { useEffect, useMemo, useState } from 'react'
import {
  RELATIONSHIP_TEMPORAL_DISCLOSURE,
  relationshipTouchesSelection,
} from '../lib/worldViewRelationshipLayout.js'
import './world-view-relationships.css'

const PAGE_SIZE = 20
const EMPTY = Object.freeze([])
const REASONS = {
  unmapped: 'An endpoint has no admitted projection marker.',
  hiddenEndpoints: 'An endpoint is hidden by the current renderer or outside the viewport.',
  budget: 'Hidden by the map line limit.',
  hypothesis: 'Stored hypothesis; not drawn as a documented relationship.',
  coincidentEndpoints: 'Endpoints share the same displayed point; the record remains inspectable.',
  invalidEdge: 'The graph reader did not supply both endpoint identities.',
}

function valueText(value) {
  if (value == null) return 'Not supplied'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

/**
 * All records are the supplied authorized graph edges, including records whose
 * map lines are hidden. onSelectNode receives only the matching supplied graph
 * node, never a chosen projection row or an invented subject.
 */
export default function WorldViewRelationshipPanel({
  edges = EMPTY, nodes = EMPTY, selectedKeys = EMPTY, displaySummary = null,
  edgesUnavailable = null, onSelectNode,
}) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [edges, selectedKeys])
  const nodeById = useMemo(() => {
    const index = new Map()
    for (const node of nodes) if (node.id != null) index.set(String(node.id), node)
    for (const node of nodes) {
      if (node.slug != null && !index.has(String(node.slug))) index.set(String(node.slug), node)
    }
    return index
  }, [nodes])
  const ordered = useMemo(() => edges.map((edge, edgeIndex) => ({
    edge, edgeIndex, selected: relationshipTouchesSelection(edge, selectedKeys),
  })).sort((a, b) => Number(b.selected) - Number(a.selected) || a.edgeIndex - b.edgeIndex), [edges, selectedKeys])
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const shown = ordered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const hasSummary = displaySummary?.total === edges.length && Array.isArray(displaySummary?.dispositions)
  const label = key => nodeById.get(String(key))?.label || String(key ?? 'Endpoint not supplied')
  const endpointButton = (key, endpoint) => {
    const node = nodeById.get(String(key))
    return node && onSelectNode ? (
      <button type="button" onClick={() => onSelectNode(node)} aria-label={`Inspect ${endpoint}: ${label(key)}`}>
        Inspect {endpoint.toLowerCase()}
      </button>
    ) : null
  }

  return (
    <details className="wv-relationships" aria-label="Documented relationships">
      <summary>
        Documented relationships
        <span className="wv-relationships-count">
          {edgesUnavailable ? 'Unavailable' : `${edges.length} records${hasSummary ? ` · ${displaySummary.displayed} map lines` : ''}`}
        </span>
      </summary>
      {edgesUnavailable ? (
        <p>Relationship records are unavailable in the current authorized read.</p>
      ) : (
        <>
          <p className="wv-relationships-copy">
            Existing graph records, source → target. Map lines show recorded endpoint direction and type.
            Map visibility does not establish historical applicability.
          </p>
          <p className="wv-relationships-copy">{RELATIONSHIP_TEMPORAL_DISCLOSURE}</p>
          {hasSummary && (
            <p className="wv-relationships-copy" role="status">
              {displaySummary.displayed} of {edges.length} records drawn.
              {' '}{displaySummary.counts.unmapped} without mapped endpoints;
              {' '}{displaySummary.counts.hiddenEndpoints} with hidden endpoints;
              {' '}{displaySummary.counts.budget} hidden by the line limit.
              {displaySummary.counts.hypothesis > 0 && ` ${displaySummary.counts.hypothesis} stored hypotheses are not drawn.`}
              {displaySummary.counts.coincidentEndpoints > 0 && ` ${displaySummary.counts.coincidentEndpoints} have coincident endpoints.`}
              {displaySummary.counts.invalidEdge > 0 && ` ${displaySummary.counts.invalidEdge} lack endpoint identities.`}
              {displaySummary.multipleEndpointEdges > 0 && ' For records with several admitted locations, each line uses one original visible marker per endpoint. Endpoint counts are included below.'}
            </p>
          )}
          {edges.length === 0 ? (
            <p>No relationship records were returned by the current authorized graph read.</p>
          ) : (
            <>
              <p className="wv-relationships-copy">
                All {edges.length} supplied records remain inspectable below, including records without a visible map line.
                {ordered.some(entry => entry.selected) && ' Records touching the selected subject appear first.'}
              </p>
              <ol className="wv-relationships-list" start={currentPage * PAGE_SIZE + 1}>
                {shown.map(({ edge, edgeIndex, selected }) => {
                  const candidate = hasSummary ? displaySummary.dispositions[edgeIndex] : null
                  const disposition = candidate?.edge === edge ? candidate : null
                  const endpoints = disposition?.endpointCounts
                  return (
                    <li key={edgeIndex} className={selected ? 'is-selected' : undefined} data-edge-id={edge.id ?? undefined}>
                      <details className="wv-relationship-record">
                        <summary>
                          <span>{label(edge.source)} → {label(edge.target)}</span>
                          <span className="wv-relationship-type">{edge.type ?? 'Type not supplied'}{edge.claimed_by === 'MIP_inferred' ? ' · Stored hypothesis' : ''}</span>
                          {selected && <span className="wv-relationship-selected">Selected subject</span>}
                        </summary>
                        <p className="wv-relationships-copy">
                          {disposition ? disposition.displayed ? 'Shown on the map.' : REASONS[disposition.reason] : 'Map line visibility is unavailable.'}
                        </p>
                        {endpoints && (endpoints.source > 1 || endpoints.target > 1) && (
                          <p className="wv-relationships-copy">
                            Admitted endpoint markers: {endpoints.source} source ({endpoints.visibleSource} visible);
                            {' '}{endpoints.target} target ({endpoints.visibleTarget} visible).
                            {disposition.displayed && ' One original visible marker per endpoint is used for this line.'}
                          </p>
                        )}
                        <div className="wv-relationship-actions">
                          {endpointButton(edge.source, 'Source')}
                          {endpointButton(edge.target, 'Target')}
                        </div>
                        <dl className="wv-relationship-fields">
                          {Object.entries(edge).map(([field, value]) => (
                            <div key={field}>
                              <dt>{field}</dt>
                              <dd>{typeof value === 'object' && value != null ? <pre>{valueText(value)}</pre> : valueText(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </li>
                  )
                })}
              </ol>
              {pageCount > 1 && (
                <nav className="wv-relationship-pages" aria-label="Relationship record pages">
                  <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
                  <span role="status">Page {currentPage + 1} of {pageCount}</span>
                  <button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </details>
  )
}
