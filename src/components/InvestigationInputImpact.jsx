import { useEffect, useRef, useState } from 'react'
import { inputImpactMatches } from '../lib/investigationInputImpactClient.js'
import { assessmentOutcomeCopy } from '../lib/investigationWorkspaceSession.js'

function References({ indices, evidence, bundle, onOpenCitation }) {
  return <ul className="piw-list">{indices.map(index => <li key={index}>
    <p>Recorded as {evidence[index].relation}. {evidence[index].note}</p>
    <blockquote className="piw-retained-body">{evidence[index].excerpt}</blockquote>
    {onOpenCitation ? <button className="piw-text-btn" type="button" onClick={() => onOpenCitation(evidence[index], bundle)}>Open exact excerpt in inspector</button> : null}
  </li>)}</ul>
}

export default function InvestigationInputImpact({ bundle, position, client, onAccessFailure, onOpenCitation }) {
  const identity = `${bundle?.investigation_id}:${bundle?.version?.id}:${bundle?.observation?.id}:${position}`
  const current = useRef(identity), request = useRef(0)
  current.current = identity
  const [state, setState] = useState({ status: 'idle' }), [limit, setLimit] = useState(10)
  useEffect(() => {
    setState({ status: 'idle' })
    return () => { request.current++ }
  }, [identity, client])
  const read = async () => {
    const token = ++request.current, key = identity
    setState({ status: 'loading', key }); setLimit(10)
    let result
    try { result = await client.read(bundle.investigation_id, bundle.version.id, position) }
    catch { result = { error: { code: 'request_failed' } } }
    if (request.current !== token || current.current !== key) return
    if (!result) result = { error: { code: 'request_failed' } }
    if (result.error) {
      setState({ status: 'error', key, code: result.error.code })
      if (['authentication_required', 'access_denied'].includes(result.error.code)) onAccessFailure?.(result.error.code, bundle)
    } else if (!inputImpactMatches(bundle, position, result.data)) setState({ status: 'error', key, code: 'identity_mismatch' })
    else setState({ status: 'ready', key, data: result.data })
  }
  if (!client) return null
  const visible = state.key === identity ? state : { status: 'idle' }
  const data = visible.data, snapshot = bundle.observation.snapshot, definition = bundle.version.state
  return <div className="piw-input-impact">
    <button type="button" className="piw-section-btn" onClick={read} disabled={visible.status === 'loading'}>
      {visible.status === 'loading' ? 'Reading saved references…' : visible.status === 'idle' ? 'Inspect references to this input' : 'Refresh saved references'}
    </button>
    <p className="piw-note">Read-only lookup of this saved version. It does not withdraw evidence, reassess a conclusion, or mark anything reviewed.</p>
    {visible.status === 'loading' ? <p role="status">Loading references for position {position}.</p> : null}
    {visible.status === 'error' ? <p role="alert">{visible.code === 'input_unavailable' ? 'This input is unavailable in the saved observation.' : visible.code === 'identity_mismatch' ? 'The returned references do not match this saved version. No result is shown.' : ['authentication_required', 'access_denied'].includes(visible.code) ? 'Access is no longer available. Private records are being cleared.' : 'Saved references are unavailable. Retry the lookup.'}</p> : null}
    {visible.status === 'ready' ? <div data-input-impact={position}>
      <h4>References to this input</h4>
      <p>{data.context_assessment_ids.length} selected assessment(s) · {data.hypotheses.length} hypothesis record(s) · {data.stages.length} commitment stage(s)</p>
      <p className="piw-note">These counts describe saved references, not independent sources or support strength. Prerequisite links and unrelated records are not inferred to use this input.</p>
      {data.context_assessment_ids.slice(0, limit).map(id => {
        const a = snapshot.assessments.find(a => a.id === id)
        return <details className="piw-linked-record" key={id}><summary>Selected assessment · Saved context includes this input</summary>
          <p>{assessmentOutcomeCopy(a.outcome)}</p><p>{a.rationale}</p>
          {a.stale ? <p className="piw-note">A dependency changed; reassessment is not complete.</p> : null}
          <p>Remaining uncertainty: {a.remaining_uncertainty}</p>
        </details>
      })}
      {data.hypotheses.slice(0, limit).map(row => {
        const h = definition.hypotheses.find(h => h.id === row.id)
        return <details className="piw-linked-record" key={row.id}><summary>Hypothesis · {h.statement}</summary>
          <p>{row.citation_indices.length} direct citation(s); {row.assessment_ids.length} linked assessment(s) use this input as context.</p>
          <References indices={row.citation_indices} evidence={h.evidence} bundle={bundle} onOpenCitation={onOpenCitation} />
          <p>Remaining uncertainty: {h.remaining_uncertainty}</p>
        </details>
      })}
      {data.stages.slice(0, limit).map(row => {
        const c = definition.commitments.find(c => c.id === row.commitment_id), s = c.stages.find(s => s.id === row.id)
        return <details className="piw-linked-record" key={`${row.commitment_id}:${row.id}`}><summary>Commitment stage · {s.kind} · {c.actor}</summary>
          <p>{c.statement}</p><p>Recorded status: {s.status}. {s.note}</p>
          <References indices={row.citation_indices} evidence={s.evidence} bundle={bundle} onOpenCitation={onOpenCitation} />
          <p>Remaining uncertainty: {c.remaining_uncertainty}</p>
        </details>
      })}
      {Math.max(data.context_assessment_ids.length, data.hypotheses.length, data.stages.length) > limit ? <button className="piw-text-btn" type="button" onClick={() => setLimit(n => n + 10)}>Show more references</button> : null}
      {!data.context_assessment_ids.length && !data.hypotheses.length && !data.stages.length ? <p>No references to this input are recorded in the inspected fields. That does not establish irrelevance or an absence of use elsewhere.</p> : null}
      {data.unknown_context_assessment_ids.length ? <p className="piw-note">Context is unavailable for {data.unknown_context_assessment_ids.length} selected assessment(s); their use of this input is unresolved.</p> : null}
    </div> : null}
  </div>
}
