// Actual Node subprocess CLI qualification, not a worker/SQL substitute.
import test from 'node:test'
import assert from 'node:assert/strict'
import {parseQualificationShardTap} from './qualificationShardSelection.tap.mjs'
import {spawn} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {workerRoot,commitRoot,directNames,aNames,skipA,skipB} from './qualificationShardSelection.fixture.mjs'
const fixture=fileURLToPath(new URL('./qualificationShardSelection.fixture.mjs',import.meta.url))
async function run(flags,layout='one-file'){
 assert.equal(process.versions.node,'24.21.0','qualification requires exact Node24.21.0')
 return new Promise((resolve,reject)=>{
  const env={...process.env,MIP_SHARD_SELECTION_CHILD:'synthetic-only',MIP_SHARD_SELECTION_LAYOUT:layout}
  // Prevent the parent test runner context/filters or NODE_OPTIONS overriding this proof.
  for(const key of Object.keys(env))if(key.startsWith('NODE_TEST_')||key==='NODE_OPTIONS')delete env[key]
  const files=layout==='two-files'?['tests/qualificationShardSelection.fixture.mjs','tests/qualificationShardCommit.fixture.mjs']:[fixture]
  const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...flags,...files],
   {env,cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe']})
  let output='',bytes=0,failure=null,closed=false
  const timer=setTimeout(()=>{failure=Error('shard_selection_timeout');child.kill('SIGKILL')},20000)
  const accept=b=>{
   bytes+=b.length
   if(bytes>1048576){failure=Error('shard_selection_output_bound');child.kill('SIGKILL');return}
   output+=b.toString('utf8')
  }
  child.stdout.on('data',accept);child.stderr.on('data',accept)
  child.on('error',()=>{failure=Error('shard_selection_spawn_failed')})
  child.on('close',code=>{
   if(closed)return;closed=true;clearTimeout(timer)
   if(failure)return reject(failure)
   if(code!==0)return reject(Error('shard_selection_child_failed'))
   try{
    const records=output.split('\n').flatMap(line=>{
     const index=line.indexOf('SHARD_SELECTION_RECORD ')
     if(index<0)return []
     const record=JSON.parse(line.slice(index+'SHARD_SELECTION_RECORD '.length))
     assert.deepEqual(Object.keys(record).sort(),['kind','name'])
     return [record]
    })
    resolve({records,tap:output})
   }catch{reject(Error('shard_selection_protocol_failed'))}
  })
 })
}
function assertSelected({records},expected,withCommit){
 assert.equal(new Set(expected).size,expected.length)
 for(const kind of ['direct','nested','deep'])
  assert.deepEqual(records.filter(x=>x.kind===kind).map(x=>x.name),expected)
 assert.deepEqual(records.filter(x=>x.kind==='root').map(x=>x.name).sort(),(withCommit?[workerRoot,commitRoot]:[workerRoot]).sort())
 assert.deepEqual(records.filter(x=>x.kind==='commit').map(x=>x.name),withCommit?['nested','deep']:[])
 assert.equal(records.length,1+3*expected.length+(withCommit?3:0))
}
test('Node24 positive ancestor match reproduces prior over-selection defect',{timeout:25000},async()=>{
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
 const records=await run(['--test-name-pattern=^'+escape(workerRoot)+'$'])
 assertSelected(records,directNames,false)
 assert.equal(directNames.length,39)
})
test('skip-only shard A executes exactly its two complete subtrees and no commit root',{timeout:25000},async()=>{
 assert.equal(aNames.length,2)
 const output=await run(['--test-skip-pattern='+skipA])
 assertSelected(output,aNames,false)
 const coverage=parseQualificationShardTap(output.tap,{shard:'A',workerRoot,commitRoot,directNames,aNames})
 assert.deepEqual(coverage.executed_direct,aNames)
 assert.equal(coverage.explicitly_skipped_direct.length+coverage.omitted_direct.length,37)
 assert.equal(coverage.commit_executed,false)
 assert.equal(coverage.selected_descendants_completed,4)
 const missing=coverage.omitted_direct[0]
 if(missing){
  const withExplicitSkip=output.tap.replace('# Subtest: '+workerRoot+'\n',
   ()=>'# Subtest: '+workerRoot+'\n    ok 999 - '+missing+' # SKIP excluded synthetic registration\n')
  assert.notEqual(withExplicitSkip,output.tap)
  const classified=parseQualificationShardTap(withExplicitSkip,{shard:'A',workerRoot,commitRoot,directNames,aNames})
  assert.ok(classified.explicitly_skipped_direct.includes(missing))
  assert.equal(classified.explicitly_skipped_direct.length+classified.omitted_direct.length,37)
 }
 const altered=output.tap.replace(/^( +ok [0-9]+ - synthetic nested assertion)$/m,line=>line+' # SKIP injected')
 assert.notEqual(altered,output.tap)
 assert.throws(()=>parseQualificationShardTap(altered,{shard:'A',workerRoot,commitRoot,directNames,aNames}),/qualification_shard_tap_refused/)
})
test('skip-only shard B executes other37 complete subtrees and entire commit root',{timeout:25000},async()=>{
 const expected=directNames.filter(n=>!aNames.includes(n))
 assert.equal(expected.length,37)
 const output=await run(['--test-skip-pattern='+skipB])
 assertSelected(output,expected,true)
 const coverage=parseQualificationShardTap(output.tap,{shard:'B',workerRoot,commitRoot,directNames,aNames})
 assert.deepEqual(coverage.executed_direct,expected)
 assert.equal(coverage.explicitly_skipped_direct.length+coverage.omitted_direct.length,2)
 assert.equal(coverage.commit_executed,true)
 assert.equal(coverage.selected_descendants_completed,74)
 const rootSkipped=output.tap.replace(new RegExp('^ok [0-9]+ - '+commitRoot+'$','m'),line=>line+' # SKIP injected')
 assert.notEqual(rootSkipped,output.tap)
 assert.throws(()=>parseQualificationShardTap(rootSkipped,{shard:'B',workerRoot,commitRoot,directNames,aNames}),/qualification_shard_tap_refused/)
})
test('unfiltered baseline and A/B executed-name union cover each original direct name exactly',{timeout:25000},async()=>{
 assert.equal(new Set(directNames).size,39)
 const output=await run([])
 assertSelected(output,directNames,true)
 const baseline=parseQualificationShardTap(output.tap,{shard:'all',workerRoot,commitRoot,directNames,aNames})
 assert.equal(baseline.executed_direct.length,39)
 assert.equal(baseline.omitted_direct.length,0)
 assert.equal(baseline.explicitly_skipped_direct.length,0)
 assert.throws(()=>parseQualificationShardTap(output.tap,{shard:'B',workerRoot,commitRoot,directNames,aNames}),/qualification_shard_tap_refused/)
 const b=directNames.filter(n=>!aNames.includes(n))
 assert.deepEqual([...aNames,...b].sort(),[...directNames].sort())
 assert.equal(aNames.some(n=>b.includes(n)),false)
})

