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
  await db.exec("reset role;update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '1 second';set role service_role")
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
  assert.equal(tables.length,3);assert.ok(tables.every(x=>x.relrowsecurity&&!x.ins&&!x.upd&&!x.del))
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
