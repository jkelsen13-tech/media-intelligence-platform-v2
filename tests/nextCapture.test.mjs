import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createCaptureRetrievalHandler } from '../supabase/functions/capture-retrieval/handler.mjs'
import { createOperatorBackend, PIPELINE_TARGET } from '../supabase/functions/_shared/operatorBackend.mjs'
import { runNextCapture } from '../supabase/functions/_shared/nextCapture.mjs'

const key = 'sb_secret_fixture_only'
const request = (body, extra = {}) => new Request('https://edge.invalid/capture-retrieval', {
  method:'POST', headers:{apikey:key,Authorization:'Bearer gateway-fixture','Content-Type':'application/json',...extra},
  body:JSON.stringify(body),
})
const body = {action:'run-next',apply:true}
test('run-next validates authorization and budgets before backend construction', async () => {
  let created=0
  const handler=createCaptureRetrievalHandler({url:PIPELINE_TARGET,serviceKey:key,makeBackend:()=>{created++;throw new Error('unexpected')}})
  for(const input of [null,[],{maxPages:0},{maxPages:3},{pageSize:26},{pageSize:null},{producer:'record_version'},{job_id:'anything'}]) {
    assert.equal((await handler(request({...body,input}))).status,400)
  }
  for(const b of [{action:'run-next'},{...body,apply:false},{...body,extra:true}]) assert.equal((await handler(request(b))).status,400)
  assert.equal((await handler(request(body,{apikey:'public'}))).status,401)
  assert.equal((await handler(request(body,{Origin:'https://example.org'}))).status,403)
  assert.equal(created,0)
})
test('fixed capture transport cannot select another route or producer', async () => {
  for(const serverKey of [key,'legacy-fixture']) {
    const sent=[]
    const backend=createOperatorBackend({url:PIPELINE_TARGET,key:serverKey,fetchImpl:async(url,init)=>{sent.push([url,init]);return Response.json(null)}})
    assert.equal(await backend.captureClaims('claim'),null)
    assert.equal(sent[0][0],PIPELINE_TARGET+'/rest/v1/rpc/mip_evidence_change_claim_v1')
    assert.deepEqual(JSON.parse(sent[0][1].body),{p_route:'new_candidate_search',p_producer:'capture'})
    assert.equal(sent[0][1].headers.apikey,serverKey)
    assert.equal(sent[0][1].headers.Authorization,serverKey.startsWith('sb_secret_')?undefined:'Bearer '+serverKey)
    await assert.rejects(backend.captureClaims('claim',{p_producer:'record_version'}))
    await assert.rejects(backend.captureClaims('finish'))
    assert.equal(sent.length,1)
  }
})
test('empty, lost and malformed claims do not trigger another claim or retrieval', async () => {
  for(const value of [null,undefined,{},[],{id:'private'}]) {
    let calls=0
    const result=await runNextCapture({captureClaims:async()=>{calls++;return value},retrieval:()=>assert.fail('unexpected retrieval')})
    assert.equal(calls,1);assert.equal(result.state,value===null?'no_ready_capture':'indeterminate')
    assert.ok(!JSON.stringify(result).includes('private'))
  }
  let calls=0
  const result=await runNextCapture({captureClaims:async()=>{calls++;throw new Error(key)}})
  assert.deepEqual(result,{state:'indeterminate',code:'claim_outcome_unknown',pages:0})
  assert.equal(calls,1)
})