test('selection inventory matches actual original worker and commit test registration source',async()=>{
 const worker=await readFile(new URL('../verifier/hypothesis-worker/worker.test.mjs',import.meta.url),'utf8')
 const commit=await readFile(new URL('../verifier/hypothesis-worker/commitRecorder.test.mjs',import.meta.url),'utf8')
 assert.ok(worker.includes("test('"+workerRoot+"'"))
 assert.ok(commit.includes("test('"+commitRoot+"'"))
 const names=[...worker.matchAll(/await t\.test\('([^']+)'/g)].flatMap(match=>{
  if(match[1]==='actual termination/restart '){
   assert.ok(worker.includes("['before_complete_commit','after_complete_commit']"))
   return ['actual termination/restart before_complete_commit recovers exact durable completion',
    'actual termination/restart after_complete_commit recovers exact durable completion']
  }
  return [match[1]]
 })
 assert.deepEqual(names,directNames)
 assert.equal((worker.match(/await t\.test\(/g)??[]).length,38)
 assert.equal((commit.match(/^test\(/gm)??[]).length,1)
})

test('two-file wildcard geometry distinguishes filtered commit file from executed commit root',{timeout:45000},async()=>{
 const a=await run(['--test-skip-pattern='+skipA],'two-files')
 assertSelected(a,aNames,false)
 const options={workerRoot,commitRoot,directNames,aNames,sourceLayout:'synthetic'}
 const ac=parseQualificationShardTap(a.tap,{...options,shard:'A'})
 assert.equal(ac.executed_direct.length,2)
 assert.equal(ac.commit_executed,false)
 // Record actual Node output behavior; never infer commit execution from a file result.
 assert.equal(ac.filtered_commit_file_placeholder,/^ok [0-9]+ - tests\/qualificationShardCommit\.fixture\.mjs$/m.test(a.tap))
 if(ac.filtered_commit_file_placeholder){
  const unknown=a.tap.replaceAll('tests/qualificationShardCommit.fixture.mjs','tests/unknown.fixture.mjs')
  assert.throws(()=>parseQualificationShardTap(unknown,{...options,shard:'A'}),/qualification_shard_tap_refused/)
 }
 const b=await run(['--test-skip-pattern='+skipB],'two-files')
 assertSelected(b,directNames.filter(n=>!aNames.includes(n)),true)
 const bc=parseQualificationShardTap(b.tap,{...options,shard:'B'})
 assert.equal(bc.executed_direct.length,37)
 assert.equal(bc.commit_executed,true)
 assert.equal(bc.filtered_commit_file_placeholder,false)
})
