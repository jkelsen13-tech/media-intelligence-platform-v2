// Synthetic transport-contract tests, NOT a PostgreSQL/hosted qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {callNativeComparisonBinding} from '../supabase/qualification/native-comparison-binding/serverCaller.mjs';

const id=n=>'d9500000-0000-4000-8000-'+String(n).padStart(12,'0');
const secret='SYNTHETIC_DRIVER_SECRET_SENTINEL';
const connection={connectionString:'postgresql://binding_reviewer:'+secret+'@127.0.0.1:5432/postgres',
 expectedLogin:'binding_reviewer',sessionPoolerHost:null,disposable:true};
const request={action:'admit',scope:id(1),binding_id:id(2),projection_id:id(3),
 dependency_hash:'a'.repeat(64),display_hash:'b'.repeat(64),private_review_id:id(4),
 release_request:id(5),event_id:id(6),native_generation_id:id(7),comparison_generation_id:id(8),
 broker:{session:id(9),runtime:'synthetic-binding-runtime'}};
const wire={contract:'native-comparison-binding-receipt-v1',scope:id(1),binding_id:id(2),
 manifest_hash:'c'.repeat(64),native_generation_id:id(7),comparison_generation_id:id(8),
 state:'bound_private',publication_allowed:false,attachment_allowed:false};
const settings={log_statement:'none',log_min_duration_statement:'-1',log_min_duration_sample:'-1',
 log_transaction_sample_rate:'0',log_parameter_max_length_on_error:'0',statement_timeout:'1000'};
