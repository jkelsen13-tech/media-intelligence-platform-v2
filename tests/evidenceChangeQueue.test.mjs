import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('durable evidence changes integrate with existing intake and history', async t => {
  const db=await PGlite.create(); t.after(()=>db.close())
  const read=p=>readFile(new URL(p,import.meta.url),'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec(await read('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'))
  const intake=async(action,input={})=>(await db.query('select public.mip_pipeline_v1($1,$2::jsonb) r',[action,JSON.stringify(input)])).rows[0].r
  const rpc=async(action,input={})=>(await db.query('select public.mip_evidence_changes_v1($1,$2::jsonb) r',[action,JSON.stringify(input)])).rows[0].r
  const scalar=async(sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]))[0]
  const add=async(url,published_at='2019-01-01T00:00:00Z')=>{
    await intake('enqueue',{run_id:'queue-tests',article:{url,title:'Retained test evidence',outlet:'Test',summary:'A report.',published_at}})
    const j=await intake('claim'); return intake('finish',{job_id:j.id,lease_token:j.lease_token})
  }
  await add('https://example.org/before-install')
  const files=await readdir(new URL('../supabase/migrations/',import.meta.url))
  const migration=files.filter(p=>p.endsWith('_evidence_change_queue_v1.sql'))
  assert.equal(migration.length,1)
  await db.exec(await read('../supabase/migrations/'+migration[0]))
  const route='new_candidate_search'
  const claim=()=>rpc('claim',{route})
  const finish=(j,receipt={work_ref:'isolated-fixture',coverage:'complete'})=>rpc('finish',{job_id:j.id,lease_token:j.lease_token,receipt})
  await t.test('installation retains existing versions and schedules both paths exactly once',async()=>{
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.evidence_changes'),2)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.change_jobs'),4)
    assert.equal(await rpc('reconcile'),0)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.change_jobs'),4)
  })
  await t.test('late old evidence uses arrival; source and queue clocks stay distinct',async()=>{
    const a=await add('https://example.org/late-old','2010-01-01T00:00:00Z')
    const rows=(await db.query(`select c.*,a.payload,a.captured_at from evidence_pipeline.evidence_changes c
      join evidence_pipeline.article_captures a on a.id=c.capture_id where a.id=$1`,[a.capture_id])).rows
    assert.equal(rows.length,1)
    assert.equal(new Date(rows[0].payload.published_at).getUTCFullYear(),2010)
    assert.ok(new Date(rows[0].queued_at)>new Date('2020-01-01'))
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.change_jobs'),8)
  })
  await t.test('claims are exclusive, fenced, and exact successful retries are idempotent',async()=>{
    const a=await claim(), b=await claim(); assert.notEqual(a.id,b.id)
    await assert.rejects(finish({...a,lease_token:b.lease_token}),/lease/)
    await assert.rejects(finish(a,{coverage:'partial',work_ref:'partial'}),/receipt/)
    assert.equal(await finish(a),'completed'); assert.equal(await finish(a),'completed')
    await assert.rejects(finish(a,{coverage:'complete',work_ref:'different'}),/conflict/)
    await finish(b)
    const input=await rpc('input',{job_id:a.id}); assert.ok(input.capture||input.record_version)
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_job_events where job_id=$1 and event='completed'",[a.id]),1)
  })
  await t.test('expired leases recover with backoff and reject stale workers',async()=>{
    const a=await claim()
    await db.query("update evidence_pipeline.change_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[a.id])
    await assert.rejects(finish(a),/lease/)
    const other=await claim(); if(other) await finish(other)
    assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[a.id]),'retry_wait')
    assert.equal(await claim(),null)
    await db.query("update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '1 second' where id=$1",[a.id])
    const b=await claim(); assert.equal(b.id,a.id); assert.notEqual(b.lease_token,a.lease_token)
    await assert.rejects(finish(a),/lease/)
    await finish(b)
  })
  await t.test('failure budgets survive replay and stop after five attempts',async()=>{
    await add('https://example.org/fail-budget')
    let j=await claim()
    for(let n=1;n<=5;n++) {
      assert.equal(j.attempt_count,n)
      assert.equal(await rpc('fail',{job_id:j.id,lease_token:j.lease_token,code:'test',retryable:true}),n===5?'dead_letter':'retry_wait')
      if(n<5){
        await db.query("update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '1 day' where id=$1",[j.id])
        j=await claim()
      }
    }
    await rpc('reconcile')
    assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[j.id]),'dead_letter')
  })
  await t.test('publisher revisions and graph edits create new immutable inputs',async()=>{
    const before=await scalar('select count(*)::int from evidence_pipeline.evidence_changes')
    await intake('enqueue',{run_id:'correction',article:{url:'https://example.org/late-old',title:'Correction',outlet:'Test',summary:'A corrected report.'}})
    const j=await intake('claim'); await intake('finish',{job_id:j.id,lease_token:j.lease_token})
    const id=await scalar("insert into public.nodes(type,label) values('event','A') returning id")
    await db.query("update public.nodes set label='B' where id=$1",[id])
    await db.query('delete from public.nodes where id=$1',[id])
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.evidence_changes'),before+4)
    const versions=(await db.query('select operation,payload from evidence_pipeline.record_versions where record_key=$1 order by ordinal',[id])).rows
    assert.deepEqual(versions.map(x=>x.operation),['insert','update','delete'])
    await assert.rejects(db.exec('delete from evidence_pipeline.evidence_changes'),/append-only|foreign key/)
    await assert.rejects(db.exec('update evidence_pipeline.change_job_events set detail=\'{}\''),/append-only/)
  })
  await t.test('failed source transaction leaves no phantom change or job',async()=>{
    const before=await scalar('select count(*)::int from evidence_pipeline.change_jobs')
    await db.exec("begin; insert into public.nodes(type,label) values('event','rolled-back'); rollback;")
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.change_jobs'),before)
  })
  await t.test('bounded reconciliation recovers missed historical notifications',async()=>{
    await db.exec('alter table evidence_pipeline.record_versions disable trigger mip_record_change')
    await db.exec("insert into public.nodes(type,label) values('event','missed-1'),('event','missed-2')")
    await db.exec('alter table evidence_pipeline.record_versions enable trigger mip_record_change')
    assert.equal(await rpc('reconcile',{limit:1}),1)
    assert.equal(await rpc('reconcile',{limit:1}),1)
    assert.equal(await rpc('reconcile',{limit:1}),0)
    await assert.rejects(rpc('reconcile',{limit:101}),/limit/)
  })
  await t.test('browser denial and server intake work through the full trigger chain',async()=>{
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`)
      await assert.rejects(rpc('status'),/permission denied/)
      await assert.rejects(db.exec('select * from evidence_pipeline.evidence_changes'),/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    await add('https://example.org/server-role')
    assert.ok((await rpc('status')).length)
    const j=await rpc('claim',{route:'dependency_lookup'}); await finish(j)
    await assert.rejects(db.exec("update public.articles set reader_state='eligible'"),/permission denied/)
    await db.exec('reset role')
  })
})
