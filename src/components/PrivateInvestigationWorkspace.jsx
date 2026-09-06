import RemainingUncertaintyBlock from './RemainingUncertaintyBlock.jsx'
import {
  COMPARISON_MODE_COPY,
  EMPTY_SECTION_COPY,
  INVESTIGATION_WORKSPACE_PANELS,
  SEARCH_STATUS_COPY,
  STAGE_STATUS_COPY,
  WORKSPACE_STATUS,
  assessmentOutcomeCopy,
  canRevealPrivateRecords,
  citationUnavailableCopy,
  definitionChangeSummary,
  evidenceChangeLabel,
  isCurrentSavedVersion,
  newerCollectionNote,
  publicGraphUnavailableCopy,
  revisionLabel,
  snapshotAssessment,
  snapshotCoverageCopy,
  snapshotInputAtPosition,
  stageDepths,
  timeRangeCopy,
  unavailableCopy,
} from '../lib/investigationWorkspaceSession.js'
import { resolveWorkspaceExcerpt } from '../lib/investigationWorkspaceClient.js'
import { formatWorkspaceDate } from '../lib/workspacePresentation.js'
import '../styles/investigation-workspace-panels.css'

const RELATION_LABELS = {
  supports: 'Recorded as supporting',
  contradicts: 'Recorded as contradicting',
  context: 'Recorded as context',
}

const BEFORE_DISCLOSURE_LIMIT = 4

