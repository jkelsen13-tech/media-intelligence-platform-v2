import { useEffect, useRef, useState } from 'react'
import { savedDefinitionRevisions } from '../lib/investigationDefinitionRevisions.js'
import { STAGE_STATUS_COPY, SEARCH_STATUS_COPY, COVERAGE_STATUS_COPY } from '../lib/investigationWorkspaceSession.js'
import { formatWorkspaceDate } from '../lib/workspacePresentation.js'
import AssessmentEvidenceTrail, { AssessmentSavedReasoning } from './InvestigationAssessmentTrail.jsx'

const labels = { statement: 'Wording', actor: 'Actor', scope: 'Scope', conditions: 'Conditions', deadline_text: 'Deadline wording',
  success_criterion: 'Success criterion', remaining_uncertainty: 'Remaining uncertainty', assumptions: 'Assumptions',
  would_strengthen: 'Evidence that would strengthen', would_weaken: 'Evidence that would weaken', evidence: 'Retained excerpts',
  assessment_ids: 'Linked assessments', status: 'Recorded status', depends_on: 'Prerequisite links', coverage_ids: 'Collection declarations',
  note: 'Recorded explanation', stage_order: 'Recorded stage order', kind: 'Stage kind', label: 'Label', source_classes: 'Source classes',
  languages: 'Languages', regions: 'Regions', from: 'Range start', to: 'Range end', retained_text: 'Retained text availability',
  search_status: 'Search status', searched_at: 'Search recorded at', method: 'Collection method', limitations: 'Collection limits',
  question: 'Question', scope_note: 'Question scope', canonical_subject: 'Canonical subject', time_range: 'Source/event time range', unresolved_questions: 'Unresolved questions' }
const groups = { hypotheses: 'Hypothesis', commitments: 'Commitment', coverage: 'Collection declaration', question: 'Question', scope: 'Scope', unresolved_questions: 'Unresolved questions' }
const actions = { added: 'Added record', removed: 'Removed record', updated: 'Updated record' }

function Value({ value, field, group, bundle, owner, renderEvidence }) {
  if (value === undefined) return <p className="piw-muted">Record absent on this version.</p>
  if (value === null) return <p className="piw-muted">Not recorded.</p>
  if (Array.isArray(value)) {
    if (!value.length) return <p className="piw-muted">No entries recorded.</p>
    if (field === 'evidence') return renderEvidence?.(value, bundle) ?? <p>Retained excerpts are available in the full record.</p>
    if (field === 'assessment_ids') return value.map(id => {
      const assessment = bundle.observation.snapshot.assessments.find(a => a.id === id)
      return <details className="piw-linked-record" key={id}><summary>Saved assessment · {id}</summary>
        {assessment ? <><AssessmentSavedReasoning assessment={assessment} /><AssessmentEvidenceTrail bundle={bundle} assessmentId={id} /></> : <p>Assessment unavailable in this saved observation.</p>}
      </details>
    })
    return <ul className="piw-list">{value.map((item, i) => {
      const linked = ['depends_on', 'stage_order'].includes(field) ? owner?.stages?.find(s => s.id === item)
        : field === 'coverage_ids' ? bundle.version.state.coverage.find(c => c.id === item) : null
      return <li key={i}>{linked ? `${linked.kind ?? linked.label} · ${item}` : String(item)}</li>
    })}</ul>
  }
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{item === null ? 'Not recorded.' : String(item)}</dd></div>)}</dl>
  const copy = field === 'status' ? (group === 'stages' ? STAGE_STATUS_COPY : COVERAGE_STATUS_COPY)[value]
    : field === 'search_status' ? SEARCH_STATUS_COPY[value] : null
  return <p className="piw-retained-body">{copy ?? (['from', 'to', 'searched_at'].includes(field) ? formatWorkspaceDate(value) : String(value))}</p>
}

function Field({ row, group, model, owners, renderEvidence }) {
  const [open, setOpen] = useState(false)
  return <details className="piw-source-field" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }}>
    <summary>{labels[row.key] ?? row.key}</summary>
    {open ? <div className="piw-source-pair">{[['Before', row.before, model.before, owners.before], ['After', row.after, model.after, owners.after]].map(([label, value, bundle, owner]) => <div key={label}>
      <h5>{label} · Revision {bundle.version.revision}</h5><Value value={value} field={row.key} group={group} bundle={bundle} owner={owner} renderEvidence={renderEvidence} />
    </div>)}</div> : null}
  </details>
}

