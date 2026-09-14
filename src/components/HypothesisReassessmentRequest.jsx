import {useEffect,useId,useRef,useState} from 'react'
const triggers={contradiction:'Possible contradiction',shared_origin:'Possible shared source origin',methodology:'Method or reasoning needs reconsideration'}
const text=x=>typeof x==='string'&&x.trim().length>0
export default function HypothesisReassessmentRequest({client,investigationId,revisionId,scopeKey,onRecorded}) {
 const id=useId(),[trigger,setTrigger]=useState('contradiction'),[reason,setReason]=useState(''),[attempt,setAttempt]=useState(null),[status,setStatus]=useState('idle')
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const active=useRef({});active.current={client,scopeKey}
 async function submit(event) {
  event.preventDefault()
  if(status==='sending'||typeof client?.requestReassessment!=='function')return
  const input=attempt??{investigation_id:investigationId,revision_id:revisionId,request_id:globalThis.crypto.randomUUID(),trigger,reason}
  const context=active.current;setAttempt(input);setStatus('sending')
  try {
   const result=await client.requestReassessment(input)
   if(!alive.current||active.current.client!==context.client||active.current.scopeKey!==context.scopeKey)return
   const r=result?.data
   if(result?.error||r?.contract_version!=='mip_hypothesis_request_receipt_v1'||r.investigation_id!==investigationId||
     r.request_id!==input.request_id||r.revision_id!==revisionId||r.trigger!==input.trigger||!text(r.cause_id)||
     r.completed_reassessment!==false||r.publication_allowed!==false){setStatus('uncertain');return}
   setStatus('recorded');onRecorded?.()
  }catch{if(alive.current&&active.current.client===context.client&&active.current.scopeKey===context.scopeKey)setStatus('uncertain')}
 }
 return <section className="piw-card" aria-label="Request reassessment"><h3>Request reassessment</h3>
  <p>Record a concern for explicit reconsideration. This does not approve a method, change the saved conclusion or authorize publication.</p>
  <form onSubmit={submit}>
   <label htmlFor={id+'-trigger'}>Reason for reconsideration</label>
   <select id={id+'-trigger'} value={trigger} disabled={!!attempt} onChange={e=>setTrigger(e.target.value)}>
    {Object.entries(triggers).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select>
   <label htmlFor={id+'-reason'}>What needs reconsideration, and why?</label>
   <textarea id={id+'-reason'} value={reason} maxLength={2000} required disabled={!!attempt}
    onChange={e=>setReason(e.target.value)} />
   <p>Describe the concern using authorized evidence references. The request remains private and does not itself establish the concern as true.</p>
   <button type="submit" disabled={!reason.trim()||status==='sending'||status==='recorded'}>
    {status==='sending'?'Recording request…':attempt?'Retry the same request':'Record reassessment request'}</button>
  </form>
  {status==='uncertain'?<p role="status">Recording is unconfirmed. Retry the same request to recover its receipt. After reopening, check retained changes before creating another request.</p>:null}
  {status==='recorded'?<p role="status">Request recorded. Reassessment remains pending.</p>:null}
 </section>
}
export function ReassessmentRequestDetail({client,investigationId,cause,scopeKey}) {
 const [state,setState]=useState(null),active=useRef({});active.current={client,scopeKey}
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function inspect() {
  const context=active.current;setState({status:'loading',...context})
  try {
   const result=await client.requestDetail(investigationId,cause.detail.request_id)
   if(!alive.current||active.current.client!==context.client||active.current.scopeKey!==context.scopeKey)return
   const r=result?.data
   const valid=!result?.error&&r?.contract_version==='mip_hypothesis_request_detail_v1'&&
    r.investigation_id===investigationId&&r.request_id===cause.detail.request_id&&r.cause_id===cause.cause_id&&
    r.revision_id===cause.revision_id&&r.trigger===cause.detail.trigger&&r.publication_allowed===false&&r.is_approval===false
   setState({status:valid&&r.status==='available'&&text(r.reason)?'available':'withheld',reason:valid&&r.status==='available'?r.reason:null,...context})
  }catch{if(alive.current&&active.current.client===context.client&&active.current.scopeKey===context.scopeKey)setState({status:'withheld',...context})}
 }
 const current=state?.client===client&&state.scopeKey===scopeKey?state:null
 return <div><button type="button" onClick={inspect} disabled={current?.status==='loading'}>Inspect reassessment request</button>
  {current?.status==='available'?<p>{current.reason}</p>:current?.status==='withheld'?<p role="status">Request details are unavailable under current access or evidence permissions.</p>:null}
 </div>
}
