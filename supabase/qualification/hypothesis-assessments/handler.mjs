// Isolated authenticated transport. No live index, credentials, model or deployment.
import {validateHypothesisAssessment} from '../../../src/lib/hypothesisAssessment.js'
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
async function boundedJson(request) {
 if(!request.body) throw new Error('invalid_request')
 const reader=request.body.getReader(),chunks=[];let size=0
 try {
  for(;;) {const {value,done}=await reader.read();if(done)break
   size+=value.byteLength;if(size>65536){await reader.cancel();throw new Error('request_too_large')}chunks.push(value)}
 } finally {reader.releaseLock()}
 const data=new Uint8Array(size);let offset=0
 for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data))
}
function valid(body) {
 if(!object(body)||Object.keys(body).some(k=>!['action','input'].includes(k))||!object(body.input))return false
 const input=body.input
 const keys=body.action==='capture_observation'?['investigation_id','request_id']:body.action==='read_observation'?['investigation_id','observation_id']:['history','backlog','reconcile','generation_backlog','review_history','list_observations'].includes(body.action)?['investigation_id']:body.action==='acknowledge_review'?['investigation_id','request_id','revision_id','previous_receipt_id']:body.action==='recover_generation'?['investigation_id','workspace_version_id','request_id','prior_generation_id','spec']:body.action==='capture_generation'?['investigation_id','workspace_version_id','request_id','spec']:body.action==='authoring_context'?['investigation_id','workspace_version_id']:body.action==='authoring_span'?['investigation_id','workspace_version_id','input_position','source_field','start','end']:body.action==='request_reassessment'?['investigation_id','request_id','revision_id','trigger','reason']:body.action==='request_detail'?['investigation_id','request_id']:['append','complete'].includes(body.action)
  ?['investigation_id','workspace_version_id','request_id','predecessor_id','assessment']:null
 if(!keys||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k))||!uuid(input.investigation_id))return false
 if(body.action==='capture_observation')return uuid(input.request_id)
 if(body.action==='read_observation')return uuid(input.observation_id)
 if(['history','backlog','reconcile','generation_backlog','review_history','list_observations'].includes(body.action))return true
 if(body.action==='acknowledge_review')return uuid(input.request_id)&&uuid(input.revision_id)&&(input.previous_receipt_id===null||uuid(input.previous_receipt_id))
 if(['capture_generation','recover_generation'].includes(body.action)) {
  if(body.action==='recover_generation'&&!uuid(input.prior_generation_id))return false
  const s=input.spec
  return uuid(input.workspace_version_id)&&uuid(input.request_id)&&object(s)&&Object.keys(s).length===3&&
   ['overlapping','mutually_exclusive','not_established'].includes(s.hypothesis_relationship)&&
   Array.isArray(s.hypotheses)&&s.hypotheses.length>=2&&s.hypotheses.length<=64&&
   new Set(s.hypotheses.map(h=>h?.id)).size===s.hypotheses.length&&
   s.hypotheses.every(h=>object(h)&&Object.keys(h).length===2&&typeof h.id==='string'&&h.id.trim()&&typeof h.definition==='string'&&h.definition.trim())&&
   Array.isArray(s.spans)&&s.spans.length<=256&&new Set(s.spans.map(x=>x?.id)).size===s.spans.length&&
   s.spans.every(x=>object(x)&&Object.keys(x).length===5&&typeof x.id==='string'&&x.id.trim()&&typeof x.input_position==='string'&&/^[1-9][0-9]*$/.test(x.input_position)&&
    ['title','summary','body_text'].includes(x.source_field)&&Number.isSafeInteger(x.start)&&Number.isSafeInteger(x.end)&&x.start>=0&&x.end>x.start&&x.end-x.start<=2000&&x.end<=2147483647)
 }
 if(body.action==='authoring_context')return uuid(input.workspace_version_id)
 if(body.action==='authoring_span')return uuid(input.workspace_version_id)&&typeof input.input_position==='string'&&/^[1-9][0-9]*$/.test(input.input_position)&&
  ['title','summary','body_text'].includes(input.source_field)&&Number.isSafeInteger(input.start)&&Number.isSafeInteger(input.end)&&
  input.start>=0&&input.end>input.start&&input.end-input.start<=2000&&input.end<=2147483647
 if(body.action==='request_detail')return uuid(input.request_id)
 if(body.action==='request_reassessment')return uuid(input.request_id)&&uuid(input.revision_id)&&['contradiction','shared_origin','methodology'].includes(input.trigger)&&typeof input.reason==='string'&&input.reason.trim().length>0&&Array.from(input.reason.trim()).length<=2000
 return uuid(input.workspace_version_id)&&uuid(input.request_id)&&(input.predecessor_id===null||uuid(input.predecessor_id))
  &&validateHypothesisAssessment(input.assessment).valid&&input.assessment.review_state==='unreviewed'
  &&(body.action==='complete'?Boolean(input.assessment.reassessment_causes?.length):!Object.hasOwn(input.assessment,'reassessment_causes'))
  &&input.assessment.question_id===input.investigation_id&&input.assessment.predecessor_id===input.predecessor_id
}
export function createHypothesisHandler({authenticate,store,sourceProject,allowedOrigins,generationTarget=null}) {
 if(typeof authenticate!=='function'||typeof store?.appendBound!=='function'||typeof store?.boundHistory!=='function'
  ||typeof sourceProject!=='string'||!sourceProject.trim()||sourceProject==='cc-definition-batch-v1'
  ||!Array.isArray(allowedOrigins)||!allowedOrigins.length)throw new TypeError('invalid_isolated_configuration')
 // Trusted configuration only. No default runtime/method; source rights and method authority are rechecked in SQL.
 const target=generationTarget===null?null:Object.freeze({...generationTarget})
 if(target&&(!object(target)||Object.keys(target).length!==2||typeof target.runtimeId!=='string'||!target.runtimeId.trim()||!uuid(target.methodRevision)))
  throw new TypeError('invalid_isolated_configuration')
 const origins=new Set(allowedOrigins)
 if([...origins].some(o=>{try{return new URL(o).origin!==o||!o.startsWith('https://')}catch{return true}}))
  throw new TypeError('invalid_isolated_configuration')
 return async request=>{
  const origin=request.headers.get('origin')
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin',
   'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type'}
  if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers})
  if(origin&&!origins.has(origin))return reply(403,{error:{code:'origin_denied'}})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return reply(405,{error:{code:'method_not_allowed'}})
  const authorization=request.headers.get('authorization')??''
  if(!/^Bearer \S+$/i.test(authorization))return reply(401,{error:{code:'authentication_required'}})
  if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))
   return reply(415,{error:{code:'json_required'}})
  let body
  try{body=await boundedJson(request)}catch(e){return reply(e.message==='request_too_large'?413:400,{error:{code:e.message==='request_too_large'?'request_too_large':'invalid_request'}})}
  if(!valid(body))return reply(400,{error:{code:'invalid_request'}})
  try{
   // Verified Auth result is the sole identity source. No browser/worker user_id or role is accepted.
   const user=await authenticate(authorization)
   if(!user||!uuid(user.id)||user.is_anonymous===true)return reply(401,{error:{code:'authentication_required'}})
   const i=body.input,scope={verifiedUserId:user.id,investigationId:i.investigation_id}
   if(['capture_generation','recover_generation'].includes(body.action)&&(!target||typeof store[body.action==='recover_generation'?'recoverGeneration':'captureGeneration']!=='function'))return reply(409,{error:{code:'generation_not_configured'}})
   const data=body.action==='list_observations'?await store.listObservations(scope):body.action==='capture_observation'?await store.captureObservation({...scope,requestId:i.request_id}):body.action==='read_observation'?await store.readObservation({...scope,observationId:i.observation_id}):body.action==='review_history'?await store.reviewHistory(scope):body.action==='acknowledge_review'?await store.acknowledgeReview({...scope,requestId:i.request_id,revisionId:i.revision_id,previousReceiptId:i.previous_receipt_id}):body.action==='recover_generation'?await store.recoverGeneration({...scope,workspaceVersionId:i.workspace_version_id,sourceProject,
    requestId:i.request_id,runtimeId:target.runtimeId,methodRevision:target.methodRevision,priorGenerationId:i.prior_generation_id,spec:i.spec}):body.action==='capture_generation'?await store.captureGeneration({...scope,workspaceVersionId:i.workspace_version_id,sourceProject,
    requestId:i.request_id,runtimeId:target.runtimeId,methodRevision:target.methodRevision,spec:i.spec}):body.action==='generation_backlog'?await store.generationBacklog(scope):body.action==='authoring_context'?await store.authoringContext({...scope,workspaceVersionId:i.workspace_version_id,sourceProject}):body.action==='authoring_span'?await store.authoringSpan({...scope,workspaceVersionId:i.workspace_version_id,sourceProject,inputPosition:i.input_position,sourceField:i.source_field,start:i.start,end:i.end}):body.action==='request_detail'?await store.requestDetail({...scope,requestId:i.request_id}):body.action==='request_reassessment'?await store.requestReassessment({...scope,requestId:i.request_id,revisionId:i.revision_id,trigger:i.trigger,reason:i.reason}):body.action==='history'?await store.boundHistory(scope):body.action==='backlog'?await store.backlog(scope):body.action==='reconcile'?await store.reconcile(scope):await (body.action==='complete'?store.complete.bind(store):store.appendBound.bind(store))({...scope,
    workspaceVersionId:i.workspace_version_id,sourceProject,requestId:i.request_id,predecessorId:i.predecessor_id,assessment:i.assessment})
   return reply(200,{data})
  }catch(e){
   const code=e?.code
   if(code==='42501')return reply(403,{error:{code:'access_denied'}})
   if(['40001','23505'].includes(code))return reply(409,{error:{code:'version_conflict'}})
   if(['22023','22P02','22007','22008'].includes(code))return reply(400,{error:{code:'invalid_request'}})
   return reply(503,{error:{code:'service_unavailable'}})
  }
 }
}
