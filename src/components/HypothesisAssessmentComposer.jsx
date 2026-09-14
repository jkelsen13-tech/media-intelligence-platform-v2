import {useEffect,useId,useRef,useState} from 'react'
import {buildGenerationRequest,validGenerationReceipt,buildRecoveryRequest,validRecoveryReceipt} from '../lib/hypothesisGeneration.js'
import {COMPARISON_COPY} from '../lib/hypothesisAssessment.js'
import {buildComposerSubmission,createAssessmentDraft,missingEstimate,newArgument,newHypothesis,validAuthoringContext,validComposerReceipt,verifyComposerSpan} from '../lib/hypothesisAssessmentComposer.js'
const relationNames={reports_allegation:'Reports this allegation',supports:'Supports this explanation',weakens:'Weakens this explanation',compatible:'Fits but does not distinguish',context:'Provides context'}
const triggerNames={new_evidence:'New evidence',correction:'Source correction',withdrawal:'Source withdrawal',contradiction:'Contradiction',shared_origin:'Shared source origin',methodology:'Method or reasoning reconsidered'}
const causeNames={method_changed:'Evaluated method changed',retained_source_change:'Retained source changed',retained_assessment_change:'Retained assessment changed',workspace_changed:'Investigation changed',permission_changed:'Permission changed',human_reconsideration:'Human reconsideration requested'}
function TextField({label,value,onChange,required=false}) {
 const id=useId()
 return <label className="piw-field" htmlFor={id}><span>{label}</span><textarea id={id} value={value} rows={3} maxLength={4000} required={required} onChange={e=>onChange(e.target.value)}/></label>
}
function MissingRating({label,value,onChange}) {return <fieldset className="piw-card"><legend>{label} — not estimated</legend><TextField label={'Why '+label.toLowerCase()+' is not estimated'} value={value.reason} onChange={reason=>onChange({kind:'not_estimated',reason})} required/></fieldset>}
const id=()=>globalThis.crypto.randomUUID()
export default function HypothesisAssessmentComposer({client,investigationId,workspaceVersionId,userScopeKey,onSaved,onAccessFailure,recoveryPrior=null,onRecoveryClose}) {
 const [open,setOpen]=useState(Boolean(recoveryPrior)),[state,setState]=useState(null)
 const scope=JSON.stringify([investigationId,workspaceVersionId,userScopeKey])
 useEffect(()=>{
  if(!open||!userScopeKey){setState(null);return}
  let active=true;setState({client,scope,status:'loading'})
  Promise.resolve().then(()=>client.authoringContext(investigationId,workspaceVersionId)).then(result=>{
   if(!active)return
   if(result?.error||!validAuthoringContext(result?.data,investigationId,workspaceVersionId)){
    setState({client,scope,status:'unavailable'})
    if(['access_denied','authentication_required'].includes(result?.error?.code))onAccessFailure?.(result.error.code)
   }else setState({client,scope,status:'ready',context:result.data})
  }).catch(()=>{if(active)setState({client,scope,status:'unavailable'})})
  return()=>{active=false}
 },[open,client,scope,investigationId,workspaceVersionId])
 if(!userScopeKey)return null
 if(!open)return <button type="button" className="piw-btn" onClick={()=>setOpen(true)}>Write a hypothesis assessment</button>
 const current=state?.client===client&&state.scope===scope?state:null
 if(!current||current.status==='loading')return <p role="status">Loading retained authoring context…</p>
 if(current.status==='unavailable')return <section className="piw-card piw-hypothesis-composer"><p role="status">Authoring is unavailable. Current reviewer access and a current retained observation are required.</p><button type="button" onClick={()=>setOpen(false)}>Close authoring</button></section>
 return <ComposerForm key={scope} client={client} context={current.context} onSaved={onSaved}
  recoveryPrior={recoveryPrior} onClose={()=>{setOpen(false);onRecoveryClose?.()}} onAccessFailure={code=>{setState({client,scope,status:'unavailable'});onAccessFailure?.(code)}}/>
}
export function ComposerForm({client,context,onSaved,onClose,onAccessFailure,recoveryPrior=null}) {
 const [draft,setDraft]=useState(()=>createAssessmentDraft(context)),[status,setStatus]=useState('editing'),[error,setError]=useState(null)
 const [previews,setPreviews]=useState({}),[pick,setPick]=useState({position:'',field:'',start:0,end:0}),[preview,setPreview]=useState(null),[loadingSpan,setLoadingSpan]=useState(false)
 const active=useRef(true),spanEpoch=useRef(0),attempt=useRef(null),saving=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false;spanEpoch.current++}},[])
 const change=(key,value)=>setDraft(r=>({...r,[key]:value}))
 const updateRow=(key,rowId,patch)=>setDraft(r=>({...r,[key]:r[key].map(x=>x.id===rowId?{...x,...patch}:x)}))
 const choose=next=>{spanEpoch.current++;setPreview(null);setLoadingSpan(false);setPick(next)}
 async function readSpan() {
  const epoch=++spanEpoch.current;setPreview(null);setLoadingSpan(true);setError(null)
  const input={investigation_id:context.investigation_id,workspace_version_id:context.workspace_version_id,
   input_position:pick.position,source_field:pick.field,start:pick.start,end:pick.end}
  try {
   const result=await client.authoringSpan(input)
   if(!active.current||epoch!==spanEpoch.current)return
   if(result?.error){if(['access_denied','authentication_required'].includes(result.error.code))onAccessFailure?.(result.error.code);throw Error('span_unavailable')}
   const evidence=await verifyComposerSpan(context,input,result.data,id())
   if(!active.current||epoch!==spanEpoch.current)return
   setPreview({evidence,excerpt:result.data.excerpt})
  }catch{if(active.current&&epoch===spanEpoch.current)setError('The retained passage is unavailable under the selected bounds or current permissions.')}
  finally{if(active.current&&epoch===spanEpoch.current)setLoadingSpan(false)}
 }
 async function save(event,kind='manual') {
  event.preventDefault()
  if(recoveryPrior)kind='worker'
  if(saving.current)return
  let submission=attempt.current
  if(!submission)try{submission=kind==='worker'?(recoveryPrior?{action:'recoverGeneration',input:buildRecoveryRequest(context,draft,id(),recoveryPrior)}:{action:'captureGeneration',input:buildGenerationRequest(context,draft,id())}):buildComposerSubmission(context,draft,id())}
  catch(e){setError(e.message==='record_reassessment_request_first'?'Record a reconsideration request or reconcile pending changes before creating another revision.':
   e.message==='supporting_argument_required'?'Each favored explanation needs an explicit supporting argument linked to retained evidence.':'Complete the required reasoning, evidence links and revision fields before saving.');return}
  attempt.current=submission;saving.current=true;setStatus('saving');setPreview(null);setError(null)
  try {
   const result=await client[submission.action](submission.input)
   if(!active.current)return
   if(['captureGeneration','recoverGeneration'].includes(submission.action)&&result?.error?.code==='generation_not_configured') {
    attempt.current=null;setStatus('editing');setError('No evaluated worker is configured for this investigation. A trusted runtime and authorized method are required.');return
   }
   if(result?.error||!(submission.action==='recoverGeneration'?validRecoveryReceipt(submission.input,result?.data):submission.action==='captureGeneration'?validGenerationReceipt(submission.input,result?.data):validComposerReceipt(context,submission,result?.data))){
    if(['access_denied','authentication_required'].includes(result?.error?.code))onAccessFailure?.(result.error.code)
    setStatus('uncertain');return
   }
   setStatus(['captureGeneration','recoverGeneration'].includes(submission.action)?'queued':'saved');onSaved?.(result.data)
  }catch{if(active.current)setStatus('uncertain')}
  finally{saving.current=false}
 }
 if(status==='uncertain')return <section className="piw-card piw-hypothesis-composer"><p role="status">Saving is unconfirmed. The request is frozen; retry it to recover the same result. Current authority and identical arguments are still required.</p><button type="button" onClick={save}>{['captureGeneration','recoverGeneration'].includes(attempt.current?.action)?'Retry the same generation request':'Retry the same assessment'}</button><button type="button" onClick={onClose}>Close and inspect saved history</button></section>
 if(status==='queued')return <p role="status">Retained-input work requested. Inspect worker attempts for completion or explicit recovery; no assessment is approved or published.</p>
 if(status==='saving')return <p role="status">{['captureGeneration','recoverGeneration'].includes(attempt.current?.action)?'Capturing retained-input work…':'Saving the immutable assessment…'}</p>
 if(status==='saved')return <p role="status">Assessment saved privately. Human review and publication eligibility remain separate.</p>
 const selected=context.materials.find(m=>m.input_position===pick.position),field=selected?.fields.find(f=>f.name===pick.field)
 return <section className="piw-stack piw-hypothesis-composer" aria-label="Compose hypothesis assessment"><header className="piw-card"><h2>{context.question}</h2>
  <p>Write a saved assessment from this retained observation. Human entry and a separately configured worker are distinct paths. Source, acquisition and assessment times remain distinct.</p>
  <p>Likelihood, confidence, evidence quality and relevance remain separate. Estimation controls are unavailable until an approved method is configured.</p>
  <button type="button" onClick={onClose}>Close authoring</button></header>
  {recoveryPrior?<p role="status">Prepare new work linked to prior generation {recoveryPrior}. Select the current definitions and retained passages. The original attempt stays retained; current authority and eligibility are rechecked.</p>:null}
  {error?<p role="alert">{error}</p>:null}
  <form onSubmit={save} className="piw-stack">
   <section className="piw-card piw-hypothesis-composer"><h3>Competing explanations</h3>
    {draft.hypotheses.map((h,index)=><fieldset key={h.id}><legend>Explanation {index+1}</legend>
     <TextField label={'Definition of explanation '+(index+1)} value={h.definition} onChange={definition=>updateRow('hypotheses',h.id,{definition})} required/>
     <MissingRating label="Likelihood" value={h.likelihood} onChange={likelihood=>updateRow('hypotheses',h.id,{likelihood})}/>
     <MissingRating label="Confidence in this likelihood assessment" value={h.confidence} onChange={confidence=>updateRow('hypotheses',h.id,{confidence})}/>
     {draft.hypotheses.length>2?<button type="button" onClick={()=>setDraft(r=>({...r,hypotheses:r.hypotheses.filter(x=>x.id!==h.id),
      arguments:r.arguments.filter(a=>a.hypothesis_id!==h.id),comparison:{...r.comparison,favored_ids:r.comparison.favored_ids.filter(x=>x!==h.id)}}))}>Remove explanation and its arguments</button>:null}
    </fieldset>)}
    <button type="button" onClick={()=>change('hypotheses',[...draft.hypotheses,newHypothesis(id())])}>Add explanation</button>
    <label className="piw-field">Relationship among explanations<select aria-label="Relationship among explanations" value={draft.hypothesis_relationship} onChange={e=>change('hypothesis_relationship',e.target.value)}>
     <option value="not_established">Not established</option><option value="overlapping">May overlap</option><option value="mutually_exclusive">Mutually exclusive</option></select></label>
   </section>
   <section className="piw-card piw-hypothesis-composer"><h3>Retained evidence</h3><p>Only explicitly opened, permission-checked passages can be linked. Retention does not establish support or independent corroboration.</p>
    <label className="piw-field">Retained material<select aria-label="Retained material" value={pick.position} onChange={e=>choose({position:e.target.value,field:'',start:0,end:0})}>
     <option value="">Choose retained material</option>{context.materials.map(m=><option key={m.input_position} value={m.input_position} disabled={m.permission_state!=='checked_current'}>
      Position {m.input_position}{m.permission_state==='blocked'?' — required permissions unavailable':''}</option>)}</select></label>
    {selected?<><p>Material version: {selected.material_version} · Obtained: {selected.acquired_at}. Current permission will be rechecked.</p>
     <label className="piw-field">Retained text field<select aria-label="Retained text field" value={pick.field} onChange={e=>{const f=selected.fields.find(f=>f.name===e.target.value);choose({...pick,field:e.target.value,start:0,end:Math.min(f?.length??0,2000)})}}>
      <option value="">Choose text field</option>{selected.fields.map(f=><option key={f.name} value={f.name}>{f.name} ({f.length} code points)</option>)}</select></label>
     <p>Boundaries count Unicode code points; some displayed characters contain more than one. The end boundary is excluded. Each read is limited to 2,000 code points.</p>
     <label>Start<input type="number" min={0} max={field?.length??0} value={pick.start} onChange={e=>choose({...pick,start:Number(e.target.value)})}/></label>
     <label>End<input type="number" min={1} max={field?.length??0} value={pick.end} onChange={e=>choose({...pick,end:Number(e.target.value)})}/></label>
     <button type="button" disabled={loadingSpan||!field||pick.end<=pick.start||pick.end-pick.start>2000||pick.end>field.length} onClick={readSpan}>
      {loadingSpan?'Checking retained passage…':'Open retained passage'}</button></>:null}
    {preview?<figure><blockquote>{preview.excerpt}</blockquote><figcaption>Exact retained passage. This does not establish the proposed inference.</figcaption>
     <button type="button" onClick={()=>{change('evidence',[...draft.evidence,preview.evidence]);setPreviews(p=>({...p,[preview.evidence.id]:preview.excerpt}));setPreview(null)}}>Link this passage</button></figure>:null}
    {draft.evidence.map((e,index)=><fieldset key={e.id}><legend>Evidence {index+1} · position {e.input_position}</legend><blockquote>{previews[e.id]}</blockquote>
     <TextField label={'What evidence '+(index+1)+' documents, within its limits'} value={e.documented_claim} onChange={documented_claim=>updateRow('evidence',e.id,{documented_claim})} required/>
     <MissingRating label="Evidence quality" value={e.quality} onChange={quality=>updateRow('evidence',e.id,{quality})}/>
     <p>Independent source origin: not established. Published: {String(e.published_at??'unknown')} · Reported event time: {String(e.event_time??'unknown')}.</p>
     <button type="button" onClick={()=>{setDraft(r=>({...r,evidence:r.evidence.filter(x=>x.id!==e.id),arguments:r.arguments.map(a=>({...a,evidence_ids:a.evidence_ids.filter(x=>x!==e.id)}))}));setPreviews(p=>{const next={...p};delete next[e.id];return next})}}>Remove evidence link</button>
    </fieldset>)}
   </section>
   <section className="piw-card piw-hypothesis-composer"><h3>Evidence and reasoning</h3>
    {draft.arguments.map((a,index)=><fieldset key={a.id}><legend>Argument {index+1}</legend>
     <label className="piw-field">Explanation<select aria-label="Explanation" value={a.hypothesis_id} onChange={e=>updateRow('arguments',a.id,{hypothesis_id:e.target.value})}>
      {draft.hypotheses.map((h,i)=><option key={h.id} value={h.id}>Explanation {i+1}</option>)}</select></label>
     <label className="piw-field">How the evidence relates<select aria-label="How the evidence relates" value={a.relation} onChange={e=>updateRow('arguments',a.id,{relation:e.target.value})}>
      {Object.entries(relationNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     {draft.evidence.map((e,i)=><label key={e.id}><input type="checkbox" checked={a.evidence_ids.includes(e.id)} onChange={event=>updateRow('arguments',a.id,{
      evidence_ids:event.target.checked?[...a.evidence_ids,e.id]:a.evidence_ids.filter(x=>x!==e.id)})}/>Evidence {i+1}</label>)}
     <TextField label={'Inferential connection for argument '+(index+1)} value={a.inference} onChange={inference=>updateRow('arguments',a.id,{inference})} required/>
     <TextField label={'Limitations of argument '+(index+1)} value={a.limitation} onChange={limitation=>updateRow('arguments',a.id,{limitation})} required/>
     <MissingRating label="Diagnostic relevance" value={a.relevance} onChange={relevance=>updateRow('arguments',a.id,{relevance})}/>
     <button type="button" onClick={()=>change('arguments',draft.arguments.filter(x=>x.id!==a.id))}>Remove argument</button>
    </fieldset>)}
    <button type="button" onClick={()=>change('arguments',[...draft.arguments,newArgument(id(),draft.hypotheses[0].id)])}>Add argument</button>
   </section>
   <section className="piw-card piw-hypothesis-composer"><h3>Current assessment</h3>
    <label className="piw-field">Comparison<select aria-label="Comparison" required value={draft.comparison.state} onChange={e=>change('comparison',{...draft.comparison,state:e.target.value,favored_ids:[]})}>
     <option value="">Choose the recorded comparison</option>{Object.entries(COMPARISON_COPY).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    {draft.comparison.state==='better_supported'?draft.hypotheses.map((h,i)=><label key={h.id}><input type="checkbox" checked={draft.comparison.favored_ids.includes(h.id)}
     onChange={e=>change('comparison',{...draft.comparison,favored_ids:e.target.checked?[...draft.comparison.favored_ids,h.id]:draft.comparison.favored_ids.filter(x=>x!==h.id)})}/>Explanation {i+1} is better supported</label>):null}
    <TextField label="Saved comparison rationale" value={draft.comparison.rationale} onChange={rationale=>change('comparison',{...draft.comparison,rationale})} required/>
    <TextField label="Main limitation" value={draft.comparison.main_limitation} onChange={main_limitation=>change('comparison',{...draft.comparison,main_limitation})} required/>
    <MissingRating label="Overall assessment confidence" value={draft.comparison.confidence} onChange={confidence=>change('comparison',{...draft.comparison,confidence})}/>
    {[['assumptions','Assumptions'],['gaps','Counterevidence, contradictions and gaps'],['change_tests','What would change this assessment?']].map(([key,label])=>
     <TextField key={key} label={label+' (one item per line)'} value={draft[key].join('\n')} onChange={value=>change(key,value.split('\n'))}/>)}
   </section>
   <section className="piw-card piw-hypothesis-composer"><h3>Revision record</h3><p>Human argument entry · No model used · Private and unreviewed.</p>
    {context.head?<><label className="piw-field">Main reason for revision<select aria-label="Main reason for revision" required value={draft.revision_trigger} onChange={e=>change('revision_trigger',e.target.value)}>
     <option value="">Choose revision cause</option>{Object.entries(triggerNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <label className="piw-field">Result of reconsideration<select aria-label="Result of reconsideration" required value={draft.revision_effect} onChange={e=>change('revision_effect',e.target.value)}>
      <option value="">Choose the result</option><option value="changed">Conclusion changed</option><option value="unchanged">Conclusion unchanged</option><option value="less_certain">Assessment is less certain</option></select></label>
     {!draft.reassessment_causes.length?<p role="status">No pending cause is recorded. Request reconsideration or reconcile changes before saving another revision.</p>:null}
    </>:<p>This will be the first saved hypothesis assessment.</p>}
    <TextField label="Reason for this saved revision" value={draft.revision_reason} onChange={value=>change('revision_reason',value)} required/>
    {draft.reassessment_causes?.map(c=><TextField key={c.cause_id} label={'How this change was considered: '+(causeNames[context.backlog.causes.find(x=>x.cause_id===c.cause_id)?.kind]??'Retained change')}
     value={c.reason} onChange={reason=>change('reassessment_causes',draft.reassessment_causes.map(x=>x.cause_id===c.cause_id?{...x,reason}:x))} required/>)}
    <p>Evidence cutoff: {context.knowledge_cutoff}. The database assigns completion time. Saving neither approves publication nor marks the workspace reviewed.</p>
    {!recoveryPrior?<button type="submit" disabled={context.head&&!draft.reassessment_causes.length}>Save private assessment</button>:null}
    {typeof client?.[recoveryPrior?'recoverGeneration':'captureGeneration']==='function'?<div><p>A worker request uses the competing definitions and selected retained passages above. It requires a separately configured evaluated method and does not save this form's human rationale or approve its result.</p>
     <button type="button" disabled={loadingSpan||(context.head&&!draft.reassessment_causes.length)} onClick={e=>save(e,'worker')}>{recoveryPrior?'Request fresh generation for recovery':'Request retained-input assessment'}</button></div>:null}
   </section>
  </form>
 </section>
}
