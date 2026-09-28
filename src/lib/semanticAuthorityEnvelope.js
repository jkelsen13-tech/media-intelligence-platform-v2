// Pure metadata projection, not an authority reader, provider, cache or persistence API.
// Callers must obtain each complete input from its existing authorized producer.
export const SEMANTIC_ENVELOPE_VERSION='mip_semantic_authority_envelope_v1'
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const fail=code=>{throw Object.assign(new Error(code),{code})}
function exact(o,keys){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).sort().join('|')!==[...keys].sort().join('|')||
 Reflect.ownKeys(o).length!==keys.length||Object.values(Object.getOwnPropertyDescriptors(o)).some(d=>!Object.hasOwn(d,'value')))
  fail('semantic_shape_refused')
}
function str(v,max=160){if(typeof v!=='string'||v.length<1||v.length>max)fail('semantic_value_refused');return v}
function token(v,max=120){str(v,max);if(!/^[A-Za-z0-9][A-Za-z0-9_.:/@+-]*$/.test(v))fail('semantic_identifier_unrepresented');return v}
function uuid(v){if(typeof v!=='string'||!UUID.test(v))fail('semantic_identity_refused');return v}
function nullableUuid(v){return v===null?null:uuid(v)}
function sha(v){if(typeof v!=='string'||!SHA.test(v))fail('semantic_digest_refused');return v}
function decimal(v){
 if(Number.isSafeInteger(v)&&v>0)return String(v)
 if(typeof v!=='string'||!/^[1-9][0-9]{0,18}$/.test(v)||BigInt(v)>9223372036854775807n)fail('semantic_position_refused')
 return v
}
function list(v,max,fn){
 if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||
 Object.keys(v).length!==v.length||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!Object.hasOwn(d,'value')))fail('semantic_bound_refused')
 return v.map(fn)
}
function set(v,max,fn){
 const a=list(v,max,fn)
 if(new Set(a).size!==a.length)fail('semantic_duplicate_refused')
 return a
}
function instant(v){
 str(v,40)
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(v)
 if(!m||+m[1]<1||+m[2]<1||+m[2]>12||+m[3]<1||
 +m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()||+m[4]>23||+m[5]>59||+m[6]>59||
 (m[8]!=='Z'&&(+m[8].slice(1,3)>23||+m[8].slice(4)>59))||!Number.isFinite(Date.parse(v)))
  fail('semantic_time_refused')
 return v // Preserve supplied microseconds/offset; never use Date's rounded value.
}
function canonical(value){
 let nodes=0,bytes=0
 function walk(v,depth){
  if(++nodes>10000||depth>16)fail('semantic_bound_refused')
  if(v===null||typeof v==='boolean')return JSON.stringify(v)
  if(typeof v==='string'){
   if(v.length>8192)fail('semantic_bound_refused')
   bytes+=new TextEncoder().encode(v).length
   if(bytes>65536)fail('semantic_bound_refused')
   return JSON.stringify(v)
  }
  if(typeof v==='number'&&Number.isSafeInteger(v))return String(v)
  if(Array.isArray(v)){
   if(v.length>1024||Object.keys(v).length!==v.length||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!Object.hasOwn(d,'value')))fail('semantic_bound_refused')
   return '['+v.map(x=>walk(x,depth+1)).join(',')+']'
  }
  if(v&&Object.getPrototypeOf(v)===Object.prototype){
   const keys=Object.keys(v)
   if(keys.length>64||Reflect.ownKeys(v).length!==keys.length||
    Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!Object.hasOwn(d,'value')))fail('semantic_shape_refused')
   return '{'+keys.sort().map(k=>walk(k,depth+1)+':'+walk(v[k],depth+1)).join(',')+'}'
  }
  fail('semantic_encoding_refused')
 }
 return walk(value,0)
}
const issued=new WeakSet()