function RevisionRecord({ row, model, renderEvidence }) {
  const [open, setOpen] = useState(false), [stageLimit, setStageLimit] = useState(10)
  const owners = { before: row.before, after: row.after }
  const contextField = ['hypotheses', 'commitments'].includes(row.group) ? 'remaining_uncertainty' : row.group === 'coverage' ? 'limitations' : null
  return <details className="piw-definition-record" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }}>
    <summary>{groups[row.group]} · {actions[row.action]}{row.id ? ` · ${row.title ?? row.id}` : ''}</summary>
    {open ? <div className="piw-definition-fields">
      {row.status === 'record_unavailable' ? <p>The server-declared change does not resolve to the expected saved records. No substitute is shown.</p> : row.status === 'no_field_difference' ? <p>The backend reported an edit, but no difference is available in these supported fields.</p> : <>
        {row.fields.filter(field => field.key !== contextField).map(field => <Field key={field.key} row={field} group={row.group} model={model} owners={owners} renderEvidence={renderEvidence} />)}
        {contextField ? <div className="piw-definition-context"><h5>{labels[contextField]} · {row.fields.some(f => f.key === contextField) ? 'Revised field' : 'Saved context'}</h5>
          <div className="piw-source-pair">{[['Before', row.before, model.before], ['After', row.after, model.after]].map(([label, record, bundle]) => <div key={label}><h5>{label} · Revision {bundle.version.revision}</h5><Value value={record?.[contextField]} field={contextField} group={row.group} bundle={bundle} /></div>)}</div>
        </div> : null}
        {row.stages.slice(0, stageLimit).map(stage => <div className="piw-definition-stage" key={stage.id}>
          <h5>Stage · {stage.after?.kind ?? stage.before?.kind} · {actions[stage.action]}</h5>
          <p className="piw-mono">{stage.id}</p>
          {stage.fields.map(field => <Field key={field.key} row={field} group="stages" model={model} owners={owners} renderEvidence={renderEvidence} />)}
        </div>)}
        {row.stages.length > stageLimit ? <button className="piw-text-btn" type="button" onClick={() => setStageLimit(n => n + 10)}>Show more stage revisions</button> : null}
      </>}
    </div> : null}
  </details>
}

export default function InvestigationDefinitionRevisions({ bundle, beforeBundle, onLoadBeforeVersion, renderEvidence }) {
  const identity = `${bundle.investigation_id}:${bundle.version.id}:${bundle.observation.id}:${bundle.comparison?.before_version_id}:${bundle.review?.id}`
  const current = useRef(identity), serial = useRef(0)
  current.current = identity
  const [request, setRequest] = useState({ status: 'idle' }), [limit, setLimit] = useState(10)
  useEffect(() => { setRequest({ status: 'idle' }); setLimit(10); return () => { serial.current++ } }, [identity])
  const read = async () => {
    const token = ++serial.current, key = identity
    setRequest({ status: 'loading', key })
    let result
    try { result = await onLoadBeforeVersion?.(bundle.comparison.before_version_id) } catch { result = null }
    if (serial.current !== token || current.current !== key) return
    setRequest({ status: result?.data && !result.error && !result.ignored ? 'ready' : 'error', key })
  }
  const model = savedDefinitionRevisions(bundle, beforeBundle)
  if (model.status === 'not_comparable') return null
  const visible = request.key === identity ? request.status : 'idle'
  return <section className="piw-definition-revisions" aria-label="Saved definition revisions">
    <h4>Compare saved definition fields</h4>
    <p className="piw-note">Shows exact wording, stage status, evidence links and collection declarations from the named review baseline and displayed version. An edited or removed record is not proof of a real-world outcome, contradiction or causal effect.</p>
    <button className="piw-section-btn" type="button" onClick={read} disabled={visible === 'loading' || !onLoadBeforeVersion}>{visible === 'loading' ? 'Loading compared version…' : model.status === 'not_loaded' ? 'Load saved field comparison' : 'Refresh saved field comparison'}</button>
    {visible === 'loading' ? <p role="status">Reading the exact review-baseline version.</p> : null}
    {visible === 'error' ? <p role="alert">The compared version could not be loaded. Retry the comparison.</p> : null}
    {model.status === 'identity_mismatch' ? <p role="alert">The saved versions do not match this review baseline. No field comparison is shown.</p> : null}
    {model.status === 'ready' && !['error', 'loading'].includes(visible) ? <div data-definition-revisions="ready">
      <p>Before: revision {model.before.version.revision} · {formatWorkspaceDate(model.before.version.recorded_at)}. After: revision {model.after.version.revision} · {formatWorkspaceDate(model.after.version.recorded_at)}.</p>
      <p className="piw-note">These are MIP version-recording times, not the dates an institution acted. Reading this comparison does not mark either version reviewed.</p>
      <p>Displayed version’s recorded reason: {model.after.version.change_reason ?? 'Not recorded.'}</p>
      <p className="piw-note">This compares the two named versions. Intervening edits are not enumerated here.</p>
      {model.scopeChanged ? <p className="piw-note">Candidate scope changed. Definition records can be compared; an evidence comparison is unavailable.</p> : null}
      {model.rows.length ? model.rows.slice(0, limit).map(row => <RevisionRecord key={`${identity}:${row.group}:${row.id}`} row={row} model={model} renderEvidence={renderEvidence} />) : <p>No definition edits are reported by the backend for this comparison.</p>}
      {model.rows.length > limit ? <button className="piw-text-btn" type="button" onClick={() => setLimit(n => n + 10)}>Show more record revisions</button> : null}
    </div> : null}
  </section>
}
