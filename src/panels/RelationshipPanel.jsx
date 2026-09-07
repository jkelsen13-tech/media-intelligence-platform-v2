import { mipBackend } from '../lib/mipBackend.js'
import { useEffect, useMemo, useState } from 'react'
import { buildRelationshipPanelView } from '../lib/relationshipProvenance.js'
import './relationship-panel.css'

// Track B Step 2 item 5 (2026-08-17) — docked relationship panel.
//
// Replaces the floating edge-evidence popover with a docked panel (desktop:
// flex sibling of the graph stage, so the canvas shrinks beside it and is
// never covered; mobile: bottom sheet). Shows what is actually recorded for
// the selected relationship — named sources, grounding excerpt, and all six
// G2 axes — with honest empty states everywhere data is missing: 'unverified'
// / 'not yet available' are rendered as designed states, never as blank
// space or fabricated confidence.
export default function RelationshipPanel({ edge, sourceLabel, targetLabel, onClose, isMobile, backend = mipBackend.publicData.evidence }) {
  const [state, setState] = useState({ status: 'loading' })
  const edgeId = edge?.id

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    if (!edgeId) {
      setState({ status: 'ready', enabled: false, explanation: null, sources: [] })
      return
    }
    backend.loadExplanationReadView({ assertionId: `edge:${edgeId}`, limit: 1 })
      .then(async (view) => {
        if (cancelled) return
        const explanation =
          view.eligible[0] ?? view.excluded[0]?.explanation ?? null
        const sources = explanation?.source_ids?.length
          ? await backend.loadEdgeSources(explanation.source_ids)
          : []
        if (!cancelled) {
          setState({ status: 'ready', enabled: view.enabled, explanation, sources })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [edgeId, backend])

  const view = useMemo(
    () =>
      buildRelationshipPanelView({
        edge,
        explanation: state.explanation ?? null,
        sources: state.sources ?? [],
        enabled: state.enabled === true,
      }),
    [edge, state],
  )

  return (
    <aside
      className={`relationship-panel${isMobile ? ' sheet-mode' : ''}`}
      role="dialog"
      aria-label={`Relationship: ${sourceLabel ?? '?'} to ${targetLabel ?? '?'}`}
    >
      <header className="rp-header">
        <div className="rp-title-row">
          <h2>Relationship</h2>
          <button className="ap-icon-btn" title="Close panel (Esc)" aria-label="Close relationship panel" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="rp-pair">
          {sourceLabel ?? '?'} <span className="rp-arrow">→</span> {targetLabel ?? '?'}
        </p>
        <div className="rp-badges">
          <span className="rp-badge rp-badge-type">{view.typeLabel}</span>
          {view.reviewBadge && (
            <span className={`rp-badge tone-${view.reviewBadge.tone}`}>{view.reviewBadge.label}</span>
          )}
        </div>
        <p className="rp-meaning">{view.meaning}</p>
      </header>

      {state.status === 'loading' && <p className="ap-muted">Loading provenance…</p>}
      {state.status === 'error' && (
        <p className="ap-muted">Provenance could not be loaded. The relationship itself is shown above.</p>
      )}

      {state.status === 'ready' && !view.provenanceEnabled && (
        <p className="ap-muted">Provenance read path is disabled (provenance_ui flag off).</p>
      )}

      {state.status === 'ready' && view.provenanceEnabled && (
        <>
          <section className="rp-section">
            <span className="ap-label">Sources</span>
            {view.sources.length === 0 && (
              <p className="ap-muted">No sources documented yet for this relationship.</p>
            )}
            {view.sources.length > 0 && (
              <ul className="ap-sources">
                {view.sources.map((s, i) =>
                  s.kind === 'unresolved' ? (
                    <li key={s.id ?? i} className="ap-source">
                      <span className="ap-source-outlet">Source record not available</span>
                      <span className="ap-source-headline rp-unresolved">
                        recorded id <code>{s.id}</code> could not be resolved
                      </span>
                    </li>
                  ) : (
                    <li key={s.id ?? i} className="ap-source">
                      <span className="ap-source-outlet">{s.name}</span>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="ap-source-headline">
                          {s.title}
                        </a>
                      ) : (
                        <span className="ap-source-headline">{s.title}</span>
                      )}
                      {s.publishedAt && <span className="ap-source-date">{s.publishedAt}</span>}
                    </li>
                  ),
                )}
              </ul>
            )}
            <p className="rp-note">
              The number of sources is not a measure of evidence strength.
            </p>
          </section>

          <section className="rp-section">
            <span className="ap-label">Grounding excerpt</span>
            {view.grounding?.recorded ? (
              <blockquote className="rp-grounding">{view.grounding.text}</blockquote>
            ) : (
              <p className="ap-muted">{view.grounding?.text}</p>
            )}
          </section>

          <section className="rp-section">
            <span className="ap-label">Provenance — six axes</span>
            <dl className="rp-axes">
              {view.axes.map((axis) => (
                <div key={axis.key} className={`rp-axis tone-${axis.tone}`}>
                  <dt>{axis.label}</dt>
                  <dd>{axis.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rp-section">
            <span className="ap-label">Source independence</span>
            <p className="rp-axis-value tone-unverified">{view.independence}</p>
            <p className="rp-note">
              Independent sources exclude syndicated or duplicated reporting; lineage is
              required before independence can be claimed.
            </p>
          </section>

          {view.contradicting && (
            <section className="rp-section">
              <span className="ap-label">Contradicting evidence</span>
              <p className="rp-axis-value tone-unavailable">{view.contradicting}</p>
            </section>
          )}

          {view.falsificationCondition && (
            <section className="rp-section">
              <span className="ap-label">Falsification condition</span>
              <p>{view.falsificationCondition}</p>
            </section>
          )}

          {view.correctionHistory.length > 0 && (
            <section className="rp-section">
              <span className="ap-label">
                Correction history (<span className="num">{view.correctionHistory.length}</span>)
              </span>
              <ul className="rp-corrections">
                {view.correctionHistory.map((c, i) => (
                  <li key={i}>
                    <span className="rp-correction-decision">{c.decision ?? 'correction'}</span>
                    {c.reason && <span className="rp-correction-reason">{c.reason}</span>}
                    {c.at && <span className="ap-source-date">{String(c.at).slice(0, 10)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="rp-section">
        <span className="ap-label">Extraction detail</span>
        <dl className="rp-axes">
          {view.rawLabel && (
            <div className="rp-axis tone-value">
              <dt>Relation (raw)</dt>
              <dd>{view.rawLabel}</dd>
            </div>
          )}
          {view.extraction.map((row) => (
            <div key={row.label} className="rp-axis tone-value">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          {!view.rawLabel && view.extraction.length === 0 && (
            <p className="ap-muted">No extraction detail recorded for this relationship.</p>
          )}
        </dl>
      </section>
    </aside>
  )
}
