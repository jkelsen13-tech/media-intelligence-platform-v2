import AssessmentEvidenceTrail, { RetainedInputRecord, RetainedInputDates } from './InvestigationAssessmentTrail.jsx'
import InvestigationSourceHistory from './InvestigationSourceHistory.jsx'
import { createInvestigationInputImpactClient } from '../lib/investigationInputImpactClient.js'
import { createInvestigationSourceSpansClient } from '../lib/investigationSourceSpansClient.js'
import { SourceSpanInspector } from './InvestigationSourceSpans.jsx'
import InvestigationDefinitionRevisions from './InvestigationDefinitionRevisions.jsx'
import { supabase } from '../lib/supabase.js'

import RemainingUncertaintyBlock from './RemainingUncertaintyBlock.jsx'
import {
  EVIDENCE_REVIEW_LABELS,
} from '../lib/investigationEvidenceReviewsClient.js'
import {
  REVIEW_FILTER_ALL,
  REVIEW_FILTER_ATTENTION,
  buildSuggestedReviewDraft,
  humanReviewStatusCopy,
  reviewAuthorLabel,
  reviewDecisionLabel,
  reviewSubmissionBlockReason,
  reviewTargetFromPanels,
  reviewTargetKey,
  reviewHistoryRefreshBlocked,
  reviewsUnavailableCopy,
  targetMatchesFilter,
} from '../lib/investigationEvidenceReviewUi.js'
import {
  COMPARISON_MODE_COPY,
  EMPTY_SECTION_COPY,
  INVESTIGATION_WORKSPACE_PANELS,
  SEARCH_STATUS_COPY,
  STAGE_STATUS_COPY,
  WORKSPACE_STATUS,
  assessmentOutcomeCopy,
  canRevealPrivateRecords,
  challengeCueCopy,
  checksUnavailableCopy,
  citationUnavailableCopy,
  definitionChangeSummary,
  evidenceChangeLabel,
  isCurrentSavedVersion,
  lineageReasonCopy,
  newerCollectionNote,
  publicGraphUnavailableCopy,
  resolveWorkspaceMetadata,
  revisionLabel,
  safeWorkspaceHttpUrl,
  snapshotAssessment,
  snapshotCoverageCopy,
  snapshotInputAtPosition,
  snapshotInputPayload,
  stageDepths,
  timeRangeCopy,
  unavailableCopy,
} from '../lib/investigationWorkspaceSession.js'
import { resolveWorkspaceExcerpt } from '../lib/investigationWorkspaceClient.js'
import { formatWorkspaceDate } from '../lib/workspacePresentation.js'
import '../styles/investigation-workspace-panels.css'

const defaultInputImpactClient = createInvestigationInputImpactClient(supabase)
const defaultSourceSpansClient = createInvestigationSourceSpansClient(supabase)

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
        {reference.relation || reference.note ? (
          <p>{RELATION_LABELS[reference.relation] ?? reference.relation}{reference.note ? `. ${reference.note}` : ''}</p>
        ) : null}
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

function ReviewProgressCard({ reviewsPanels, reviewsError, loadingReviews, decisionSavedNeedsRefresh, pendingDecision, reviewsBusy, reviewsConflict, onRetryRead, onRetryDecision }) {
  if (!reviewsPanels && !reviewsError && !loadingReviews) return null
  const summary = reviewsPanels?.summary
  const showDecisionRetry = Boolean(pendingDecision && reviewsError && !reviewsConflict && !decisionSavedNeedsRefresh)
  const showReadRetry = Boolean(reviewsError && !showDecisionRetry)
  return (
    <div className="piw-review-progress" data-review-progress="true">
      <h3>Review progress for returned report targets</h3>
      <p className="piw-note">
        Counts cover only the targets returned in this saved evidence-check report. Never-reviewed items are already included in needs review; do not add those counts together.
        Reviewing every returned target does not mean all retained evidence, the source corpus, or the web was reviewed. Human decisions do not remove scan limits, increase confidence, or mark the workspace review baseline.
        Independence stays unknown. These are relevance decisions, not factual verdicts.
      </p>
      {loadingReviews ? <StatusBanner>Loading saved evidence reviews…</StatusBanner> : null}
      {decisionSavedNeedsRefresh ? (
        <StatusBanner tone="error" data-review-saved-refresh="true">
          Decision saved; refresh to load current review state.
        </StatusBanner>
      ) : null}
      {reviewsConflict ? (
        <StatusBanner tone="error" data-review-decision-conflict="true">
          {reviewsUnavailableCopy('version_conflict')}
        </StatusBanner>
      ) : null}
      {reviewsError && !reviewsConflict ? (
        <StatusBanner tone="error">{reviewsUnavailableCopy(reviewsError)}</StatusBanner>
      ) : null}
      {summary ? (
        <ul className="piw-review-counts" data-review-scope="returned_report_targets_only">
          <li>Returned targets: {summary.returned_targets}</li>
          <li>Needs review: {summary.needs_review} (never reviewed: {summary.never_reviewed})</li>
          <li>Retained for follow-up: {summary.relevant}</li>
          <li>Dismissed for this investigation: {summary.not_relevant}</li>
          <li>Disputed: {summary.disputed}</li>
        </ul>
      ) : reviewsError ? (
        <p className="piw-note">Review progress is unavailable. This is not an unreviewed ledger of zero targets.</p>
      ) : null}
      {showDecisionRetry ? (
        <button
          type="button"
          className="piw-btn"
          data-action="retry-evidence-review-decision"
          disabled={reviewsBusy}
          onClick={() => onRetryDecision?.()}
        >
          {reviewsBusy ? 'Saving review decision…' : 'Retry the same review decision'}
        </button>
      ) : null}
      {showReadRetry ? (
        <button
          type="button"
          className="piw-btn"
          data-action="retry-evidence-reviews"
          data-retry-kind="read"
          disabled={loadingReviews}
          onClick={() => onRetryRead?.()}
        >
          {loadingReviews ? 'Loading saved evidence reviews…' : 'Retry loading review state'}
        </button>
      ) : null}
    </div>
  )
}

