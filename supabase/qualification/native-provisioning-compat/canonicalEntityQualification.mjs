// Owned synthetic entities only. Customer installed the real adapter/trigger.
// Provider sessions below exercise protected owner semantics, never perform
// customer provisioning or represent separately authenticated runtime coverage.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {ENTITY_CATALOG_SQL} from './canonicalEntity.mjs'
const pause=()=>new Promise(r=>setTimeout(r,20))
export async function qualifyCanonicalEntity({provider,connect}){
 const id=randomUUID(),missing=randomUUID()
 const client=()=>connect('supabase_admin',process.env.MIP_COMPAT_ADMIN_PASSWORD)
 const digest=async c=>{
  await c.query('set role mip_mentions_owner')
  try{return (await c.query('select mip_mentions.canonical_entity_digest($1) digest',[id])).rows[0].digest}
  finally{await c.query('reset role')}
 }
 await provider.query("insert into public.entities(id,canonical_name,normalized_name,entity_type,aliases) values($1,'Fixture','fixture','person',array['fixture'])",[id])
 try{
  const initial=await digest(provider)
  const expected=(await provider.query("select encode(sha256(convert_to(jsonb_build_object('id',id,'canonical_name',canonical_name,'normalized_name',normalized_name,'type',entity_type,'aliases',aliases)::text,'UTF8')),'hex') digest from public.entities where id=$1",[id])).rows[0].digest
  assert.equal(initial,expected);assert.equal(await digest(provider),initial)
  await provider.query('begin');await provider.query('set local role mip_mentions_owner')
  await assert.rejects(()=>provider.query('select mip_mentions.canonical_entity_digest($1)',[missing]),e=>e.code==='P0001'&&e.message==='canonical_entity_unavailable')
  await provider.query('rollback')
  await provider.query('begin');await provider.query('set local role mip_mentions_gateway')
  await assert.rejects(()=>provider.query('select mip_mentions.canonical_entity_digest($1)',[id]),e=>e.code==='42501')
  await provider.query('rollback')
  for(const column of ['entity_type','canonical_name','normalized_name','aliases']){
   await provider.query('begin')
   const sql=column==='aliases'?"update public.entities set aliases=array['changed'] where id=$1":"update public.entities set "+column+"='changed' where id=$1"
   await provider.query(sql,[id])
   assert.notEqual(await digest(provider),initial)
   await provider.query('rollback')
   assert.equal(await digest(provider),initial)
  }
  const reader=await client(),writer=await client()
  let pending
  try{
   const rp=(await reader.query('select pg_backend_pid() p')).rows[0].p
   const wp=(await writer.query('select pg_backend_pid() p')).rows[0].p
   await reader.query('begin');await reader.query('set local role mip_mentions_owner')
   await reader.query('select mip_mentions.lock_policy()')
   assert.equal((await reader.query('select mip_mentions.canonical_entity_digest($1) digest',[id])).rows[0].digest,initial)
   await writer.query('begin')
   pending=writer.query("update public.entities set entity_type='organization' where id=$1",[id])
   // Observe the actual blocker, not a timeout. Failure branch drains the query.
   pending.catch(()=>{})
   let blocked=false
   for(let i=0;i<150;i++){
    blocked=(await provider.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[wp,rp])).rows[0].blocked
    if(blocked)break
    await pause()
   }
   assert.equal(blocked,true)
   assert.equal((await reader.query('select mip_mentions.canonical_entity_digest($1) digest',[id])).rows[0].digest,initial)
   await reader.query('commit');await pending;pending=null
   await writer.query('commit')
   assert.notEqual(await digest(provider),initial)
  }finally{
   await reader.query('rollback').catch(()=>{});await writer.query('rollback').catch(()=>{})
   if(pending)await pending.catch(()=>{})
   await reader.end();await writer.end()
  }
  assert.equal((await provider.query(ENTITY_CATALOG_SQL)).rows[0].ok,true)
 }finally{
  await provider.query('reset role');await provider.query('rollback').catch(()=>{})
  await provider.query('delete from public.entities where id=$1',[id])
 }
}
