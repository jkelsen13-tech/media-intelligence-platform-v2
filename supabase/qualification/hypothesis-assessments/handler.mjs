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
 const keys=body.action==='history'?['investigation_id']:body.action==='append'
  ?['investigation_id','workspace_version_id','request_id','predecessor_id','assessment']:null
 if(!keys||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k))||!uuid(input.investigation_id))return false
 if(body.action==='history')return true
 return uuid(input.workspace_version_id)&&uuid(input.request_id)&&(input.predecessor_id===null||uuid(input.predecessor_id))
  &&validateHypothesisAssessment(input.assessment).valid&&input.assessment.review_state==='unreviewed'
  &&input.assessment.question_id===input.investigation_id&&input.assessment.predecessor_id===input.predecessor_id
}
export function createHypothesisHandler({authenticate,store,sourceProject,allowedOrigins}) {
 if(typeof authenticate!=='function'||typeof store?.appendBound!=='function'||typeof store?.boundHistory!=='function'
  ||typeof sourceProject!=='string'||!sourceProject.trim()||sourceProject==='cc-definition-batch-v1'
  ||!Array.isArray(allowedOrigins)||!allowedOrigins.length)throw new TypeError('invalid_isolated_configuration')
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
   const data=body.action==='history'?await store.boundHistory(scope):await store.appendBound({...scope,
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
