import { compactCoverageSummary, formatCoverageMetric } from './graphCanvasLayout.js'

function metric(value) {
  return formatCoverageMetric(value)
}

export default function GraphCoverageNotice({ coverage, shownNodeCount, totalNodeCount, onToggle }) {
  if (!coverage) return null

  const focused = Number.isInteger(shownNodeCount) && Number.isInteger(totalNodeCount) && shownNodeCount < totalNodeCount
  const compactLine = compactCoverageSummary(coverage, { shownNodeCount, totalNodeCount })

  return (
    <section className="graph-coverage-notice" aria-labelledby="graph-coverage-title" data-coverage-state="collapsed">
      <details
        className="graph-coverage-details"
        onToggle={(event) => {
          const expanded = event.currentTarget.open
          event.currentTarget.closest('.graph-coverage-notice')?.setAttribute(
            'data-coverage-state',
            expanded ? 'expanded' : 'collapsed',
          )
          onToggle?.(expanded)
        }}
      >
        <summary className="graph-coverage-summary">
          <div className="graph-coverage-heading">
            <div>
              <p className="graph-coverage-kicker">Coverage disclosure</p>
              <h2 id="graph-coverage-title">What this graph represents</h2>
            </div>
            {Number.isInteger(totalNodeCount) && (
              <span className="graph-coverage-focus">
                {focused ? `${shownNodeCount} of ${totalNodeCount}` : totalNodeCount} published nodes shown
              </span>
            )}
          </div>
          <p className="graph-coverage-compact">{compactLine}</p>
        </summary>
        <div className="graph-coverage-panel" id="graph-coverage-panel">
          <p className="graph-coverage-copy">
            These are stored resolution and review counts, not a completeness score. A focused view is a readable subset of published graph records; it does not represent every article in the corpus.
          </p>
          <dl className="graph-coverage-metrics">
            <div>
              <dt>Corpus articles</dt>
              <dd>{metric(coverage.articleCount)}</dd>
              <span>published records in the reader corpus</span>
            </div>
            <div>
              <dt>Resolved to a published node</dt>
              <dd>{metric(coverage.articlesWithPublishedNode)}</dd>
              <span>article records with a stored citation-to-node link</span>
            </div>
            <div>
              <dt>Graph candidates pending review</dt>
              <dd>{metric(coverage.pendingGraphCandidates)}</dd>
              <span>candidate records not shown as graph relationships</span>
            </div>
            <div>
              <dt>Documented relationships</dt>
              <dd>{metric(coverage.documentedRelationshipCount)}</dd>
              <span>published graph edges; causal and sequence meanings remain distinct</span>
            </div>
            <div>
              <dt>Not yet node-linked</dt>
              <dd>{metric(coverage.articlesWithoutPublishedNode)}</dd>
              <span>article records outside the published node-link layer</span>
            </div>
          </dl>
        </div>
      </details>
    </section>
  )
}
