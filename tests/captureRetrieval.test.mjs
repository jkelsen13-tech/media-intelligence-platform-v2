import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {createOperatorBackend, PIPELINE_TARGET} from '../scripts/operatorBackend.mjs'
import {enqueueManifest, runWorker} from '../scripts/evidencePipeline.mjs'
import {runCaptureRetrieval} from '../scripts/runCaptureRetrieval.mjs'

test('bounded private capture retrieval',async t=>{
 const db=await PGlite.create();t.after(()=>db.close())
 const read=p=>readFile(new URL(p,import.meta.url),'utf8')
 await db.exec(await read('./changeQueueFixture.sql'))
 for(const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','evidence_capture_retrieval_v1']){
  const files=await readdir(new URL('../supabase/migrations/',import.meta.url));const file=files.filter(x=>x.endsWith('_'+suffix+'.sql'));assert.equal(file.length,1)
  await db.exec(await read('../supabase/migrations/'+file[0]))
 }
 const rpc=name=>(action,input={})=>db.query(`select public.${name}($1,$2::jsonb) r`,[action,JSON.stringify(input)]).then(r=>r.rows[0].r)
 const intake=rpc('mip_pipeline_v1'),queue=rpc('mip_evidence_changes_v1'),retrieval=rpc('mip_capture_retrieval_v1')
 const scalar=async(sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]))[0]
 const add=async(url,summary,date='2026-01-01T00:00:00Z')=>{
  await intake('enqueue',{run_id:'retrieval-tests',article:{url,title:'Report',outlet:'Fixture',summary,published_at:date}})
  const j=await intake('claim');return intake('finish',{job_id:j.id,lease_token:j.lease_token})
 }
 const claim=async cap=>{
  await db.query("update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '100 years' where change_position=(select position from evidence_pipeline.evidence_changes where capture_id=$1)",[cap.capture_id])
  const j=await queue('claim',{route:'new_candidate_search'});assert.equal(j.change.capture_id,cap.capture_id);return j
 }
 await t.test('composed operator transport connects intake, bounded retrieval and durable recovery',async()=>{
  await db.exec('begin')
  try {
  let losePageResponse=false
  const routes={mip_pipeline_v1:intake,mip_evidence_changes_v1:queue,mip_capture_retrieval_v1:retrieval}
  const backend=createOperatorBackend({url:PIPELINE_TARGET,key:'test-only',fetchImpl:async(url,init)=>{
   const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(init.body)
   const value=await routes[name](body.p_action,body.p_input)
   if(losePageResponse&&body.p_action==='page'){losePageResponse=false;throw new Error('lost committed response')}
   return Response.json(value)
  }})
  await enqueueManifest(backend.intake,{run_id:'operator-test',articles:[1,2,3].map(n=>({url:`https://example.org/operator-${n}`,title:'Riverbridge wetlands monitoring',outlet:'Fixture'}))},{apply:true})
  const imported=await runWorker(backend.intake,{maxJobs:3});assert.equal(imported.completed.length,3)
  const leased=await claim(imported.completed[0])
  const partial=await runCaptureRetrieval(backend,{mode:'start',job_id:leased.id,lease_token:leased.lease_token,maxPages:1,pageSize:1})
  assert.equal(partial.state,'partial');assert.equal(partial.scanned,1)
  losePageResponse=true
  const recovered=await runCaptureRetrieval(backend,{mode:'resume',run_id:partial.run_id,lease_token:leased.lease_token})
  assert.equal(recovered.state,'completed');assert.equal(recovered.scanned,2)
  assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[leased.id]),'completed')
  assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_job_events where job_id=$1 and event='completed'",[leased.id]),1)
  assert.equal((await runCaptureRetrieval(backend,{mode:'resume',run_id:partial.run_id})).pages,0)
  assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessments'),0)
  assert.ok((await backend.retrieval('results',{run_id:partial.run_id})).every(row=>row.release_state==='private'))
  assert.equal(await scalar("select count(*)::int from public.articles where reader_state<>'pending_review'"),0)
  await enqueueManifest(backend.intake,{run_id:'operator-late',articles:[{url:'https://example.org/operator-late',title:'Riverbridge wetlands historical record',outlet:'Fixture',published_at:'1980-01-01T00:00:00Z'}]},{apply:true})
  await runWorker(backend.intake,{maxJobs:1})
  const refresh=await runCaptureRetrieval(backend,{mode:'refresh',job_id:leased.id,maxPages:1,pageSize:1})
  assert.equal(refresh.state,'partial');assert.equal(refresh.targets,3);assert.notEqual(refresh.run_id,partial.run_id)
  assert.equal((await runCaptureRetrieval(backend,{mode:'resume',run_id:refresh.run_id})).state,'completed')
  assert.equal((await backend.retrieval('read',{run_id:partial.run_id})).targets.length,2)
  } finally { await db.exec('rollback') }
 })
 const a=await add('https://example.org/a','Riverbridge chemical discharge affected wetlands.'),b=await add('https://example.org/b','Riverbridge wetlands monitoring began.'),c=await add('https://example.org/c','Orchestra violin rehearsal continued.')
 let j,run;
 await t.test('lease checks, frozen manifest, bounded pages and exact retry',async()=>{
  j=await claim(a)
  await assert.rejects(retrieval('start',{job_id:j.id,lease_token:'00000000-0000-0000-0000-000000000000'}),/lease/)
  run=await retrieval('start',{job_id:j.id,lease_token:j.lease_token});assert.equal(run.targets.length,2)
  assert.equal((await retrieval('start',{job_id:j.id,lease_token:j.lease_token})).id,run.id)
  const p={run_id:run.id,lease_token:j.lease_token,limit:1}
  await assert.rejects(retrieval('page',{...p,lease_token:'00000000-0000-0000-0000-000000000000'}),/lease/)
  assert.equal((await retrieval('page',p)).coverage,'partial')
  assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[j.id]),'processing')
  const receipt=await retrieval('page',p);assert.equal(receipt.coverage,'complete');assert.deepEqual(await retrieval('page',p),receipt)
  const r=await retrieval('read',{run_id:run.id});assert.equal(r.counts.retrieval_candidate,1);assert.equal(r.counts.no_lexical_match,1)
  const result=await retrieval('results',{run_id:run.id});assert.equal(result.length,2);assert.ok((await retrieval('pair',{pair_id:result[0].id})).left_capture.payload.summary);assert.ok(result.every(x=>x.release_state==='private'))
  assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessments'),0)
 })
 await t.test('reverse scans reuse the same pair without multiplying support',async()=>{
  const jb=await claim(b),rb=await retrieval('start',{job_id:jb.id,lease_token:jb.lease_token});await retrieval('page',{run_id:rb.id,lease_token:jb.lease_token})
  assert.equal(await scalar('select count(*)::int from evidence_pipeline.retrieval_pairs'),3)
 })
 await t.test('late historical evidence is included and refresh repairs older snapshots',async()=>{
  const d=await add('https://example.org/historical','Riverbridge wetlands pollution investigation.','1980-01-01T00:00:00Z')
  const jd=await claim(d),rd=await retrieval('start',{job_id:jd.id,lease_token:jd.lease_token});assert.equal(rd.targets.length,3)
  await retrieval('page',{run_id:rd.id,lease_token:jd.lease_token})
  assert.equal((await retrieval('read',{run_id:rd.id})).counts.retrieval_candidate,2)
  const fresh=await retrieval('refresh',{job_id:j.id});assert.notEqual(fresh.id,run.id);assert.equal(fresh.targets.length,3)
  assert.equal((await retrieval('refresh',{job_id:j.id})).id,fresh.id)
  await retrieval('page',{run_id:fresh.id});assert.equal((await retrieval('refresh',{job_id:j.id})).id,fresh.id)
  assert.equal((await retrieval('read',{run_id:run.id})).targets.length,2)
 })
 await t.test('arrivals during paged search wait for explicit refresh without losing history',async()=>{
  const jc=await claim(c),rc=await retrieval('start',{job_id:jc.id,lease_token:jc.lease_token});
  const late=await add('https://example.org/late','Orchestra violin performance.','1990-01-01T00:00:00Z')
  assert.ok(!rc.targets.includes(late.capture_id));await retrieval('page',{run_id:rc.id,lease_token:jc.lease_token})
  const refresh=await retrieval('refresh',{job_id:jc.id});assert.ok(refresh.targets.includes(late.capture_id))
  await retrieval('page',{run_id:refresh.id});assert.equal((await retrieval('read',{run_id:refresh.id})).counts.retrieval_candidate,1)
 })
 await t.test('same-article corrections are not independent pairs; lexical overlap is not a truth decision',async()=>{
  const corrected=await add('https://example.org/a','Riverbridge chemical discharge did not affect wetlands.')
  const jc=await claim(corrected),rc=await retrieval('start',{job_id:jc.id,lease_token:jc.lease_token});await retrieval('page',{run_id:rc.id,lease_token:jc.lease_token})
  assert.equal((await retrieval('read',{run_id:rc.id})).counts.same_article,1)
  const rows=await retrieval('results',{run_id:rc.id});assert.ok(rows.some(x=>x.disposition==='retrieval_candidate'))
  assert.ok(rows.every(x=>!('outcome' in x)&&!('confidence' in x)))
 })
 await t.test('unsupported producer is refused without consuming its notice',async()=>{
  const id=await scalar("select j.id from evidence_pipeline.change_jobs j join evidence_pipeline.evidence_changes c on c.position=j.change_position where c.capture_id is null and j.route='new_candidate_search' limit 1")
  await assert.rejects(retrieval('start',{job_id:id}),/unsupported producer/)
  assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[id]),'pending')
 })
 await t.test('page rollback leaves neither phantom progress nor pair rows',async()=>{
  const late=await add('https://example.org/rollback','Orchestra violin concert.')
  const jl=await claim(late),rl=await retrieval('start',{job_id:jl.id,lease_token:jl.lease_token});
  const before=await scalar('select count(*)::int from evidence_pipeline.retrieval_pairs')
  await db.exec('begin');await retrieval('page',{run_id:rl.id,lease_token:jl.lease_token});await db.exec('rollback')
  assert.equal((await retrieval('read',{run_id:rl.id})).next_index,0)
  assert.equal(await scalar('select count(*)::int from evidence_pipeline.retrieval_pairs'),before)
  await db.query("update evidence_pipeline.change_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[jl.id])
  await assert.rejects(retrieval('page',{run_id:rl.id,lease_token:jl.lease_token}),/lease/)
 })
 await t.test('roles and immutable results',async()=>{
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(retrieval('read',{run_id:run.id}),/permission denied/);await db.exec('reset role')}
  await db.exec('set role service_role');assert.ok(await retrieval('read',{run_id:run.id}));
  await assert.rejects(db.exec('update evidence_pipeline.retrieval_pairs set release_state=release_state'),/permission denied|append-only/)
  await assert.rejects(db.exec("update evidence_pipeline.retrieval_runs set targets='{}'"),/permission denied/)
  await db.exec('reset role')
 })
 await t.test('deployment canary unchanged',async()=>{await db.exec(await read('../supabase/tests/capture_retrieval_smoke.sql'))})
})
