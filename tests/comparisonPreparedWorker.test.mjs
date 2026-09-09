import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { membershipInputFingerprint as fingerprint } from '../supabase/runtime-snapshots/source-comparison-run-v13/membershipFingerprint.js'
import { scoreEventMembership, regressionMixedTopicMembershipFixture } from '../supabase/runtime-snapshots/source-comparison-run-v13/lib.js'

const path='../supabase/runtime-snapshots/'
const read=(version,name)=>readFileSync(new URL(path+'source-comparison-run-'+version+'/'+name,import.meta.url),'utf8')
const previousIndex=read('v10','index.ts')
const legacySource=previousIndex.slice(previousIndex.indexOf('function membershipFingerprint('),previousIndex.indexOf('async function upsertInChunks')).replace(/: any\b/g,'')
const previous=runInNewContext('('+legacySource.trim()+')')
const gate={fixturePassed:true,autoApprovalEnabled:false,autoApprovalThreshold:null}
const fixture=()=>{const {event,members}=regressionMixedTopicMembershipFixture();return {event,members:members.slice(0,2).map(article=>({article}))}}
const score=input=>scoreEventMembership(input.event,input.members,gate)
const key=input=>fingerprint(input,score(input).release_gate)

test('corrected summaries and canonical anchors cannot reuse a different score input key',()=>{
  const before=fixture(), oldScore=score(before)
  const anchor=structuredClone(before)
  anchor.event.canonical_title='Volcano erupts as residents flee ash and lava'
  assert.equal(previous(anchor),previous(before),'reproduce the actual legacy deduplication collision')
  assert.notDeepEqual(score(anchor),oldScore,'the deployed scorer consumes the omitted event anchor')
  assert.notEqual(key(anchor),key(before))
  const summary=structuredClone(before)
  summary.members[0].article.summary='Volcano eruption ash lava evacuation residents flee disaster island'
  assert.equal(previous(summary),previous(before),'legacy key ignores source correction')
  assert.notDeepEqual(score(summary),oldScore,'corrected source text changes scorer observations')
  assert.notEqual(key(summary),key(before))
  assert.deepEqual(score(before),oldScore,'fingerprinting never edits scorer inputs')
  assert.equal(score(before).eligible_for_auto_approval,false)
})

test('exact observed fields, dates, array order and release parameters are bound without copying payload text',()=>{
  const input=fixture()
  input.members[0].article.body_text='Private body marker'
  input.members[0].article.embedding=[0.125,0.75]
  input.members[0].article.published_at='2024-04-08 17:59:00.123456+00'
  const original=structuredClone(input), base=key(input)
  for(const [field,value] of [['body_text','Corrected private body'],['embedding',[0.25,0.75]],['outlet','Changed outlet'],['published_at','2024-04-08 17:59:00.123457+00'],['claims',[{claim:'changed'}]]]){
    const changed=structuredClone(input);changed.members[0].article[field]=value
    assert.notEqual(key(changed),base,field)
  }
  const ordered=structuredClone(input);ordered.members.reverse()
  assert.notEqual(key(ordered),base,'bind the actual scorer order, including floating point operations')
  const release=score(input).release_gate
  assert.notEqual(fingerprint(input,{...release,auto_approval_enabled:true}),base)
  const descriptor=JSON.parse(base)
  assert.deepEqual(Object.keys(descriptor).sort(),['contract','event_id','input_sha256','members'])
  assert.equal(descriptor.contract,'mip-membership-input-v2')
  assert.match(descriptor.input_sha256,/^[a-f0-9]{64}$/)
  assert.doesNotMatch(base,/Private body marker|0\.125/)
  assert.deepEqual(input,original)
  const reordered={members:input.members.map(({article})=>({article:Object.fromEntries(Object.entries(article).reverse())})),event:Object.fromEntries(Object.entries(input.event).reverse())}
  assert.equal(key(reordered),base,'object property ordering is immaterial')
})

test('ambiguous or non-JSON inputs fail closed before a fingerprint can be persisted',()=>{
  for(const value of [NaN,Infinity,Number.MAX_SAFE_INTEGER+1,undefined,()=>0,new Date(),1n]){
    const input=fixture();input.members[0].article.embedding=value
    assert.throws(()=>key(input))
  }
  const duplicate=fixture();duplicate.members.push(duplicate.members[0])
  assert.throws(()=>key(duplicate),/unique/)
  const cycle=fixture();cycle.event.self=cycle.event
  assert.throws(()=>key(cycle),/acyclic/)
  const sparse=fixture();sparse.members[0].article.embedding=new Array(1)
  assert.throws(()=>key(sparse),/sparse/)
})

test('the complete runtime preserves qualified scoring and only changes fingerprint binding and client pin and preserves scoring, projection, authorization and queue logic',()=>{
  assert.equal(read('v13','lib.js'),readFileSync(new URL('../supabase/qualification/membership-prepared/lib.js',import.meta.url),'utf8'))
  assert.equal(read('v13','loadedLanguageLexicon.json'),read('v10','loadedLanguageLexicon.json'))
  let next=read('v13','index.ts')
  assert.ok(next.includes('membershipInputFingerprint(input, score.release_gate)'))
  next=next.replace("import { membershipInputFingerprint } from './membershipFingerprint.js'\n",'')
  next=next.replace('@supabase/supabase-js@2.110.0','@supabase/supabase-js@2')
  const oldFunction=previousIndex.slice(previousIndex.indexOf('function membershipFingerprint('),previousIndex.indexOf('async function upsertInChunks'))
  next=next.replace('async function upsertInChunks',oldFunction+'async function upsertInChunks')
  next=next.replace(`    const score = scoreEventMembership(input.event, input.members, policy.gate ?? {})
    const fingerprint = membershipInputFingerprint(input, score.release_gate)`,`    const fingerprint = membershipFingerprint(input)`)
  next=next.replace('      ...score,','      ...scoreEventMembership(input.event, input.members, policy.gate ?? {}),')
  assert.equal(next,previousIndex,'no unrelated change to the recovered runtime')
})
