import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {compareRecordCandidateRuns} from '../scripts/compareRecordCandidateRuns.mjs'
const sha = value => createHash('sha256').update(value).digest('hex')
function fixture(labels = ['supporting','disconfirming','unrelated','unresolved']) {
  const makeCase = (id, label, partition) => ({
    id, label, partition,
    observed_at: partition === 'heldout' ? '2026-02-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
    input_sha256: sha(id), retained_reference: 'synthetic-private-reference:' + id,
    event_groups:[id], arc_groups:[id], origin_groups:[id], duplicate_groups:[id],
    adjudication:{status:label === 'unresolved' ? 'unresolved' : 'independently_adjudicated',
      reference:'synthetic-private-label:' + id, rationale:'Synthetic private rationale',
      sha256:sha('label:' + id)}
  })
  const manifest = {contract:'record-candidate-corpus-1',development_until:'2026-01-31T23:59:59.999Z',
    heldout_from:'2026-02-01T00:00:00.000Z',
    cases:[makeCase('development','unrelated','development'), ...labels.map((label,i)=>makeCase('private-case-' + i,label,'heldout'))]}
  const raw = JSON.stringify(manifest)
  const run = version => ({contract:'record-candidate-predictions-1',manifest_sha256:sha(raw),
    implementation_sha256:sha(version),algorithm_version:version,
    predictions:labels.map((label,i)=>({case_id:'private-case-' + i,retrieved:true,
      decision:label === 'unresolved' ? 'abstain' : label}))})
  return {manifest,raw,baseline:run('synthetic-baseline'),candidate:run('synthetic-candidate')}
}
const compare = f => compareRecordCandidateRuns(f.raw,JSON.stringify(f.baseline),JSON.stringify(f.candidate))

test('aggregate improvement cannot conceal loss of all disconfirming retrieval', () => {
  const f = fixture([...Array(9).fill('supporting'),'disconfirming'])
  f.baseline.predictions.slice(1,9).forEach(p=>{p.retrieved=false;p.decision='abstain'})
  f.candidate.predictions[9] = {...f.candidate.predictions[9],retrieved:false,decision:'abstain'}
  const r = compare(f)
  assert.equal(r.baseline.retrieval_recall.value,0.2)
  assert.equal(r.candidate.retrieval_recall.value,0.9)
  assert.equal(r.by_label.disconfirming.baseline.retrieval_coverage.value,1)
  assert.equal(r.by_label.disconfirming.candidate.retrieval_coverage.value,0)
  assert.deepEqual(r.by_label.disconfirming.retrieval_transitions,{retained:0,gained:0,lost:1,neither:0})
  assert.equal(r.by_label.disconfirming.correctness_transitions.lost,1)
  assert.equal(r.by_label.supporting.correctness_transitions.gained,8)
  assert.equal(r.qualification,'not_assessed')
  assert.equal(r.model_selection,'not_assessed')
})

test('equal aggregate scores retain different-case gains and losses', () => {
  const f = fixture(['supporting','supporting'])
  f.baseline.predictions[0].decision='disconfirming'
  f.candidate.predictions[1].decision='disconfirming'
  const r = compare(f)
  assert.equal(r.baseline.verifier_accuracy.value,r.candidate.verifier_accuracy.value)
  assert.deepEqual(r.by_label.supporting.correctness_transitions,{retained:0,gained:1,lost:1,neither:0})
  assert.equal(r.by_label.supporting.decision_transitions.disconfirming.supporting,1)
  assert.equal(r.by_label.supporting.decision_transitions.supporting.disconfirming,1)
})

test('pairs by exact case identity independently of prediction order', () => {
  const f = fixture()
  f.candidate.predictions[0].decision='abstain'
  const expected=compare(f).by_label
  f.baseline.predictions.reverse()
  f.candidate.predictions.reverse()
  assert.deepEqual(compare(f).by_label,expected)
})

