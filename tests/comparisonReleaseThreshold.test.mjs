import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {scoreEventMembership,regressionMixedTopicMembershipFixture,runMembershipRegressionSuite} from '../supabase/runtime-snapshots/source-comparison-run-v10/lib.js'
import {scoreEventMembership as previous} from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/source-comparison-run/lib.js'
const {event,members:allMembers}=regressionMixedTopicMembershipFixture()
const members=allMembers.slice(0,2)
const gate={fixturePassed:true,autoApprovalEnabled:true}
test('missing and non-scalar approval thresholds fail closed in the deployed scorer',()=>{
  assert.equal(previous(event,members,{...gate,autoApprovalThreshold:null}).eligible_for_auto_approval,true,'reproduce legacy null-to-zero approval')
  for(const value of [undefined,null,'','  ',false,true,[],[0],{},NaN,Infinity,-1,1.1,'NaN']){
    const scored=scoreEventMembership(event,members,{...gate,autoApprovalThreshold:value})
    assert.equal(scored.eligible_for_auto_approval,false,String(value))
    assert.equal(scored.release_gate.auto_approval_threshold,null)
  }
})
test('explicit valid thresholds keep existing scoring semantics and remain separately gated',()=>{
  for(const value of [0,'0',0.7,'0.7',1]){
    const policy={...gate,autoApprovalThreshold:value}
    assert.deepEqual(scoreEventMembership(event,members,policy),previous(event,members,policy))
  }
  for(const policy of [{fixturePassed:false,autoApprovalEnabled:true},{fixturePassed:true,autoApprovalEnabled:false}]){
    assert.equal(scoreEventMembership(event,members,{...policy,autoApprovalThreshold:0}).eligible_for_auto_approval,false)
  }
  assert.equal(scoreEventMembership(event,allMembers,{...gate,autoApprovalThreshold:0}).eligible_for_auto_approval,false,'hard rejection cannot be overridden')
})
test('all existing live membership counterexamples remain rejected',()=>{
  const result=runMembershipRegressionSuite()
  assert.equal(result.passed,true)
  assert.ok(result.fixtures.length>=3)
})
test('complete deployment preserves live handlers, scheduler authorization and lexicon',()=>{
  for(const name of ['index.ts','loadedLanguageLexicon.json']){
    assert.equal(readFileSync(new URL('../supabase/runtime-snapshots/source-comparison-run-v10/'+name,import.meta.url),'utf8'),
      readFileSync(new URL('../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/source-comparison-run/'+name,import.meta.url),'utf8'))
  }
})