const error=()=>Object.assign(Error(secret),{code:'P0001',detail:secret,where:secret,cause:Error(secret)});
async function fixture(t,options={}){
 const old=process.env.MIP_DISPOSABLE_POSTGRES;process.env.MIP_DISPOSABLE_POSTGRES='qik-native-caller';
 t.after(()=>{if(old===undefined)delete process.env.MIP_DISPOSABLE_POSTGRES;else process.env.MIP_DISPOSABLE_POSTGRES=old});
 const connections=[],calls=[],numbers=new WeakMap();let admitted=false;
 const number=client=>{if(!numbers.has(client)){numbers.set(client,connections.length);connections.push(client)}return numbers.get(client)};
 t.mock.method(pg.Client.prototype,'connect',async function(){number(this);if(options.connectFailure)throw error()});
 t.mock.method(pg.Client.prototype,'end',async function(){calls.push({n:number(this),kind:'close'});if(options.closeFailure)throw error()});
 t.mock.method(pg.Client.prototype,'query',async function(sql,args){
  const n=number(this);calls.push({n,sql,args});
  if(sql==="set statement_timeout='1000ms'")return {rows:[]};
  if(sql.includes('r.rolname = session_user'))return {rows:[{login:connection.expectedLogin,effective:connection.expectedLogin,
   rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false}]};
  if(sql.startsWith('select name,setting from pg_settings'))return {rows:Object.entries(settings).map(([name,setting])=>({name,setting}))};
  if(sql.includes("pg_has_role(session_user,'mip_mentions_gateway'"))return {rows:[{gateway:!options.noGateway,extra_membership:options.extraMembership===true}]};
  if(sql==='begin isolation level read committed')return {rows:[]};
  if(sql==='rollback'){if(options.rollbackFailure)throw error();return {rows:[]}}
  if(sql==='commit'){if(options.ambiguousCommit&&(n===0||options.ambiguousAgain))throw error();return {rows:[]}}
  if(sql.startsWith('select mip_native_comparison.admit(')){
   if(options.operationFailure)throw error();admitted=true;
   return {rows:[{result:options.badReceipt??structuredClone(wire)}]};
  }
  if(sql.startsWith('select mip_native_comparison.read_current(')){
   if(options.readFailure||(!admitted&&options.requireAdmitted))throw error();
   return {rows:[{result:options.badReadReceipt??structuredClone(wire)}]};
  }
  if(sql.startsWith('select mip_native_comparison.revoke_binding('))return {rows:[{result:''}]};
  throw Error('unexpected_synthetic_dispatch');
 });
 return {calls,connections};
}
test('closed caller uses actual driver identity/logging checks and metadata-only admission receipt',async t=>{
 const f=await fixture(t);const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.state,'current_binding_confirmed');assert.deepEqual(result.receipt,wire);
 assert.equal(result.connection_closed,true);assert.equal(result.needs_reconciliation,false);
 const operation=f.calls.filter(c=>c.sql?.startsWith('select mip_native_comparison.'));
 assert.equal(operation.length,1);
 assert.deepEqual(operation[0].args,[request.scope,request.binding_id,request.projection_id,request.dependency_hash,
 request.display_hash,request.private_review_id,request.broker.session,request.broker.runtime,request.release_request,request.event_id]);
 assert.equal(JSON.stringify(result).includes(secret),false);
 assert.equal(JSON.stringify(result).includes(request.broker.session),false);
 assert.equal(JSON.stringify(result).includes(request.broker.runtime),false);
 assert.equal(f.calls.some(c=>c.sql?.startsWith('set role')),false);
});
test('unknown keys/actions/SQL callbacks/identity substitutions refuse before connecting',async t=>{
 const f=await fixture(t);
 for(const changed of [{...request,action:'execute'},{...request,sql:'select 1'},
 {...request,broker:{...request.broker,token:secret}}]){
  await assert.rejects(callNativeComparisonBinding({connection,request:changed}),/^Error: native_comparison_caller_configuration_refused$/);
 }
 for(const changed of [{...connection,effectiveRole:'service_role'},{...connection,query:()=>{}},
 {...connection,connectionString:connection.connectionString.replace('/postgres','/unrelated')}]){
  await assert.rejects(callNativeComparisonBinding({connection:changed,request}),/^Error: native_comparison_caller_configuration_refused$/);
 }
 await assert.rejects(callNativeComparisonBinding({connection,request,sql:()=>{}}),/^Error: native_comparison_caller_configuration_refused$/);
 assert.equal(f.connections.length,0);
});
test('principal role denial precedes every binding operation',async t=>{
 const f=await fixture(t,{extraMembership:true});
 const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.state,'operation_refused');assert.deepEqual(result.diagnostics,['principal_failed']);
 assert.equal(f.calls.some(c=>c.sql?.startsWith('select mip_native_comparison.')),false);
});
test('receipt unknown/nested payload keys fail closed and rollback',async t=>{
 const f=await fixture(t,{badReceipt:{...wire,body:{secret}}});
 const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.state,'operation_refused');assert.equal(result.receipt,null);
 assert.deepEqual(result.diagnostics,['receipt_failed']);assert.equal(f.calls.some(c=>c.sql==='rollback'),true);
 assert.equal(f.calls.some(c=>c.sql==='commit'),false);assert.equal(JSON.stringify(result).includes(secret),false);
});
test('ambiguous commit uses one fresh authenticated exact current read and never repeats admission',async t=>{
 const f=await fixture(t,{ambiguousCommit:true});
 const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.state,'current_binding_confirmed');assert.equal(result.needs_reconciliation,false);
 assert.deepEqual(result.diagnostics,['commit_acknowledgement_unknown']);
 assert.equal(f.connections.length,2);
 assert.equal(f.calls.filter(c=>c.sql?.startsWith('select mip_native_comparison.admit(')).length,1);
 const reads=f.calls.filter(c=>c.sql?.startsWith('select mip_native_comparison.read_current('));
 assert.equal(reads.length,1);
 assert.deepEqual(reads[0].args,[request.scope,request.binding_id,wire.manifest_hash,request.broker.session,request.broker.runtime]);
 assert.equal(f.calls.some(c=>c.n===0&&c.sql==='rollback'),false);
});
test('stale/revoked current read after lost commit remains unknown without recreating identity',async t=>{
 const f=await fixture(t,{ambiguousCommit:true,readFailure:true});
 const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.state,'outcome_unknown');assert.equal(result.needs_reconciliation,true);assert.equal(result.receipt,null);
 assert.deepEqual(result.diagnostics,['commit_acknowledgement_unknown','reconciliation_operation_failed']);
 assert.deepEqual(result.reconciliation_identity,{scope:wire.scope,binding_id:wire.binding_id,manifest_hash:wire.manifest_hash,
  native_generation_id:wire.native_generation_id,comparison_generation_id:wire.comparison_generation_id});
 assert.equal(f.calls.filter(c=>c.sql?.startsWith('select mip_native_comparison.admit(')).length,1);
 assert.equal(JSON.stringify(result).includes(secret),false);
});
test('ambiguous reconciliation is bounded to two authenticated attempts',async t=>{
 const f=await fixture(t,{ambiguousCommit:true,ambiguousAgain:true});
 const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.state,'outcome_unknown');assert.equal(f.connections.length,2);
 assert.equal(result.diagnostics.includes('reconciliation_commit_acknowledgement_unknown'),true);
});
test('primary, rollback and close failures remain independent static diagnostics',async t=>{
 await fixture(t,{operationFailure:true,rollbackFailure:true,closeFailure:true});
 const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.state,'outcome_unknown');assert.equal(result.connection_closed,false);
 assert.deepEqual(result.diagnostics,['operation_failed','rollback_failed','close_failed']);
 assert.equal(JSON.stringify(result).includes(secret),false);
});
test('opaque shared-driver connection cleanup is never reported as proven closed',async t=>{
 await fixture(t,{connectFailure:true,closeFailure:true});
 const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.connection_closed,false);assert.equal(result.needs_reconciliation,true);
 assert.deepEqual(result.diagnostics,['connect_failed','connection_cleanup_unverified']);
});
test('read binds exact supplied hash and both generation identities',async t=>{
 const f=await fixture(t,{badReadReceipt:{...wire,comparison_generation_id:id(88)}});
 const read={action:'read',scope:request.scope,binding_id:request.binding_id,manifest_hash:wire.manifest_hash,
 native_generation_id:request.native_generation_id,comparison_generation_id:request.comparison_generation_id,broker:request.broker};
 const result=await callNativeComparisonBinding({connection,request:read});
 assert.equal(result.state,'operation_refused');assert.equal(result.receipt,null);
 assert.equal(f.calls.some(c=>c.sql?.startsWith('select mip_native_comparison.admit(')),false);
});
test('revocation is exact-ID only and an ambiguous commit cannot be inferred from read refusal',async t=>{
 const f=await fixture(t,{ambiguousCommit:true});
 const result=await callNativeComparisonBinding({connection,request:{action:'revoke',scope:request.scope,binding_id:request.binding_id}});
 assert.equal(result.state,'outcome_unknown');assert.equal(result.receipt,null);assert.equal(result.needs_reconciliation,true);
 assert.equal(f.connections.length,1);
 assert.equal(f.calls.filter(c=>c.sql?.startsWith('select mip_native_comparison.')).length,1);
});
test('acknowledged commit plus failed close preserves committed identity but reports cleanup unresolved',async t=>{
 await fixture(t,{closeFailure:true});
 const result=await callNativeComparisonBinding({connection,request});
 assert.equal(result.state,'committed_cleanup_unresolved');assert.deepEqual(result.receipt,wire);
 assert.equal(result.connection_closed,false);assert.equal(result.needs_reconciliation,true);
 assert.deepEqual(result.diagnostics,['close_failed']);
});

test('equal UUID values remain independently bound in distinct generation namespaces',async t=>{
 const same={...wire,comparison_generation_id:wire.native_generation_id};
 const f=await fixture(t,{badReceipt:same});
 const supplied={...request,comparison_generation_id:request.native_generation_id};
 const result=await callNativeComparisonBinding({connection,request:supplied});
 assert.equal(result.state,'current_binding_confirmed');
 assert.equal(result.receipt.native_generation_id,supplied.native_generation_id);
 assert.equal(result.receipt.comparison_generation_id,supplied.comparison_generation_id);
 assert.equal(f.calls.filter(c=>c.sql?.startsWith('select mip_native_comparison.admit(')).length,1);
});
