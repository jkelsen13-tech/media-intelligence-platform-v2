import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {runEventProjection} from '../supabase/runtime-snapshots/source-comparison-run-v16/lib.js'

const contract=await readFile(new URL('../supabase/qualification/comparison-generations/contract.sql',import.meta.url),'utf8')
const lexicon=JSON.parse(await readFile(new URL('../supabase/runtime-snapshots/source-comparison-run-v16/loadedLanguageLexicon.json',import.meta.url),'utf8'))
const observed='2026-01-01T00:00:00Z', implementation='qualification:sc-v2-event-projection:v16'
async function fixture(t){
  const db=await PGlite.create();t.after(()=>db.close())
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
  await db.exec(contract)
  await db.exec('set role service_role')
  return db
}
const enqueue=(db,payload,source='synthetic-source',at=observed)=>db.query(
  'select comparison_qualification.enqueue($1,$2::jsonb,$3,$4::timestamptz) id',
  [source,typeof payload==='string'?payload:JSON.stringify(payload),implementation,at]).then(r=>r.rows[0].id)
const claim=db=>db.query('select comparison_qualification.claim() job').then(r=>r.rows[0].job)
const complete=(db,j,output)=>db.query('select comparison_qualification.complete($1,$2,$3,$4,$5::jsonb) state',
  [j.generation_id,j.lease_token,j.input_hash,j.implementation_ref,JSON.stringify(output)]).then(r=>r.rows[0].state)
const state=db=>db.query('select generation_id,state,lease_token,attempt from comparison_qualification.jobs order by generation_id').then(r=>r.rows)
const inputs=()=>({eventInputs:[{event:{id:'event',canonical_title:'Council water funding',comparison_validation_state:'approved'},members:[
  {article:{id:'a',outlet:'Outlet A',title:'Council approves water infrastructure funding',summary:'Council approves water infrastructure funding',published_at:'2026-01-01 00:00:00.123456+00'}},
  {article:{id:'b',outlet:'Outlet B',title:'Council approves water infrastructure funding',summary:'Council approves water infrastructure funding',published_at:'2026-01-01'}}
]}],config:{groupFloor:0.6},lexicon})

test('actual projection output commits with only its retained generation; late corrections and siblings remain pending',async t=>{
  const db=await fixture(t), input=inputs(), first=await enqueue(db,input), j=await claim(db)
  assert.equal(j.generation_id,first)
  const retained=JSON.parse(j.input_text)
  const output=runEventProjection(retained.eventInputs,retained.config,retained.lexicon)
  assert.ok(output.claims.length>0)
  const corrected=structuredClone(input);corrected.eventInputs[0].members[0].article.summary='Corrected report'
  const later=await enqueue(db,corrected),other=await enqueue(db,input,'other-source')
  assert.equal(await complete(db,j,output),'completed')
  const rows=await state(db)
  assert.equal(rows.find(x=>x.generation_id===first).state,'completed')
  assert.equal(rows.find(x=>x.generation_id===later).state,'pending')
  assert.equal(rows.find(x=>x.generation_id===other).state,'pending')
  for(const generation_id of [later,other]) await assert.rejects(complete(db,{...j,generation_id},output))
  const durable=(await db.query('select output_payload,input_hash,implementation_ref from comparison_qualification.outputs')).rows
  assert.equal(durable.length,1)
  assert.deepEqual(durable[0].output_payload,output)
  assert.equal(durable[0].input_hash,j.input_hash)
  assert.equal(durable[0].implementation_ref,implementation)
  assert.equal((await db.query('select input_payload::text value from comparison_qualification.generations where id=$1',[first])).rows[0].value,j.input_text)
})

