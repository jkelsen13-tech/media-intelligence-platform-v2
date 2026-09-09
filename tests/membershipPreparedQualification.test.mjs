import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import * as baseline from '../supabase/runtime-snapshots/source-comparison-run-v10/lib.js'
import * as candidate from '../supabase/qualification/membership-prepared/lib.js'

const gate = { fixturePassed: true, autoApprovalEnabled: true, autoApprovalThreshold: 0.7 }
const event = { id: 'synthetic-event', canonical_title: 'Council approves water infrastructure funding' }
function article(i) {
  return { id: 'synthetic-' + i, title: i % 3 ? 'Council approves water infrastructure funding' : 'Court reviews coastal shipping rules',
    summary: 'Synthetic comparison fixture ' + i + ' Council water investment review.',
    body_text: ('Synthetic body with attribution and quantities ' + i + ' ').repeat(30),
    published_at: '2026-08-' + String(1 + i % 28).padStart(2, '0') + 'T12:00:00Z',
    embedding: Array.from({length: 64}, (_, j) => ((i + j * 17) % 53 - 26) / 53) }
}
function compare(members, policy = gate, anchor = event) {
  assert.deepStrictEqual(candidate.scoreEventMembership(anchor, members, policy),
    baseline.scoreEventMembership(anchor, members, policy))
}
test('prepared scorer preserves every existing adversarial fixture and full output', () => {
  assert.deepStrictEqual(candidate.runMembershipRegressionSuite(), baseline.runMembershipRegressionSuite())
  for (const name of ['regressionMixedTopicMembershipFixture','regressionPeerMajorityMembershipFixture','regressionActorOnlyTopicVoidFixture']) {
    const fixture = baseline[name]()
    for (const threshold of [undefined,null,'',' ',false,true,[],[0],{},NaN,Infinity,-1,1.1,0,'0',0.7,'0.7',1]) {
      compare(fixture.members, {...gate,autoApprovalThreshold:threshold}, fixture.event)
    }
  }
})
test('missing, malformed and duplicate-ID observations retain exact null and rejection semantics', () => {
  const variants = [null, {}, {title:''}, {summary:'Summary only'}, {body_text:'Body only'},
    {title:'The and of'}, {title:'東京 水道'}, {embedding:[]}, {embedding:'[]'},
    {embedding:'[1,broken,3]'}, {embedding:[1,Infinity,NaN]}, {embedding:[0,0]},
    {published_at:'invalid'}, {published_at:'2026-08-01'}, {id:'duplicate',title:'Council water'},
    {id:'duplicate',title:'Court shipping'}, article(1)]
  for (let i=0;i<variants.length;i++) for(let j=0;j<variants.length;j++) compare([variants[i],variants[j]])
  compare([])
  compare([article(1)])
  compare([article(1),article(1),{article:article(2)}])
})
test('preparation is per invocation and does not reuse stale features after corrections', () => {
  const members = [article(1), article(2), article(3)]
  compare(members)
  for (const field of ['title','summary','body_text','published_at','embedding']) {
    members[0][field] = field === 'embedding' ? [1,0,1] : 'Corrected ' + field
    compare(members)
  }
  const frozen = members.map(a => Object.freeze({...a,embedding:Object.freeze([...a.embedding])}))
  compare(Object.freeze(frozen))
})
test('seeded heterogeneous corpora preserve exact scores and all disabled-gate states', () => {
  let state=764319
  const next=()=> (state=(Math.imul(state,1664525)+1013904223)>>>0)
  for(let run=0;run<30;run++){
    const members=Array.from({length:2+next()%17},(_,i)=>{
      const value=article(next()%100)
      if(next()%3===0) value.summary=null
      if(next()%3===0) value.embedding=JSON.stringify(value.embedding)
      if(next()%5===0) value.embedding=null
      if(next()%5===0) value.published_at='invalid'
      return i%2 ? {article:value} : value
    })
    compare(members,{...gate,fixturePassed:run%3!==0,autoApprovalEnabled:run%4!==0})
  }
})
test('312-member synthetic workload preserves full output; timing is diagnostic, not an Edge SLA', t => {
  const members=Array.from({length:312},(_,i)=>article(i))
  const before=performance.now()
  const expected=baseline.scoreEventMembership(event,members,gate)
  const middle=performance.now()
  const actual=candidate.scoreEventMembership(event,members,gate)
  const after=performance.now()
  assert.deepStrictEqual(actual,expected)
  t.diagnostic(JSON.stringify({fixture:'synthetic-312-members-64-dimensions',
    directedPairs:312*311, baselineMs:middle-before,candidateMs:after-middle,
    ratio:(middle-before)/(after-middle),productionRuntimeQualified:false}))
})
test('embedding preparation is linear and pair coverage remains complete', async () => {
  async function instrument(path) {
    let source=readFileSync(new URL(path,import.meta.url),'utf8')
    source='export const calls={embedding:0,pair:0};\n'+source
    source=source.replace('export function parseEmbedding(raw) {','export function parseEmbedding(raw) { calls.embedding++;')
    source=source.replace(/function pairMembershipSignals\(([^)]*)\) \{/, 'function pairMembershipSignals($1) { calls.pair++;')
    return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
  }
  const old=await instrument('../supabase/runtime-snapshots/source-comparison-run-v10/lib.js')
  const next=await instrument('../supabase/qualification/membership-prepared/lib.js')
  const members=Array.from({length:40},(_,i)=>article(i))
  assert.deepStrictEqual(next.scoreEventMembership(event,members,gate),old.scoreEventMembership(event,members,gate))
  assert.equal(old.calls.embedding,2*40*39)
  assert.equal(next.calls.embedding,40)
  assert.equal(old.calls.pair,40*39)
  assert.equal(next.calls.pair,40*39)
})
