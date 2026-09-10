import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {runEventProjection} from '../supabase/runtime-snapshots/source-comparison-run-v16/lib.js'
import {comparisonProjectionConfig} from '../supabase/runtime-snapshots/source-comparison-run-v16/projectionConfig.js'
const read=path=>readFile(new URL(path,import.meta.url),'utf8')
const contract=await read('../supabase/qualification/comparison-generations/contract.sql')
const source=await read('../supabase/qualification/comparison-generations/source-snapshot.sql')
const fixtureSql=await read('../supabase/qualification/comparison-generations/source-fixture.sql')
const lexicon=JSON.parse(await read('../supabase/runtime-snapshots/source-comparison-run-v16/loadedLanguageLexicon.json'))
const impl='qualification:snapshot-v1'
async function fixture(t){
 const db=await PGlite.create();t.after(()=>db.close())
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
 await db.exec(contract);await db.exec(fixtureSql);await db.exec(source);await db.exec('set role service_role')
 return db
}
const capture=(db,l=lexicon,i=impl)=>db.query('select comparison_qualification.capture_source($1::jsonb,$2) id',[JSON.stringify(l),i]).then(r=>r.rows[0].id)
const snapshot=db=>db.query('select comparison_qualification.source_snapshot($1::jsonb,$2) value',[JSON.stringify(lexicon),impl]).then(r=>r.rows[0].value)

test('capture retains exact selected rows, metadata and usable projection input without numeric reserialization',async t=>{
 const db=await fixture(t), id=await capture(db)
 const raw=(await db.query('select input_payload::text value from comparison_qualification.generations where id=$1',[id])).rows[0].value
 assert.match(raw,/9007199254740993/);assert.match(raw,/0.123456789012345678/)
 assert.match(raw,/00:00:00.123456\+00:00/)
 const input=JSON.parse(raw)
 assert.equal(input.eventInputs.length,1);assert.equal(input.eventInputs[0].members.length,2)
 assert.equal(input.eventInputs[0].event.occurred_at_start,'2026-01-01')
 assert.equal(input.eventInputs[0].members[0].membership.membership_method,'reviewed')
 assert.deepEqual(input.lexicon,lexicon);assert.equal(input.implementation_ref,impl)
 const output=runEventProjection(input.eventInputs,comparisonProjectionConfig(input.configRows),input.lexicon)
 assert.ok(output.claims.length>0)
 const job=(await db.query('select comparison_qualification.claim() value')).rows[0].value
 assert.equal(job.generation_id,id);assert.equal(job.input_text,raw)
 assert.equal((await db.query('select comparison_qualification.complete($1,$2,$3,$4,$5::jsonb) value',
 [id,job.lease_token,job.input_hash,impl,JSON.stringify(output)])).rows[0].value,'completed')
})

test('later source, membership and configuration changes create independent retained input and preserve the old generation',async t=>{
 const db=await fixture(t),first=await capture(db)
 const before=(await db.query('select input_payload::text value from comparison_qualification.generations where id=$1',[first])).rows[0].value
 await db.exec("reset role;update public.articles set summary='Corrected';update public.event_articles set membership_method='revised';update public.pipeline_config set value='0.7';set role service_role")
 const later=await capture(db);assert.notEqual(later,first)
 const input=(await db.query('select input_payload from comparison_qualification.generations where id=$1',[later])).rows[0].input_payload
 assert.equal(input.eventInputs[0].members[0].article.summary,'Corrected')
 assert.equal(input.eventInputs[0].members[0].membership.membership_method,'revised')
 assert.equal(input.configRows[0].value,0.7)
 assert.equal((await db.query('select input_payload::text value from comparison_qualification.generations where id=$1',[first])).rows[0].value,before)
 assert.equal((await db.query("select count(*)::int n from comparison_qualification.jobs where state='pending'")).rows[0].n,2)
})

test('snapshot applies existing approval, timeline and distinct-outlet eligibility without manufacturing empty evidence',async t=>{
 const db=await fixture(t)
 for(const sql of ["update public.events set comparison_validation_state='pending_review'",
 "update public.events set comparison_validation_state='approved',status='timeline_only'",
 "update public.events set status='active';update public.articles set outlet='same'"]){
  await db.exec('reset role;'+sql+';set role service_role')
  assert.deepEqual((await snapshot(db)).eventInputs,[])
 }
 await db.exec("reset role;delete from public.pipeline_config;set role service_role")
 assert.deepEqual((await snapshot(db)).configRows,[])
 assert.deepEqual(comparisonProjectionConfig((await snapshot(db)).configRows),{groupFloor:0.6})
})

test('capture is atomic, bounded, browser-denied and does not imply config validity or evaluated authority',async t=>{
 const db=await fixture(t)
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role);await assert.rejects(capture(db),/permission denied/)
 }
 await db.exec('reset role;set role service_role')
 await assert.rejects(capture(db,[]),/snapshot binding/)
 await assert.rejects(capture(db,lexicon,''),/snapshot binding/)
 await assert.rejects(capture(db,{oversized:'x'.repeat(2097152)}),/check constraint/)
 assert.equal((await db.query('select count(*)::int n from comparison_qualification.generations')).rows[0].n,0)
 await db.exec("reset role;update public.pipeline_config set value='null';set role service_role")
 assert.throws(()=>comparisonProjectionConfig([{key:'claim_group_confidence_floor',value:null}]))
 assert.equal((await snapshot(db)).configRows[0].value,null,'malformed config is retained exactly, not silently repaired')
 await db.exec('begin');await capture(db);await db.exec('rollback')
 assert.equal((await db.query('select count(*)::int n from comparison_qualification.jobs')).rows[0].n,0)
})
