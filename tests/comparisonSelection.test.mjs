import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const root='../supabase/qualification/comparison-generations/'
const contract=await readFile(new URL(root+'contract.sql',import.meta.url),'utf8')
const selection=await readFile(new URL(root+'selection.sql',import.meta.url),'utf8')
async function fixture(t){
 const db=await PGlite.create();t.after(()=>db.close())
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
 await db.exec(contract);await db.exec(selection);await db.exec('set role service_role')
 return db
}
async function output(db,source='source',payload={claims:[]}){
 await db.query("select comparison_qualification.enqueue($1,$2::jsonb,'fixture','2026-01-01')",[source,JSON.stringify({version:randomUUID()})])
 const j=(await db.query('select comparison_qualification.claim() j')).rows[0].j
 await db.query('select comparison_qualification.complete($1,$2,$3,$4,$5::jsonb)',[j.generation_id,j.lease_token,j.input_hash,j.implementation_ref,JSON.stringify(payload)])
 return (await db.query('select generation_id,output_hash from comparison_qualification.outputs where generation_id=$1',[j.generation_id])).rows[0]
}
const select=(db,id,previous,out,context='{}',source='source')=>db.query(
 'select comparison_qualification.select_output($1,$2,$3,$4,$5,$6::jsonb) id',
 [id,source,previous,out?.generation_id??null,out?.output_hash??null,context]).then(r=>r.rows[0].id)
const head=db=>db.query("select selection_id from comparison_qualification.selection_heads where source_project='source'").then(r=>r.rows[0]?.selection_id)
test('selection binds exact output; replacement, withdrawal and old retry preserve every version',async t=>{
 const db=await fixture(t),a=await output(db),b=await output(db),first=randomUUID(),second=randomUUID(),withdraw=randomUUID()
 const precise='{"quantity":9007199254740993,"observed":"2026-01-01 00:00:00.123456+00","publication":"not-authorized"}'
 assert.equal(await select(db,first,null,a,precise),first)
 assert.equal(await select(db,second,first,b),second)
 assert.equal(await select(db,withdraw,second,null),withdraw)
 assert.equal(await select(db,first,null,a,precise),first)
 assert.equal(await head(db),withdraw,'old receipt retry cannot restore withdrawn output')
 const history=(await db.query("select id,generation_id,context_payload->>'quantity' quantity,context_payload->>'observed' observed from comparison_qualification.selection_history")).rows
 assert.equal(history.length,3)
 assert.equal(history.find(x=>x.id===first).quantity,'9007199254740993')
 assert.equal(history.find(x=>x.id===first).observed,'2026-01-01 00:00:00.123456+00')
 assert.equal(history.find(x=>x.id===withdraw).generation_id,null)
 assert.equal((await db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,2)
})
test('stale predecessors, foreign sources, wrong hashes and conflicting retries fail without moving head',async t=>{
 const db=await fixture(t),a=await output(db),foreign=await output(db,'foreign'),first=randomUUID()
 await select(db,first,null,a)
 await assert.rejects(select(db,randomUUID(),null,a),/stale/)
 await assert.rejects(select(db,randomUUID(),first,foreign),/unbound/)
 await assert.rejects(select(db,randomUUID(),first,{...a,output_hash:'0'.repeat(64)}),/unbound/)
 await assert.rejects(select(db,first,null,a,'{"changed":true}'),/retry conflict/)
 await assert.rejects(select(db,first,null,a,'{}','foreign'),/retry conflict/)
 const pending=(await db.query("select comparison_qualification.enqueue('source','{}','fixture','2026-01-01') id")).rows[0].id
 await assert.rejects(select(db,randomUUID(),first,{generation_id:pending,output_hash:'0'.repeat(64)}),/unbound/)
 assert.equal(await head(db),first)
 assert.equal((await db.query('select count(*)::int n from comparison_qualification.selection_history')).rows[0].n,1)
})
test('selection failure rolls back its history and pointer together; malformed context cannot create a head',async t=>{
 const db=await fixture(t),a=await output(db)
 for(const context of ['null','[]',JSON.stringify({oversized:'x'.repeat(2097152)})]){
  await assert.rejects(select(db,randomUUID(),null,a,context),/invalid/)
 }
 assert.equal(await head(db),undefined)
 await db.exec("reset role; create function comparison_qualification.inject_failure() returns trigger language plpgsql as $$ begin raise exception 'injected head failure';end $$; create trigger inject_failure before update on comparison_qualification.selection_heads for each row execute function comparison_qualification.inject_failure();set role service_role")
 await assert.rejects(select(db,randomUUID(),null,a),/injected head failure/)
 assert.equal(await head(db),undefined)
 assert.equal((await db.query('select count(*)::int n from comparison_qualification.selection_history')).rows[0].n,0)
})
test('selection has no browser access or direct worker DML; owner history rewrites are rejected',async t=>{
 const db=await fixture(t),a=await output(db),id=randomUUID();await select(db,id,null,a)
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role)
  await assert.rejects(select(db,randomUUID(),id,null),/permission denied/)
  await assert.rejects(db.exec('select * from comparison_qualification.selection_history'),/permission denied/)
 }
 await db.exec('reset role;set role service_role')
 for(const table of ['selection_history','selection_heads']) await assert.rejects(db.exec('delete from comparison_qualification.'+table),/permission denied/)
 await db.exec('reset role')
 for(const statement of ['delete from comparison_qualification.selection_history','update comparison_qualification.selection_history set context_payload=\'{}\'','truncate comparison_qualification.selection_history cascade']) await assert.rejects(db.exec(statement),/immutable/)
 const rows=(await db.query("select relrowsecurity from pg_class where oid in ('comparison_qualification.selection_history'::regclass,'comparison_qualification.selection_heads'::regclass)")).rows
 assert.ok(rows.every(x=>x.relrowsecurity))
 const f=(await db.query("select prosecdef,proconfig from pg_proc where oid='comparison_qualification.select_output(uuid,text,uuid,uuid,text,jsonb)'::regprocedure")).rows[0]
 assert.equal(f.prosecdef,true);assert.ok(f.proconfig.includes('search_path=""'))
})
