import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('producer-scoped queue claims preserve the durable lease contract', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  for (const p of ['./changeQueueFixture.sql',
    '../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql',
    '../supabase/migrations/20260906042413_evidence_change_queue_v1.sql',
    '../supabase/migrations/20260907234007_evidence_change_producer_claim_v1.sql']) await db.exec(await read(p))
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const rpc = (action, input = {}) => scalar('select public.mip_evidence_changes_v1($1,$2::jsonb)', [action, JSON.stringify(input)])
  const claim = (producer = 'capture', route = 'new_candidate_search') =>
    scalar('select public.mip_evidence_change_claim_v1($1,$2)', [route, producer])
  const finish = j => rpc('finish', {job_id:j.id, lease_token:j.lease_token, receipt:{work_ref:'isolated-test', coverage:'complete'}})
  const snapshot = () => scalar("select jsonb_agg(to_jsonb(j) order by id) from evidence_pipeline.change_jobs j")
  const events = () => scalar('select count(*)::int from evidence_pipeline.change_job_events')
  const rejects = async (fn, pattern) => {
    await db.exec('savepoint expected_error')
    try { await assert.rejects(fn,pattern) } finally { await db.exec('rollback to savepoint expected_error; release savepoint expected_error') }
  }
  const check = (name, fn) => t.test(name, async () => {
    await db.exec('begin')
    try { await fn() } finally { await db.exec('reset role; rollback') }
  })
  for (let n=0; n<2; n++) {
    await scalar('select public.mip_pipeline_v1($1,$2::jsonb)', ['enqueue', JSON.stringify({
      run_id:'producer-tests', article:{url:'https://example.org/producer-'+n, title:'Retained', outlet:'Fixture', summary:'Retained text'}
    })])
    const j=await scalar("select public.mip_pipeline_v1('claim','{}')")
    await scalar('select public.mip_pipeline_v1($1,$2::jsonb)', ['finish',JSON.stringify({job_id:j.id,lease_token:j.lease_token})])
  }
  await check('mandatory producer and route reject invalid input without mutation', async () => {
    const before=await snapshot(), count=await events()
    for (const p of [null,'','all','captures','CAPTURE']) await rejects(() => claim(p),/invalid producer/)
    for (const r of [null,'','unknown']) await rejects(() => claim('capture',r),/invalid route/)
    assert.deepEqual(await snapshot(),before); assert.equal(await events(),count)
  })
  await check('capture selection skips older history and leaves other routes untouched', async () => {
    await db.exec("update evidence_pipeline.change_jobs set available_at='2000-01-01' where change_position in (select position from evidence_pipeline.evidence_changes where record_version_id is not null)")
    const before=await scalar("select jsonb_agg(to_jsonb(j) order by id) from evidence_pipeline.change_jobs j where route='dependency_lookup' or change_position in (select position from evidence_pipeline.evidence_changes where record_version_id is not null)")
    const a=await claim(), b=await claim()
    assert.ok(a.change.capture_id); assert.ok(b.change.capture_id); assert.notEqual(a.id,b.id)
    assert.equal(a.attempt_count,1); assert.equal(await claim(),null)
    assert.equal(new Date(a.lease_expires_at)-new Date(a.available_at)>0,true)
    assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(j) order by id) from evidence_pipeline.change_jobs j where route='dependency_lookup' or change_position in (select position from evidence_pipeline.evidence_changes where record_version_id is not null)"),before)
    assert.equal(await finish(a),'completed'); assert.equal(await finish(a),'completed')
    await rejects(() => finish({...b,lease_token:a.lease_token}),/lease/)
  })
  await check('record-version and legacy callers coexist with exclusive claims', async () => {
    const a=await claim('record_version'); assert.ok(a.change.record_version_id)
    const b=await rpc('claim',{route:'new_candidate_search'}); assert.notEqual(a.id,b.id)
    const c=await claim('capture','dependency_lookup'); assert.equal(c.route,'dependency_lookup'); assert.ok(c.change.capture_id)
  })
  await check('expired leases of other producers are not recovered or charged', async () => {
    const a=await claim('record_version')
    await db.query("update evidence_pipeline.change_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[a.id])
    const before=await scalar('select to_jsonb(j) from evidence_pipeline.change_jobs j where id=$1',[a.id])
    await claim()
    assert.deepEqual(await scalar('select to_jsonb(j) from evidence_pipeline.change_jobs j where id=$1',[a.id]),before)
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_job_events where job_id=$1",[a.id]),1)
  })
  await check('matching expiration retains backoff, new fencing and fifth-attempt dead letters', async () => {
    const a=await claim(), other=await claim(); await finish(other)
    await db.query("update evidence_pipeline.change_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[a.id])
    assert.equal(await claim(),null)
    assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[a.id]),'retry_wait')
    await db.query("update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '1 second' where id=$1",[a.id])
    const b=await claim(); assert.equal(b.id,a.id); assert.equal(b.attempt_count,2); assert.notEqual(b.lease_token,a.lease_token)
    await rejects(() => finish(a),/lease/)
    await db.query("update evidence_pipeline.change_jobs set attempt_count=5,lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[b.id])
    assert.equal(await claim(),null)
    assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[b.id]),'dead_letter')
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_job_events where job_id=$1 and event='dead_letter'",[b.id]),1)
  })
  await check('explicit failure shares retry budgets with the historical API', async () => {
    let j=await claim(); const other=await claim(); await finish(other)
    for(let n=1;n<=5;n++) {
      assert.equal(j.attempt_count,n)
      assert.equal(await rpc('fail',{job_id:j.id,lease_token:j.lease_token,code:'fixture',retryable:true}),n===5?'dead_letter':'retry_wait')
      if(n<5) {
        assert.equal(await claim(),null)
        await db.query("update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '1 second' where id=$1",[j.id])
        j=await claim()
      }
    }
  })
  await check('expiration recovery remains bounded to 100 matching jobs', async () => {
    await db.exec("insert into public.nodes(type,label) select 'event','bounded-'||n from generate_series(1,101) n")
    await db.exec("update evidence_pipeline.change_jobs set state='processing',attempt_count=1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()-interval '1 second' where route='new_candidate_search' and change_position in (select position from evidence_pipeline.evidence_changes where record_version_id is not null)")
    const before=await scalar("select count(*)::int from evidence_pipeline.change_jobs where state='processing'")
    assert.ok(before>100); assert.equal(await claim('record_version'),null)
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_jobs where state='processing'"),before-100)
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_job_events where event='lease_expired'"),100)
  })
  await check('service role allowed; browser roles denied at function boundary', async () => {
    for(const role of ['anon','authenticated']) {
      assert.equal(await scalar("select has_function_privilege($1,'public.mip_evidence_change_claim_v1(text,text)','EXECUTE')",[role]),false)
    }
    for(const role of ['anon','authenticated']) {
      await db.exec('set role '+role)
      await rejects(() => claim(), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.ok((await claim()).change.capture_id)
    await db.exec('reset role')
    assert.equal(await scalar("select prosecdef from pg_proc where oid='public.mip_evidence_change_claim_v1(text,text)'::regprocedure"),false)
  })
})
