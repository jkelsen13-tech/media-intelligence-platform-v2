import { useMemo, useState } from 'react'
import { savedSourceHistory, compareRetainedCaptures } from '../lib/investigationSourceHistory.js'
import { RetainedInputDates, RetainedInputRecord, AssessmentSavedReasoning } from './InvestigationAssessmentTrail.jsx'
import InvestigationInputImpact from './InvestigationInputImpact.jsx'
import InvestigationSourceSpans from './InvestigationSourceSpans.jsx'

const labels = { title: 'Title', summary: 'Summary', body_text: 'Body text', url: 'Source URL', outlet: 'Outlet', published_at: 'Publication value' }
const states = { equal: 'Exact match', different: 'Values differ', left_only: 'Only in first capture', right_only: 'Only in second capture', not_recorded: 'Not recorded in either' }

function TextValue({ value }) {
  const [expanded, setExpanded] = useState(false)
  if (value === null) return <p className="piw-muted">Not recorded</p>
  if (value === '') return <p className="piw-muted">Empty retained string</p>
  const points = Array.from(value), shortened = points.length > 1200 && !expanded
  return <>
    <p className="piw-retained-body">{shortened ? points.slice(0, 1200).join('') : value}</p>
    {points.length > 1200 ? <button className="piw-text-btn" type="button" onClick={() => setExpanded(!expanded)}>
      {expanded ? 'Show less text' : `Show full retained text (${points.length} characters)`}
    </button> : null}
    {shortened ? <p className="piw-muted">Preview ends here. Equality checks use the complete retained field.</p> : null}
  </>
}

function CaptureChoice({ input, label, bundle, impactOptions }) {
  const [open, setOpen] = useState(false)
  return <div className="piw-source-capture">
    <h4>{label}</h4>
    <p>{input.capture.payload?.title || 'Untitled retained capture'}</p>
    <p className="piw-mono">Position {input.position}</p>
    <RetainedInputDates input={input} />
    {impactOptions ? <InvestigationInputImpact key={input.position} bundle={bundle} position={input.position} {...impactOptions} /> : null}
    <details className="piw-linked-record" onToggle={event => {
      if (event.target === event.currentTarget) setOpen(event.currentTarget.open)
    }}><summary>Open exact retained record</summary>
      {open ? <RetainedInputRecord input={input} position={input.position} bundle={bundle} /> : null}
    </details>
  </div>
}

function FieldComparison({ row }) {
  const [open, setOpen] = useState(false)
  return <details className="piw-source-field" onToggle={event => {
    if (event.target === event.currentTarget) setOpen(event.currentTarget.open)
  }}>
    <summary><strong>{labels[row.field]}</strong><span data-field-status={row.status}>{states[row.status]}</span></summary>
    {open ? <div className="piw-source-pair">
      <div><h5>First capture</h5><TextValue value={row.left} /></div>
      <div><h5>Second capture</h5><TextValue value={row.right} /></div>
    </div> : null}
  </details>
}

