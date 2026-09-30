import {marketInstant} from '../../supabase/functions/_shared/marketsEvidenceContract.mjs'
export const privateMarketsFailure=code=>({data:null,error:{code}})
export const privateMarketsErrors=new Set(['not_configured','authentication_required','access_denied','origin_denied','invalid_request','evidence_unavailable','scope_too_large','service_unavailable','invalid_response','request_cancelled'])
export const marketUUID=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
const object=v=>v!==null&&Object.getPrototypeOf(v)===Object.prototype
const keys=(v,k)=>object(v)&&Object.keys(v).sort().join('|')===k.split(' ').sort().join('|')
const text=(v,n=4096)=>typeof v==='string'&&v.length<=n
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&marketInstant(v)!==null
const dateText=v=>text(v,128)&&(instant(v)||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&marketInstant(v+'T00:00:00Z')!==null))
const nullable=(v,check)=>v===null||check(v)
export function snapshotPrivateMarketsRequest(v){
 if(!keys(v,'investigation_id workspace_version_id asset_id event_id at')||!marketUUID(v.investigation_id)||!marketUUID(v.workspace_version_id)||
 !nullable(v.asset_id,marketUUID)||!nullable(v.event_id,marketUUID)||(!v.asset_id&&!v.event_id)||!instant(v.at))return null
 return Object.freeze({investigation_id:v.investigation_id,workspace_version_id:v.workspace_version_id,asset_id:v.asset_id,event_id:v.event_id,at:v.at})
}
function node(v){
 if(!keys(v,'id version_id type name')||!marketUUID(v.id)||!marketUUID(v.version_id)||!['event','actor','institution','document','anomaly','policy','topic','equity','cryptoasset','network'].includes(v.type)||!text(v.name))throw Error('invalid_response')
 return {id:v.id,version_id:v.version_id,type:v.type,name:v.name}
}
function safeUrl(v){
 if(v===null)return null
 if(!text(v,4096))throw Error('invalid_response')
 try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}
}
// Strict private contract mapper: reject unknown payload fields; never promote provenance or rights.
export function mapPrivateMarketsResult(value,expected,{expectedObservationId=null}={}){
 try{
 const request=snapshotPrivateMarketsRequest(expected)
 if(!request||!keys(value,'contract_version investigation_id workspace_version_id observation_id asset_id event_id at paths publication_allowed historical_time_qualified broader_context coverage source_root_lineage_qualified')||
 value.contract_version!=='mip_markets_private_qualification_v1'||value.investigation_id!==request.investigation_id||value.workspace_version_id!==request.workspace_version_id||
 !marketUUID(value.observation_id)||(expectedObservationId!==null&&value.observation_id!==expectedObservationId)||value.asset_id!==request.asset_id||value.event_id!==request.event_id||
 !instant(value.at)||marketInstant(value.at)!==marketInstant(request.at)||value.publication_allowed!==false||value.historical_time_qualified!==false||value.source_root_lineage_qualified!==false||
 value.coverage!=='bounded_explicit_typed_paths_only'||!Array.isArray(value.broader_context)||value.broader_context.length||!Array.isArray(value.paths)||value.paths.length>32)return null
 const seen=new Set(),paths=value.paths.map(p=>{
  if(!keys(p,'asset_id asset_version_id asset_kind name identity_companion asset_identifier valid_from valid_to aliases_version_id aliases event_id hops relation')||
   !marketUUID(p.asset_id)||!marketUUID(p.asset_version_id)||!marketUUID(p.event_id)||(request.asset_id!==null&&p.asset_id!==request.asset_id)||(request.event_id!==null&&p.event_id!==request.event_id)||
   !['equity','cryptoasset'].includes(p.asset_kind)||!text(p.name)||!dateText(p.valid_from)||!nullable(p.valid_to,dateText)||p.aliases_version_id!==p.asset_version_id||
   !Array.isArray(p.aliases)||p.aliases.length>32||!Array.isArray(p.hops)||!p.hops.length||p.hops.length>8||!nullable(p.asset_identifier,v=>text(v,512)))throw Error('invalid_response')
  const companion=node(p.identity_companion)
  if(p.asset_kind==='equity'?!['actor','institution'].includes(companion.type):companion.type!=='network'||!p.asset_identifier)throw Error('invalid_response')
  const aliases=p.aliases.map(a=>{if(!keys(a,'symbol namespace valid_from valid_to')||!text(a.symbol,200)||!a.symbol.trim()||!text(a.namespace,200)||!a.namespace.trim()||!dateText(a.valid_from)||!nullable(a.valid_to,dateText))throw Error('invalid_response');return {symbol:a.symbol,namespace:a.namespace,valid_from:a.valid_from,valid_to:a.valid_to}})
  const visited=new Set([p.asset_id]),candidates=new Set()
  const hops=p.hops.map((h,i)=>{
   if(!keys(h,'edge_id edge_version_id subject object subject_version_id object_version_id candidate_id assessment_id relationship valid_from valid_to uncertainty capture_id article_id captured_at published_at source_url capture_payload_hash support')||
    ![h.edge_id,h.edge_version_id,h.subject_version_id,h.object_version_id,h.candidate_id,h.assessment_id,h.capture_id,h.article_id].every(marketUUID)||
    !['direct_reporting','ownership','operation','supply','regulation','financing','protocol_dependency'].includes(h.relationship)||!instant(h.valid_from)||!nullable(h.valid_to,instant)||!text(h.uncertainty)||
    !instant(h.captured_at)||!nullable(h.published_at,v=>text(v,128))||!hash(h.capture_payload_hash)||candidates.has(h.candidate_id))throw Error('invalid_response')
   const subject=node(h.subject),object=node(h.object),support=h.support
   if(subject.version_id!==h.subject_version_id||object.version_id!==h.object_version_id||visited.has(object.id)||
    (i===0?(subject.id!==p.asset_id||subject.version_id!==p.asset_version_id||subject.type!==p.asset_kind):(p.hops[i-1].object.id!==subject.id||p.hops[i-1].object.version_id!==subject.version_id))||
    (i===p.hops.length-1&&(object.id!==p.event_id||object.type!=='event'))||
    !keys(support,'excerpt material_hash material_version input_position source_field start end')||!text(support.excerpt,16384)||!hash(support.material_hash)||support.material_version!==h.capture_id||
    !text(support.input_position,32)||!(/^[1-9][0-9]*$/).test(support.input_position)||!['title','summary','body_text'].includes(support.source_field)||
    !Number.isSafeInteger(support.start)||!Number.isSafeInteger(support.end)||support.start<0||support.end>2147483647||support.end-support.start!==Array.from(support.excerpt).length||support.end<=support.start)throw Error('invalid_response')
   visited.add(object.id);candidates.add(h.candidate_id)
   return {edge_id:h.edge_id,edge_version_id:h.edge_version_id,subject,object,subject_version_id:h.subject_version_id,object_version_id:h.object_version_id,candidate_id:h.candidate_id,assessment_id:h.assessment_id,relationship:h.relationship,valid_from:h.valid_from,valid_to:h.valid_to,uncertainty:h.uncertainty,capture_id:h.capture_id,article_id:h.article_id,captured_at:h.captured_at,published_at:h.published_at,source_url:safeUrl(h.source_url),capture_payload_hash:h.capture_payload_hash,support:{excerpt:support.excerpt,material_hash:support.material_hash,material_version:support.material_version,input_position:support.input_position,source_field:support.source_field,start:support.start,end:support.end}}
  })
  const relation=hops.length===1&&hops[0].relationship==='direct_reporting'?'direct_reporting':'connected_development',key=hops.map(h=>h.candidate_id).join('|')
  if(p.relation!==relation||seen.has(key))throw Error('invalid_response');seen.add(key)
  return {asset_id:p.asset_id,asset_version_id:p.asset_version_id,asset_kind:p.asset_kind,name:p.name,identity_companion:companion,asset_identifier:p.asset_identifier,valid_from:p.valid_from,valid_to:p.valid_to,aliases_version_id:p.aliases_version_id,aliases,event_id:p.event_id,hops,relation}
 })
 return {contract_version:value.contract_version,investigation_id:request.investigation_id,workspace_version_id:request.workspace_version_id,observation_id:value.observation_id,asset_id:request.asset_id,event_id:request.event_id,at:request.at,paths,publication_allowed:false,historical_time_qualified:false,broader_context:[],coverage:value.coverage,source_root_lineage_qualified:false}
 }catch{return null}
}
