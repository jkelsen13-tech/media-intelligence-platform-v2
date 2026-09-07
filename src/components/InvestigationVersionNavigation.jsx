import { savedVersionNavigation, versionNavigationBlocked } from '../lib/investigationVersionNavigation.js'
import { retainedDateLabel } from '../lib/investigationEvidenceTrail.js'

export default function InvestigationVersionNavigation({ bundle, state, onSelectVersion }) {
  const model = savedVersionNavigation(bundle)
  if (!model) return <p className="piw-note" role="status">Saved-version navigation is unavailable for this record.</p>
  const blocked = versionNavigationBlocked(state)
  const select = versionId => { if (!blocked && onSelectVersion) return onSelectVersion(model.investigationId, versionId) }
  return <section className="piw-version-navigation" aria-label="Saved version navigation">
    <div className="piw-version-heading"><h2>Saved versions</h2><span className="piw-version-label">Revision {model.revision} · {model.current ? 'Latest at last read' : 'Historical version'}</span></div>
    <p className="piw-note">Browse the investigation as it was saved. All sections and the inspector switch together. Opening a version does not mark it reviewed.</p>
    <div className="piw-version-actions">
      <button type="button" className="piw-section-btn" disabled={blocked || !model.previous || !onSelectVersion} onClick={() => select(model.previous)}>Previous saved version</button>
      <button type="button" className="piw-section-btn" disabled={blocked || !onSelectVersion} onClick={() => select(null)}>{model.current ? 'Refresh latest saved version' : 'Return to latest saved version'}</button>
      {model.reviewed && !model.isReviewedVersion ? <button type="button" className="piw-section-btn" disabled={blocked || !onSelectVersion} onClick={() => select(model.reviewed)}>Open reviewed version</button> : null}
    </div>
    {blocked ? <p role="status" className="piw-note">{state?.loadingBundle ? 'Loading the requested saved version…' : 'Finish or resolve the pending review or check request before switching versions.'}</p> : null}
    <p className="piw-note">{model.first ? 'This is the first saved version.' : !model.previous ? 'An earlier-version link is unavailable; no earlier version is inferred.' : 'Previous follows the recorded predecessor, not the review baseline.'} {model.isReviewedVersion ? 'This version is your recorded review baseline.' : !model.reviewed ? 'No personal review baseline is recorded.' : 'Your recorded review baseline stays unchanged.'}</p>
    <details className="piw-version-details"><summary>Saved version details</summary>
      <p><strong>Recorded reason:</strong> {model.reason ?? 'Not recorded.'}</p>
      <p><strong>Version recorded:</strong> {model.recordedAt ? <time dateTime={model.recordedAt}>{retainedDateLabel(model.recordedAt)}</time> : 'Not recorded.'}</p>
      <p className="piw-note">Recording time describes this MIP version, not when a reported event happened. A later version is not proof of a stronger claim or completed reassessment.</p>
      <dl><div><dt>Saved version</dt><dd>{model.versionId}</dd></div><div><dt>Saved observation</dt><dd>{bundle.observation.id}</dd></div></dl>
    </details>
  </section>
}
