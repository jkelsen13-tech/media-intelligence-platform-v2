import test from 'node:test'
import assert from 'node:assert/strict'
import { validateHypothesisAssessment as validate, selectHypothesisVersion as select, assessmentInstant, ratingCopy } from '../src/lib/hypothesisAssessment.js'
import { hypothesisFixture } from './hypothesisAssessmentFixture.mjs'
const f=hypothesisFixture
const changed=(change)=>{const r=f();change(r);return r}
test('synthetic record preserves distinct missing likelihood and confidence without inventing a midpoint',()=>{
 const r=f(),before=structuredClone(r);assert.equal(validate(r).valid,true)
 assert.equal(ratingCopy(r.hypotheses[0].likelihood),'Not enough basis to estimate');assert.deepEqual(r,before)
})
test('all three comparison states remain distinct',()=>{
 for(const state of ['better_supported','difficult_to_distinguish','insufficient_to_rank']){
  const r=f();r.comparison.state=state;r.comparison.favored_ids=state==='better_supported'?['influence']:[]
  assert.equal(validate(r).valid,true)
 }
})
test('numeric probability or rubric cannot bypass the separately gated method path',()=>{
 for(const kind of ['probability','rubric','qualitative']){
  const r=f();r.hypotheses[0].likelihood={kind,value:0.8,label:'High',reason:'Synthetic',method_ref:'unapproved'}
  assert.equal(validate(r).valid,false)
 }
})
test('retained input positions stay exact strings beyond JavaScript safe integers',()=>{
 const r=f();assert.equal(validate(r).valid,true);r.evidence[0].input_position=Number(r.evidence[0].input_position)
 assert.equal(validate(r).valid,false)
})
test('microsecond knowledge boundary refuses future-acquired evidence despite old event/publication dates',()=>{
 const r=f();r.evidence[0].acquired_at='2026-09-13T10:00:00.123457Z';assert.equal(validate(r).valid,false)
 assert.equal(assessmentInstant('2026-09-13T10:00:00.123457Z')-assessmentInstant('2026-09-13T10:00:00.123456Z'),1n)
})
test('impossible dates and timezone-free instants fail closed',()=>{
 for(const time of ['2026-02-30T00:00:00Z','2026-09-13T10:00:00','2026-09-13','invalid']){
  assert.equal(assessmentInstant(time),null);assert.equal(validate(changed(r=>r.knowledge_cutoff=time)).valid,false)
 }
})
test('unbound evidence, unknown alternatives and duplicate identities are refused',()=>{
 for(const change of [
  r=>r.arguments[0].evidence_ids=['missing'],r=>r.arguments[0].hypothesis_id='missing',
  r=>r.evidence.push(structuredClone(r.evidence[0])),r=>r.hypotheses.push(structuredClone(r.hypotheses[0])),
  r=>r.comparison.favored_ids=['missing'],
 ]) assert.equal(validate(changed(change)).valid,false)
})
test('overlapping explanations do not require artificial normalized percentages',()=>{
 const r=f();r.hypothesis_relationship='overlapping';assert.equal(validate(r).valid,true)
 assert.ok(r.hypotheses.every(h=>!Object.hasOwn(h.likelihood,'value')))
})
test('methodology revision and unchanged/less-certain outcomes remain explicit',()=>{
 for(const effect of ['changed','unchanged','less_certain']){
  const r=f();Object.assign(r,{id:'next',revision:2,predecessor_id:'synthetic-assessment-1',revision_trigger:'methodology',revision_effect:effect})
  assert.equal(validate(r).valid,true)
 }
})
test('as-known-then selects completed historical version; reconstruction selects its retained replacement',()=>{
 const a=f(),b=f();Object.assign(b,{id:'next',revision:2,predecessor_id:a.id,completed_at:'2026-09-14T00:00:00Z',
  knowledge_cutoff:'2026-09-14T00:00:00Z',revision_trigger:'new_evidence',revision_effect:'unchanged'})
 const before=structuredClone([a,b]),opts={questionId:a.question_id}
 assert.equal(select([a,b],{...opts,mode:'as_known_then',asOf:'2026-09-13T12:00:00Z'}).record.id,a.id)
 assert.equal(select([a,b],{...opts,mode:'reconstructed_now'}).record.id,b.id)
 assert.equal(select([a,b],{...opts,mode:'as_known_then',asOf:'2026-09-13T10:00:00Z'}).record,null)
 assert.deepEqual([a,b],before)
})
test('missing or inconsistent history cannot masquerade as a complete reconstruction',()=>{
 const a=f(),b=f();Object.assign(b,{id:'next',revision:2,predecessor_id:a.id,revision_trigger:'correction',revision_effect:'less_certain'})
 const opts={questionId:a.question_id,mode:'reconstructed_now'}
 assert.equal(select([b],opts).record,null)
 b.predecessor_id='wrong';assert.equal(select([a,b],opts).record,null)
 assert.equal(select([a,a],opts).record,null)
})
test('publication and review stay independent of recorded qualitative confidence',()=>{
 const r=f();r.comparison.confidence={kind:'qualitative',label:'Moderate',reason:'Synthetic display case.',method_ref:'synthetic-only'}
 assert.equal(validate(r).valid,true);assert.equal(r.release_state,'private');assert.equal(r.review_state,'unreviewed')
 r.release_state='public';assert.equal(validate(r).valid,false)
})
