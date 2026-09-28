import pg from 'pg'
import {createHash} from 'node:crypto'
import {
 ARC_MEMBERSHIP_SCORER_RULE_VERSION,scoreArcMembership,
 runArcMembershipRegressionSuite,buildArcMembershipAuditSample,
} from '../../../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js'
export const SCORER_BLOB='08ce23092cfbbe8dcb7eb7c26cf6e3943e177531'
export const CONTRACT='arc-native-expanded-v1'
export const NODE_VERSION='22.14.0'
const fail=code=>{throw Error('arc_native_'+code)}
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex')
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)
const exact=(v,keys)=>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==keys.split('|').sort().join('|'))fail('shape')
}
const number=(n,max=1)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>max)fail('number')}
const integer=(n,max)=>{number(n,max);if(!Number.isSafeInteger(n))fail('integer')}
const reasons=new Set(['insufficient_evidence','actor_only_contamination','generic_entity_no_continuity','stale_without_narrative_bridge','topic_action_contradiction'])
export function validatePrivateScore(score){
 exact(score,'model_version|candidate_article_id|arc_id|cluster_confidence|decision|eligible_for_auto_approval|hard_rejections|signals|evidence|release_gate')
 if(score.model_version!==ARC_MEMBERSHIP_SCORER_RULE_VERSION||!uuid(score.candidate_article_id)||!uuid(score.arc_id)
  ||!['candidate','rejected'].includes(score.decision)||score.eligible_for_auto_approval!==false)fail('score_identity')
 number(score.cluster_confidence)
 if(!Array.isArray(score.hard_rejections)||score.hard_rejections.length>5
  ||new Set(score.hard_rejections).size!==score.hard_rejections.length
  ||score.hard_rejections.some(r=>!reasons.has(r)))fail('score_reasons')
 if((score.decision==='rejected')!==(score.hard_rejections.length>0)
  ||score.hard_rejections.length&&score.cluster_confidence!==0)fail('score_decision')
 exact(score.signals,'entity|canonical|recent|action|continuity|temporal|source_diversity')
 Object.values(score.signals).forEach(v=>number(v))
 exact(score.evidence,'shared_entity_count|candidate_entity_count|arc_entity_count|temporal_gap_days|explicit_continuity|recent_member_count')
 for(const key of ['shared_entity_count','candidate_entity_count','arc_entity_count'])integer(score.evidence[key],64)
 integer(score.evidence.recent_member_count,5)
 if(score.evidence.temporal_gap_days!==null)number(score.evidence.temporal_gap_days,1000000000)
 if(typeof score.evidence.explicit_continuity!=='boolean')fail('score_evidence')
 exact(score.release_gate,'fixture_passed|auto_approval_enabled|auto_approval_threshold')
 if(score.release_gate.fixture_passed!==false||score.release_gate.auto_approval_enabled!==false||score.release_gate.auto_approval_threshold!==null)fail('release_closed')
 return score
}
function article(value){
 exact(value,'id|title|summary|outlet|published_at')
 if(!uuid(value.id))fail('article')
 for(const k of ['title','summary','outlet','published_at'])
  if(value[k]!==null&&(typeof value[k]!=='string'||Buffer.byteLength(value[k])>65536))fail('article')
 if(value.published_at!==null&&!Number.isFinite(Date.parse(value.published_at)))fail('date')
}
export function scoreGovernedNativeInput(wire){
 if(process.versions.node!==NODE_VERSION)fail('runtime')
 exact(wire,'input_text|input_hash|manifest_hash')
 if(typeof wire.input_text!=='string'||Buffer.byteLength(wire.input_text)>2097152
  ||!hash(wire.input_hash)||!hash(wire.manifest_hash)||sha(wire.input_text)!==wire.input_hash)fail('input_hash')
 let e;try{e=JSON.parse(wire.input_text)}catch{fail('input_json')}
 exact(e,'version|codec|runtime|scorer_blob|scorer_version|generation_id|candidate_id|candidate_revision|candidate|arc|members|entity_states|selection|audit')
 if(e.version!==CONTRACT||e.codec!=='postgres17-jsonb-text-utf8-v1'||e.runtime!==NODE_VERSION
  ||e.scorer_blob!==SCORER_BLOB||e.scorer_version!==ARC_MEMBERSHIP_SCORER_RULE_VERSION
  ||!uuid(e.generation_id)||!uuid(e.candidate_id)||typeof e.candidate_revision!=='string'||e.candidate_revision.length>80)fail('input_version')
 article(e.candidate)
 exact(e.arc,'id|title|summary|started_at|last_update_at')
 if(!uuid(e.arc.id))fail('arc')
 for(const k of ['title','summary','started_at','last_update_at'])
  if(e.arc[k]!==null&&(typeof e.arc[k]!=='string'||Buffer.byteLength(e.arc[k])>65536))fail('arc')
 if(!Array.isArray(e.members)||e.members.length>31||!Array.isArray(e.entity_states)||e.entity_states.length>32)fail('cohort')
 e.members.forEach(article)
 const ids=[e.candidate.id,...e.members.map(m=>m.id)]
 if(new Set(ids).size!==ids.length||e.members.some((r,i)=>i&&r.id<=e.members[i-1].id))fail('cohort_order')
 exact(e.selection,'policy_id|domain|cutoff')
 if(!uuid(e.selection.policy_id)||e.selection.domain!=='reviewed_evidence_weight_v1')fail('weight_domain')
 number(e.selection.cutoff)
 const entities=new Map()
 let total=0
 if(e.entity_states.length!==ids.length)fail('entity_completeness')
 for(const state of e.entity_states){
  exact(state,'article_id|state|reason|attestation_id|article_set_digest|entities')
  if(!ids.includes(state.article_id)||entities.has(state.article_id)||!uuid(state.attestation_id)||!hash(state.article_set_digest)
   ||!['completed','unavailable'].includes(state.state)||!Array.isArray(state.entities))fail('entity_state')
  if(state.state==='completed'&&state.reason!=='reviewed_complete'
   ||state.state==='unavailable'&&(!['not_performed','method_does_not_provide_entities'].includes(state.reason)||state.entities.length))fail('entity_state')
  for(const [i,r] of state.entities.entries()){
   exact(r,'entity_id|evidence_weight|projection_id')
   if(!uuid(r.entity_id)||!uuid(r.projection_id)||i&&r.entity_id<=state.entities[i-1].entity_id)fail('entity_identity')
   number(r.evidence_weight)
  }
  total+=state.entities.length;if(total>64)fail('entity_budget')
  entities.set(state.article_id,state.entities.filter(r=>r.evidence_weight>=e.selection.cutoff).map(r=>({id:r.entity_id})))
 }
 exact(e.audit,'low_confidence|high_sample_size|seed')
 number(e.audit.low_confidence);integer(e.audit.high_sample_size,1)
 if(e.audit.low_confidence!==0.70||e.audit.high_sample_size!==1)fail('audit_contract')
 const seed='arc-native:'+e.generation_id+':'+ARC_MEMBERSHIP_SCORER_RULE_VERSION+':'+e.selection.policy_id
 if(e.audit.seed!==seed)fail('audit_seed')
 if(!runArcMembershipRegressionSuite().passed)fail('scorer_regression')
 const arcEntities=[...new Map(e.members.flatMap(m=>entities.get(m.id)).map(r=>[r.id,r])).values()]
 const score=validatePrivateScore(scoreArcMembership(e.candidate,e.arc,e.members,entities.get(e.candidate.id),arcEntities,
  {fixture_passed:false,auto_approval_enabled:false,auto_approval_threshold:null}))
 const audit=buildArcMembershipAuditSample([{...score,candidate_id:e.candidate_id}],{
  lowConfidence:e.audit.low_confidence,highSampleSize:e.audit.high_sample_size,seed,
 })
 return {
  contract:'arc-native-private-score-v1',generation_id:e.generation_id,candidate_id:e.candidate_id,
  input_hash:wire.input_hash,manifest_hash:wire.manifest_hash,runtime:NODE_VERSION,scorer_blob:SCORER_BLOB,
  score,audit:audit.sample.map(r=>({candidate_id:r.candidate_id,stratum:r.audit_stratum})),
  approval_allowed:false,publication_allowed:false,attached:false,
 }
}
export async function runGovernedNativeArc({connection,scope,generation,expectedInputHash}){
 if(!uuid(scope)||!uuid(generation)||!hash(expectedInputHash))fail('request')
 let u;try{u=new URL(connection?.connectionString)}catch{fail('connection')}
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||u.pathname==='/'||u.search||u.hash
  ||Object.keys(connection).some(k=>!['connectionString','ssl'].includes(k)))fail('connection')
 const db=new pg.Client({...connection,connectionTimeoutMillis:5000,query_timeout:10000,application_name:'mip-native-arc-private'})
 let begun=false,committed=false,result,stage='connect'
 const failures=[]
 try{
  await db.connect();stage='begin';await db.query('begin');begun=true
  stage='settings'
  await db.query("set local statement_timeout='5s'")
  stage='read'
  const r=await db.query('select mip_arc_native.read_scoring_input($1,$2,$3) as wire',[scope,generation,expectedInputHash])
  if(r.rows.length!==1)fail('input_missing')
  stage='score'
  const output=scoreGovernedNativeInput(r.rows[0].wire)
  stage='complete'
  const completed=await db.query('select mip_arc_native.complete_score($1,$2,$3,$4::jsonb) as receipt',
   [scope,generation,expectedInputHash,JSON.stringify(output)])
  result=completed.rows[0]?.receipt
  exact(result,'generation_id|output_hash|state|approval_allowed|publication_allowed|attached')
  if(result.generation_id!==generation||!hash(result.output_hash)||result.state!=='scored_private'
   ||result.approval_allowed!==false||result.publication_allowed!==false||result.attached!==false)fail('receipt')
  stage='commit';await db.query('commit');committed=true
 }catch{failures.push(Error(stage==='commit'?'arc_native_commit_outcome_unknown':'arc_native_'+stage+'_failed'))}
 finally{
  if(begun&&!committed)try{await db.query('rollback')}catch{failures.push(Error('arc_native_rollback_failed'))}
  try{await db.end()}catch{failures.push(Error('arc_native_close_failed'))}
 }
 if(failures.length>1)throw new AggregateError(failures,'arc_native_operation_failed')
 if(failures.length===1)throw failures[0]
 if(!committed)fail('not_committed')
 return result
}
