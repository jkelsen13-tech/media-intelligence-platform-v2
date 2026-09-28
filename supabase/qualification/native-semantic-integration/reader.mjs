// Closed server-side consumers of existing governed producers. No HTTP/public API.
import {connectAuthenticatedPg} from '../collector-native-capture/authenticatedPgDriver.mjs'
import {assessmentAuthorityEnvelope,hypothesisChangeAuthorityEnvelope,assertSameMetadataRetry} from '../../../src/lib/semanticAuthorityEnvelope.js'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,SHA=/^[a-f0-9]{64}$/
const fail=code=>{throw Object.assign(Error(code),{code})}
function exact(v,keys,code='semantic_native_request_refused'){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join('|')!==[...keys].sort().join('|')||
 Reflect.ownKeys(v).length!==keys.length||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!Object.hasOwn(d,'value')))fail(code)
}
function uuid(v){if(typeof v!=='string'||!UUID.test(v))fail('semantic_native_request_refused')}
function expected(v){if(v!==null&&(typeof v!=='string'||!SHA.test(v)))fail('semantic_native_request_refused')}
const ASSESSMENT="with r as materialized (select public.mip_assessments_v1('read',jsonb_build_object('assessment_id',$1::uuid)) value) select case when octet_length(value::text)<=65536 then value else null end value from r"
const CHANGE=`with h as materialized (
 select mip_hypothesis.read_bound_history($1::uuid,$2::uuid) value
), b as materialized (
 select mip_hypothesis.reassessment_backlog($1::uuid,$2::uuid) value
)
select jsonb_build_object(
 'history_contract',h.value->'contract_version','investigation_id',h.value->'investigation_id',
 'publication_allowed',h.value->'publication_allowed',
 'temporal_scope',h.value->'temporal_scope',
 'historical_commit_visibility_qualified',h.value->'historical_commit_visibility_qualified',
 'revision',(select jsonb_build_object('revision_id',e->'revision_id','status',e->'status',
   'current_context',e->'current_context')
   from jsonb_array_elements(h.value->'entries') e where e->>'revision_id'=$3::text),
 'backlog',case when octet_length(b.value::text)<=65536 and jsonb_array_length(b.value->'causes')<=256
   then b.value else null end
) value from h cross join b`
function sanitize(error){
 const code=error?.code
 if(code==='42501')return Object.assign(Error('semantic_native_access_denied'),{code:'semantic_native_access_denied'})
 if(['semantic_native_request_refused','semantic_native_binding_mismatch','semantic_native_currentness_refused',
 'semantic_native_access_denied','semantic_native_producer_unavailable','semantic_native_identity_refused','semantic_native_contract_refused'].includes(code))
  return Object.assign(Error(code),{code})
 // Source envelope refusals are metadata-shape/unsupported-mapping failures.
 if(typeof code==='string'&&code.startsWith('semantic_'))return Object.assign(Error('semantic_native_contract_refused'),{code:'semantic_native_contract_refused'})
 return Error('semantic_native_read_failed')
}
async function readOnce(client,kind,selection){
 if(kind==='assessment'){
  const rows=(await client.query(ASSESSMENT,[selection.assessmentId])).rows
  if(rows.length!==1||!rows[0].value)fail('semantic_native_producer_unavailable')
  const read=rows[0].value
  if(read.id!==selection.assessmentId||read.input_fingerprint!==selection.expectedInputFingerprint)
   fail('semantic_native_binding_mismatch')
  const envelope=await assessmentAuthorityEnvelope(read)
  if(selection.mode==='current'&&envelope.currentness.state!=='current')fail('semantic_native_currentness_refused')
  return envelope
 }
 const rows=(await client.query(CHANGE,[selection.verifiedUserId,selection.investigationId,selection.revisionId])).rows
 if(rows.length!==1||!rows[0].value)fail('semantic_native_producer_unavailable')
 const data=rows[0].value
 exact(data,['history_contract','investigation_id','publication_allowed','temporal_scope',
  'historical_commit_visibility_qualified','revision','backlog'],'semantic_native_contract_refused')
 if(data.history_contract!=='mip_hypothesis_history_v1'||data.investigation_id!==selection.investigationId||
 data.publication_allowed!==false||data.temporal_scope!=='retained_versions_only'||
 data.historical_commit_visibility_qualified!==false)fail('semantic_native_binding_mismatch')
 if(!data.revision||data.revision.status!=='available')fail('semantic_native_access_denied')
 exact(data.revision,['revision_id','status','current_context'],'semantic_native_contract_refused')
 if(data.revision.revision_id!==selection.revisionId||typeof data.revision.current_context!=='boolean'||
 data.backlog?.investigation_id!==selection.investigationId)fail('semantic_native_binding_mismatch')
 const envelope=await hypothesisChangeAuthorityEnvelope(data.backlog,selection.causeId)
 if(envelope.metadata.revision_id!==selection.revisionId)fail('semantic_native_binding_mismatch')
 return envelope // Cause remains unknown current authority, including method-change history.
}
async function consume(connection,kind,selection){
 let client=null,open=false,result=null,primary=null,rollback=null,close=null
 try{
  client=await connectAuthenticatedPg(connection)
  await client.query('begin isolation level read committed');open=true
  const row=(await client.query("select session_user::text login,current_user::text effective,current_setting('transaction_isolation') isolation")).rows[0]
  if(row?.login!==connection.expectedLogin||row.isolation!=='read committed'||
   row.effective!==(kind==='assessment'?'service_role':connection.expectedLogin))fail('semantic_native_identity_refused')
  // Real readers acquire their existing permission fences. READ ONLY cannot be
  // used because those reader functions intentionally use SELECT FOR SHARE.
  const first=await readOnce(client,kind,selection)
  const current=await readOnce(client,kind,selection)
  await assertSameMetadataRetry(first,current,{mode:kind==='assessment'&&selection.mode==='current'?'current_observation':'historical_metadata'})
  if(selection.expectedEnvelopeDigest!==null&&current.envelope_digest.sha256!==selection.expectedEnvelopeDigest)
   fail('semantic_native_binding_mismatch')
  await client.query('commit');open=false;result=current
 }catch(error){primary=sanitize(error)}
 finally{
  if(client&&open){try{await client.query('rollback')}catch{rollback=Error('semantic_native_rollback_unverified')}}
  if(client){try{await client.end()}catch{close=Error('semantic_native_close_unverified')}}
 }
 const failures=[primary,rollback,close].filter(Boolean)
 if(failures.length>1)throw new AggregateError(failures,'semantic_native_operation_failed')
 if(failures.length)throw failures[0]
 return result
}
function config(value,kind){
 exact(value,['connectionString','expectedLogin','disposable','sessionPoolerHost'])
 if(typeof value.connectionString!=='string'||value.connectionString.length>4096||
 typeof value.expectedLogin!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(value.expectedLogin)||
 typeof value.disposable!=='boolean'||(value.sessionPoolerHost!==null&&value.sessionPoolerHost!=='aws-0-us-west-1.pooler.supabase.com'))
  fail('semantic_native_request_refused')
 if(kind==='assessment'&&!value.expectedLogin.endsWith('_native'))fail('semantic_native_identity_refused')
 return Object.freeze({...value,effectiveRole:kind==='assessment'?'service_role':null})
}
// Configuration is trusted server composition only; never deserialize it from a request.
// The assessment branch is INTERNAL service-role authority, not per-user delivery.
export function createNativeSemanticAssessmentReader(connection){
 const configured=config(connection,'assessment')
 return async selection=>{
  exact(selection,['assessmentId','expectedInputFingerprint','expectedEnvelopeDigest','mode'])
  uuid(selection.assessmentId)
  if(typeof selection.expectedInputFingerprint!=='string'||!SHA.test(selection.expectedInputFingerprint)||
   !['current','retained'].includes(selection.mode))fail('semantic_native_request_refused')
  expected(selection.expectedEnvelopeDigest)
  return consume(configured,'assessment',selection)
 }
}
// verifiedUserId MUST come from the existing trusted Auth handler, never browser JSON.
// The existing gateway's read_bound_history revalidates the full retained permission closure.
export function createNativeSemanticChangeReader(connection){
 const configured=config(connection,'change')
 return async selection=>{
  exact(selection,['verifiedUserId','investigationId','revisionId','causeId','expectedEnvelopeDigest'])
  for(const key of ['verifiedUserId','investigationId','revisionId','causeId'])uuid(selection[key])
  expected(selection.expectedEnvelopeDigest)
  return consume(configured,'change',selection)
 }
}
