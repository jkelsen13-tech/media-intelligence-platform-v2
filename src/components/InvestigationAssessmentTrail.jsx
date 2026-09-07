import { useState } from 'react'
import RemainingUncertaintyBlock from './RemainingUncertaintyBlock.jsx'
import { savedAssessmentTrail, selectedContextUsers, retainedInputDates, retainedDateLabel } from '../lib/investigationEvidenceTrail.js'
import { assessmentOutcomeCopy, safeWorkspaceHttpUrl, snapshotInputPayload } from '../lib/investigationWorkspaceSession.js'

const PAGE_SIZE = 10

function PagedRecords({ rows, children, label }) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  return <>
    {rows.slice(0, limit).map(children)}
    {rows.length > limit ? <button type="button" className="piw-section-btn" onClick={() => setLimit(value => value + PAGE_SIZE)}>
      Show more {label} ({rows.length - limit} remaining)
    </button> : null}
  </>
}

export function AssessmentSavedReasoning({ assessment }) {
  return <>
    <p>{assessmentOutcomeCopy(assessment.outcome)}</p>
    <p>{assessment.rationale}</p>
    {assessment.stale ? <p className="piw-note">This recorded assessment has a changed dependency. That is not a completed reassessment.</p> : null}
    <RemainingUncertaintyBlock>{assessment.remaining_uncertainty}</RemainingUncertaintyBlock>
  </>
}

export function RetainedInputDates({ input }) {
  return <dl className="piw-input-dates">{retainedInputDates(input).map(({ label, value }) => <div key={label}>
    <dt>{label}</dt><dd>{value && Number.isFinite(Date.parse(value))
      ? <time dateTime={value} title={value}>{retainedDateLabel(value)}</time> : retainedDateLabel(value)}</dd>
  </div>)}</dl>
}

export function RetainedInputRecord({ input, position, bundle }) {
  const payload = snapshotInputPayload(input)
  const safeUrl = safeWorkspaceHttpUrl(payload?.url)
  const users = input ? selectedContextUsers(bundle, position) : []
  return <div className="piw-card" data-record="input" data-position={position ?? undefined}>
    <p className="piw-mono">Position {position ?? 'not recorded'}</p>
    {input ? <>
      <p>{payload?.title ?? payload?.label ?? 'Retained source identity'}</p>
      {payload?.outlet ? <p>{payload.outlet}</p> : null}
      <RetainedInputDates input={input} />
      <p className="piw-note">Publication, capture, and queue times describe different records. They do not establish when the reported event happened.</p>
      {payload?.url ? <p>{safeUrl ? <a href={safeUrl} target="_blank" rel="noreferrer">{safeUrl}</a> : <>Retained locator (not opened as a link): {payload.url}</>}</p> : null}
      {payload?.summary ? <p>{payload.summary}</p> : null}
      {payload?.body_text ? <details className="piw-linked-record">
        <summary>Retained body text</summary>
        <p className="piw-retained-body">{payload.body_text}</p>
      </details> : null}
      {bundle ? <>
        <h4>Selected assessments using this input as context ({users.length})</h4>
        <p className="piw-note">These assessments retained this input in their context. Reuse does not establish independent sources or show how a conclusion would change if the input were withdrawn.</p>
        {users.length ? <PagedRecords rows={users} label="assessments">{(row, index) => <details className="piw-linked-record" key={row.id}>
          <summary>Selected assessment {index + 1} · View saved reasoning</summary>
          <AssessmentSavedReasoning assessment={row} />
        </details>}</PagedRecords> : <p>No selected assessment records this input in its saved context.</p>}
      </> : null}
    </> : <p>Input unavailable in this saved observation. No current record is substituted.</p>}
  </div>
}

function InputDisclosure({ row, bundle }) {
  const [open, setOpen] = useState(false)
  const title = snapshotInputPayload(row.input)?.title ?? 'Retained record'
  return <details className="piw-linked-record" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title} · Position {row.position}{row.explicitlyAdded ? ' · Explicitly added input' : ''}</summary>
    {open ? <RetainedInputRecord input={row.input} position={row.position} bundle={bundle} /> : null}
  </details>
}

function AssessmentLinks({ rows }) {
  return <PagedRecords rows={rows} label="assessment links">{row => <details className="piw-linked-record" key={`${row.kind}:${row.id}`}>
    <summary>{row.kind} · {row.assessment ? 'View saved reasoning' : 'Unavailable in this observation'}</summary>
    <p className="piw-mono">{row.id}</p>
    {row.assessment ? <AssessmentSavedReasoning assessment={row.assessment} /> : <p>The linked record is unavailable here. No current assessment is substituted.</p>}
  </details>}</PagedRecords>
}

export default function AssessmentEvidenceTrail({ bundle, assessmentId }) {
  const [open, setOpen] = useState(false)
  const trail = savedAssessmentTrail(bundle, assessmentId)
  if (!trail) return <p>Assessment trail unavailable in this saved observation.</p>
  return <details className="piw-linked-record piw-assessment-trail" onToggle={event => {
    if (event.target === event.currentTarget) setOpen(event.currentTarget.open)
  }}>
    <summary>Saved evidence trail · {trail.contextRecorded ? `${trail.inputs.length} context input${trail.inputs.length === 1 ? '' : 's'}` : 'Context inputs not recorded'} · {trail.dependenciesRecorded ? `${trail.dependencies.length} assessment dependenc${trail.dependencies.length === 1 ? 'y' : 'ies'}` : 'Dependencies not recorded'}</summary>
    {open ? <div>
      <p className="piw-note">This trail belongs to this saved observation. Context can include earlier versions and inherited input history; it does not mean every input supports the assessment.</p>
      <h4>Retained context inputs</h4>
      {!trail.contextRecorded ? <p>Context input list not recorded on this assessment.</p> : !trail.inputs.length ? <p>No context inputs recorded.</p> :
        <PagedRecords rows={trail.inputs} label="inputs">{row => <InputDisclosure key={row.position} row={row} bundle={bundle} />}</PagedRecords>}
      <h4>Assessment dependencies</h4>
      <p className="piw-note">Shared dependencies appear once in this trail. Their reuse is not independent corroboration.</p>
      {!trail.dependenciesRecorded ? <p>Dependency list not recorded on this assessment.</p> : !trail.dependencies.length ? <p>No assessment dependencies recorded.</p> : null}
      <AssessmentLinks rows={trail.dependencies} />
      {trail.revisions.length ? <>
        <h4>Assessment revisions</h4>
        <p className="piw-note">Revision links are shown separately from dependencies. A replacement may fall outside this saved observation.</p>
        <AssessmentLinks rows={trail.revisions} />
      </> : null}
    </div> : null}
  </details>
}
