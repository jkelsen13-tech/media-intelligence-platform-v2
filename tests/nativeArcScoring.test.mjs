
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {scoreGovernedNativeInput,validatePrivateScore,SCORER_BLOB,NODE_VERSION} from '../supabase/qualification/arc-membership-native/runGovernedNativeArc.mjs'
import {scoreArcMembership,buildArcMembershipAuditSample,runArcMembershipRegressionSuite,ARC_MEMBERSHIP_SCORER_RULE_VERSION as model} from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const digest=x=>createHash('sha256').update(x).digest('hex')
function input(){
 const candidate={id:id(1),title:'Court extends injunction in merger case',summary:'The court extends its existing injunction after an appeal.',outlet:'Alpha',published_at:'2026-01-02T00:00:00.123456Z'}
 const member={id:id(2),title:'Court issues injunction in merger case',summary:'The court issues an injunction in the merger case.',outlet:'Beta',published_at:'2026-01-01T00:00:00Z'}
 return {version:'arc-native-expanded-v1',codec:'postgres17-jsonb-text-utf8-v1',runtime:NODE_VERSION,scorer_blob:SCORER_BLOB,scorer_version:model,
 generation_id:id(3),candidate_id:id(4),candidate_revision:'2026-01-02 00:00:00.123456+00',candidate,
 arc:{id:id(5),title:'Court injunction in merger case',summary:'The court case concerns the merger injunction.',started_at:'2026-01-01',last_update_at:'2026-01-01T00:00:00Z'},
 members:[member],entity_states:[candidate,member].map((a,i)=>({article_id:a.id,state:'completed',reason:'reviewed_complete',attestation_id:id(10+i),article_set_digest:'a'.repeat(64),entities:[{entity_id:id(20),evidence_weight:0.8,projection_id:id(30+i)}]})),
 selection:{policy_id:id(40),domain:'reviewed_evidence_weight_v1',cutoff:0.75},
 audit:{low_confidence:0.70,high_sample_size:1,seed:'arc-native:'+id(3)+':'+model+':'+id(40)}}
}
function wire(e=input()){const input_text=JSON.stringify(e);return{input_text,input_hash:digest(input_text),manifest_hash:'b'.repeat(64)}}
test('pinned recovered scorer and regression suite remain unchanged',async()=>{
 assert.equal(process.versions.node,'22.14.0')
 const bytes=await readFile(new URL('../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js',import.meta.url))
 assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),SCORER_BLOB)
 assert.equal(runArcMembershipRegressionSuite().passed,true)
})
test('native expansion produces the unchanged arithmetic and unchanged one-generation audit',()=>{
 const e=input(),out=scoreGovernedNativeInput(wire(e))
 const score=scoreArcMembership(e.candidate,e.arc,e.members,[{id:id(20)}],[{id:id(20)}],{fixture_passed:false,auto_approval_enabled:false,auto_approval_threshold:null})
 assert.deepEqual(out.score,score)
 assert.deepEqual(out.audit,buildArcMembershipAuditSample([{...score,candidate_id:e.candidate_id}],{lowConfidence:.70,highSampleSize:1,seed:e.audit.seed}).sample.map(r=>({candidate_id:r.candidate_id,stratum:r.audit_stratum})))
 assert.equal(out.publication_allowed,false);assert.equal(out.approval_allowed,false);assert.equal(out.attached,false)
 assert.equal(e.candidate_revision,'2026-01-02 00:00:00.123456+00')
})
test('reviewed evidence cutoff is explicit and has no legacy confidence default',()=>{
 const e=input();e.selection.cutoff=.9
 assert.equal(scoreGovernedNativeInput(wire(e)).score.evidence.candidate_entity_count,0)
 e.selection.cutoff=.7
 assert.equal(scoreGovernedNativeInput(wire(e)).score.evidence.candidate_entity_count,1)
 delete e.selection.cutoff
 assert.throws(()=>scoreGovernedNativeInput(wire(e)),/^Error: arc_native_/)
})
test('unavailable extraction preserves original private narrative fallback',()=>{
 const e=input()
 e.entity_states.forEach(s=>{s.state='unavailable';s.reason='not_performed';s.entities=[]})
 const out=scoreGovernedNativeInput(wire(e))
 assert.deepEqual(out.score,scoreArcMembership(e.candidate,e.arc,e.members,[],[],{fixture_passed:false,auto_approval_enabled:false,auto_approval_threshold:null}))
 assert.equal(out.approval_allowed,false)
 e.entity_states[0].reason='unknown'
 assert.throws(()=>scoreGovernedNativeInput(wire(e)),/^Error: arc_native_/)
})
test('reviewed zero differs from absent extraction evidence',()=>{
 const e=input();e.entity_states.forEach(s=>s.entities=[])
 assert.doesNotThrow(()=>scoreGovernedNativeInput(wire(e)))
 e.entity_states.pop()
 assert.throws(()=>scoreGovernedNativeInput(wire(e)),/^Error: arc_native_/)
})
test('unknown nested fields, unbounded values and duplicated entity sets refuse',()=>{
 for(const mutate of[
 e=>e.entity_states[0].diagnostic='BODY_SENTINEL',
 e=>e.entity_states[0].entities[0].evidence_weight=1.1,
 e=>e.entity_states.push(e.entity_states[0]),
 e=>e.candidate.body_text='BODY_SENTINEL',
 e=>e.selection.domain='legacy_confidence',
 e=>e.audit.seed='BODY_SENTINEL',
 e=>e.audit.low_confidence=.69,
 e=>e.audit.high_sample_size=0,
 e=>e.runtime='22.15.0',
 ]){
 const e=input();mutate(e);assert.throws(()=>scoreGovernedNativeInput(wire(e)),/^Error: arc_native_/)
 }
})
test('full input bytes bind every consumed field and exact retry is deterministic',()=>{
 const base=wire(),first=scoreGovernedNativeInput(base)
 assert.deepEqual(scoreGovernedNativeInput(base),first)
 for(const mutate of[
 e=>e.candidate.outlet='Other',
 e=>e.members[0].published_at='2025-01-01',
 e=>e.arc.started_at='2025-01-01',
 e=>e.entity_states[0].entities[0].evidence_weight=.1,
 e=>e.audit.high_sample_size=0,
 ]){
 const e=input();mutate(e);const changed=wire(e)
 assert.notEqual(changed.input_hash,base.input_hash)
 assert.throws(()=>scoreGovernedNativeInput({...changed,input_hash:base.input_hash}),/^Error: arc_native_input_hash/)
 }
})
test('all private output destinations omit source sentinels and reject extra nested keys',()=>{
 const e=input();e.candidate.title+=' SOURCE_SENTINEL';e.candidate.summary+=' BODY_SENTINEL'
 const out=scoreGovernedNativeInput(wire(e))
 assert.equal(/SOURCE_SENTINEL|BODY_SENTINEL/.test(JSON.stringify(out)),false)
 out.score.evidence.diagnostic='BODY_SENTINEL'
 assert.throws(()=>validatePrivateScore(out.score),/^Error: arc_native_/)
})
test('exact retry is byte-identical in independent pinned Node processes',()=>{
 const url=new URL('../supabase/qualification/arc-membership-native/runGovernedNativeArc.mjs',import.meta.url).href
 const code="import {scoreGovernedNativeInput} from "+JSON.stringify(url)+";process.stdout.write(JSON.stringify(scoreGovernedNativeInput(JSON.parse(process.argv[1]))))"
 const outputs=[0,1].map(()=>spawnSync(process.execPath,['--input-type=module','-e',code,JSON.stringify(wire())],{encoding:'utf8',timeout:10000,maxBuffer:65536}))
 outputs.forEach(r=>assert.equal(r.status,0))
 assert.equal(outputs[0].stdout,outputs[1].stdout)
})
