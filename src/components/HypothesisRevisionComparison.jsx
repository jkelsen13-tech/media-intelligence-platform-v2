import {useState} from 'react'
import {compareHypothesisRevisions,comparisonFieldLabel} from '../lib/hypothesisRevisionComparison.js'
import {ratingCopy} from '../lib/hypothesisAssessment.js'
import {retainedDateDisplay} from '../lib/investigationEvidenceTrail.js'
function Value({value,present=true}){
 if(!present)return<p>Not included in this revision.</p>
 if(value===null)return<p>Not established in the saved record.</p>
 if(Array.isArray(value))return value.length?<ul>{value.map((v,i)=><li key={i}><Value value={v}/></li>)}</ul>:<p>None recorded.</p>
 if(typeof value==='object'&&['not_estimated','qualitative'].includes(value.kind))return<div><p>{ratingCopy(value)}</p><p>{value.reason}</p>{value.method_ref?<p>Recorded method: {value.method_ref}. This is not a numerical probability.</p>:null}</div>
 if(typeof value==='object')return<dl>{Object.entries(value).map(([key,v])=><div key={key}><dt>{comparisonFieldLabel(key)}</dt><dd><Value value={v}/></dd></div>)}</dl>
 return<p>{typeof value==='boolean'?(value?'true':'false'):String(value)}</p>
}
export default function HypothesisRevisionComparison({view,revisionId}){
 const [open,setOpen]=useState(false),diff=compareHypothesisRevisions(view,revisionId)
 if(diff.status==='initial')return null
 if(diff.status!=='available')return<section className="piw-card"><h3>Compare saved revisions</h3><p role="status">Comparison unavailable: both linked revisions need current permission and a consistent saved history.</p></section>
 return<section className="piw-card piw-revision-comparison" aria-label="Compare saved hypothesis revisions">
  <h3>Compare saved revisions</h3>
  <p>Revision {diff.previous.revision} → revision {diff.next.revision}</p>
  <p>Saved result: {diff.effect.replaceAll('_',' ')}.</p>
  {diff.pending?<p role="status">Further changes remain pending. This comparison only describes the two completed revisions.</p>:null}
  <details onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open)}}>
   <summary>Inspect changes from revision {diff.previous.revision}</summary>
   {open?<div>
    <p>Recorded reason: {diff.reason}</p><p>Recorded trigger: {diff.trigger.replaceAll('_',' ')}</p>
    {diff.groups.length?diff.groups.map((group,i)=><section className="piw-revision-diff-group" key={i}>
     <h4>{group.title}</h4>
     {group.status==='included'?<p>Included in the selected revision.</p>:group.status==='omitted'?<p>Omitted from the selected revision; prior history remains retained.</p>:null}
     {group.changes.map(change=><section key={change.key}><h5>{change.label}</h5><div className="piw-revision-diff-values">
      <div><h6>Revision {diff.previous.revision}</h6><Value value={change.before} present={change.beforePresent}/></div>
      <div><h6>Revision {diff.next.revision}</h6><Value value={change.after} present={change.afterPresent}/></div>
     </div></section>)}
    </section>):<p>No differences in the compared assessment fields. Revision identity, completion time and recorded reason remain separate.</p>}
    <details className="piw-comparison-notes"><summary>Version details and interpretation</summary>
     <p>Previous completion: {retainedDateDisplay(diff.previous.completedAt).label}</p>
     <p>Selected completion: {retainedDateDisplay(diff.next.completedAt).label}</p>
     <p>This is a comparison of saved revisions. A verified historical-time view remains unavailable.</p>
     <p>Omitted from a revision does not mean deleted from MIP. A changed reference does not by itself establish changed source content. Shared origins are not independent corroboration.</p>
     <p>Differences do not calculate a new likelihood or confidence, acknowledge review, resolve pending work, approve permissions or authorize publication.</p>
    </details>
   </div>:null}
  </details>
 </section>
}