async function hash(v){
 const bytes=new TextEncoder().encode(canonical(v))
 if(bytes.length>65536)fail('semantic_bound_refused')
 if(!globalThis.crypto?.subtle)fail('semantic_hash_unavailable')
 try{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
 catch{fail('semantic_hash_unavailable')}
}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const authority=()=>({authorization_conferred:false,cross_user_reuse_allowed:false,
 publication_allowed:false,provider_activation_allowed:false,semantic_qualification_claimed:false})
async function seal(kind,identity,scope,producer,metadata,currentness,recorded_at){
 const body={contract_version:SEMANTIC_ENVELOPE_VERSION,kind,identity,scope,producer,metadata,currentness,
 visibility:{retention:'private',basis:'producer_authorization_required_on_every_read'},
 time:{recorded_at,as_of:null,interpretation:'current_observation_not_historical_visibility'},authority:authority()}
 const result=freeze({...body,envelope_digest:{scheme:'semantic_authority_sorted_json_utf8_sha256_v1',sha256:await hash(body)}})
 issued.add(result);return result
}
const ASSESSMENT_KEYS=['id','ordinal','candidate_id','algorithm_key','algorithm_version','outcome','rationale',
 'remaining_uncertainty','extra_positions','parent_ids','ancestor_ids','watch_keys','context_positions',
 'predecessor_id','assessed_at','input_fingerprint','release_state','stale','stale_causes','superseded_by','publicly_eligible']
const OUTCOMES=['supported','contested','insufficient_evidence','not_supported']
export async function assessmentAuthorityEnvelope(read){
 exact(read,ASSESSMENT_KEYS)
 const id=uuid(read.id),candidate=uuid(read.candidate_id),predecessor=nullableUuid(read.predecessor_id)
 if(predecessor===id||read.release_state!=='private'||read.publicly_eligible!==false||
 typeof read.stale!=='boolean'||!OUTCOMES.includes(read.outcome))fail('semantic_assessment_refused')
 // Required producer fields are bounded but deliberately excluded from metadata.
 str(read.rationale,8000);str(read.remaining_uncertainty,4000)
 list(read.watch_keys,1024,x=>str(x,512))
 const context=set(read.context_positions,500,decimal),extras=set(read.extra_positions,32,decimal)
 const parents=set(read.parent_ids,8,uuid),ancestors=set(read.ancestor_ids,128,uuid)
 if(!context.length||extras.some(x=>!context.includes(x))||parents.some(x=>!ancestors.includes(x))||
 ancestors.includes(id)||parents.includes(id))fail('semantic_assessment_refused')
 const superseded=set(read.superseded_by,1,uuid)
 if(superseded.includes(id)||superseded.includes(predecessor))fail('semantic_assessment_refused')
 const causes=list(read.stale_causes,500,x=>{
  exact(x,['change_position','superseding_assessment_id'])
  if((x.change_position===null)===(x.superseding_assessment_id===null))fail('semantic_cause_refused')
  return {change_position:x.change_position===null?null:decimal(x.change_position),
   superseding_assessment_id:nullableUuid(x.superseding_assessment_id)}
 }).sort((a,b)=>canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0)
 if(new Set(causes.map(canonical)).size!==causes.length||read.stale!==(causes.length>0))fail('semantic_currentness_refused')
 const metadata={ordinal:decimal(read.ordinal),candidate_id:candidate,
 algorithm:{key:token(read.algorithm_key),version:token(read.algorithm_version)},
 input_fingerprint:sha(read.input_fingerprint),fingerprint_scheme:'legacy_assessment_pg_jsonb_v1',
 outcome:read.outcome,context_positions:context,extra_positions:extras,parent_ids:parents,ancestor_ids:ancestors,
 predecessor_id:predecessor,superseded_by:superseded,
 absence:read.outcome==='insufficient_evidence'?{kind:'unknown_or_unresolved',scope:'assessment_outcome_only',negative_evidence:false}:null,
 policy:null,domain_adapter:null,provider:null,unrepresented:['policy','domain_adapter','provider','explicit_temporal_scope','entity_roles','evidence_revision_hash_digest']}
 return seal('assessment',{namespace:'evidence_pipeline.assessments',id},
 {kind:'candidate',id:candidate},'public.mip_assessments_v1.read',metadata,
 {state:superseded.length?'superseded':read.stale?'stale':'current',basis:'producer_read_only',causes},instant(read.assessed_at))
}
const CAUSE_KINDS=['retained_source_change','retained_assessment_change','workspace_changed','permission_changed','human_reconsideration','method_changed']
function causeMetadata(c){
 const resolved=c?.state==='reassessment_recorded'
 exact(c,['cause_id','revision_id','kind','change_position','related_version_id','detail','recorded_at','state',
 ...(resolved?['resolution_revision_id','resolved_at']:[])])
 if(!CAUSE_KINDS.includes(c.kind)||!['pending_explicit_reconciliation','reassessment_recorded'].includes(c.state))
  fail('semantic_cause_unrepresented')
 const basic={cause_id:uuid(c.cause_id),revision_id:uuid(c.revision_id),kind:c.kind,
 change_position:c.change_position===null?null:decimal(c.change_position),related_version_id:nullableUuid(c.related_version_id),
 recorded_at:instant(c.recorded_at),state:c.state,
 resolution_revision_id:resolved?uuid(c.resolution_revision_id):null,resolved_at:resolved?instant(c.resolved_at):null}
 if((c.kind==='retained_source_change')!==(basic.change_position!==null))fail('semantic_cause_refused')
 let d=c.detail
 if(c.kind==='method_changed'){
  exact(d,['implementation','accepted_method_revision','observed_method_revision','observed_active','classification'])
  if(d.classification!=='method_change_requires_reassessment_not_approval'||typeof d.observed_active!=='boolean')fail('semantic_cause_refused')
  d={implementation:token(d.implementation),accepted_method_revision:uuid(d.accepted_method_revision),
   observed_method_revision:nullableUuid(d.observed_method_revision),observed_active:d.observed_active,classification:d.classification}
  if(basic.related_version_id!==d.observed_method_revision||
   (d.observed_active&&d.observed_method_revision===d.accepted_method_revision))fail('semantic_cause_refused')
 }else if(c.kind==='permission_changed'){
  exact(d,['input_position','operation','domain','accepted_permission_revision','observed_permission_revision','reason'])
  if(!['retention','analysis','excerpt_display'].includes(d.operation)||!['rights','privacy'].includes(d.domain)||
   !['current_permission_denied','permission_binding_changed'].includes(d.reason)||basic.related_version_id!==null)fail('semantic_cause_refused')
  d={input_position:decimal(d.input_position),operation:d.operation,domain:d.domain,
   accepted_permission_revision:uuid(d.accepted_permission_revision),
   observed_permission_revision:nullableUuid(d.observed_permission_revision),reason:d.reason}
 }else{
  // These exact source kinds remain identifiable but do not establish the
  // requested semantic correction/retraction/remapping/override meanings.
  fail('semantic_cause_unrepresented')
 }
 return {...basic,detail:d}
}
export async function hypothesisChangeAuthorityEnvelope(backlog,causeId){
 const v2=backlog?.contract_version==='mip_hypothesis_reassessment_backlog_v2'
 exact(backlog,['contract_version','investigation_id','causes','coverage','completed_reassessment','publication_allowed',
 ...(v2?['is_completion_receipt']:[])])
 if(!['mip_hypothesis_reassessment_backlog_v1','mip_hypothesis_reassessment_backlog_v2'].includes(backlog.contract_version)||
 backlog.completed_reassessment!==false||backlog.publication_allowed!==false||(v2&&backlog.is_completion_receipt!==false)||
 !['retained_causes_only','current_head_watch_scope_at_reconciliation'].includes(backlog.coverage))fail('semantic_backlog_refused')
 const scope=uuid(backlog.investigation_id);uuid(causeId)
 // Bounded complete response is required; unsupported selected cause refuses.
 const raw=list(backlog.causes,256,c=>{if(!c||Object.getPrototypeOf(c)!==Object.prototype||Object.values(Object.getOwnPropertyDescriptors(c)).some(d=>!Object.hasOwn(d,'value')))fail('semantic_shape_refused');uuid(c.cause_id);return c})
 if(new Set(raw.map(c=>c.cause_id)).size!==raw.length)fail('semantic_duplicate_refused')
 const selected=raw.filter(c=>c.cause_id===causeId)
 if(selected.length!==1)fail('semantic_identity_refused')
 const c=causeMetadata(selected[0])
 const metadata={...c,canonical_cause:c.kind==='method_changed'?'method_changed':'visibility_changed',
 cause_scope:c.kind==='method_changed'?'evaluated_method_authority':'specific_operation_permission',
 discovery_coverage:backlog.coverage,completion_claimed:false,review_approval_claimed:false,
 algorithm_change:null,provider_change:null,unrepresented:['actor_identity','policy_version','semantic_effect']}
 return seal('change',{namespace:'mip_hypothesis.reassessment_causes',id:c.cause_id},
 {kind:'investigation',id:scope},backlog.contract_version,metadata,
 {state:'unknown',basis:'retained_cause_not_current_authority',causes:[]},c.recorded_at)
}
// The actual public comparison view supplies outlet labels, not immutable
// examined-capture boundaries. This classification is intentionally ephemeral.
export function classifyComparisonAbsence(view,outlet){
 exact(view,['id','omittedBy','coverageUnknown'])
 const claim=token(view.id,160),name=str(outlet,256)
 const omitted=set(view.omittedBy,128,x=>str(x,256)),unknown=set(view.coverageUnknown,128,x=>str(x,256))
 if(omitted.some(x=>unknown.includes(x)))fail('semantic_coverage_refused')
 return freeze({contract_version:'mip_comparison_absence_classification_v1',claim_id:claim,
 state:omitted.includes(name)?'not_present_in_extracted_coverage':unknown.includes(name)?'coverage_unknown':'no_absence_observation',
 canonical_absence_kind:null,immutable_boundary_available:false,persistable_as_canonical_absence:false,
 source_reporting_absence_claimed:false,publication_eligibility_conferred:false})
}
export function requireCanonicalAbsence(envelope){
 if(!issued.has(envelope)||envelope?.contract_version!==SEMANTIC_ENVELOPE_VERSION||envelope.kind!=='assessment'||
 envelope.metadata?.absence?.kind!=='unknown_or_unresolved')fail('semantic_absence_unrepresented')
 return freeze({kind:'unknown_or_unresolved',scope:'assessment_outcome_only',negative_evidence:false})
}
export async function assertSameMetadataRetry(previous,current,{mode='current_observation'}={}){
 if(!issued.has(current)||!['current_observation','historical_metadata'].includes(mode))fail('semantic_retry_refused')
 for(const e of [previous,current]){
  exact(e,['contract_version','kind','identity','scope','producer','metadata','currentness','visibility','time','authority','envelope_digest'])
  exact(e.envelope_digest,['scheme','sha256'])
  if(e.contract_version!==SEMANTIC_ENVELOPE_VERSION||
   e.envelope_digest.scheme!=='semantic_authority_sorted_json_utf8_sha256_v1')fail('semantic_retry_refused')
  sha(e.envelope_digest.sha256)
  const {envelope_digest,...body}=e
  if(await hash(body)!==envelope_digest.sha256)fail('semantic_retry_refused')
  if(canonical(e.authority)!==canonical(authority())||
   canonical(e.visibility)!==canonical({retention:'private',basis:'producer_authorization_required_on_every_read'}))fail('semantic_retry_refused')
 }
 if(canonical(previous)!==canonical(current))fail('semantic_retry_conflict')
 if(mode==='current_observation'&&current.currentness.state!=='current')fail('semantic_currentness_refused')
 return freeze({same_metadata:true,authorization_conferred:false,reuse_authorized:false})
}
