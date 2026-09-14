import {createHash} from 'node:crypto'
import {createStore} from './store.mjs'
const freezeTree=x=>{if(x&&typeof x==='object'){for(const value of Object.values(x))freezeTree(value);Object.freeze(x)}return x}
const deny=()=>{throw Error('exact_citation_denied')}
const hash=b=>createHash('sha256').update(b).digest('hex')
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const digest=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)
const exact=(x,fields)=>{if(!x||Object.getPrototypeOf(x)!==Object.prototype||Object.keys(x).sort().join('|')!==fields.split('|').sort().join('|'))deny()}
const identityKeys='investigation|assessment_revision|evidence_id|field_id|input_position|material_version|source_field|start_code_point|end_code_point|byte_start|byte_end|span_hash|mapping'
const mappingKeys='investigation|workspace_version|input_position|material_version|source_field|parent_logical_key|parent_ref_id|parent_canonical_hash|parent_source_version|parent_contract|field_contract|assessment_offset_unit|resolver_offset_unit|field_source_version|field_capture_id|field_hash|field_size|acquired_at|field_logical_key|field_ref_id'
function identityCheck(v,i,r,eid){
 exact(v,identityKeys);exact(v.mapping,mappingKeys);const m=v.mapping
 if(v.investigation!==i||v.assessment_revision!==r||v.evidence_id!==eid||!uuid(v.field_id)||!uuid(v.material_version)||!uuid(m.workspace_version)||
  m.investigation!==i||m.input_position!==v.input_position||m.material_version!==v.material_version||m.source_field!==v.source_field||
  !['title','summary','body_text'].includes(v.source_field)||typeof v.input_position!=='string'||!v.input_position.length||v.input_position.length>256||
  !uuid(m.parent_ref_id)||!uuid(m.field_ref_id)||!uuid(m.field_capture_id)||m.parent_ref_id===m.field_ref_id||
  !digest(m.parent_canonical_hash)||!digest(m.field_hash)||!digest(v.span_hash)||m.parent_source_version!==v.material_version||
  typeof m.field_source_version!=='string'||!/^field-v1:[0-9a-f]{64}$/.test(m.field_source_version)||
  m.parent_contract!=='postgres_retained_jsonb_text_utf8_v1'||m.field_contract!=='utf8_field_bytes_v1'||
  m.assessment_offset_unit!=='unicode_code_points_v1'||m.resolver_offset_unit!=='utf8_bytes_v1'||
  !Number.isSafeInteger(m.field_size)||m.field_size<1||m.field_size>1048576||
  !Number.isFinite(Date.parse(m.acquired_at)))deny()
 for(const k of ['parent_logical_key','field_logical_key'])if(typeof m[k]!=='string'||!m[k].length||m[k].length>256)deny()
 for(const k of ['start_code_point','end_code_point','byte_start','byte_end'])if(!Number.isSafeInteger(v[k])||v[k]<0)deny()
 if(v.end_code_point<=v.start_code_point||v.end_code_point-v.start_code_point>2000||v.byte_end<=v.byte_start||v.byte_end-v.byte_start>8000)deny()
 return m
}
// Bounded response fence only. Production transport cancellation and source authority remain unqualified.
export function createExactCitationAdapter({call,investigation,policy}){
 if(typeof call!=='function'||!uuid(investigation))deny()
 async function invoke(name,args){
  const controller=new AbortController();let timer
  try{return await Promise.race([Promise.resolve().then(()=>call(name,args,controller.signal)),
   new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('exact_citation_deadline'))},8000)})])}
  finally{clearTimeout(timer);controller.abort()}
 }
 async function resolve(response,revision,evidenceId){
   response=structuredClone(response)
   exact(response,'identity|parent|field|source_authority_qualified|ingest_extraction_qualified|production_qualified|transport_qualified|deployment_qualified|publication_allowed')
   for(const k of ['source_authority_qualified','ingest_extraction_qualified','production_qualified','transport_qualified','deployment_qualified','publication_allowed'])if(response[k]!==false)deny()
   const v=response.identity,m=identityCheck(v,investigation,revision,evidenceId)
   const bytes=async(record,key)=>createStore({investigation,policy,call:async(name,args)=>{
    if(name!=='read'||args[0]!==investigation||args[1]!==key||args[2]!=='canonical')deny()
    return record
   }}).factualEvidence(key)
   const parent=await bytes(response.parent,m.parent_logical_key),field=await bytes(response.field,m.field_logical_key)
   if(parent.length>1048576||field.length!==m.field_size||hash(parent)!==m.parent_canonical_hash||hash(field)!==m.field_hash||
    response.parent.ref_id!==m.parent_ref_id||response.field.ref_id!==m.field_ref_id||
    response.parent.provenance.source_version!==m.parent_source_version||response.field.provenance.source_version!==m.field_source_version||
    response.parent.provenance.acquired_at!==m.acquired_at||response.field.provenance.acquired_at!==m.acquired_at)deny()
   // The independently verified parent must name the same retained material and exact field.
   const parentRecord=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(parent))
   if(parentRecord?.id!==v.material_version||typeof parentRecord?.payload?.[v.source_field]!=='string'||
    !Buffer.from(parentRecord.payload[v.source_field],'utf8').equals(field))deny()
   // Hashes of whole canonical units are verified before decoding/converting any field offsets.
   const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(field),points=Array.from(raw)
   if(!Buffer.from(raw,'utf8').equals(field)||v.end_code_point>points.length)deny()
   const a=Buffer.byteLength(points.slice(0,v.start_code_point).join(''),'utf8')
   const b=Buffer.byteLength(points.slice(0,v.end_code_point).join(''),'utf8')
   if(a!==v.byte_start||b!==v.byte_end||b>field.length)deny()
   const passage=field.subarray(a,b)
   if(hash(passage)!==v.span_hash)deny()
   return freezeTree({passage:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(passage),
    provenance:{...structuredClone(v),parent_source_provenance:{...response.parent.provenance},field_representation_provenance:{...response.field.provenance}},
    exact_passage_verified:true,claim_truth_qualified:false,source_authority_qualified:false,ingest_extraction_qualified:false,
    rights_qualified:false,codec_qualified:false,temporal_provenance_qualified:false,production_qualified:false,transport_qualified:false,deployment_qualified:false,publication_allowed:false})
 }
 return Object.freeze({
  async bind(revision,evidenceId,fieldId,requestId){
   if(!uuid(requestId)||!uuid(revision)||!uuid(fieldId)||typeof evidenceId!=='string'||!evidenceId.length||evidenceId.length>256)deny()
   const preview=await invoke('preview',[investigation,revision,evidenceId,fieldId])
   await resolve(preview,revision,evidenceId)
   if(preview.identity.field_id!==fieldId)deny()
   try{
    const receipt=await invoke('bind',[investigation,revision,evidenceId,fieldId,requestId])
    exact(receipt,'request_id|identity')
    if(receipt.request_id!==requestId)deny()
    const value=receipt.identity
    if(JSON.stringify(value)!==JSON.stringify(preview.identity))deny()
    identityCheck(value,investigation,revision,evidenceId)
    if(value.field_id!==fieldId)deny()
    return Object.freeze({bound:true,request_id:requestId,source_authority_qualified:false,ingest_extraction_qualified:false,production_qualified:false,transport_qualified:false,deployment_qualified:false,publication_allowed:false})
   }catch(cause){throw Object.assign(Error('exact_citation_outcome_unknown'),{requestId,cause})}
  },
  async read(revision,evidenceId){
   if(!uuid(revision)||typeof evidenceId!=='string'||!evidenceId.length||evidenceId.length>256)deny()
   return resolve(await invoke('read',[investigation,revision,evidenceId]),revision,evidenceId)

  }
 })
}