function SourceComparison({ source, bundle, impactOptions }) {
  const captures = source.captures
  const [leftPosition, setLeft] = useState(captures.at(-2)?.position ?? captures[0].position)
  const [rightPosition, setRight] = useState(captures.at(-1).position)
  const [assessmentLimit, setAssessmentLimit] = useState(10)
  const result = useMemo(() => compareRetainedCaptures(bundle, leftPosition, rightPosition), [bundle, leftPosition, rightPosition])
  if (captures.length === 1) return <>
    <p className="piw-note">One capture is retained in this observation. An earlier or later version may exist outside this saved scope.</p>
    <CaptureChoice input={captures[0]} label="Retained capture" bundle={bundle} impactOptions={impactOptions} />
  </>
  return <>
    <div className="piw-source-pair piw-source-selectors">
      {[['First capture', leftPosition, setLeft], ['Second capture', rightPosition, setRight]].map(([label, value, set]) => <label className="piw-field" key={label}>
        {label}<select aria-label={label} value={value} onChange={event => { set(event.target.value); setAssessmentLimit(10) }}>
          {captures.map((input, i) => <option key={input.position} value={input.position}>Capture {i + 1} · Position {input.position}</option>)}
        </select>
      </label>)}
    </div>
    {!result ? <p className="piw-note" role="status">Choose two different captures of this retained source.</p> : <div key={`${leftPosition}:${rightPosition}`}>
      <div className="piw-source-pair">
        <CaptureChoice input={result.left} label="First capture" bundle={bundle} impactOptions={impactOptions} />
        <CaptureChoice input={result.right} label="Second capture" bundle={bundle} impactOptions={impactOptions} />
      </div>
      <h4>Retained field comparison</h4>
      <p className="piw-note">Exact values are compared without rewriting text. A difference is not automatically a correction, contradiction, or change in meaning. Missing text is not a deletion from the source.</p>
      {impactOptions?.spansClient ? <InvestigationSourceSpans bundle={bundle} leftPosition={leftPosition} rightPosition={rightPosition}
        client={impactOptions.spansClient} onAccessFailure={impactOptions.onAccessFailure} onOpenSpan={impactOptions.onOpenSpan} /> : null}
      <div className="piw-source-fields">{result.fields.map(row => <FieldComparison key={row.field} row={row} />)}</div>
      <h4>Assessment context ({result.assessments.length})</h4>
      <p className="piw-note">Selected assessments that saved either capture in their context, including inherited inputs. This does not establish support, source independence, or how a conclusion would change if a source were withdrawn.</p>
      {result.assessments.slice(0, assessmentLimit).map(({ assessment, usesLeft, usesRight }) => <details className="piw-linked-record" key={assessment.id}>
        <summary>{usesLeft && usesRight ? 'Both captures' : usesLeft ? 'First capture only' : 'Second capture only'} · View saved assessment</summary>
        <p className="piw-mono">{assessment.id}</p><AssessmentSavedReasoning assessment={assessment} />
      </details>)}
      {result.assessments.length > assessmentLimit ? <button type="button" className="piw-text-btn" onClick={() => setAssessmentLimit(n => n + 10)}>Show more assessments</button> : null}
      {!result.assessments.length ? <p>No selected assessment records either capture in its saved context.</p> : null}
      {result.unrecordedContexts ? <p className="piw-note">Context is unavailable for {result.unrecordedContexts} selected assessment(s); their use of these captures cannot be determined.</p> : null}
    </div>}
  </>
}

function SourceDisclosure({ source, bundle, impactOptions }) {
  const [open, setOpen] = useState(false)
  return <details className="piw-source-history-item" onToggle={event => {
    if (event.target === event.currentTarget) setOpen(event.currentTarget.open)
  }}>
    <summary><strong>{source.captures.at(-1).capture.payload?.title || 'Untitled retained source'}</strong><span>{source.captures.length} retained capture{source.captures.length === 1 ? '' : 's'}</span></summary>
    {open ? <div className="piw-source-history-content">
      <p className="piw-mono">Retained article identity {source.articleId}</p>
      <SourceComparison source={source} bundle={bundle} impactOptions={impactOptions} />
    </div> : null}
  </details>
}

export default function InvestigationSourceHistory({ bundle, impactOptions }) {
  const history = useMemo(() => savedSourceHistory(bundle), [bundle])
  const [limit, setLimit] = useState(10)
  return <section className="piw-section" id="piw-source-history" tabIndex={-1}>
    <h2>Source History</h2>
    <p className="piw-note">Compare exact captures retained in this saved observation, grouped only by their recorded article identity. The order is MIP input order, not publication or event chronology. Matching URLs, outlets, and text do not join different identities.</p>
    {history.sources.length ? <>
      <p>{history.sources.length} retained source identit{history.sources.length === 1 ? 'y' : 'ies'} · {history.sources.filter(source => source.captures.length > 1).length} with multiple captures</p>
      {history.sources.slice(0, limit).map(source => <SourceDisclosure key={`${bundle?.version?.id}:${bundle?.observation?.id}:${source.articleId}`} source={source} bundle={bundle} impactOptions={impactOptions} />)}
      {history.sources.length > limit ? <button type="button" className="piw-section-btn" onClick={() => setLimit(n => n + 10)}>Show more sources ({history.sources.length - limit} remaining)</button> : null}
    </> : <p className="piw-empty">{history.available ? 'No capture with a recorded article identity is available in this observation. This does not establish an absence of source history.' : 'Saved observation unavailable. No current source history is substituted.'}</p>}
    {history.excludedInputs ? <p className="piw-muted">{history.excludedInputs} input(s) are not grouped here, including record versions and captures without a usable identity or position. They remain available through their evidence trails.</p> : null}
  </section>
}