test('completion rollback removes staged output and leaves the lease intact',async t=>{
  const db=await fixture(t);await enqueue(db,inputs());const j=await claim(db)
  await db.exec(`reset role;
    create function comparison_qualification.fixture_fail_completion() returns trigger language plpgsql as $$
    begin if new.state='completed' then raise exception 'injected completion failure';end if;return new;end $$;
    create trigger fixture_failure before update on comparison_qualification.jobs
      for each row execute function comparison_qualification.fixture_fail_completion();
    set role service_role;`)
  await assert.rejects(complete(db,j,{claims:[]}),/injected completion failure/)
  assert.equal((await db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,0)
  assert.equal((await state(db))[0].lease_token,j.lease_token)
  assert.equal((await state(db))[0].state,'processing')
  await db.exec('reset role;drop trigger fixture_failure on comparison_qualification.jobs;set role service_role')
  assert.equal(await complete(db,j,{claims:[]}),'completed')
})

test('stale leases, foreign input bindings and conflicting replays cannot acknowledge another generation',async t=>{
  const db=await fixture(t);await enqueue(db,inputs());const old=await claim(db)
  assert.equal(await claim(db),null,'an active lease is not claimed twice')
  for(const changed of [{input_hash:'foreign'},{implementation_ref:'foreign'},{lease_token:null}]){
    await assert.rejects(complete(db,{...old,...changed},{claims:[]}))
  }
  await db.exec("reset role;update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '31 seconds';set role service_role")
  await assert.rejects(complete(db,old,{claims:[]}),/expired/)
  const current=await claim(db)
  assert.notEqual(current.lease_token,old.lease_token)
  assert.equal((await state(db))[0].attempt,2)
  await assert.rejects(complete(db,old,{claims:[]}),/lease/)
  assert.equal(await complete(db,current,{claims:[]}),'completed')
  const before=await state(db)
  assert.equal(await complete(db,current,{claims:[]}),'completed')
  await assert.rejects(complete(db,current,{claims:[{changed:true}]}),/conflict/)
  await assert.rejects(complete(db,old,{claims:[]}),/conflict/)
  assert.deepEqual(await state(db),before)
  assert.equal((await db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,1)
})

test('raw numeric precision, source dates and independent observation identity survive immutable retention',async t=>{
  const db=await fixture(t)
  const raw='{"count":9007199254740993,"coordinate":41.123456789012345678,"published_at":"2026-01-01 00:00:00.123456+00"}'
  const id=await enqueue(db,raw)
  assert.equal(await enqueue(db,raw),id)
  assert.notEqual(await enqueue(db,raw,'synthetic-source','2026-01-01T00:00:01Z'),id)
  const r=(await db.query("select input_payload->>'count' n,input_payload->>'coordinate' c,input_payload->>'published_at' p from comparison_qualification.generations where id=$1",[id])).rows[0]
  assert.deepEqual(r,{n:'9007199254740993',c:'41.123456789012345678',p:'2026-01-01 00:00:00.123456+00'})
  await assert.rejects(enqueue(db,raw,'synthetic-source','infinity'),/observation/)
  await assert.rejects(enqueue(db,raw,'synthetic-source','2999-01-01'),/observation/)
  await assert.rejects(enqueue(db,'[]'))
  const j=await claim(db)
  await assert.rejects(complete(db,j,[]),/invalid comparison output/)
  await assert.rejects(complete(db,j,{oversized:'x'.repeat(2097152)}),/invalid comparison output/)
})

test('browser roles and direct worker mutations cannot bypass the API; retained history rejects owner DML',async t=>{
  const db=await fixture(t)
  const roles=(await db.query("select r,has_schema_privilege(r,'comparison_qualification','usage') usage,has_function_privilege(r,'comparison_qualification.claim()','execute') callable from unnest(array['anon','authenticated']) r")).rows
  assert.ok(roles.every(x=>!x.usage&&!x.callable))
  const tables=(await db.query("select c.relname,c.relrowsecurity,has_table_privilege('service_role',c.oid,'insert') ins,has_table_privilege('service_role',c.oid,'update') upd,has_table_privilege('service_role',c.oid,'delete') del from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='comparison_qualification' and c.relkind='r'")).rows
  assert.equal(tables.length,4);assert.ok(tables.every(x=>x.relrowsecurity&&!x.ins&&!x.upd&&!x.del))
  await enqueue(db,inputs());const j=await claim(db);await complete(db,j,{claims:[]})
  await assert.rejects(db.exec("update comparison_qualification.jobs set state='completed'"),/permission denied/)
  await assert.rejects(db.exec("delete from comparison_qualification.outputs"),/permission denied/)
  await db.exec('reset role')
  for(const table of ['generations','outputs']){
    await assert.rejects(db.exec('delete from comparison_qualification.'+table),/immutable/)
    await assert.rejects(db.exec('truncate comparison_qualification.'+table+' cascade'),/immutable/)
  }
  const functions=(await db.query("select proconfig from pg_proc where pronamespace='comparison_qualification'::regnamespace")).rows
  assert.ok(functions.every(f=>f.proconfig.includes('search_path=""')))
})

test('crashed leases back off, exhaust after three attempts and never acknowledge retained input',async t=>{
  const db=await fixture(t), id=await enqueue(db,inputs()), first=await claim(db)
  await db.exec("reset role;update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '1 second';set role service_role")
  assert.equal(await claim(db),null,'expired first attempt must wait for backoff')
  await assert.rejects(complete(db,first,{claims:[]}),/expired/)
  const sibling=await enqueue(db,{independent:true},'independent-source'), other=await claim(db)
  assert.equal(other.generation_id,sibling,'backoff cannot block unrelated work')
  assert.equal(await complete(db,other,{claims:[]}),'completed')
  async function age(seconds){
    await db.exec('reset role')
    await db.query("update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-make_interval(secs=>$1) where generation_id=$2",[seconds,id])
    await db.exec('set role service_role')
  }
  await age(31);const second=await claim(db)
  assert.equal(second.generation_id,id);assert.notEqual(second.lease_token,first.lease_token)
  await age(31);assert.equal(await claim(db),null,'second backoff is sixty seconds')
  await age(61);const third=await claim(db)
  assert.notEqual(third.lease_token,second.lease_token)
  await age(1)
  assert.equal(await claim(db),null,'exhausted generation must not get a fourth attempt')
  const row=(await db.query('select state,attempt,lease_token,lease_expires_at,failure_code from comparison_qualification.jobs where generation_id=$1',[id])).rows[0]
  assert.deepEqual(row,{state:'failed',attempt:3,lease_token:null,lease_expires_at:null,failure_code:'lease_attempts_exhausted'})
  for(const lease of [first,second,third]) await assert.rejects(complete(db,lease,{claims:[]}),/lease/)
  assert.equal(await enqueue(db,inputs()),id,'enqueue replay cannot reset the attempt budget')
  assert.equal(await claim(db),null)
  assert.equal((await db.query('select count(*)::int n from comparison_qualification.outputs where generation_id=$1',[id])).rows[0].n,0)
  assert.equal((await db.query('select input_payload::text value from comparison_qualification.generations where id=$1',[id])).rows[0].value,first.input_text)
  const late=await enqueue(db,{correction:true})
  assert.equal((await claim(db)).generation_id,late)
})

test('job state constraints reject partial leases and terminal failure forgery',async t=>{
  const db=await fixture(t);await enqueue(db,inputs())
  await db.exec('reset role')
  for(const assignment of [
    "lease_token=gen_random_uuid()",
    "lease_expires_at=clock_timestamp()",
    "state='failed'",
    "failure_code='lease_attempts_exhausted'",
    "attempt=4"
  ]) await assert.rejects(db.exec('update comparison_qualification.jobs set '+assignment),/check constraint/)
})

const fail=(db,j)=>db.query('select comparison_qualification.fail($1,$2,$3,$4) state',
  [j.generation_id,j.lease_token,j.input_hash,j.implementation_ref]).then(r=>r.rows[0].state)

test('explicit failure is retained atomically, replay is stable and independent generations continue',async t=>{
  const db=await fixture(t), id=await enqueue(db,inputs()), j=await claim(db)
  const sibling=await enqueue(db,{independent:true})
  assert.equal(await fail(db,j),'failed')
  const before=(await db.query('select * from comparison_qualification.failure_reports')).rows
  assert.equal(before.length,1)
  assert.equal(before[0].generation_id,id)
  assert.equal(before[0].input_hash,j.input_hash)
  assert.equal(before[0].implementation_ref,j.implementation_ref)
  assert.equal(before[0].lease_token,j.lease_token)
  assert.equal(before[0].attempt,1)
  assert.equal(before[0].failure_code,'worker_reported_failure')
  assert.equal(await fail(db,j),'failed')
  assert.deepEqual((await db.query('select * from comparison_qualification.failure_reports')).rows,before)
  assert.equal(await enqueue(db,inputs()),id)
  await assert.rejects(complete(db,j,{claims:[]}),/lease/)
  assert.equal((await db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,0)
  const other=await claim(db);assert.equal(other.generation_id,sibling)
  assert.equal(await complete(db,other,{claims:[]}),'completed')
  assert.equal(await claim(db),null)
})

test('failure rejects foreign bindings, expired or replaced leases, completed jobs and failure conflicts',async t=>{
  const db=await fixture(t);await enqueue(db,inputs());const old=await claim(db)
  for(const changed of [{input_hash:null},{implementation_ref:'foreign'},{lease_token:null},{generation_id:'00000000-0000-0000-0000-000000000000'}]){
    await assert.rejects(fail(db,{...old,...changed}))
  }
  await db.exec("reset role;update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '31 seconds';set role service_role")
  await assert.rejects(fail(db,old),/lease/)
  const current=await claim(db)
  await assert.rejects(fail(db,old),/lease/)
  assert.equal(await fail(db,current),'failed')
  await assert.rejects(fail(db,old),/conflict/)
  await enqueue(db,{other:true});const other=await claim(db)
  await complete(db,other,{claims:[]})
  await assert.rejects(fail(db,other),/lease/)
  assert.equal((await db.query('select count(*)::int n from comparison_qualification.failure_reports')).rows[0].n,1)
})

test('failure rollback retains active lease and leaves no durable report',async t=>{
  const db=await fixture(t);await enqueue(db,inputs());const j=await claim(db)
  await db.exec(`reset role;
    create function comparison_qualification.fixture_fail_report() returns trigger language plpgsql as $$
    begin if new.state='failed' then raise exception 'injected report failure';end if;return new;end $$;
    create trigger fixture_failure before update on comparison_qualification.jobs
      for each row execute function comparison_qualification.fixture_fail_report();
    set role service_role;`)
  await assert.rejects(fail(db,j),/injected report failure/)
  assert.equal((await db.query('select count(*)::int n from comparison_qualification.failure_reports')).rows[0].n,0)
  assert.equal((await state(db))[0].lease_token,j.lease_token)
  assert.equal((await state(db))[0].state,'processing')
  await db.exec('reset role;drop trigger fixture_failure on comparison_qualification.jobs;set role service_role')
  assert.equal(await complete(db,j,{claims:[]}),'completed')
})

test('failure report API denies browser access and immutable history denies worker and owner rewrites',async t=>{
  const db=await fixture(t);await enqueue(db,inputs());const j=await claim(db);await fail(db,j)
  for(const role of ['anon','authenticated']){
    await db.exec('reset role;set role '+role)
    await assert.rejects(fail(db,j),/permission denied/)
    await assert.rejects(db.exec('select * from comparison_qualification.failure_reports'),/permission denied/)
  }
  await db.exec('reset role;set role service_role')
  await assert.rejects(db.exec('delete from comparison_qualification.failure_reports'),/permission denied/)
  await db.exec('reset role')
  for(const action of ["update comparison_qualification.failure_reports set attempt=2",
    'delete from comparison_qualification.failure_reports','truncate comparison_qualification.failure_reports']){
    await assert.rejects(db.exec(action),/immutable/)
  }
})