// Source-facing only. Attestation is an independently configured owner capability, not a user-supplied grant.
// Uses raw CAS byte admission: never putOnce/JSON.stringify for a canonical field blob.
export function createCanonicalFieldSource({sourceCall,casCall,attestDerivedField,investigation,policy}){
 if(!uuid(investigation)||typeof sourceCall!=='function'||typeof casCall!=='function'||typeof attestDerivedField!=='function')deny()
 const store=createStore({call:casCall,investigation,policy})
 return Object.freeze({async register(input){
  exact(input,'workspaceVersion|inputPosition|sourceField|parentKey|fieldKey')
  const {workspaceVersion,inputPosition,sourceField,parentKey,fieldKey}=input
  if(!uuid(workspaceVersion)||typeof inputPosition!=='string'||!inputPosition.length||inputPosition.length>256||
   !['title','summary','body_text'].includes(sourceField))deny()
  for(const k of [parentKey,fieldKey])if(typeof k!=='string'||!k.length||k.length>256)deny()
  const plan=structuredClone(await sourceCall('plan',[investigation,workspaceVersion,inputPosition,sourceField,parentKey]))
  exact(plan,'investigation|workspace_version|input_position|material_version|source_field|parent_logical_key|parent_ref_id|parent_canonical_hash|parent_source_version|parent_contract|field_contract|assessment_offset_unit|resolver_offset_unit|field_source_version|field_capture_id|field_hash|field_size|field_base64|acquired_at')
  if(plan.investigation!==investigation||plan.workspace_version!==workspaceVersion||plan.input_position!==inputPosition||plan.source_field!==sourceField||
   plan.parent_logical_key!==parentKey||!uuid(plan.material_version)||plan.parent_source_version!==plan.material_version||!uuid(plan.parent_ref_id)||
   !digest(plan.parent_canonical_hash)||!digest(plan.field_hash)||!uuid(plan.field_capture_id)||!/^field-v1:[0-9a-f]{64}$/.test(plan.field_source_version)||
   plan.parent_contract!=='postgres_retained_jsonb_text_utf8_v1'||plan.field_contract!=='utf8_field_bytes_v1'||
   plan.assessment_offset_unit!=='unicode_code_points_v1'||plan.resolver_offset_unit!=='utf8_bytes_v1'||
   !Number.isSafeInteger(plan.field_size)||plan.field_size<1||plan.field_size>1048576||typeof plan.field_base64!=='string'||
   plan.field_base64.length>1398104||typeof plan.acquired_at!=='string'||!Number.isFinite(Date.parse(plan.acquired_at)))deny()
  const raw=Buffer.from(plan.field_base64,'base64')
  if(raw.toString('base64')!==plan.field_base64||raw.length!==plan.field_size||hash(raw)!==plan.field_hash)deny()
  const fieldText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw)
  if(!Buffer.from(fieldText,'utf8').equals(raw))deny()
  const parent=await store.factualEvidence(parentKey),parentMeta=await store.metadata(parentKey)
  const parentRecord=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(parent))
  if(hash(parent)!==plan.parent_canonical_hash||parentMeta.ref_id!==plan.parent_ref_id||parentMeta.provenance.source_version!==plan.parent_source_version||
   parentRecord.id!==plan.material_version||parentRecord.payload?.[sourceField]!==fieldText)deny()
  const {field_base64:omittedBytes,...attestationFields}=structuredClone(plan)
  const attestation=freezeTree(attestationFields)
  const provenance=structuredClone(await attestDerivedField(attestation))
  exact(provenance,'source_version|acquired_at|rights_ref|privacy_ref')
  if(provenance.source_version!==plan.field_source_version||provenance.acquired_at!==plan.acquired_at||
   Object.values(provenance).some(v=>typeof v!=='string'||!v.length||v.length>512))deny()
  const receipt=await casCall('put',[investigation,fieldKey,raw,'identity-v1',raw,provenance])
  exact(receipt,'ref_id|hash|committed|production_qualified|source_identity_qualified|temporal_provenance_qualified')
  if(!uuid(receipt.ref_id)||receipt.hash!==plan.field_hash||receipt.committed!==true||receipt.production_qualified!==false||
   receipt.source_identity_qualified!==false||receipt.temporal_provenance_qualified!==false)deny()
  const readback=await store.factualEvidence(fieldKey),meta=await store.metadata(fieldKey)
  if(!readback.equals(raw)||meta.ref_id!==receipt.ref_id||meta.hash!==plan.field_hash||Object.keys(provenance).some(k=>meta.provenance[k]!==provenance[k]))deny()
  const fieldId=await sourceCall('register_field',[investigation,workspaceVersion,inputPosition,sourceField,parentKey,fieldKey])
  if(!uuid(fieldId))deny()
  return freezeTree({field_id:fieldId,field_ref_id:meta.ref_id,field_hash:plan.field_hash,field_source_version:plan.field_source_version,
   source_authority_qualified:false,ingest_extraction_qualified:false,production_qualified:false,transport_qualified:false,deployment_qualified:false,publication_allowed:false})
 }})
}