function ReviewFilterBar({ summary, filter, onChange }) {
  if (!summary) return null
  const attention = Number(summary.needs_review ?? 0) + Number(summary.disputed ?? 0)
  return (
    <div className="piw-review-filter" role="group" aria-label="Evidence review filter">
      <button
        type="button"
        className={`piw-section-btn${filter === REVIEW_FILTER_ATTENTION ? ' active' : ''}`}
        data-action="review-filter-attention"
        onClick={() => onChange?.(REVIEW_FILTER_ATTENTION)}
      >
        Needs review or disputed ({attention})
      </button>
      <button
        type="button"
        className={`piw-section-btn${filter === REVIEW_FILTER_ALL ? ' active' : ''}`}
        data-action="review-filter-all"
        onClick={() => onChange?.(REVIEW_FILTER_ALL)}
      >
        All returned targets ({summary.returned_targets})
      </button>
    </div>
  )
}

function ReviewDecisionForm({
  targetKind,
  target,
  machineTarget,
  bundle,
  canDecide,
  draft,
  pendingDecision,
  reviewsBusy,
  decisionSavedNeedsRefresh,
  reviewsConflict,
  onDraftChange,
  onSave,
  onOpenCitation,
}) {
  const reviewTarget = target
  if (!reviewTarget && !canDecide) return null
  const suggested = draft ?? buildSuggestedReviewDraft(targetKind, machineTarget, bundle)
  const frozen = Boolean(
    pendingDecision
    && pendingDecision.target_kind === targetKind
    && pendingDecision.target_id === (machineTarget?.id ?? reviewTarget?.target_id),
  )
  const blockReason = canDecide && !frozen ? reviewSubmissionBlockReason(suggested, targetKind) : null
  const saveBlocked = Boolean(blockReason) || reviewsBusy || decisionSavedNeedsRefresh || frozen
  return (
    <div className="piw-review-form" data-review-target={`${targetKind}:${machineTarget?.id}`}>
      <p data-human-review="true">{humanReviewStatusCopy(reviewTarget)}</p>
      {reviewTarget?.latest_event?.rationale_preview ? (
        <p className="piw-muted">Latest rationale preview: {reviewTarget.latest_event.rationale_preview}</p>
      ) : null}
      {!canDecide ? (
        <p className="piw-muted">Viewer access can read this review state and history. Saving a decision is limited to reviewers.</p>
      ) : (
        <>
          <p className="piw-note">
            Save records a relevance decision for this returned target. It does not run on open, focus, navigation, checking a box, or marking the workspace reviewed.
            Labels are not factual verdicts, verified relationships, or independent-source classifications.
          </p>
          <label className="piw-field">
            Decision
            <select
              value={suggested.decision}
              disabled={frozen || reviewsBusy || decisionSavedNeedsRefresh}
              onChange={(event) => onDraftChange?.({ ...suggested, decision: event.target.value })}
            >
              {Object.entries(EVIDENCE_REVIEW_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="piw-field">
            Rationale
            <textarea
              rows={3}
              value={suggested.rationale}
              disabled={frozen || reviewsBusy || decisionSavedNeedsRefresh}
              onChange={(event) => onDraftChange?.({ ...suggested, rationale: event.target.value })}
            />
          </label>
          <fieldset className="piw-evidence-pick" disabled={frozen || reviewsBusy || decisionSavedNeedsRefresh}>
            <legend>Retained evidence references</legend>
            <p className="piw-muted">Machine spans are suggestions. Inspect surrounding retained text before saving. Text references need a relation and a reviewer-confirmed note.</p>
            {suggested.items.map((item, index) => (
              <div key={item.id} className="piw-evidence-item">
                <label>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(event) => {
                      const items = suggested.items.map((row, rowIndex) => (
                        rowIndex === index ? { ...row, selected: event.target.checked } : row
                      ))
                      onDraftChange?.({ ...suggested, items })
                    }}
                  />
                  {item.kind === 'metadata'
                    ? `Saved source status ${item.value} at position ${item.position}`
                    : `Position ${item.position} · ${item.source_field} · “${item.excerpt}”`}
                  {item.required ? ' (required input)' : ' (additional context)'}
                </label>
                {!item.resolvable ? (
                  <p className="piw-note">This reference cannot be resolved against the matching saved observation.</p>
                ) : item.kind === 'text' ? (
                  <>
                    <label className="piw-field">
                      Relation
                      <select
                        value={item.relation}
                        onChange={(event) => {
                          const items = suggested.items.map((row, rowIndex) => (
                            rowIndex === index ? { ...row, relation: event.target.value } : row
                          ))
                          onDraftChange?.({ ...suggested, items })
                        }}
                      >
                        <option value="context">Recorded as context</option>
                        <option value="supports">Recorded as supporting</option>
                        <option value="contradicts">Recorded as contradicting</option>
                      </select>
                    </label>
                    <label className="piw-field">
                      Note
                      <textarea
                        rows={2}
                        value={item.note}
                        onChange={(event) => {
                          const items = suggested.items.map((row, rowIndex) => (
                            rowIndex === index ? { ...row, note: event.target.value } : row
                          ))
                          onDraftChange?.({ ...suggested, items })
                        }}
                      />
                    </label>
                    {onOpenCitation && item.resolvable ? (
                      <button
                        type="button"
                        className="piw-text-btn"
                        onClick={() => onOpenCitation({
                          position: item.position,
                          source_field: item.source_field,
                          span_start: item.span_start,
                          span_end: item.span_end,
                          excerpt: item.excerpt,
                          relation: item.relation,
                          note: item.note || 'Inspect surrounding retained text.',
                        }, bundle)}
                      >
                        Inspect surrounding retained text
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ))}
          </fieldset>
          {blockReason ? <p className="piw-note" data-review-block="true">{blockReason}</p> : null}
          {frozen ? (
            <p className="piw-note">A decision request is in progress. Edits will not change the frozen payload.</p>
          ) : null}
          <button
            type="button"
            className="piw-btn"
            data-action="save-evidence-review"
            disabled={saveBlocked}
            onClick={() => {
              const next = draft ?? suggested
              onDraftChange?.(next)
              onSave?.(next)
            }}
          >
            {reviewsBusy && frozen ? 'Saving review decision…' : 'Save decision'}
          </button>
        </>
      )}
    </div>
  )
}

function ReviewHistoryPanel({
  history,
  loading,
  loadingOlder,
  error,
  refreshDisabled = false,
  onLoadOlder,
  onRetry,
  onRefresh,
  onOpenCitation,
  bundle,
}) {
  return (
    <section className="piw-review-history" data-review-history="true">
      <h3>Decision history</h3>
      <p className="piw-note">
        History is pinned to accepted review revision {history?.at_revision ?? 'not loaded'} and does not mix later decisions into this page.
        Browsing history does not mark the workspace reviewed or change the selected version.
      </p>
      {history?.refreshed ? (
        <p className="piw-note" data-history-refreshed="true">
          This history view was explicitly refreshed to review revision {history.at_revision}. Earlier pages from a previous revision are not mixed in.
        </p>
      ) : null}
      {loading ? <StatusBanner>Loading decision history…</StatusBanner> : null}
      {error ? (
        <StatusBanner tone="error">
          {reviewsUnavailableCopy(error)} History failure is not an empty decision list.
        </StatusBanner>
      ) : null}
      {error ? (
        <button type="button" className="piw-btn" data-action="retry-review-history" onClick={() => onRetry?.()}>
          Retry loading decision history
        </button>
      ) : null}
      {history?.events?.length ? (
        <ol className="piw-stack">
          {history.events.map((event) => (
            <li key={event.id} className="piw-card" data-review-event={event.id}>
              <p><strong>{reviewDecisionLabel(event.decision)}</strong> · {reviewAuthorLabel(event)} · revision {event.revision}</p>
              <p>{event.rationale}</p>
              <ul className="piw-list">
                {(event.evidence ?? []).map((reference, index) => (
                  <li key={`${event.id}:${index}`}>
                    {reference.source_field === 'source_status' ? (
                      <p>Saved source status {reference.value} at position {reference.position}.</p>
                    ) : (
                      <ExcerptBlock
                        resolved={resolveWorkspaceExcerpt(bundle, reference)}
                        reference={reference}
                        onOpen={onOpenCitation ? () => onOpenCitation(reference, bundle) : undefined}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : !loading && !error ? (
        <p className="piw-muted">No review events are recorded for this target at this pinned revision.</p>
      ) : null}
      <div className="piw-history-controls">
        {history?.next_before_revision ? (
          <button
            type="button"
            className="piw-btn"
            data-action="load-older-review-history"
            disabled={loadingOlder || loading}
            onClick={() => onLoadOlder?.()}
          >
            {loadingOlder ? 'Loading older decisions…' : 'Load older decisions'}
          </button>
        ) : history?.events?.length ? (
          <p className="piw-muted">No older decisions remain at this pinned revision.</p>
        ) : null}
        <button
          type="button"
          className="piw-text-btn"
          data-action="refresh-review-history"
          disabled={refreshDisabled}
          title={refreshDisabled ? 'History refresh is unavailable while a review decision is being saved.' : undefined}
          onClick={() => {
            if (refreshDisabled) return
            onRefresh?.()
          }}
        >
          Refresh history to the latest review revision
        </button>
      </div>
    </section>
  )
}

function HypothesisRecord({ hypothesis, bundle, onOpenCitation }) {
  const selectedIds = bundle?.observation?.snapshot?.selected_assessment_ids ?? []
  return (
    <article className="piw-card" data-record="hypothesis" data-record-id={hypothesis.id}>
      <h3>{hypothesis.statement}</h3>
      {hypothesis.assumptions?.length ? (
        <>
          <h4>Assumptions</h4>
          <ul className="piw-list">{hypothesis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      ) : null}
      <h4>What would strengthen this explanation</h4>
      <ul className="piw-list">{hypothesis.would_strengthen?.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <h4>What would weaken this explanation</h4>
      <ul className="piw-list">{hypothesis.would_weaken?.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <p className="piw-note">These are recorded criteria for evaluating the explanation; they do not mean that this evidence has been found.</p>
      <h4>Linked assessments</h4>
      {hypothesis.assessment_ids?.length ? hypothesis.assessment_ids.map((id, index) => {
        const assessment = selectedIds.includes(id) ? snapshotAssessment(bundle, id) : null
        return (
          <details className="piw-linked-record" key={`${id}:${index}`}>
            <summary>Assessment {index + 1} · {assessment ? 'View saved reasoning' : 'Unavailable on this saved version'}</summary>
            {assessment ? <>
              <p>{assessmentOutcomeCopy(assessment.outcome)}</p>
              <p>{assessment.rationale}</p>
              {assessment.stale ? <p className="piw-note">This recorded assessment has a changed dependency. That is not a completed reassessment.</p> : null}
              <RemainingUncertaintyBlock>{assessment.remaining_uncertainty}</RemainingUncertaintyBlock>
              <AssessmentEvidenceTrail key={`${bundle?.version?.id}:${assessment.id}`} bundle={bundle} assessmentId={assessment.id} />
            </> : <p className="piw-muted">The linked selected assessment is not available in this saved observation.</p>}
          </details>
        )
      }) : <p className="piw-muted">No assessments are linked to this explanation.</p>}
      <h4>Retained excerpts</h4>
      <EvidenceList evidence={hypothesis.evidence} bundle={bundle} onOpenCitation={onOpenCitation} />
      <RemainingUncertaintyBlock>{hypothesis.remaining_uncertainty}</RemainingUncertaintyBlock>
    </article>
  )
}

function CommitmentRecord({ commitment, bundle, onOpenCitation }) {
  const stages = commitment.stages ?? []
  const coverage = bundle?.version?.state?.coverage ?? []
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
        {stageDepths(stages).map((stage, stageIndex) => (
          <li key={stage.id} style={{ '--piw-depth': stage.depth }} className="piw-stage">
            <p>
              <strong>Stage {stageIndex + 1} · {stage.kind}</strong>
              {' · '}
              {STAGE_STATUS_COPY[stage.status] ?? stage.status}
            </p>
            <p>{stage.note}</p>
            {stage.depends_on?.length ? <>
              <h4>Depends on</h4>
              <p className="piw-note">These links describe prerequisites, not proof that a stage completed.</p>
              <ul className="piw-list">{stage.depends_on.map((id, index) => {
                const dependencyIndex = stages.findIndex((item) => item.id === id)
                const dependency = dependencyIndex >= 0 && dependencyIndex < stageIndex ? stages[dependencyIndex] : null
                return <li key={`${id}:${index}`}>{dependency
                  ? <>Stage {dependencyIndex + 1} · {dependency.kind} · {STAGE_STATUS_COPY[dependency.status] ?? dependency.status}<p>{dependency.note}</p></>
                  : 'Linked prerequisite unavailable in this commitment on this saved version.'}</li>
              })}</ul>
            </> : null}
            {stage.coverage_ids?.length ? <>
              <h4>Linked collection records</h4>
              <p className="piw-note">Search declarations apply only to their recorded scope. No follow-up found does not establish that nothing happened.</p>
              {stage.coverage_ids.map((id, index) => {
                const row = coverage.find((item) => item.id === id)
                return <details className="piw-linked-record" key={`${id}:${index}`}>
                  <summary>{row?.label ?? 'Collection record unavailable on this saved version'}</summary>
                  {row ? <CoverageRecord row={row} /> : <p className="piw-muted">The linked collection record is not available in this saved version.</p>}
                </details>
              })}
            </> : null}
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
          <RetainedInputRecord key={`after:${currentBundle?.version?.id}:${position}`} input={currentInput} position={position} bundle={currentBundle} />
          {beforeBundle && (
            <>
              <p className="piw-muted">Compared version</p>
              <RetainedInputRecord key={`before:${beforeBundle?.version?.id}:${position}`} input={beforeInput} position={position} bundle={beforeBundle} />
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
              <AssessmentEvidenceTrail key={`${beforeBundle?.version?.id}:${beforeAssessment.id}`} bundle={beforeBundle} assessmentId={beforeAssessment.id} />
            </div>
          )}
          {afterAssessment && (
            <div className="piw-card">
              <p className="piw-muted">Displayed version</p>
              <p>{assessmentOutcomeCopy(afterAssessment.outcome)}</p>
              <p>{afterAssessment.rationale}</p>
              <AssessmentEvidenceTrail key={`${currentBundle?.version?.id}:${afterAssessment.id}`} bundle={currentBundle} assessmentId={afterAssessment.id} />
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
              <AssessmentEvidenceTrail key={`${bundle?.version?.id}:${assessment.id}`} bundle={bundle} assessmentId={assessment.id} />
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
  onLoadBeforeVersion,
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
      <InvestigationDefinitionRevisions key={`${bundle.version.id}:${beforeId}:${bundle.review?.id}`} bundle={bundle} beforeBundle={beforeBundles[beforeId]}
        onLoadBeforeVersion={onLoadBeforeVersion}
        renderEvidence={(evidence, sourceBundle) => <EvidenceList evidence={evidence} bundle={sourceBundle} onOpenCitation={onOpenCitation}
          versionLabel={sourceBundle.version.id === bundle.version.id ? 'Displayed version' : 'Compared version'} />} />
      {beforeId && beforeBundles[beforeId] && (
        <details className="piw-linked-record"><summary>All records on the compared version</summary><BeforeStateRecords
          bundle={beforeBundles[beforeId]}
          onOpenCitation={onOpenCitation}
        /></details>
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

function MetadataNotice({ cue, metadata }) {
  return (
    <div className="piw-metadata" data-cue-kind="recorded_source_status">
      <p>{challengeCueCopy('recorded_source_status')}</p>
      <p>Recorded source status: {cue.metadata_reference?.value ?? 'not recorded'}.</p>
      {metadata ? (
        <p className="piw-muted">
          Position {String(cue.metadata_reference.position)}
          {metadata.recordVersionId ? ` · retained record ${metadata.recordVersionId}` : ''}
          . This is the saved record version, not current live source text.
        </p>
      ) : (
        <p className="piw-muted">{citationUnavailableCopy()}</p>
      )}
    </div>
  )
}

function SourceWitness({ bundle, reference, position, onOpen, label }) {
  const input = snapshotInputAtPosition(bundle, position)
  const payload = snapshotInputPayload(input)
  const resolved = reference ? resolveWorkspaceExcerpt(bundle, reference) : null
  const safeUrl = safeWorkspaceHttpUrl(payload?.url)
  return (
    <div className="piw-witness">
      {label ? <p className="piw-muted">{label}</p> : null}
      <p>{payload?.title ?? 'Retained source identity'}</p>
      {payload?.outlet ? <p className="piw-muted">{payload.outlet}</p> : null}
      {payload?.url ? (
        safeUrl ? (
          <p><a href={safeUrl} target="_blank" rel="noreferrer">{safeUrl}</a></p>
        ) : (
          <p className="piw-muted">Retained locator (not opened as a link): {payload.url}</p>
        )
      ) : null}
      {reference ? (
        <ExcerptBlock resolved={resolved} reference={reference} onOpen={onOpen} />
      ) : (
        <p className="piw-muted">No retained text witness is attached to this side.</p>
      )}
    </div>
  )
}

function EvidenceChecksToolbar({
  bundle,
  checksPanels,
  loadingChecks,
  checksBusy,
  checksError,
  pendingChecksRun,
  onRun,
  onRetry,
}) {
  const viewingHistorical = Boolean(bundle && !isCurrentSavedVersion(bundle))
  const canRun = checksPanels?.canRun === true
  const requestInFlight = Boolean(checksBusy || loadingChecks)
  const showRunRetry = Boolean(checksError && pendingChecksRun)
  const showReadRetry = Boolean(checksError && !pendingChecksRun)
  const showRetry = showRunRetry || showReadRetry
  return (
    <div className="piw-checks-toolbar">
      <h2>Evidence checks for this saved version</h2>
      <p className="piw-note">
        Source Links, Evidence Checks, and Search Coverage share one version-bound private report.
        Reading, switching tabs, refreshing, opening the inspector, or rendering does not run checks.
      </p>
      {viewingHistorical ? (
        <p className="piw-note" data-historical-checks="true">
          This is a historical saved version. Inspecting or running checks here uses this displayed version only. It does not mark the investigation reviewed.
        </p>
      ) : null}
      {loadingChecks ? <StatusBanner>Loading saved evidence checks…</StatusBanner> : null}
      {checksError ? (
        <StatusBanner tone="error">{checksUnavailableCopy(checksError)}</StatusBanner>
      ) : null}
      {showRetry ? (
        <button
          type="button"
          className="piw-btn"
          data-action="retry-evidence-checks"
          data-retry-kind={showRunRetry ? 'run' : 'read'}
          disabled={requestInFlight}
          onClick={() => onRetry?.()}
        >
          {checksBusy ? 'Saving evidence checks…' : 'Retry the same evidence-check request'}
        </button>
      ) : canRun ? (
        <button
          type="button"
          className="piw-btn"
          data-action="run-evidence-checks"
          disabled={requestInFlight}
          onClick={() => onRun?.()}
        >
          {checksBusy ? 'Saving evidence checks…' : 'Run evidence checks'}
        </button>
      ) : checksPanels?.status === 'saved' ? (
        <p className="piw-muted">A report is already saved for this version. Checks are not run again from this view.</p>
      ) : checksPanels?.status === 'not_run' ? (
        <p className="piw-muted">Viewer access can read a saved report. Running checks is limited to reviewers.</p>
      ) : null}
    </div>
  )
}

function SourceLinksSection({
  bundle,
  checksPanels,
  loadingChecks,
  reviewsPanels,
  reviewFilter,
  reviewDrafts,
  canDecide,
  pendingDecision,
  reviewsBusy,
  decisionSavedNeedsRefresh,
  reviewsConflict,
  onInspectPair,
  onOpenWitness,
  onDraftChange,
  onSave,
}) {
  const lineage = checksPanels?.lineage ?? []
  const coverage = checksPanels?.coverage
  const truncated = coverage && coverage.lineage_candidates_found > coverage.lineage_candidates_returned
  const visible = lineage.filter((pair) => {
    if (!reviewsPanels) return true
    const target = reviewTargetFromPanels(reviewsPanels, 'source_link', pair.id)
    return targetMatchesFilter(target ?? { decision: 'needs_review', latest_event: null }, reviewFilter)
  })
  return (
    <section className="piw-section" id="piw-source-links" tabIndex={-1}>
      <h2>Source Links</h2>
      <p className="piw-note">
        These are candidate pairs from this saved observation. Source independence is unresolved and transmission direction is undetermined.
        Same article or URL indicates related captures, not necessarily syndication. Exact repeated text may be boilerplate or a common quotation.
        No outlet is labeled independent. Human review decisions below are relevance decisions, not verified relationships or independent sources.
      </p>
      {loadingChecks && !checksPanels ? <p className="piw-muted">Loading source-link candidates…</p> : null}
      {checksPanels?.status === 'not_run' ? (
        <p className="piw-empty">Checks have not been run for this saved version.</p>
      ) : checksPanels?.status === 'saved' && lineage.length === 0 ? (
        <p className="piw-empty">No source-link candidates were found in this saved observation. That is not evidence that nothing happened, and it does not establish independence.</p>
      ) : lineage.length > 0 ? (
        <>
          {reviewsPanels && visible.length === 0 ? (
            <p className="piw-note">No source-link targets match this review filter. Use All returned targets to keep every original pair discoverable.</p>
          ) : null}
          <ul className="piw-cards">
            {visible.map((pair) => {
              const reviewTarget = reviewTargetFromPanels(reviewsPanels, 'source_link', pair.id)
              return (
                <li key={pair.id} className="piw-card" data-source-link={pair.id}>
                  <p>Possible shared-source pair. Independence: unknown. Direction: undetermined.</p>
                  <p className="piw-muted">Machine detection remains a candidate pair. It is not replaced by the human decision.</p>
                  <ul className="piw-list">
                    {(pair.reasons ?? []).map((reason) => (
                      <li key={reason}>{lineageReasonCopy(reason)}</li>
                    ))}
                  </ul>
                  <div className="piw-pair">
                    <SourceWitness
                      bundle={bundle}
                      reference={pair.left_excerpt}
                      position={pair.left_position}
                      label="First retained capture"
                      onOpen={() => onOpenWitness?.(pair.left_excerpt, bundle)}
                    />
                    <SourceWitness
                      bundle={bundle}
                      reference={pair.right_excerpt}
                      position={pair.right_position}
                      label="Second retained capture"
                      onOpen={() => onOpenWitness?.(pair.right_excerpt, bundle)}
                    />
                  </div>
                  <p className="piw-mono">Pair {pair.id}</p>
                  {reviewsPanels ? (
                    <ReviewDecisionForm
                      targetKind="source_link"
                      target={reviewTarget}
                      machineTarget={pair}
                      bundle={bundle}
                      canDecide={canDecide}
                      draft={reviewDrafts?.[reviewTargetKey('source_link', pair.id)]}
                      pendingDecision={pendingDecision}
                      reviewsBusy={reviewsBusy}
                      decisionSavedNeedsRefresh={decisionSavedNeedsRefresh}
                      reviewsConflict={reviewsConflict}
                      onDraftChange={(next) => onDraftChange?.('source_link', pair.id, next)}
                      onSave={(draft) => onSave?.('source_link', pair.id, draft)}
                      onOpenCitation={onOpenWitness}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="piw-text-btn"
                    data-action="inspect-source-link"
                    onClick={() => onInspectPair?.(pair)}
                  >
                    Open both sources in inspector
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
      {truncated ? (
        <p className="piw-note">
          {coverage.lineage_candidates_found} candidate pairs were found in the scanned scope; {coverage.lineage_candidates_returned} are shown. Truncation does not mean the remaining fields were not scanned.
        </p>
      ) : null}
    </section>
  )
}

function EvidenceChecksSection({
  bundle,
  checksPanels,
  loadingChecks,
  reviewsPanels,
  reviewFilter,
  reviewDrafts,
  canDecide,
  pendingDecision,
  reviewsBusy,
  decisionSavedNeedsRefresh,
  reviewsConflict,
  onInspectCue,
  onOpenCitation,
  onDraftChange,
  onSave,
}) {
  const cues = checksPanels?.challenges ?? []
  const coverage = checksPanels?.coverage
  const truncated = coverage && coverage.challenge_cues_found > coverage.challenge_cues_returned
  const visible = cues.filter((cue) => {
    if (!reviewsPanels) return true
    const target = reviewTargetFromPanels(reviewsPanels, 'evidence_cue', cue.id)
    return targetMatchesFilter(target ?? { decision: 'needs_review', latest_event: null }, reviewFilter)
  })
  const textCues = visible.filter((cue) => cue.kind !== 'recorded_source_status')
  const statusCues = visible.filter((cue) => cue.kind === 'recorded_source_status')
  return (
    <section className="piw-section" id="piw-evidence-checks" tabIndex={-1}>
      <h2>Evidence Checks</h2>
      <p className="piw-note">
        Correction or withdrawal language is a review cue. It may be negated, concern another event, or describe a different claim.
        It is not a contradiction, retraction verdict, confidence change, or changed commitment outcome.
        Human review decisions below are relevance decisions, not those verdicts.
      </p>
      {loadingChecks && !checksPanels ? <p className="piw-muted">Loading evidence-check cues…</p> : null}
      {checksPanels?.status === 'not_run' ? (
        <p className="piw-empty">Checks have not been run for this saved version.</p>
      ) : checksPanels?.status === 'saved' && cues.length === 0 ? (
        <p className="piw-empty">No correction, withdrawal, or recorded source-status cues were found in this saved observation. That is not evidence that nothing happened.</p>
      ) : (
        <>
          {reviewsPanels && visible.length === 0 ? (
            <p className="piw-note">No evidence-check targets match this review filter. Use All returned targets to keep every original cue discoverable.</p>
          ) : null}
          {textCues.length > 0 && (
            <>
              <h3>Correction and withdrawal language</h3>
              <ul className="piw-cards">
                {textCues.map((cue) => {
                  const resolved = resolveWorkspaceExcerpt(bundle, cue.reference)
                  const reviewTarget = reviewTargetFromPanels(reviewsPanels, 'evidence_cue', cue.id)
                  return (
                    <li key={cue.id} className="piw-card" data-cue-kind={cue.kind}>
                      <p>{challengeCueCopy(cue.kind)}</p>
                      <p className="piw-muted">Machine detection remains a language cue. It is not replaced by the human decision.</p>
                      <ExcerptBlock
                        resolved={resolved}
                        reference={cue.reference ?? { position: cue.position, source_field: 'unknown', span_start: 0, span_end: 0, excerpt: '', relation: 'context', note: 'No retained excerpt is attached.' }}
                        onOpen={cue.reference ? () => onOpenCitation?.(cue.reference, bundle) : undefined}
                      />
                      {reviewsPanels ? (
                        <ReviewDecisionForm
                          targetKind="evidence_cue"
                          target={reviewTarget}
                          machineTarget={cue}
                          bundle={bundle}
                          canDecide={canDecide}
                          draft={reviewDrafts?.[reviewTargetKey('evidence_cue', cue.id)]}
                          pendingDecision={pendingDecision}
                          reviewsBusy={reviewsBusy}
                          decisionSavedNeedsRefresh={decisionSavedNeedsRefresh}
                          reviewsConflict={reviewsConflict}
                          onDraftChange={(next) => onDraftChange?.('evidence_cue', cue.id, next)}
                          onSave={(draft) => onSave?.('evidence_cue', cue.id, draft)}
                          onOpenCitation={onOpenCitation}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="piw-text-btn"
                        data-action="inspect-challenge-cue"
                        onClick={() => onInspectCue?.(cue)}
                      >
                        Open exact saved reference
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          {statusCues.length > 0 && (
            <>
              <h3>Recorded source-status notices</h3>
              <ul className="piw-cards">
                {statusCues.map((cue) => {
                  const reviewTarget = reviewTargetFromPanels(reviewsPanels, 'evidence_cue', cue.id)
                  return (
                    <li key={cue.id} className="piw-card" data-cue-kind="recorded_source_status">
                      <MetadataNotice cue={cue} metadata={resolveWorkspaceMetadata(bundle, cue.metadata_reference)} />
                      <p className="piw-muted">Machine detection remains a recorded source-status notice. It is not replaced by the human decision.</p>
                      {reviewsPanels ? (
                        <ReviewDecisionForm
                          targetKind="evidence_cue"
                          target={reviewTarget}
                          machineTarget={cue}
                          bundle={bundle}
                          canDecide={canDecide}
                          draft={reviewDrafts?.[reviewTargetKey('evidence_cue', cue.id)]}
                          pendingDecision={pendingDecision}
                          reviewsBusy={reviewsBusy}
                          decisionSavedNeedsRefresh={decisionSavedNeedsRefresh}
                          reviewsConflict={reviewsConflict}
                          onDraftChange={(next) => onDraftChange?.('evidence_cue', cue.id, next)}
                          onSave={(draft) => onSave?.('evidence_cue', cue.id, draft)}
                          onOpenCitation={onOpenCitation}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="piw-text-btn"
                        data-action="inspect-challenge-cue"
                        onClick={() => onInspectCue?.(cue)}
                      >
                        Open this retained record version
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
      {truncated ? (
        <p className="piw-note">
          {coverage.challenge_cues_found} cues were found in the scanned scope; {coverage.challenge_cues_returned} are shown. Truncation does not mean the remaining fields were not scanned.
        </p>
      ) : null}
    </section>
  )
}

function SearchCoverageSection({ checksPanels, loadingChecks, reviewsPanels }) {
  const coverage = checksPanels?.coverage
  const limits = checksPanels?.limits
  const omittedPairPositions = coverage?.lineage_excluded_positions ?? []
  const resultsCapped = Boolean(
    coverage
    && (
      Number(coverage.lineage_candidates_found) > Number(coverage.lineage_candidates_returned)
      || Number(coverage.challenge_cues_found) > Number(coverage.challenge_cues_returned)
    ),
  )
  return (
    <section className="piw-section" id="piw-search-coverage" tabIndex={-1}>
      <h2>Search Coverage</h2>
      <p className="piw-note">
        This receipt describes only the saved observation inputs that were checked. It is not the analyst-declared collection records in Evidence Gaps.
        External retrieval was not run. The cue vocabulary is English only. Language detection was not performed.
        Human review of returned targets does not remove these limitations, increase confidence, or mark the workspace review baseline.
      </p>
      {loadingChecks && !checksPanels ? <p className="piw-muted">Loading the search-coverage receipt…</p> : null}
      {checksPanels?.status === 'not_run' ? (
        <p className="piw-empty">Checks have not been run for this saved version.</p>
      ) : coverage ? (
        <div className="piw-card" data-search-coverage="true">
          <p className="piw-note">
            Bounded checks completed for the supported saved inputs. Unsupported record kinds are listed separately. This receipt describes only this saved observation. It is not independently measured global coverage.
          </p>
          {omittedPairPositions.length > 0 ? (
            <StatusBanner>
              Pair comparison omitted some capture inputs. Those omitted pair inputs are not an incomplete scan of the remaining saved observation.
            </StatusBanner>
          ) : null}
          {resultsCapped ? (
            <StatusBanner>
              Result lists are capped. Found-versus-shown counts do not mean the remaining saved inputs were not scanned.
            </StatusBanner>
          ) : null}
          {reviewsPanels?.summary ? (
            <p className="piw-note">
              Human review counts apply to the {reviewsPanels.summary.returned_targets} returned report targets only. They do not expand this scan or recast omitted-pair and capped-result notices.
            </p>
          ) : null}
          <p>Saved inputs checked: {coverage.input_count}. Text fields searched: {coverage.text_fields_scanned}.</p>
          <p>Capture inputs in the pair scope: {coverage.lineage_scanned_positions?.length ?? 0}. Pairs compared: {coverage.pairs_compared}.</p>
          <p>Source-link candidates found: {coverage.lineage_candidates_found}; shown: {coverage.lineage_candidates_returned}.</p>
          <p>Evidence-check cues found: {coverage.challenge_cues_found}; shown: {coverage.challenge_cues_returned}.</p>
          <p>External retrieval: not run. Semantic adjudication: not performed. Languages verified: no.</p>
          {limits?.cue_language ? <p>Cue vocabulary: {limits.cue_language} only.</p> : null}
          {coverage.missing_body_positions?.length ? (
            <>
              <h4>Missing bodies</h4>
              <p className="piw-muted">Positions {coverage.missing_body_positions.join(', ')}. Presence of a title or summary does not establish full publisher text retention.</p>
            </>
          ) : (
            <p className="piw-muted">No missing-body positions were recorded for supported inputs.</p>
          )}
          {coverage.unsupported_inputs?.length ? (
            <>
              <h4>Unsupported record types</h4>
              <ul className="piw-list">
                {coverage.unsupported_inputs.map((row) => (
                  <li key={`${row.position}:${row.record_kind}`}>
                    Position {row.position} · {row.record_kind} · {row.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="piw-muted">No unsupported record types were listed.</p>
          )}
          {coverage.lineage_excluded_positions?.length ? (
            <>
              <h4>Explicit pair-scope exclusions</h4>
              <p className="piw-muted">Capture positions omitted from pair comparison: {coverage.lineage_excluded_positions.join(', ')}.</p>
            </>
          ) : (
            <p className="piw-muted">No capture positions were excluded from the pair scope.</p>
          )}
          <h4>Limitations</h4>
          <ul className="piw-list">
            {(checksPanels.limitations ?? []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
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
      <p className="ws-nav-note">These private sections share this saved version and review state.</p>
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
          {inspector.input ? <RetainedInputDates input={inspector.input} /> : null}
        </section>
      )}
      {inspector?.kind === 'source-text-span' && <SourceSpanInspector bundle={state.bundle} selection={inspector.selection} />}
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
      {inspector?.kind === 'source-link' && (
        <section>
          <h3>Possible shared-source pair</h3>
          <p className="piw-note">Independence is unknown. Transmission direction is undetermined. Related captures are not labeled independent.</p>
          <div className="piw-pair">
            <SourceWitness
              bundle={state.bundle}
              reference={inspector.pair?.left_excerpt}
              position={inspector.pair?.left_position}
              label="First retained capture"
            />
            <SourceWitness
              bundle={state.bundle}
              reference={inspector.pair?.right_excerpt}
              position={inspector.pair?.right_position}
              label="Second retained capture"
            />
          </div>
          {(state.reviewsPanels || state.reviewHistory || state.reviewHistoryError || state.loadingReviewHistory) ? (
          <ReviewHistoryPanel
            history={state.reviewHistory}
            loading={state.loadingReviewHistory}
            loadingOlder={state.loadingOlderReviewHistory}
            error={state.reviewHistoryError}
            refreshDisabled={reviewHistoryRefreshBlocked(state)}
            onLoadOlder={workspace.actions?.loadOlderReviewHistory}
            onRetry={workspace.actions?.retryReviewHistory}
            onRefresh={workspace.actions?.refreshReviewHistory}
            bundle={state.bundle}
          />
          ) : null}
        </section>
      )}
      {inspector?.kind === 'challenge-cue' && (
        <section>
          <h3>Evidence-check cue</h3>
          {inspector.cue?.kind === 'recorded_source_status' ? (
            <MetadataNotice
              cue={inspector.cue}
              metadata={inspector.metadata ?? resolveWorkspaceMetadata(state.bundle, inspector.cue?.metadata_reference)}
            />
          ) : (
            <>
              <p>{challengeCueCopy(inspector.cue?.kind)}</p>
              <ExcerptBlock
                resolved={inspector.resolved}
                reference={inspector.cue?.reference ?? inspector.reference}
              />
            </>
          )}
          {(state.reviewsPanels || state.reviewHistory || state.reviewHistoryError || state.loadingReviewHistory) ? (
          <ReviewHistoryPanel
            history={state.reviewHistory}
            loading={state.loadingReviewHistory}
            loadingOlder={state.loadingOlderReviewHistory}
            error={state.reviewHistoryError}
            refreshDisabled={reviewHistoryRefreshBlocked(state)}
            onLoadOlder={workspace.actions?.loadOlderReviewHistory}
            onRetry={workspace.actions?.retryReviewHistory}
            onRefresh={workspace.actions?.refreshReviewHistory}
            bundle={state.bundle}
          />
          ) : null}
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
  inputImpactClient = defaultInputImpactClient,
  sourceSpansClient = defaultSourceSpansClient,
  onSignIn,
  accountUiAvailable = false,
  onOpenPublicGraphNode,
  publicNode = null,
}) {
  const { state, status, sessionLoading, actions } = workspace
  const panels = state.panels
  const bundle = state.bundle
  const revealPrivate = canRevealPrivateRecords(status) && panels && bundle

  const openCitation = (reference, sourceBundle, section = 'changed') => {
    const resolved = resolveWorkspaceExcerpt(sourceBundle, reference)
    actions.setInspector({
      kind: 'citation',
      reference,
      resolved,
      input: resolved?.input ?? null,
      versionId: sourceBundle?.version?.id ?? null,
    })
    actions.setActiveSection(section)
  }

  const openSourceLink = (pair) => {
    actions.inspectReviewTarget?.({ kind: 'source-link', pair })
      ?? actions.setInspector({ kind: 'source-link', pair })
    actions.setActiveSection('source-links')
  }

  const openChallengeCue = (cue) => {
    if (cue?.kind === 'recorded_source_status') {
      const inspector = {
        kind: 'challenge-cue',
        cue,
        metadata: resolveWorkspaceMetadata(bundle, cue.metadata_reference),
      }
      actions.inspectReviewTarget?.(inspector) ?? actions.setInspector(inspector)
    } else {
      const inspector = {
        kind: 'challenge-cue',
        cue,
        resolved: resolveWorkspaceExcerpt(bundle, cue.reference),
        reference: cue.reference,
      }
      actions.inspectReviewTarget?.(inspector) ?? actions.setInspector(inspector)
    }
    actions.setActiveSection('evidence-checks')
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
        <details className="piw-assignment-picker" open={!revealPrivate}>
          <summary>Choose investigation ({state.catalog.length})</summary>
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
        </details>
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
            onLoadBeforeVersion={actions.openBeforeVersion}
            pendingReview={state.pendingReview}
            reviewBusy={state.reviewBusy}
            reviewError={state.reviewError}
            reviewConflict={state.reviewConflict}
            onMarkReviewed={actions.markReviewed}
            onRetryReview={actions.retryReview}
            onSelectVersion={actions.selectVersion}
            onInspectComparedRecords={actions.inspectComparedRecords}
            onInspectEvidenceChange={actions.inspectEvidenceChange}
            onInspectRemovedRecord={actions.inspectComparedRecords}
            onOpenCitation={openCitation}
          />
          <HypothesesSection panels={panels} bundle={bundle} onOpenCitation={openCitation} />
          <CommitmentsSection panels={panels} bundle={bundle} onOpenCitation={openCitation} />
          <GapsSection panels={panels} />
          <InvestigationSourceHistory key={`${bundle?.version?.id}:${bundle?.observation?.id}`} bundle={bundle}
            impactOptions={{ client: inputImpactClient, spansClient: sourceSpansClient, onAccessFailure: actions.rejectInputImpactAccess,
              onOpenSpan: (selection, sourceBundle) => {
                if (sourceBundle !== bundle) return
                actions.setInspector({ kind: 'source-text-span', selection })
                actions.setActiveSection('source-history')
              },
              onOpenCitation: (reference, sourceBundle) => openCitation(reference, sourceBundle, 'source-history') }} />
          <EvidenceChecksToolbar
            bundle={bundle}
            checksPanels={state.checksPanels}
            loadingChecks={state.loadingChecks}
            checksBusy={state.checksBusy}
            checksError={state.checksError}
            pendingChecksRun={state.pendingChecksRun}
            onRun={actions.runEvidenceChecks}
            onRetry={actions.retryChecks}
          />
          <ReviewProgressCard
            reviewsPanels={state.reviewsPanels}
            reviewsError={state.reviewsError}
            loadingReviews={state.loadingReviews}
            decisionSavedNeedsRefresh={state.decisionSavedNeedsRefresh}
            pendingDecision={state.pendingReviewDecision}
            reviewsBusy={state.reviewsBusy}
            reviewsConflict={state.reviewsConflict}
            onRetryRead={actions.retryReviews}
            onRetryDecision={actions.retryEvidenceReviewDecision}
          />
          {state.reviewsPanels ? (
            <ReviewFilterBar
              summary={state.reviewsPanels.summary}
              filter={state.reviewFilter}
              onChange={actions.setReviewFilter}
            />
          ) : null}
          <SourceLinksSection
            bundle={bundle}
            checksPanels={state.checksPanels}
            loadingChecks={state.loadingChecks}
            reviewsPanels={state.reviewsPanels}
            reviewFilter={state.reviewFilter}
            reviewDrafts={state.reviewDrafts}
            canDecide={state.reviewsPanels?.canDecide === true}
            pendingDecision={state.pendingReviewDecision}
            reviewsBusy={state.reviewsBusy}
            decisionSavedNeedsRefresh={state.decisionSavedNeedsRefresh}
            reviewsConflict={state.reviewsConflict}
            onInspectPair={openSourceLink}
            onOpenWitness={(reference, sourceBundle) => openCitation(reference, sourceBundle, 'source-links')}
            onDraftChange={(kind, id, draft) => actions.updateReviewDraft?.(kind, id, draft)}
            onSave={(kind, id, draft) => actions.saveEvidenceReview?.(kind, id, draft)}
          />
          <EvidenceChecksSection
            bundle={bundle}
            checksPanels={state.checksPanels}
            loadingChecks={state.loadingChecks}
            reviewsPanels={state.reviewsPanels}
            reviewFilter={state.reviewFilter}
            reviewDrafts={state.reviewDrafts}
            canDecide={state.reviewsPanels?.canDecide === true}
            pendingDecision={state.pendingReviewDecision}
            reviewsBusy={state.reviewsBusy}
            decisionSavedNeedsRefresh={state.decisionSavedNeedsRefresh}
            reviewsConflict={state.reviewsConflict}
            onInspectCue={openChallengeCue}
            onOpenCitation={(reference, sourceBundle) => openCitation(reference, sourceBundle, 'evidence-checks')}
            onDraftChange={(kind, id, draft) => actions.updateReviewDraft?.(kind, id, draft)}
            onSave={(kind, id, draft) => actions.saveEvidenceReview?.(kind, id, draft)}
          />
          <SearchCoverageSection
            checksPanels={state.checksPanels}
            loadingChecks={state.loadingChecks}
            reviewsPanels={state.reviewsPanels}
          />
        </>
      )}
    </div>
  )
}
