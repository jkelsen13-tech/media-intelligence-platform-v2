import test from 'node:test'
import assert from 'node:assert/strict'
import {validateActorRevision,validateAgency} from '../../supabase/qualification/entity-resolution/agencyContract.mjs'
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor={scope:id(1),id:id(2),actor_id:id(3),version:1,predecessor_id:null,label:'Sam',kind:'person',evidence:[id(4)],reason:'Synthetic review'}
const base={scope:id(1),id:id(5),action_mention:id(6),participant_mention:id(4),role:'agent',version:1,predecessor_id:null,action_kind:'attributed_action',status:'unresolved',choices:[],evidence:[id(6)],role_confidence:.3,evidence_quality:.8,evidence_relevance:.6,assessment_confidence:.2,reason:'Insufficient role evidence'}
const choice={candidate_id:id(7),decision_id:null,actor_revision_id:id(2),identity_confidence:.9}
test('actor revisions remain reviewed interpretations, never documented facts',()=>{
 assert.equal(validateActorRevision(actor).documented_fact,false)
 for(const x of [{...actor,label:''},{...actor,evidence:[]},{...actor,version:2},{...actor,aliases:[]},{...actor,kind:'source'}])assert.throws(()=>validateActorRevision(x))
})
test('six participant roles and direct/attributed actions remain independent',()=>{
 for(const role of ['speaker','addressee','agent','principal','beneficiary','affected_actor'])for(const action_kind of ['direct_action','attributed_action']){
  const r=validateAgency({...base,role,action_kind});assert.equal(r.documented_fact,false);assert.equal(r.publication_allowed,false)
 }
 assert.throws(()=>validateAgency({...base,role:'actor'}))
 assert.throws(()=>validateAgency({...base,action_kind:'fact'}))
})
test('unresolved and multiple identity candidates are first class',()=>{
 validateAgency(base)
 validateAgency({...base,status:'proposed',choices:[choice,{...choice,candidate_id:id(8),actor_revision_id:id(9)}]})
 assert.throws(()=>validateAgency({...base,status:'proposed'}))
 assert.throws(()=>validateAgency({...base,choices:[choice]}))
 assert.throws(()=>validateAgency({...base,status:'proposed',choices:[choice,choice]}))
})
test('acceptance requires an exact identity decision but never promotes to fact',()=>{
 assert.throws(()=>validateAgency({...base,status:'accepted',choices:[choice]}))
 const r=validateAgency({...base,status:'accepted',choices:[{...choice,decision_id:id(10)}]})
 assert.equal(r.documented_fact,false);assert.equal(r.production_qualified,false)
 assert.throws(()=>validateAgency({...base,status:'accepted',choices:[{...choice,decision_id:id(10)},choice]}))
})
test('identity role quality relevance and assessment confidence are separate finite scores',()=>{
 for(const k of ['role_confidence','evidence_quality','evidence_relevance','assessment_confidence'])for(const v of [null,NaN,Infinity,-.1,1.1,'1'])assert.throws(()=>validateAgency({...base,[k]:v}))
 for(const v of [null,NaN,Infinity,-.1,1.1,'1'])assert.throws(()=>validateAgency({...base,status:'proposed',choices:[{...choice,identity_confidence:v}]}))
 assert.throws(()=>validateAgency({...base,confidence:.9}))
})
test('caps, predecessors, malformed cross-layer fields and direct actor shortcuts fail',()=>{
 for(const x of [{...base,evidence:Array.from({length:17},(_,i)=>id(i+100))},{...base,version:2},{...base,actor_id:id(3)},{...base,reason:''},
 {...base,status:'proposed',choices:[{...choice,actor_id:id(3)}]}])assert.throws(()=>validateAgency(x))
})

test('raw actor and agency text caps count leading and trailing padding',()=>{
 for(const [baseValue,validate,key,cap] of [[actor,validateActorRevision,'label',256],[actor,validateActorRevision,'reason',4096],[base,validateAgency,'reason',4096]]){
  for(const padded of ['x'+' '.repeat(cap),' '.repeat(cap)+'x'])assert.throws(()=>validate({...baseValue,[key]:padded}))
  validate({...baseValue,[key]:'x'+' '.repeat(cap-1)})
 }
})
