// Synthetic paged snapshot mechanism fixtures, not material or semantic qualification.
import test from 'node:test'
import assert from 'node:assert/strict'
import {recordPagedBootstrap,validateBootstrapCoverage,bootstrapKey,bootstrapPageKey,recordBootstrappedPgoutputBatch} from '../supabase/qualification/hypothesis-assessments/temporalBootstrap.mjs'
import {epoch,frames} from './hypothesisPgoutputFixture.mjs'
const context={source_id:epoch,stream_epoch:epoch},input={consistent_lsn:'0/10',snapshot_id:'00000003-000000AA-1'}
const row=i=>({revision_id:'00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),transaction_epoch:null,creator_xid:null})
function fixture(rows){
 const entries=new Map()
 const journal={putOnce:async(k,v)=>{const text=JSON.stringify(v);if(entries.has(k)&&entries.get(k)!==text)throw Error('synthetic_conflict');entries.set(k,text);return {committed:true}},
  get:async k=>entries.has(k)?JSON.parse(entries.get(k)):null}
 const withSnapshot=async(id,consume)=>{let at=0;await consume(async n=>{const page=rows.slice(at,at+n);at+=page.length;return page});return {snapshot_id:id,read_transaction_completed:true}}
 return {entries,options:{context,observationEpoch:epoch,input,journal,withSnapshot,pageSize:2}}
}
test('paged snapshot exceeds old single-envelope bound without truncation and validates a late-page overlap',async()=>{
 const f=fixture(Array.from({length:100001},(_,i)=>row(i+1)));f.options.pageSize=10000
 const result=await recordPagedBootstrap(f.options)
 assert.equal(result.revisions,100001);assert.equal(result.pages,11)
 const validated=await validateBootstrapCoverage({...f.options,revisionIds:[row(100001).revision_id]})
 assert.equal(validated.revisions,100001);assert.equal(validated.overlap,true)
 assert.equal((await recordPagedBootstrap(f.options)).hash,result.hash)
})
test('paged capture preserves null and foreign transaction provenance and exact empty baseline',async()=>{
 const rows=[row(1),{...row(2),transaction_epoch:'22222222-2222-4222-8222-222222222222',creator_xid:'9'}],f=fixture(rows)
 await recordPagedBootstrap(f.options)
 const page=await f.options.journal.get(bootstrapPageKey(context,0))
 assert.deepEqual(page.bootstrap.rows.map(r=>r.provenance),['transaction_not_established','foreign_transaction_epoch'])
 const empty=fixture([]),result=await recordPagedBootstrap(empty.options)
 assert.equal(result.revisions,0);assert.equal(result.pages,0)
 assert.equal((await validateBootstrapCoverage(empty.options)).overlap,false)
})
test('interrupted or unconfirmed read transaction retains pages without completing a bootstrap manifest',async()=>{
 for(const kind of ['error','incomplete','wrong_snapshot','not_entered']){
  const f=fixture([row(1),row(2),row(3)]),reader=f.options.withSnapshot
  f.options.withSnapshot=async(id,consume)=>{
   if(kind==='not_entered')return {snapshot_id:id,read_transaction_completed:true}
   if(kind==='error'){let calls=0;await consume(async()=>{if(calls++)throw Error('synthetic_reader_terminated');return [row(1)]})}
   const done=await reader(id,consume)
   return {...done,read_transaction_completed:kind!=='incomplete',snapshot_id:kind==='wrong_snapshot'?'synthetic-wrong':id}
  }
  await assert.rejects(()=>recordPagedBootstrap(f.options))
  assert.equal(await f.options.journal.get(bootstrapKey(context)),null)
  if(kind!=='not_entered')assert.ok(f.entries.size>0)
 }
})
test('duplicate, reordered or overlapping pages deny a manifest rather than fabricating equivalence',async()=>{
 for(const rows of [[row(2),row(1)],[row(1),row(2),row(2)],[row(1),row(3),row(2)]]){
  const f=fixture(rows);await assert.rejects(()=>recordPagedBootstrap(f.options))
  assert.equal(await f.options.journal.get(bootstrapKey(context)),null)
 }
})
test('missing, changed, reordered and truncated page chains cannot acknowledge a stream',async()=>{
 for(const kind of ['missing','changed','reordered','truncated','count']){
  const f=fixture([row(1),row(2),row(3)]);await recordPagedBootstrap(f.options)
  const key=bootstrapKey(context),p0=bootstrapPageKey(context,0),p1=bootstrapPageKey(context,1)
  if(kind==='missing')f.entries.delete(p1)
  if(kind==='changed'){const v=JSON.parse(f.entries.get(p1));v.bootstrap.rows[0].creator_xid='8';f.entries.set(p1,JSON.stringify(v))}
  if(kind==='reordered'){const v=f.entries.get(p0);f.entries.set(p0,f.entries.get(p1));f.entries.set(p1,v)}
  if(kind==='truncated'){const v=JSON.parse(f.entries.get(key));v.page_count=0;v.row_count=0;v.last_page_hash=null;f.entries.set(key,JSON.stringify(v))}
  if(kind==='count'){const v=JSON.parse(f.entries.get(key));v.row_count++;f.entries.set(key,JSON.stringify(v))}
  let acknowledged=false
  await assert.rejects(()=>recordBootstrappedPgoutputBatch({...f.options,frames:frames(),relationId:'42',acknowledge:async()=>{acknowledged=true}}))
  assert.equal(acknowledged,false)
 }
})
test('page writes and final manifest both require committed exact readback',async()=>{
 for(const target of ['page','manifest']){
  const f=fixture([row(1)]),old=f.options.journal
  f.options.journal={get:old.get,putOnce:async(k,v)=>{await old.putOnce(k,v);return {committed:target==='page'?!k.includes(':page:'):k.includes(':page:')}}}
  await assert.rejects(()=>recordPagedBootstrap(f.options),/mip_bootstrap_not_durable/)
 }
})