test('unresolved correctness stays absent and empty classes have null denominators', () => {
  const f = fixture(['unresolved'])
  f.candidate.predictions[0].decision='supporting'
  const r=compare(f)
  const unresolved=r.by_label.unresolved
  assert.equal(unresolved.candidate.verifier_accuracy,null)
  assert.equal(unresolved.candidate.correct_population_coverage,null)
  assert.equal(unresolved.correctness_transitions,null)
  assert.equal(unresolved.decision_transitions.abstain.supporting,1)
  assert.equal(unresolved.candidate.decision_coverage.value,1)
  assert.deepEqual(r.by_label.disconfirming.candidate.retrieval_coverage,{numerator:0,denominator:0,value:null})
  assert.equal(r.by_label.disconfirming.candidate.verifier_accuracy.value,null)
})

test('retrieval losses remain distinct from retrieved verifier abstentions', () => {
  const f = fixture(['supporting','disconfirming'])
  f.candidate.predictions[0].decision='abstain'
  f.candidate.predictions[1]={...f.candidate.predictions[1],retrieved:false,decision:'abstain'}
  const r=compare(f)
  assert.equal(r.by_label.supporting.retrieval_transitions.retained,1)
  assert.equal(r.by_label.disconfirming.retrieval_transitions.lost,1)
  assert.equal(r.by_label.supporting.candidate.abstention_rate.value,1)
  assert.equal(r.by_label.disconfirming.candidate.abstention_rate.value,1)
})

test('validates both runs against exact manifest and complete held-out population', () => {
  for (const side of ['baseline','candidate']) {
    for (const mutate of [
      run=>{run.manifest_sha256=sha('other corpus')},
      run=>{run.predictions.pop()},
      run=>{run.predictions.push({...run.predictions[0]})},
      run=>{run.predictions[0].case_id='development'},
      run=>{run.predictions[0].retrieved=false},
    ]) {
      const f=fixture();mutate(f[side]);assert.throws(()=>compare(f))
    }
  }
  const f=fixture()
  assert.throws(()=>compareRecordCandidateRuns(f.raw+' ',JSON.stringify(f.baseline),JSON.stringify(f.candidate)),/run identity/)
})

test('underlying split and resource gates cannot be bypassed by paired comparison', () => {
  const f=fixture()
  f.manifest.cases[1].origin_groups=f.manifest.cases[0].origin_groups
  f.raw=JSON.stringify(f.manifest)
  f.baseline.manifest_sha256=f.candidate.manifest_sha256=sha(f.raw)
  assert.throws(()=>compare(f),/leakage/)
  const g=fixture()
  assert.throws(()=>compareRecordCandidateRuns(g.raw,' '.repeat(2*1024*1024+1),JSON.stringify(g.candidate)),/bounded/)
  assert.throws(()=>compareRecordCandidateRuns(g.raw,JSON.stringify(g.baseline),' '.repeat(2*1024*1024+1)),/bounded/)
})

test('report binds both run fingerprints without exporting private case artifacts', () => {
  const f=fixture(), r=compare(f)
  assert.equal(r.manifest_sha256,sha(f.raw))
  assert.equal(r.baseline.predictions_sha256,sha(JSON.stringify(f.baseline)))
  assert.equal(r.candidate.predictions_sha256,sha(JSON.stringify(f.candidate)))
  assert.equal(r.baseline.implementation_sha256,sha('synthetic-baseline'))
  assert.equal(r.candidate.implementation_sha256,sha('synthetic-candidate'))
  assert.doesNotMatch(JSON.stringify(r),/private-case|synthetic-private|Synthetic private rationale/)
})

test('all paired transition counts conserve each label population', () => {
  const f=fixture(['supporting','supporting','supporting','supporting'])
  f.baseline.predictions[2]={...f.baseline.predictions[2],retrieved:false,decision:'abstain'}
  f.baseline.predictions[3]={...f.baseline.predictions[3],retrieved:false,decision:'abstain'}
  f.candidate.predictions[1]={...f.candidate.predictions[1],retrieved:false,decision:'abstain'}
  f.candidate.predictions[3]={...f.candidate.predictions[3],retrieved:false,decision:'abstain'}
  const r=compare(f).by_label.supporting
  assert.deepEqual(r.retrieval_transitions,{retained:1,gained:1,lost:1,neither:1})
  assert.deepEqual(r.correctness_transitions,r.retrieval_transitions)
  assert.equal(Object.values(r.decision_transitions).flatMap(Object.values).reduce((a,b)=>a+b,0),4)
})
