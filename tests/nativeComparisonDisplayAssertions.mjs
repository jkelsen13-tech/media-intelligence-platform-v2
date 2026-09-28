// Runs only inside the parent's existing disposable full native/comparison PG fixture.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDisplay,buildPrivateWorkspace} from '../supabase/qualification/native-comparison-display/displayContract.mjs';
import {readNativeComparisonDisplay} from '../supabase/qualification/native-comparison-display/serverRoute.mjs';
const SQL='select mip_native_display.read_current($1,$2,$3,$4,$5) result';
const exactError=e=>['P0001','42501','57014'].includes(e?.code);
export async function assertNativeComparisonDisplay(fx){
 assert.equal(fx.syntheticFixture,true);
 const {db,reviewer,gateway,outsider,worker,binding,broker,connection}=fx;
 const expected={scope:binding.scope,binding_id:binding.binding_id,manifest_hash:binding.manifest_hash};
 const args=[expected.scope,expected.binding_id,expected.manifest_hash,broker.session,broker.runtime];
 const read=async(client=reviewer,values=args)=>(await client.query(SQL,values)).rows[0].result;
 const source=await readFile(new URL('../supabase/qualification/native-comparison-display/001_private_display.sql',import.meta.url),'utf8');
 const begin=source.indexOf('do $native_display_final$'),end=source.indexOf('end $native_display_final$;',begin);
 assert.ok(begin>0&&end>begin);
 const final=source.slice(begin,end+'end $native_display_final$;'.length);
 let checks=0;
 async function check(body){
  const stage=++checks;
  try{await body()}catch(e){
   const code=/^[A-Z0-9]{5}$/.test(e?.code??'')?e.code:'NONE';
   const frames=String(e?.stack??'').split('\n').slice(1).flatMap(line=>{
    const m=line.match(/nativeComparisonDisplayAssertions\.mjs:(\d{1,6}):(\d{1,6})/);return m?[m[0]]:[]}).slice(0,3);
   throw Error('native_display_check_'+stage+' SQLSTATE='+code+' '+frames.join(' '));
  }
 }
 let result;
 await check(async()=>{
  result=validateDisplay(await read(),expected);
  assert.deepEqual(validateDisplay(await read(),expected),result);
  assert.equal(result.identity.native_generation_id,binding.native_generation_id);
  assert.equal(result.identity.comparison_generation_id,binding.comparison_generation_id);
  assert.ok(result.comparison.evidence.every(e=>Array.from(e.excerpt).length===e.span_end-e.span_start));
  assert.ok(result.comparison.explanations.length>0);
  if(fx.forbiddenBodySentinel)assert.equal(JSON.stringify(result).includes(fx.forbiddenBodySentinel),false);
  const model=buildPrivateWorkspace(result,expected);
  assert.equal(model.timeline.identity_kind,'private_news_record');assert.equal(model.timeline.event_occurrence.start,null);
  assert.equal(model.arc.identity_kind,'private_projection');
 });
 await check(async()=>{
  for(const client of [outsider,worker])await assert.rejects(read(client),exactError);
  for(const client of [gateway,reviewer,outsider,worker]){
   await assert.rejects(client.query('select mip_native_display.accepted_event($1,$2,$3::jsonb)',[broker.session,broker.runtime,'{}']),e=>e.code==='42501');
   await assert.rejects(client.query('select mip_identity.read_isolated_comparison($1,$2,$3)',[broker.session,broker.runtime,result.identity.release_request]),e=>e.code==='42501');
   await assert.rejects(client.query('select manifest from mip_native_comparison.bindings'),e=>e.code==='42501');
  }
  await assert.rejects(read(reviewer,[args[0],args[1],'0'.repeat(64),args[3],args[4]]),exactError);
  await assert.rejects(read(reviewer,[args[0],args[1],args[2],'00000000-0000-4000-8000-000000009999',args[4]]),exactError);
  await assert.rejects(read(reviewer,[args[0],args[1],args[2],args[3],args[4]+'-wrong']),exactError);
 });
 await check(async()=>{
  // Callbacks change actual current authority in the supplied reader transaction;
  // they must not replace validators or merely induce a lock timeout.
  for(const callback of [fx.withRevokedComparisonSession,fx.withRevokedNativeAccess,fx.withInvalidatedComparison,fx.withRevokedBinding]){
   assert.equal(typeof callback,'function');
   await callback(async client=>assert.rejects(read(client??reviewer),e=>e.code==='P0001'));
  }
  assert.deepEqual(validateDisplay(await read(),expected),result);
 });
 await check(async()=>{
  assert.equal(typeof fx.withFinalBoundary,'function');
  await fx.withFinalBoundary(async boundary=>{
   // The real synthetic LOGIN→worker edges have been revoked in this actual
   // transaction; the outer callback rolls back and checks exact restoration.
   await boundary.query(final);
   assert.equal((await boundary.query("select count(*)::integer n from pg_class where relnamespace='mip_native_display'::regnamespace")).rows[0].n,0);
   for(const drift of [
    "grant execute on function mip_native_display.accepted_event(uuid,text,jsonb) to mip_mentions_gateway",
    "grant create on schema mip_native_display to mip_mentions_gateway",
    "alter function mip_native_display.read_current(uuid,uuid,text,uuid,text) security invoker"
   ]){
    await boundary.query('savepoint display_boundary_drift');let failure;
    try{await boundary.query(drift);await assert.rejects(boundary.query(final),e=>e.code==='P0001')}
    catch(e){failure=e}
    finally{
     try{await boundary.query('rollback to savepoint display_boundary_drift');await boundary.query('release savepoint display_boundary_drift')}
     catch{throw Error('native_display_drift_cleanup')}
    }
    if(failure)throw failure;
   }
   await boundary.query(final);
  });
 });
 await check(async()=>{
  assert.ok(connection);
  const previous=process.env.MIP_DISPOSABLE_POSTGRES;process.env.MIP_DISPOSABLE_POSTGRES='qik-native-caller';
  try{
   const output=await readNativeComparisonDisplay({connection,request:{...expected,broker}});
   assert.equal(output.state,'current_private_display');assert.equal(output.connection_closed,true);
   assert.deepEqual(output.display,result);assert.deepEqual(output.diagnostics,[]);
   const rejected=await readNativeComparisonDisplay({connection,request:{...expected,manifest_hash:'0'.repeat(64),broker}});
   assert.equal(rejected.state,'display_unavailable');assert.equal(rejected.display,null);
   assert.equal(rejected.connection_closed,true);assert.deepEqual(rejected.diagnostics,['read_failed']);
   // No secret, driver detail, source excerpt or connection string in refusal.
   assert.deepEqual(Object.keys(rejected).sort(),['state','display','connection_closed','diagnostics','publication_allowed','attachment_allowed'].sort());
  }finally{if(previous===undefined)delete process.env.MIP_DISPOSABLE_POSTGRES;else process.env.MIP_DISPOSABLE_POSTGRES=previous}
 });
 return {checks,publication_allowed:false,attachment_allowed:false};
}