test('hosted producer claim integrates with real durable retrieval SQL', async t => {
  const db=await PGlite.create();t.after(()=>db.close())
  const read=p=>readFile(new URL(p,import.meta.url),'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  const files=await readdir(new URL('../supabase/migrations/',import.meta.url))
  for(const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','evidence_capture_retrieval_v1','evidence_change_producer_claim_v1']) {
    const matches=files.filter(p=>p.endsWith('_'+suffix+'.sql'));assert.equal(matches.length,1)
    await db.exec(await read('../supabase/migrations/'+matches[0]))
  }
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
  const rpc=(name,action,input={})=>scalar('select public.'+name+'($1,$2::jsonb)',[action,JSON.stringify(input)])
  for(let n=0;n<3;n++) {
    await rpc('mip_pipeline_v1','enqueue',{run_id:'hosted-fixture',article:{url:'https://example.org/hosted-'+n,title:'Riverbridge wetlands evidence',outlet:'Fixture',summary:'Riverbridge monitoring',published_at:'1980-01-01T00:00:00Z'}})
    const j=await rpc('mip_pipeline_v1','claim')
    await rpc('mip_pipeline_v1','finish',{job_id:j.id,lease_token:j.lease_token})
  }
  let lost
  const calls=[]
  const backend=createOperatorBackend({url:PIPELINE_TARGET,key,fetchImpl:async(url,init)=>{
    const name=new URL(url).pathname.split('/').at(-1), payload=JSON.parse(init.body)
    calls.push([name,payload.p_action])
    const value=name==='mip_evidence_change_claim_v1'
      ? await scalar('select public.mip_evidence_change_claim_v1($1,$2)',[payload.p_route,payload.p_producer])
      : await rpc(name,payload.p_action,payload.p_input)
    if(lost===(payload.p_action||'claim')) {lost=null;throw new Error('lost committed response')}
    return Response.json(value)
  }})
  const handler=createCaptureRetrievalHandler({url:PIPELINE_TARGET,serviceKey:key,makeBackend:()=>backend})
  const run=async(input)=>{const response=await handler(request({...body,...(input?{input}:{})}));return {status:response.status,result:await response.json()}}
  const check=(name,fn)=>t.test(name,async()=>{await db.exec('begin');calls.length=0;lost=null;try{await fn()}finally{await db.exec('rollback')}})
  const history=()=>scalar("select jsonb_agg(to_jsonb(j) order by id) from evidence_pipeline.change_jobs j join evidence_pipeline.evidence_changes c on c.position=j.change_position where c.record_version_id is not null")
  await check('partial work resumes the same immutable run after producer-scoped lease recovery',async()=>{
    const before=await history()
    const first=await run({pageSize:1});assert.equal(first.status,200);assert.equal(first.result.state,'partial');assert.equal(first.result.pages,1)
    const {job_id,run_id}=first.result
    const oldToken=await scalar('select lease_token from evidence_pipeline.change_jobs where id=$1',[job_id])
    assert.ok(!JSON.stringify(first.result).includes(oldToken))
    await db.query("update evidence_pipeline.change_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[job_id])
    // Move other capture jobs into the future so recovery does not claim them.
    await db.query("update evidence_pipeline.change_jobs set available_at=clock_timestamp()+interval '1 day' where id<>$1 and state='pending'",[job_id])
    assert.equal((await run()).result.state,'no_ready_capture')
    assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[job_id]),'retry_wait')
    await db.query("update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '1 day' where id=$1",[job_id])
    const second=await run();assert.equal(second.result.state,'completed');assert.equal(second.result.run_id,run_id);assert.equal(second.result.scanned,2)
    assert.equal(await scalar('select attempt_count from evidence_pipeline.change_jobs where id=$1',[job_id]),2)
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_job_events where job_id=$1 and event='completed'",[job_id]),1)
    // Undo only this fixture's scheduling adjustment before comparing unsupported rows.
    await db.query("update evidence_pipeline.change_jobs j set available_at=(x->>'available_at')::timestamptz from jsonb_array_elements($1::jsonb) x where j.id=(x->>'id')::uuid",[JSON.stringify(before)])
    assert.deepEqual(await history(),before)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessments'),0)
    assert.equal(await scalar("select count(*)::int from public.articles where reader_state<>'pending_review'"),0)
    assert.ok(calls.every(([name,action])=>name!=='mip_evidence_changes_v1'&&!['finish','fail'].includes(action)))
  })
  await check('lost committed page is recovered as complete without duplicate completion',async()=>{
    lost='page';const out=await run()
    assert.equal(out.status,200);assert.equal(out.result.state,'completed')
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_job_events where event='completed'"),1)
    assert.equal(calls.filter(([name])=>name==='mip_evidence_change_claim_v1').length,1)
  })
  await check('lost committed claim stays indeterminate and does not claim a second job',async()=>{
    lost='claim';const out=await run()
    assert.equal(out.status,502);assert.equal(out.result.code,'claim_outcome_unknown')
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_jobs where state='processing'"),1)
    assert.equal(calls.length,1)
  })
  await check('lost start preserves a saved run for later inspection',async()=>{
    lost='start';const out=await run()
    assert.equal(out.status,502);assert.equal(out.result.state,'indeterminate');assert.ok(out.result.job_id)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.retrieval_runs'),1)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.retrieval_run_items'),0)
    assert.equal(calls.filter(([name])=>name==='mip_evidence_change_claim_v1').length,1)
  })
})
