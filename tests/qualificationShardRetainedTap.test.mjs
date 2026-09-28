// Metadata-only replay of already executed synthetic worker TAP, not worker execution.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {parseQualificationShardTap} from './qualificationShardSelection.tap.mjs'
import {workerRoot,commitRoot,directNames,aNames} from './qualificationShardSelection.fixture.mjs'
const identity=Object.freeze({
 contract:'qualification_shard_retained_tap_v1',
 candidate:'658c2d992cf2daf5e38d7011c3be3052379d63e1',
 tree:'01555deb8a2ad624b1d74b693c6d586b1f7915c8',
 workflow:'9ce0156ed15bd05fb73ed7424994efbbc45d0266',
 run:36473957974,
 node:'24.21.0',postgres:'17.6/170006',sourceClean:true,ownedCleanup:true,
 material:'Synthetic-only TAP protocol metadata; no captured articles, SQL, credentials, command echoes or raw logs.',
 scope:'Coverage-parser replay only; no worker, PostgreSQL, journal or application re-execution.'
})
async function receipt(){
 const bytes=await readFile(new URL('./qualificationShardRetainedTap.receipt.json',import.meta.url))
 assert.ok(bytes.length<=8388608)
 const r=JSON.parse(bytes.toString('utf8'))
 assert.deepEqual(Object.keys(r).sort(),[...Object.keys(identity),'jobs'].sort())
 for(const [key,value]of Object.entries(identity))assert.equal(r[key],value)
 assert.ok(Array.isArray(r.jobs));assert.equal(r.jobs.length,2)
 for(const [index,shard,job,pass] of [[0,'A',109102887374,78],[1,'B',109102887614,69]]){
  const j=r.jobs[index]
  assert.deepEqual(Object.keys(j).sort(),['shard','job','pass','fail','skip','tap','originalJobConclusion','runtimeConclusion','originalCoverageConclusion',...(shard==='A'?['reason']:[])].sort())
  assert.equal(j.runtimeConclusion,'success')
  assert.equal(j.originalJobConclusion,shard==='A'?'failure':'success')
  assert.equal(j.originalCoverageConclusion,shard==='A'?'failure':'success')
  if(shard==='A')assert.equal(j.reason,'Original parser rejected the known filtered empty commit test-file root; source integrity and owned cleanup succeeded.')
  assert.deepEqual([j.shard,j.job,j.pass,j.fail,j.skip],[shard,job,pass,0,0])
  assert.equal(typeof j.tap,'string')
  // Parent supplies only these sanitized TAP protocol lines, no diagnostic YAML,
  // stdout, error context, timestamps, credentials or synthetic source passages.
  const lines=j.tap.split('\n').filter(Boolean)
  assert.ok(lines.length>0&&lines.length<=10000)
  for(const line of lines)assert.match(line,/^(?:TAP version 13| *# Subtest: [^\r\n]+| *(?:ok|not ok) [1-9][0-9]* - [^\r\n]+| *[0-9]+\.\.[0-9]+|# (?:tests|suites|pass|fail|cancelled|skipped|todo) [0-9]+)$/)
  for(const [label,count] of [['pass',pass],['fail',0],['skipped',0],['cancelled',0],['todo',0]]){
   const matches=[...j.tap.matchAll(new RegExp('^# '+label+' ([0-9]+)$','gm'))]
   assert.equal(matches.length,1);assert.equal(Number(matches[0][1]),count)
  }
 }
 return r
}
const parse=j=>parseQualificationShardTap(j.tap,{shard:j.shard,workerRoot,commitRoot,directNames,aNames,sourceLayout:'original'})
test('retained original A/B TAP replay verifies exact identities and complete disjoint coverage',async()=>{
 const r=await receipt(),a=parse(r.jobs[0]),b=parse(r.jobs[1])
 assert.equal(directNames.length,39)
 assert.equal(a.executed_direct.length,2);assert.equal(b.executed_direct.length,37)
 assert.equal(a.filtered_commit_file_placeholder,true);assert.equal(a.commit_executed,false)
 assert.equal(b.filtered_commit_file_placeholder,false);assert.equal(b.commit_executed,true)
 assert.equal(a.selected_descendants_completed,74);assert.equal(b.selected_descendants_completed,24)
 assert.equal(a.executed_direct.some(n=>b.executed_direct.includes(n)),false)
 assert.deepEqual([...a.executed_direct,...b.executed_direct].sort(),[...directNames].sort())
 // 78/69 are historical TAP pass totals, not independent assertion counts.
 // This test does not rerun workers, establish source cleanliness or inspect cleanup.
})
test('retained replay refuses a missing selected direct completion',async()=>{
 const r=await receipt()
 for(const j of r.jobs){
  const wanted=parse(j).executed_direct[0]
  const lines=j.tap.split('\n')
  const index=lines.findIndex(line=>/^    ok [1-9][0-9]* - /.test(line)&&line.slice(line.indexOf(' - ')+3)===wanted)
  assert.ok(index>=0)
  lines.splice(index,1)
  assert.throws(()=>parse({...j,tap:lines.join('\n')}),/qualification_shard_tap_refused/)
 }
})
test('retained replay refuses an unknown file aggregate root',async()=>{
 const r=await receipt()
 for(const j of r.jobs)assert.throws(()=>parse({...j,tap:j.tap+'\n# Subtest: tests/unknown.test.mjs\nok 999 - tests/unknown.test.mjs\n'}),/qualification_shard_tap_refused/)
})
test('retained replay refuses selected descendant SKIP and TODO completions',async()=>{
 const r=await receipt()
 for(const j of r.jobs){
  const lines=j.tap.split('\n')
  const index=lines.findIndex(line=>/^        ok [1-9][0-9]* - /.test(line)&&!line.includes(' # '))
  assert.ok(index>=0)
  for(const flag of ['SKIP','TODO']){
   const altered=[...lines];altered[index]+=' # '+flag+' synthetic negative probe'
   assert.throws(()=>parse({...j,tap:altered.join('\n')}),/qualification_shard_tap_refused/)
  }
 }
})