function StatusBanner({ children, tone = 'note', ...rest }) {
  return (
    <p className={`piw-banner piw-banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'} {...rest}>
      {children}
    </p>
  )
}

function ExcerptBlock({ resolved, reference, onOpen }) {
  if (!resolved) {
    return (
      <div className="piw-excerpt piw-excerpt-unavailable">
        <p>{citationUnavailableCopy()}</p>
      </div>
    )
  }
  return (
    <figure className="piw-excerpt">
      <blockquote>
        <span className="piw-excerpt-before">{resolved.before}</span>
        <mark>{resolved.excerpt}</mark>
        <span className="piw-excerpt-after">{resolved.after}</span>
      </blockquote>
      <figcaption>
        <p>Position {String(reference.position)} · {reference.source_field} · code points [{reference.span_start}, {reference.span_end})</p>
        <p>{RELATION_LABELS[reference.relation] ?? reference.relation}. {reference.note}</p>
        <p>Exact quotation checks source binding, not semantic truth.</p>
        {onOpen && (
          <button type="button" className="piw-text-btn" onClick={onOpen}>
            Open in inspector
          </button>
        )}
      </figcaption>
    </figure>
  )
}

function EvidenceList({ evidence, bundle, onOpenCitation, versionLabel }) {
  if (!evidence?.length) {
    return <p className="piw-muted">No retained excerpts are linked here.</p>
  }
  return (
    <ul className="piw-stack">
      {evidence.map((reference) => {
        const resolved = resolveWorkspaceExcerpt(bundle, reference)
        const key = `${reference.position}:${reference.source_field}:${reference.span_start}:${reference.span_end}:${reference.relation}`
        return (
          <li key={key}>
            {versionLabel ? <p className="piw-muted">{versionLabel}</p> : null}
            <ExcerptBlock
              resolved={resolved}
              reference={reference}
              onOpen={onOpenCitation ? () => onOpenCitation(reference, bundle) : undefined}
            />
          </li>
        )
      })}
    </ul>
  )
}

function BoundedRecords({ items, renderItem, label, initial = BEFORE_DISCLOSURE_LIMIT }) {
  const list = items ?? []
  if (list.length === 0) return <p className="piw-muted">No {label} recorded on this saved version.</p>
  const visible = list.slice(0, initial)
  const rest = list.slice(initial)
  return (
    <>
      {visible.map(renderItem)}
      {rest.length > 0 && (
        <details className="piw-more">
          <summary>Show {rest.length} more {label}</summary>
          {rest.map(renderItem)}
        </details>
      )}
    </>
  )
}

function EmptySection({ kind }) {
  return <p className="piw-empty">{EMPTY_SECTION_COPY[kind]}</p>
}

function HypothesisRecord({ hypothesis, bundle, onOpenCitation }) {
  return (
    <article className="piw-card" data-record="hypothesis" data-record-id={hypothesis.id}>
      <h3>{hypothesis.statement}</h3>
      {hypothesis.assumptions?.length ? (
        <>
          <h4>Assumptions</h4>
          <ul className="piw-list">{hypothesis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      ) : null}
      <h4>Retained excerpts</h4>
      <EvidenceList evidence={hypothesis.evidence} bundle={bundle} onOpenCitation={onOpenCitation} />
      <RemainingUncertaintyBlock>{hypothesis.remaining_uncertainty}</RemainingUncertaintyBlock>
    </article>
  )
}

function CommitmentRecord({ commitment, bundle, onOpenCitation }) {
  return (
    <article className="piw-card" data-record="commitment" data-record-id={commitment.id}>
      <h3>{commitment.statement}</h3>
      <p>Actor: {commitment.actor}</p>
      <p>Scope: {commitment.scope}</p>
      <p>Deadline wording: {commitment.deadline_text}</p>
      <p>Success criterion: {commitment.success_criterion}</p>
      {commitment.conditions?.length ? (
        <>
          <h4>Conditions</h4>
          <ul className="piw-list">{commitment.conditions.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      ) : null}
      <RemainingUncertaintyBlock>{commitment.remaining_uncertainty}</RemainingUncertaintyBlock>
      <h4>Stages</h4>
      <ol className="piw-stages">
        {stageDepths(commitment.stages).map((stage) => (
          <li key={stage.id} style={{ '--piw-depth': stage.depth }} className="piw-stage">
            <p>
              <strong>{stage.kind}</strong>
              {' · '}
              {STAGE_STATUS_COPY[stage.status] ?? stage.status}
            </p>
            <p>{stage.note}</p>
            {stage.depends_on?.length ? <p className="piw-muted">Depends on earlier stages in this commitment. Dependency is not inferred completion.</p> : null}
            <EvidenceList evidence={stage.evidence} bundle={bundle} onOpenCitation={onOpenCitation} />
          </li>
        ))}
      </ol>
    </article>
  )
}

function CoverageRecord({ row }) {
  return (
    <article className="piw-card" data-record="coverage" data-record-id={row.id}>
      <h3>{row.label}</h3>
      <p>Declaration status: {row.status}. Search: {SEARCH_STATUS_COPY[row.search_status] ?? row.search_status}</p>
      <p>Source classes: {row.source_classes.join(', ') || 'none recorded'}</p>
      <p>Languages: {row.languages.join(', ') || 'none recorded'}</p>
      <p>Regions: {row.regions.join(', ') || 'none recorded'}</p>
      <p>Period: {row.from ? formatWorkspaceDate(row.from) : 'unknown'} – {row.to ? formatWorkspaceDate(row.to) : 'unknown'}</p>
      <p>Retained text: {row.retained_text}</p>
      <p>Searched at: {row.searched_at ? formatWorkspaceDate(row.searched_at) : 'not recorded'}</p>
      <p>Method: {row.method}</p>
      <h4>Limitations</h4>
      <ul className="piw-list">{row.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
    </article>
  )
}

function BeforeStateRecords({ bundle, focus, onOpenCitation }) {
  if (!bundle) {
    return <p className="piw-muted">Compared records are not loaded yet.</p>
  }
  const state = bundle.version?.state ?? {}
  const hypotheses = state.hypotheses ?? []
  const commitments = state.commitments ?? []
  const coverage = state.coverage ?? []
  const orderedCommitments = focus?.group === 'commitments' && focus.id
    ? [...commitments.filter((row) => row.id === focus.id), ...commitments.filter((row) => row.id !== focus.id)]
    : commitments
  const orderedCoverage = focus?.group === 'coverage' && focus.id
    ? [...coverage.filter((row) => row.id === focus.id), ...coverage.filter((row) => row.id !== focus.id)]
    : coverage
  const orderedHypotheses = focus?.group === 'hypotheses' && focus.id
    ? [...hypotheses.filter((row) => row.id === focus.id), ...hypotheses.filter((row) => row.id !== focus.id)]
    : hypotheses
  return (
    <div className="piw-before" data-before-state="true">
      <p className="piw-note">Before/after citations resolve against their own observation, not the displayed bundle.</p>
      <h4>Hypotheses on the compared version</h4>
      <BoundedRecords
        items={orderedHypotheses}
        label="hypotheses"
        renderItem={(hypothesis) => (
          <HypothesisRecord
            key={hypothesis.id}
            hypothesis={hypothesis}
            bundle={bundle}
            onOpenCitation={onOpenCitation}
          />
        )}
      />
      <h4>Commitments on the compared version</h4>
      <BoundedRecords
        items={orderedCommitments}
        label="commitments"
        renderItem={(commitment) => (
          <CommitmentRecord
            key={commitment.id}
            commitment={commitment}
            bundle={bundle}
            onOpenCitation={onOpenCitation}
          />
        )}
      />
      <h4>Collection declarations on the compared version</h4>
      <BoundedRecords
        items={orderedCoverage}
        label="collection declarations"
        renderItem={(row) => <CoverageRecord key={row.id} row={row} />}
      />
    </div>
  )
}

function InputRecordView({ input, position }) {
  const payload = input?.capture?.payload ?? input?.record_version?.payload
  return (
    <div className="piw-card" data-record="input" data-position={position == null ? undefined : String(position)}>
      <p className="piw-mono">Position {position == null ? 'not recorded' : String(position)}</p>
      {input ? (
        <>
          <p>{payload?.title ?? 'Retained source identity'}</p>
          <p className="piw-muted">
            Published {input.capture?.published_at ? formatWorkspaceDate(input.capture.published_at) : 'unknown'}.
            Recorded {input.capture?.recorded_at ? formatWorkspaceDate(input.capture.recorded_at) : 'unknown'}.
          </p>
          {payload?.summary ? <p>{payload.summary}</p> : null}
        </>
      ) : (
        <p>{citationUnavailableCopy()}</p>
      )}
    </div>
  )
}

function EvidenceChangeInspect({ change, currentBundle, beforeBundle, onOpenCitation }) {
  const position = change.position == null ? null : String(change.position)
  const currentInput = snapshotInputAtPosition(currentBundle, position)
  const beforeInput = snapshotInputAtPosition(beforeBundle, position)
  const afterAssessment = snapshotAssessment(currentBundle, change.assessment_id ?? change.after_assessment_id)
  const beforeAssessment = snapshotAssessment(beforeBundle, change.assessment_id ?? change.before_assessment_id)
  const currentCitations = citationsAtPosition(currentBundle, position)
  const beforeCitations = citationsAtPosition(beforeBundle, position)
  return (
    <div data-evidence-change={change.kind}>
      <p>{evidenceChangeLabel(change.kind)}</p>
      {position != null && (
        <>
          <h4>Observation input at this position</h4>
          <p className="piw-muted">Displayed version</p>
          <InputRecordView input={currentInput} position={position} />
          {beforeBundle && (
            <>
              <p className="piw-muted">Compared version</p>
              <InputRecordView input={beforeInput} position={position} />
            </>
          )}
        </>
      )}
      {(afterAssessment || beforeAssessment) && (
        <>
          <h4>Assessments from the matching snapshots</h4>
          {beforeAssessment && (
            <div className="piw-card">
              <p className="piw-muted">Compared version</p>
              <p>{assessmentOutcomeCopy(beforeAssessment.outcome)}</p>
              <p>{beforeAssessment.rationale}</p>
            </div>
          )}
          {afterAssessment && (
            <div className="piw-card">
              <p className="piw-muted">Displayed version</p>
              <p>{assessmentOutcomeCopy(afterAssessment.outcome)}</p>
              <p>{afterAssessment.rationale}</p>
            </div>
          )}
        </>
      )}
      {currentCitations.length > 0 && (
        <>
          <h4>Citations on the displayed observation</h4>
          <EvidenceList evidence={currentCitations} bundle={currentBundle} onOpenCitation={onOpenCitation} />
        </>
      )}
      {beforeCitations.length > 0 && (
        <>
          <h4>Citations on the compared observation</h4>
          <EvidenceList
            evidence={beforeCitations}
            bundle={beforeBundle}
            onOpenCitation={onOpenCitation}
            versionLabel="Compared version"
          />
        </>
      )}
    </div>
  )
}

function citationsAtPosition(bundle, position) {
  if (!bundle || position == null) return []
  const wanted = String(position)
  const refs = []
  for (const hypothesis of bundle.version?.state?.hypotheses ?? []) {
    for (const reference of hypothesis.evidence ?? []) {
      if (String(reference.position) === wanted) refs.push(reference)
    }
  }
  for (const commitment of bundle.version?.state?.commitments ?? []) {
    for (const stage of commitment.stages ?? []) {
      for (const reference of stage.evidence ?? []) {
        if (String(reference.position) === wanted) refs.push(reference)
      }
    }
  }
  return refs
}

function OverviewSection({ panels, bundle, onOpenPublicGraphNode, publicNode }) {
  const assessments = panels.assessments ?? []
  const subject = panels.canonicalSubject
  return (
    <section className="piw-section" id="piw-overview" tabIndex={-1}>
      <h2>Overview</h2>
      <p className="piw-lead">{panels.question}</p>
      <p>{panels.scopeNote}</p>
      <p className="piw-note">{revisionLabel(bundle)}. Observation saved {formatWorkspaceDate(bundle.version.recorded_at)}. {newerCollectionNote(bundle)}</p>
      <p className="piw-note">{timeRangeCopy(panels.timeRange)}</p>
      <p className="piw-note">{snapshotCoverageCopy(bundle.observation?.snapshot?.coverage)}</p>
      <h3>Canonical subject</h3>
      {subject?.type === 'graph_node' ? (
        <div>
          <p>Private record names a graph node identity. That type is generic and is not cast to an event or person here.</p>
          {publicNode ? (
            <button type="button" className="piw-btn" onClick={() => onOpenPublicGraphNode?.(subject.id)}>
              Open the matching public graph record
            </button>
          ) : (
            <p className="piw-note">{publicGraphUnavailableCopy()}</p>
          )}
        </div>
      ) : (
        <p className="piw-muted">No canonical graph subject is recorded on this version.</p>
      )}
      <h3>Selected assessments</h3>
      <p className="piw-note">Dependency assessments can remain in the snapshot for explanation. They are not mixed into this selected list. No overall answer or confidence score is manufactured.</p>
      {assessments.length === 0 ? <EmptySection kind="assessments" /> : (
        <ul className="piw-cards">
          {assessments.map((assessment) => (
            <li key={assessment.id} className="piw-card">
              <p>{assessmentOutcomeCopy(assessment.outcome)}</p>
              <p>{assessment.rationale}</p>
              {assessment.stale ? (
                <p className="piw-note">This recorded assessment has a changed dependency. That is not a completed reassessment.</p>
              ) : null}
              <RemainingUncertaintyBlock>{assessment.remaining_uncertainty}</RemainingUncertaintyBlock>
            </li>
          ))}
        </ul>
      )}
      <h3>Unresolved questions</h3>
      {panels.unresolvedQuestions?.length ? (
        <ul className="piw-list">
          {panels.unresolvedQuestions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      ) : (
        <EmptySection kind="unresolved" />
      )}
    </section>
  )
}

function ChangedSection({
  panels,
  bundle,
  beforeBundles,
  pendingReview,
  reviewBusy,
  reviewError,
  reviewConflict,
  onMarkReviewed,
  onRetryReview,
  onSelectVersion,
  onInspectComparedRecords,
  onInspectEvidenceChange,
  onInspectRemovedRecord,
  onOpenCitation,
}) {
  const comparison = panels.comparison
  const mode = comparison?.mode
  const canReview = panels.canMarkReviewed && mode !== 'historical_before_review'
  const definitionRows = definitionChangeSummary(comparison?.definition_changes)
  const evidenceChanges = Array.isArray(comparison?.evidence_changes) ? comparison.evidence_changes : null
  const beforeId = comparison?.before_version_id ?? null
  const viewingHistorical = Boolean(bundle && !isCurrentSavedVersion(bundle))
  const showRetry = Boolean(pendingReview && reviewError && !reviewConflict)
  return (
    <section className="piw-section" id="piw-changed" tabIndex={-1}>
      <h2>What Changed</h2>
      <p className="piw-note">{COMPARISON_MODE_COPY[mode] ?? COMPARISON_MODE_COPY.not_reviewed}</p>
      {mode === 'scope_changed' && (
        <p className="piw-note">
          Review baseline version {comparison.before_version_id ?? 'not recorded'}. Displayed version {comparison.after_version_id ?? bundle.version.id}. Evidence comparison is unavailable for this scope change.
        </p>
      )}
      {mode === 'historical_before_review' && (
        <p className="piw-note">This historical view cannot mark an earlier version reviewed.</p>
      )}
      {beforeId && (
        <div className="piw-history-controls">
          <p className="piw-note">A comparison baseline is recorded. Opening it does not mark anything reviewed.</p>
          {viewingHistorical ? (
            <button
              type="button"
              className="piw-btn"
              data-action="show-current-version"
              onClick={() => onSelectVersion?.(bundle.investigation_id, null)}
            >
              Show current saved version
            </button>
          ) : (
            <button
              type="button"
              className="piw-btn"
              data-action="open-compared-version"
              onClick={() => onSelectVersion?.(bundle.investigation_id, beforeId)}
            >
              Open the compared version
            </button>
          )}
          <button
            type="button"
            className="piw-text-btn"
            data-action="inspect-compared-records"
            onClick={() => onInspectComparedRecords?.(beforeId)}
          >
            Inspect compared records here
          </button>
        </div>
      )}
      <h3>Evidence record changes</h3>
      {mode === 'scope_changed' && evidenceChanges == null && (
        <p className="piw-note">Evidence comparison is unavailable while candidate scope differs from the review baseline.</p>
      )}
      {mode === 'comparable' && evidenceChanges?.length === 0 && <EmptySection kind="changes" />}
      {evidenceChanges?.length > 0 && (
        <ul className="piw-cards">
          {evidenceChanges.map((change, index) => (
            <li key={`${change.kind}:${change.position ?? change.assessment_id ?? index}`} className="piw-card">
              <p>{evidenceChangeLabel(change.kind)}</p>
              {change.position != null && <p className="piw-mono">Position {String(change.position)}</p>}
              {change.assessment_id && <p className="piw-mono">Assessment {change.assessment_id}</p>}
              {change.candidate_id && <p className="piw-mono">Candidate {change.candidate_id}</p>}
              {change.kind === 'assessment_dependency_change' && (
                <p>Before stale: {String(change.before_stale)}. After stale: {String(change.after_stale)}. A stale dependency is not completed recalculation.</p>
              )}
              {change.kind === 'assessment_replaced' && (
                <p>Before outcome {change.before_outcome}; after outcome {change.after_outcome}. Replacement is not proof of contradiction or confirmation.</p>
              )}
              <button
                type="button"
                className="piw-text-btn"
                data-action="inspect-evidence-change"
                onClick={() => onInspectEvidenceChange?.(change)}
              >
                Inspect this evidence change
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Definition changes</h3>
      {definitionRows.length === 0 ? (
        <p className="piw-muted">No question, hypothesis, commitment, or collection-declaration edits are recorded against this baseline.</p>
      ) : (
        <ul className="piw-list">
          {definitionRows.map((row) => (
            <li key={`${row.group}:${row.action}:${row.id}`}>
              {row.group} {row.action}{row.id ? ` · ${row.id}` : ''}
              {row.action === 'removed' && beforeId && (
                <button
                  type="button"
                  className="piw-text-btn"
                  data-action="inspect-removed-record"
                  onClick={() => onInspectRemovedRecord?.(beforeId, { group: row.group, id: row.id })}
                >
                  Inspect the removed record
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {beforeId && beforeBundles[beforeId] && (
        <BeforeStateRecords
          bundle={beforeBundles[beforeId]}
          onOpenCitation={onOpenCitation}
        />
      )}
      <h3>Review acknowledgement</h3>
      {canReview ? (
        <div className="piw-review">
          <p>Marking reviewed records that you have seen this displayed version. It does not happen on open, scroll, or fetch.</p>
          {showRetry ? (
            <button
              type="button"
              className="piw-btn"
              data-action="retry-review"
              disabled={reviewBusy}
              onClick={() => onRetryReview?.()}
            >
              {reviewBusy ? 'Recording review…' : 'Retry the same review request'}
            </button>
          ) : (
            <button
              type="button"
              className="piw-btn"
              data-action="mark-reviewed"
              disabled={reviewBusy}
              onClick={() => onMarkReviewed?.()}
            >
              {reviewBusy ? 'Recording review…' : 'Mark this displayed version reviewed'}
            </button>
          )}
          {showRetry && (
            <StatusBanner tone="error">
              The review request did not complete. Retry sends the same acknowledgement for version {pendingReview.versionId}, not a newer head.
            </StatusBanner>
          )}
          {reviewConflict && (
            <StatusBanner tone="error" data-review-conflict="true">
              The review baseline changed. Current records were reloaded. Mark reviewed again only if that is still your explicit decision. A newer head was not silently acknowledged.
            </StatusBanner>
          )}
        </div>
      ) : (
        <p className="piw-muted">
          {panels.canMarkReviewed
            ? 'Review is not offered on a historical version that predates the current marker.'
            : 'Viewer access can read this investigation. Marking reviewed is limited to reviewers.'}
        </p>
      )}
    </section>
  )
}

function HypothesesSection({ panels, bundle, onOpenCitation }) {
  if (!panels.hypotheses?.length) return (
    <section className="piw-section" id="piw-hypotheses" tabIndex={-1}>
      <h2>Hypotheses</h2>
      <EmptySection kind="hypotheses" />
    </section>
  )
  return (
    <section className="piw-section" id="piw-hypotheses" tabIndex={-1}>
      <h2>Hypotheses</h2>
      <p className="piw-note">Alternatives may coexist. Linked excerpts validate source binding, not that an explanation is true. No ranking or numeric confidence is added.</p>
      <ul className="piw-cards">
        {panels.hypotheses.map((hypothesis) => (
          <li key={hypothesis.id}>
            <HypothesisRecord hypothesis={hypothesis} bundle={bundle} onOpenCitation={onOpenCitation} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CommitmentsSection({ panels, bundle, onOpenCitation }) {
  if (!panels.commitments?.length) return (
    <section className="piw-section" id="piw-commitments" tabIndex={-1}>
      <h2>Commitments</h2>
      <EmptySection kind="commitments" />
    </section>
  )
  return (
    <section className="piw-section" id="piw-commitments" tabIndex={-1}>
      <h2>Commitments</h2>
      <p className="piw-note">Branches and unknown states are preserved. No follow-up found is not proof of no activity. An observed outcome is not proof of causality.</p>
      <ul className="piw-cards">
        {panels.commitments.map((commitment) => (
          <li key={commitment.id}>
            <CommitmentRecord commitment={commitment} bundle={bundle} onOpenCitation={onOpenCitation} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function GapsSection({ panels }) {
  if (!panels.coverage?.length) return (
    <section className="piw-section" id="piw-gaps" tabIndex={-1}>
      <h2>Evidence Gaps</h2>
      <EmptySection kind="coverage" />
    </section>
  )
  return (
    <section className="piw-section" id="piw-gaps" tabIndex={-1}>
      <h2>Evidence Gaps</h2>
      <p className="piw-note">Collection records are analyst declarations with explicit limits. Observation gaps are shown separately from conflicting evidence. A completed bounded search is not independently measured global coverage.</p>
      <ul className="piw-cards">
        {panels.coverage.map((row) => (
          <li key={row.id}>
            <CoverageRecord row={row} />
          </li>
        ))}
      </ul>
      <h3>Unresolved questions</h3>
      {panels.unresolvedQuestions?.length ? (
        <ul className="piw-list">
          {panels.unresolvedQuestions.map((question) => <li key={question}>{question}</li>)}
        </ul>
      ) : (
        <EmptySection kind="unresolved" />
      )}
    </section>
  )
}

export function PrivateInvestigationInspector({ workspace, onOpenPublicGraphNode, publicNode }) {
  const { state, status } = workspace
  const inspector = state.inspector
  const reveal = canRevealPrivateRecords(status) && state.bundle && state.panels
  if (status === WORKSPACE_STATUS.access_denied) {
    return (
      <div className="piw-inspector">
        <h2>Investigation inspector</h2>
        <p>This investigation is unavailable. Access was denied. The view does not say whether that identifier exists.</p>
      </div>
    )
  }
  if (status === WORKSPACE_STATUS.signed_out || status === WORKSPACE_STATUS.authentication_required) {
    return (
      <div className="piw-inspector">
        <h2>Investigation inspector</h2>
        <p>Private investigation records stay hidden until you sign in. Signing in does not create an assignment.</p>
      </div>
    )
  }
  if (!reveal) {
    return (
      <div className="piw-inspector">
        <h2>Investigation inspector</h2>
        <p>Private investigation records are hidden until an authorized assignment is loaded.</p>
      </div>
    )
  }
  const beforeBundle = inspector?.versionId ? state.beforeBundles[inspector.versionId] : null
  return (
    <div className="piw-inspector">
      <h2>Investigation inspector</h2>
      <p className="ws-nav-note">The five sections share this saved version and review state.</p>
      <dl className="ws-inspector-dl">
        <div>
          <dt>Displayed version</dt>
          <dd>{revisionLabel(state.bundle)}</dd>
        </div>
        <div>
          <dt>Review</dt>
          <dd>{state.bundle?.review?.id ? `Receipt recorded ${formatWorkspaceDate(state.bundle.review.recorded_at)}` : 'Not marked reviewed'}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>{state.bundle?.access_role ?? 'not loaded'}</dd>
        </div>
      </dl>
      {inspector?.kind === 'citation' && (
        <section>
          <h3>Selected excerpt</h3>
          <ExcerptBlock resolved={inspector.resolved} reference={inspector.reference} />
          {inspector.input?.capture && (
            <p className="piw-muted">
              Source identity retained in this observation.
              Published {inspector.input.capture.published_at ? formatWorkspaceDate(inspector.input.capture.published_at) : 'unknown'}.
              Recorded {inspector.input.capture.recorded_at ? formatWorkspaceDate(inspector.input.capture.recorded_at) : 'unknown'}.
            </p>
          )}
        </section>
      )}
      {inspector?.kind === 'before-state' && (
        <section>
          <h3>Compared version records</h3>
          <BeforeStateRecords
            bundle={beforeBundle}
            focus={inspector.focus}
            onOpenCitation={undefined}
          />
        </section>
      )}
      {inspector?.kind === 'evidence-change' && (
        <section>
          <h3>Evidence change</h3>
          <EvidenceChangeInspect
            change={inspector.change}
            currentBundle={state.bundle}
            beforeBundle={inspector.beforeVersionId ? state.beforeBundles[inspector.beforeVersionId] : null}
          />
        </section>
      )}
      {state.panels?.canonicalSubject?.type === 'graph_node' && (
        <section>
          <h3>Public graph</h3>
          {publicNode ? (
            <button type="button" className="piw-btn" onClick={() => onOpenPublicGraphNode?.(state.panels.canonicalSubject.id)}>
              Open matching public graph record
            </button>
          ) : (
            <p>{publicGraphUnavailableCopy()}</p>
          )}
        </section>
      )}
    </div>
  )
}

export default function PrivateInvestigationWorkspace({
  workspace,
  onSignIn,
  accountUiAvailable = false,
  onOpenPublicGraphNode,
  publicNode = null,
}) {
  const { state, status, sessionLoading, actions } = workspace
  const panels = state.panels
  const bundle = state.bundle
  const revealPrivate = canRevealPrivateRecords(status) && panels && bundle

  const openCitation = (reference, sourceBundle) => {
    const resolved = resolveWorkspaceExcerpt(sourceBundle, reference)
    actions.setInspector({
      kind: 'citation',
      reference,
      resolved,
      input: resolved?.input ?? null,
      versionId: sourceBundle?.version?.id ?? null,
    })
    actions.setActiveSection('changed')
  }

  const inspectComparedRecords = async (versionId, focus = null) => {
    await actions.openBeforeVersion(versionId)
    actions.setInspector({ kind: 'before-state', versionId, focus })
    actions.setActiveSection('changed')
  }

  const inspectEvidenceChange = async (change) => {
    const beforeId = panels?.comparison?.before_version_id ?? null
    if (beforeId) await actions.openBeforeVersion(beforeId)
    actions.setInspector({
      kind: 'evidence-change',
      change,
      beforeVersionId: beforeId,
    })
    actions.setActiveSection('changed')
  }

  const scrollTo = (id) => {
    actions.setActiveSection(id)
    const el = typeof document !== 'undefined' ? document.getElementById(`piw-${id}`) : null
    el?.focus?.()
    el?.scrollIntoView?.({ block: 'start' })
  }

  return (
    <div className="piw" data-private-investigation="true" data-workspace-status={status}>
      <div className="piw-toolbar">
        <div>
          <p className="piw-kicker">Assigned investigations</p>
          <p className="piw-muted">Only investigations assigned to this account appear. Refresh to load the current list.</p>
        </div>
        {status !== WORKSPACE_STATUS.signed_out && status !== WORKSPACE_STATUS.session_loading && (
          <button type="button" className="piw-btn" onClick={() => actions.refresh()}>
            Refresh assignments
          </button>
        )}
      </div>

      {sessionLoading || status === WORKSPACE_STATUS.session_loading ? (
        <StatusBanner>Checking your session… Private investigation requests have not started.</StatusBanner>
      ) : null}

      {status === WORKSPACE_STATUS.signed_out || status === WORKSPACE_STATUS.authentication_required ? (
        <div className="piw-empty-state">
          <h2>Sign in to read assigned investigations</h2>
          <p>Private questions, hypotheses, commitments, and collection declarations stay with the signed-in account. Signing in does not create an assignment.</p>
          {accountUiAvailable ? (
            <button type="button" className="piw-btn" onClick={onSignIn}>Sign in</button>
          ) : (
            <p className="piw-note">Account sign-in is not enabled in this session. No private records are requested.</p>
          )}
        </div>
      ) : null}

      {status === WORKSPACE_STATUS.loading ? (
        <StatusBanner>Loading assigned investigations…</StatusBanner>
      ) : null}

      {status === WORKSPACE_STATUS.empty ? (
        <div className="piw-empty-state">
          <h2>No investigations assigned to this account yet.</h2>
          <p>This list only includes investigations assigned to the signed-in account.</p>
        </div>
      ) : null}

      {status === WORKSPACE_STATUS.access_denied ? (
        <div className="piw-empty-state">
          <h2>This investigation is unavailable</h2>
          <p>Access was denied. The view does not say whether that identifier exists.</p>
        </div>
      ) : null}

      {status === WORKSPACE_STATUS.unsupported_contract ? (
        <div className="piw-empty-state">
          <h2>This investigation contract is not supported</h2>
          <p>The response is not investigation-workspace-1. Field mappings are not guessed.</p>
        </div>
      ) : null}

      {status === WORKSPACE_STATUS.unavailable ? (
        <div className="piw-empty-state">
          <h2>Private investigations are unavailable</h2>
          <p>{unavailableCopy(state.bundleError ?? state.catalogError)}</p>
          <button type="button" className="piw-btn" onClick={() => actions.refresh()}>Retry</button>
        </div>
      ) : null}

      {state.catalog.length > 0 && status !== WORKSPACE_STATUS.signed_out && status !== WORKSPACE_STATUS.authentication_required && (
        <div className="piw-catalog" aria-label="Assigned investigations">
          {state.catalog.map((item) => (
            <button
              key={item.investigation_id}
              type="button"
              className={`piw-catalog-item${item.investigation_id === state.selectedInvestigationId ? ' active' : ''}`}
              onClick={() => actions.selectInvestigation(item.investigation_id)}
            >
              <span className="piw-catalog-question">{item.question}</span>
              <span className="piw-muted">Revision {item.revision} · {item.access_role}</span>
            </button>
          ))}
          {state.hasMore && (
            <button type="button" className="piw-text-btn" onClick={() => actions.loadMore()}>
              Load more assignments
            </button>
          )}
        </div>
      )}

      {revealPrivate && (
        <>
          <nav className="piw-section-nav" aria-label="Investigation sections">
            {INVESTIGATION_WORKSPACE_PANELS.map((panel) => (
              <button
                key={panel.id}
                type="button"
                className={`piw-section-btn${state.activeSection === panel.id ? ' active' : ''}`}
                onClick={() => scrollTo(panel.id)}
              >
                {panel.label}
              </button>
            ))}
          </nav>
          <OverviewSection
            panels={panels}
            bundle={bundle}
            publicNode={publicNode}
            onOpenPublicGraphNode={onOpenPublicGraphNode}
          />
          <ChangedSection
            panels={panels}
            bundle={bundle}
            beforeBundles={state.beforeBundles}
            pendingReview={state.pendingReview}
            reviewBusy={state.reviewBusy}
            reviewError={state.reviewError}
            reviewConflict={state.reviewConflict}
            onMarkReviewed={actions.markReviewed}
            onRetryReview={actions.retryReview}
            onSelectVersion={actions.selectVersion}
            onInspectComparedRecords={inspectComparedRecords}
            onInspectEvidenceChange={inspectEvidenceChange}
            onInspectRemovedRecord={inspectComparedRecords}
            onOpenCitation={openCitation}
          />
          <HypothesesSection panels={panels} bundle={bundle} onOpenCitation={openCitation} />
          <CommitmentsSection panels={panels} bundle={bundle} onOpenCitation={openCitation} />
          <GapsSection panels={panels} />
        </>
      )}
    </div>
  )
}
