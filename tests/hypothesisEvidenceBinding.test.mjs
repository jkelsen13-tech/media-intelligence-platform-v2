import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
import {bindHypothesisEvidence} from '../supabase/qualification/hypothesis-assessments/evidenceBinding.mjs'
const hash=s=>createHash('sha256').update(s).digest('hex')
function setup() {
 const assessment=hypothesisFixture(),e=assessment.evidence[0]
 e.source_span={source_field:'summary',start:2,end:5,excerpt_sha256:hash('😀 B')}
 const record={id:e.material_version,captured_at:e.acquired_at,source_version_hash:hash('database-native-fixture-envelope'),
  payload:{summary:'A 😀 B meeting record.',published_at:e.published_at,event_time:e.event_time}}
 const bundle={investigation_id:assessment.question_id,access_role:'reviewer',
  version:{id:'workspace-v1',observation_id:'observation-v1',state:{question:assessment.question}},
  observation:{id:'observation-v1',snapshot:{contract_version:'investigation-observation-1',publicly_eligible:false,
   inputs:[{position:e.input_position,capture:record,record_version:null}]}}}
 const requests=[]
 const readPermission=async scope=>{requests.push(scope);return {allowed:true,scope:{...scope},revision:'synthetic-'+scope.operation+'-'+scope.domain,
  synthetic:true,reason:'synthetic_mechanism_only'}}
 return {assessment,bundle,sourceProject:'synthetic-project',hashText:hash,readPermission,mode:'synthetic_qualification',requests}
}
test('synthetic exact retained span and six operation/domain receipts are bound without changing saved inputs',async()=>{
 const p=setup(),before=structuredClone(p.bundle),r=await bindHypothesisEvidence(p)
 assert.equal(r.bindings[0].excerpt,'😀 B');assert.equal(r.bindings[0].input_position,'9007199254740993')
 assert.equal(p.requests.length,6);assert.equal(r.synthetic,true);assert.equal(r.publication_allowed,false)
 assert.equal(r.status,'prepared_requires_atomic_acceptance');assert.deepEqual(p.bundle,before)
})
test('source operations denied before passage extraction; error does not disclose passage',async()=>{
 const p=setup();p.readPermission=async()=>({allowed:false,reason:'unsupported_historical_rights'})
 let extracted=false;Object.defineProperty(p.bundle.observation.snapshot.inputs[0].capture.payload,'summary',{get(){extracted=true;throw Error('sensitive synthetic passage')}})
 await assert.rejects(bindHypothesisEvidence(p),/^Error: operation_denied:retention:rights$/)
 assert.equal(extracted,false)
})
test('real mode cannot promote synthetic fixtures or CC admission into new feature permission',async()=>{
 const p=setup();p.mode='real'
 await assert.rejects(bindHypothesisEvidence(p),/real_permission_binding_unavailable/)
 p.readPermission=async()=>({allowed:false,reason:'qualification_batch_closed'})
 await assert.rejects(bindHypothesisEvidence(p),/operation_denied/)
})
test('every operation and privacy/rights domain is independently required',async()=>{
 for(const operation of ['retention','analysis','excerpt_display']) for(const domain of ['rights','privacy']) {
  const p=setup(),reader=p.readPermission
  p.readPermission=async scope=>scope.operation===operation&&scope.domain===domain?{allowed:false}:reader(scope)
  await assert.rejects(bindHypothesisEvidence(p),new RegExp('operation_denied:'+operation+':'+domain))
 }
})
test('permission from another material, audience, domain, project or operation is rejected',async()=>{
 for(const key of ['material_ref','material_version','source_version','audience','domain','source_project','operation']){
  const p=setup(),reader=p.readPermission;p.readPermission=async scope=>{const r=await reader(scope);r.scope[key]='different';return r}
  await assert.rejects(bindHypothesisEvidence(p),/permission_scope_or_revision_mismatch/)
 }
})
test('missing admission and primary evidence fail even for a claimed real allowed receipt',async()=>{
 const p=setup();p.mode='real';p.readPermission=async scope=>({allowed:true,scope,revision:'untrusted',synthetic:false,reason:'real_evidence_bound'})
 await assert.rejects(bindHypothesisEvidence(p),/real_permission_binding_unavailable/)
})
test('cross-investigation, observation and question substitutions are refused',async()=>{
 for(const mutate of [
  p=>p.bundle.investigation_id='other',p=>p.bundle.version.observation_id='other',p=>p.bundle.version.state.question='other',
  p=>p.bundle.access_role='revoked',
 ]) {const p=setup();mutate(p);await assert.rejects(bindHypothesisEvidence(p),/investigation_observation_binding_mismatch/)}
})
test('duplicate and absent retained positions are unavailable, not arbitrarily selected',async()=>{
 for(const duplicate of [false,true]) {const p=setup();const inputs=p.bundle.observation.snapshot.inputs
  if(duplicate)inputs.push(structuredClone(inputs[0]));else inputs.splice(0)
  await assert.rejects(bindHypothesisEvidence(p),/retained_identity_missing_or_ambiguous/)
 }
})
test('current replacement and changed acquisition clock cannot impersonate retained version',async()=>{
 for(const key of ['id','captured_at']) {const p=setup();p.bundle.observation.snapshot.inputs[0].capture[key]=key==='id'?'replacement':'2026-09-14T00:00:00Z'
  await assert.rejects(bindHypothesisEvidence(p),/retained_version_or_time_mismatch/)
 }
})
test('native envelope digest is required instead of unsafe JavaScript JSONB re-encoding',async()=>{
 const p=setup();delete p.bundle.observation.snapshot.inputs[0].capture.source_version_hash
 await assert.rejects(bindHypothesisEvidence(p),/retained_database_digest_missing/)
})
test('span boundaries and exact content hash are both checked',async()=>{
 for(const mutate of [p=>p.assessment.evidence[0].source_span.end=999,p=>p.assessment.evidence[0].source_span.excerpt_sha256=hash('different')]){
  const p=setup();mutate(p);await assert.rejects(bindHypothesisEvidence(p),/source_span_(out_of_bounds|hash_mismatch)/)
 }
})
test('allegation reporting alone cannot supply the supporting argument for a favored hypothesis',async()=>{
 const p=setup();p.assessment.comparison.state='better_supported';p.assessment.comparison.favored_ids=['influence']
 p.assessment.arguments[0].relation='reports_allegation'
 await assert.rejects(bindHypothesisEvidence(p),/favored_hypothesis_without_supporting_argument/)
 p.assessment.arguments[0].relation='supports'
 assert.equal((await bindHypothesisEvidence(p)).status,'prepared_requires_atomic_acceptance')
})

test('upstream permission and content-reader exceptions never expose their private detail',async()=>{
 const p=setup();p.readPermission=async()=>{throw Error('private credential detail')}
 await assert.rejects(bindHypothesisEvidence(p),/^Error: permission_reader_unavailable$/)
 const q=setup();q.readExcerpt=async()=>{throw Error('private content detail')}
 await assert.rejects(bindHypothesisEvidence(q),/^Error: retained_excerpt_unavailable$/)
})
test('source publication and event clocks cannot be substituted independently of retained input',async()=>{
 for(const key of ['published_at','event_time']){
  const p=setup();p.assessment.evidence[0][key]='2020-01-01'
  await assert.rejects(bindHypothesisEvidence(p),/retained_source_clock_mismatch/)
 }
})
