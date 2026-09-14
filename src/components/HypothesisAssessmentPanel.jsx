import { useState } from 'react'
import { validateHypothesisAssessment, ratingCopy, COMPARISON_COPY } from '../lib/hypothesisAssessment.js'
import { retainedDateDisplay } from '../lib/investigationEvidenceTrail.js'

const date = value => retainedDateDisplay(value).label
function Rating({title,value}) {
  return <div><dt>{title}</dt><dd>{ratingCopy(value)}<p className="piw-note">{value.reason}</p>
    {value.kind==='qualitative'?<p className="piw-note">Recorded method: {value.method_ref}. This rating is not a numerical probability.</p>:null}
  </dd></div>
}
function Notes({title,items}) {
  return <section><h4>{title}</h4>{items.length?<ul>{items.map((item,i)=><li key={i}>{item}</li>)}</ul>:<p>None recorded. This does not establish completeness.</p>}</section>
}
export default function HypothesisAssessmentPanel({assessment,dependencyChanged=false,historyMode='saved_observation'}) {
  const [open,setOpen]=useState(false)
  if(!validateHypothesisAssessment(assessment).valid) return <p>Hypothesis assessment unavailable: the saved record is incomplete or unsupported.</p>
  const r=assessment, evidence=new Map(r.evidence.map(e=>[e.id,e]))
  return <section className="piw-card piw-hypothesis-assessment">
    <h3>{r.question}</h3>
    <p><strong>Inferred assessment, not an established finding.</strong></p>
    <p>{COMPARISON_COPY[r.comparison.state]}</p>
    <p>{r.comparison.rationale}</p>
    <dl><Rating title="Overall assessment confidence" value={r.comparison.confidence}/></dl>
    <p><strong>Main limitation:</strong> {r.comparison.main_limitation}</p>
    <p>Evidence included through: {date(r.knowledge_cutoff)}</p>
    <p>Assessment completed: {date(r.completed_at)} · Revision {r.revision}</p>
    <p>{historyMode==='as_known_then'?'As known then: this is a completed assessment available by the requested time.':
      historyMode==='reconstructed_now'?'Reconstructed now: later-acquired evidence may inform this assessment.':'Saved observation: no current evidence is substituted.'}</p>
    <p>Review: {r.review_state.replaceAll('_',' ')} · Private; publication disabled.</p>
    {dependencyChanged?<p role="status">A dependency changed. Reassessment is pending; this is still the saved assessment.</p>:null}
    <details className="piw-linked-record" onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open)}}>
      <summary>Evidence, reasoning, alternatives, and assessment history</summary>
      {open?<div>
        <p>Hypotheses: {r.hypothesis_relationship.replaceAll('_',' ')}. Leading support does not establish more-likely-than-not probability. Shared origins are not independent corroboration.</p>
        {r.hypotheses.map(h=><section className="piw-card" key={h.id}>
          <h4>{h.definition}</h4>
          {r.comparison.favored_ids.includes(h.id)?<p>Better supported in this saved comparison.</p>:null}
          <dl><Rating title="Likelihood" value={h.likelihood}/><Rating title="Confidence in this likelihood assessment" value={h.confidence}/></dl>
          {r.arguments.filter(a=>a.hypothesis_id===h.id).map(a=><article key={a.id}>
            <h5>{a.relation.replaceAll('_',' ')}</h5><p>{a.inference}</p>
            <p>Inferential limitation: {a.limitation}</p>
            <dl><Rating title="Diagnostic relevance" value={a.relevance}/></dl>
            <ul>{a.evidence_ids.map(id=>{const e=evidence.get(id);return <li key={id}>
              <p>Documented scope: {e.documented_claim}</p>
              <p>Retained input {e.input_position} · Material version {e.material_version}</p>
              <p>Source publication: {date(e.published_at)} · MIP obtained: {date(e.acquired_at)} · Reported event time: {date(e.event_time)}</p>
              <p>Source-origin group: {e.origin_group??'Not established'}</p>
              <dl><Rating title="Evidence quality" value={e.quality}/></dl>
            </li>})}</ul>
            {a.relation==='reports_allegation'?<p>Reporting an allegation does not independently substantiate it.</p>:null}
          </article>)}
        </section>)}
        <Notes title="Assumptions" items={r.assumptions}/>
        <Notes title="What weakens or limits this assessment?" items={r.gaps}/>
        <Notes title="What would change this assessment?" items={r.change_tests}/>
        {r.reassessment_causes?.length?<section><h4>How pending changes were considered</h4>
          <ul>{r.reassessment_causes.map(c=><li key={c.cause_id}><p>{c.reason}</p><p>Retained cause: {c.cause_id}</p></li>)}</ul>
          <p>This saved consideration is separate from review approval and publication eligibility.</p>
        </section>:null}
        <h4>Saved revision record</h4>
        <p>Cause: {r.revision_trigger.replaceAll('_',' ')} · Result: {r.revision_effect.replaceAll('_',' ')}</p>
        <p>{r.revision_reason}</p>
        <p>Method version: {r.method_version} · Model version: {r.model_version}</p>
        <p>Previous assessment: {r.predecessor_id??'Initial revision'}. Revision links and exact retained inputs remain in the saved evidence trail.</p>
      </div>:null}
    </details>
  </section>
}
