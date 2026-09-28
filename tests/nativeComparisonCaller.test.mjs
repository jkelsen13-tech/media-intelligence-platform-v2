// Auth/PG transport are mocked; these exercise the actual caller and DTO parser,
// not SQL admission semantics, Supabase signatures, Deno packaging or a live host.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {DISPLAY_SCHEMA} from '../supabase/qualification/native-comparison-display/displayContract.mjs';
import {createNativeComparisonCaller} from '../supabase/qualification/native-comparison-caller/host.mjs';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const hash='a'.repeat(64),expected={scope:uuid(1),binding_id:uuid(2),manifest_hash:hash};
function make(spec){
 if(Array.isArray(spec))return [];
 if(spec&&typeof spec==='object'){
  if(spec.$nullable)return null;
  return Object.fromEntries(Object.entries(spec).map(([k,s])=>[k,make(s)]));
 }
 if(spec.endsWith('?'))return null;
 return spec==='uuid'?uuid(1):spec==='hash'?hash:spec==='number'?1:spec==='boolean'?false:spec==='url'?'https://synthetic.invalid/source':'synthetic';
}
function fixture(){
 const v=make(DISPLAY_SCHEMA),p=v.private_projection,c=v.comparison;
 Object.assign(v,expected,{contract:'native-comparison-display-private-v1'});
 Object.assign(v.identity,{native_generation_id:uuid(3),projection_id:uuid(4),projection_review_id:uuid(5),comparison_generation_id:uuid(6),
 comparison_event_id:uuid(7),comparison_review_revision:uuid(8),comparison_policy_revision:uuid(9),release_request:uuid(10)});
 Object.assign(p.review,{review_id:uuid(5),disposition:'accepted_private'});
 Object.assign(p.display,{contract:'native-private-arc-display-v1',projection_id:uuid(4),article_id:uuid(11),state:'pending_private'});
 p.display.vector.state='absent';
 Object.assign(c.event,{id:uuid(7),comparison_validation_state:'approved',status:'active'});
 Object.assign(c.occurrence,{kind:'event_occurrence',state:'unverified',start:null,end:null,precision:'unknown'});
 for(let n=11;n<=12;n++){
  const source=make(DISPLAY_SCHEMA.comparison.sources[0]);Object.assign(source,{article_id:uuid(n),capture_id:uuid(n+10)});
  c.sources.push(source);
  const e=make(DISPLAY_SCHEMA.comparison.evidence[0]);
  Object.assign(e,{article_id:uuid(n),capture_id:uuid(n+10),claim_key:'claim-1',candidate_id:uuid(n+20),review_revision:uuid(8),
   source_field:'body_text',span_units:'unicode_code_points',span_start:3,span_end:6,excerpt:'A😀é'});
  c.evidence.push(e);
 }
 const claim=make(DISPLAY_SCHEMA.comparison.claims[0]);Object.assign(claim,{event_id:uuid(7),claim_key:'claim-1',status:'active'});c.claims.push(claim);
 const explanation=make(DISPLAY_SCHEMA.comparison.explanations[0]);explanation.assertion_id='sc:claim_grouping:'+uuid(7)+':0:'+uuid(11);c.explanations.push(explanation);
 return v;
}

const secret='SYNTHETIC_CALLER_SECRET_SENTINEL';
const conn={connectionString:'postgresql://caller_reviewer:'+secret+'@127.0.0.1:5432/postgres',expectedLogin:'caller_reviewer',sessionPoolerHost:null,disposable:true};
const settings={log_statement:'none',log_min_duration_statement:'-1',log_min_duration_sample:'-1',
 log_transaction_sample_rate:'0',log_parameter_max_length_on_error:'0',statement_timeout:'1000'};
const claims=over=>({sub:uuid(40),session_id:uuid(41),iss:'https://qikvmopbtijoebdqosyq.supabase.co/auth/v1',
 aud:'authenticated',role:'authenticated',is_anonymous:false,iat:Math.floor(Date.now()/1000)-1,exp:Math.floor(Date.now()/1000)+300,...over});
const token=c=>[Buffer.from('{"alg":"ES256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify(c)).toString('base64url'),'synthetic_signature'].join('.');
function req(c=claims(),body=expected,over={}){
 return new Request('https://qikvmopbtijoebdqosyq.supabase.co/functions/v1/native-comparison-display',{
 method:'POST',headers:{origin:'https://jkelsen13-tech.github.io',authorization:'Bearer '+token(c),'content-type':'application/json',...over},body:JSON.stringify(body)});
}
const configuredTests=new WeakSet();
async function setup(t,options={}){
 if(!configuredTests.has(t)){
  configuredTests.add(t);const old=process.env.MIP_DISPOSABLE_POSTGRES;process.env.MIP_DISPOSABLE_POSTGRES='qik-native-caller';
  t.after(()=>{if(old===undefined)delete process.env.MIP_DISPOSABLE_POSTGRES;else process.env.MIP_DISPOSABLE_POSTGRES=old});
 }
 const calls=[],error=()=>Object.assign(Error(secret),{code:'P0001',detail:secret,cause:Error(secret)});
 t.mock.method(pg.Client.prototype,'connect',async function(){calls.push('connect')});
 t.mock.method(pg.Client.prototype,'end',async function(){calls.push('close');if(options.closeFailure)throw error()});
 t.mock.method(pg.Client.prototype,'query',async function(sql,args){
  calls.push({sql,args});
  if(sql==="set statement_timeout='1000ms'"||sql==="set local statement_timeout='1000ms'"||sql==='begin isolation level read committed')return {rows:[]};
  if(sql.includes('r.rolname = session_user'))return {rows:[{login:conn.expectedLogin,effective:conn.expectedLogin,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false}]};
  if(sql.startsWith('select name,setting from pg_settings'))return {rows:Object.entries(settings).map(([name,setting])=>({name,setting}))};
  if(sql.includes("pg_has_role(session_user,'mip_mentions_gateway'"))return {rows:[{gateway:!options.wrongGateway,extra_membership:!!options.extraMembership}]};
  if(sql==='select mip_native_caller.read_current($1,$2,$3,$4,$5,$6) result'){
   if(options.denied)throw error();return {rows:[{result:options.dto??fixture()}]};
  }
  if(sql==='commit'){if(options.commitFailure)throw error();return {rows:[]}}
  if(sql==='rollback'){if(options.rollbackFailure)throw error();return {rows:[]}}
  throw error();
 });
 const fetchImpl=async(url,init)=>{
  calls.push({url,authorization:init.headers.Authorization});
  assert.equal(url,'https://qikvmopbtijoebdqosyq.supabase.co/auth/v1/user');
  assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
  return new Response(JSON.stringify({id:options.user??uuid(40),is_anonymous:false}),{
   status:options.authStatus??200,headers:{'content-type':'application/json'}});
 };
 return {calls,host:createNativeComparisonCaller({connection:conn,anonKey:'sb_publishable_synthetic_only',fetchImpl})};
}
test('actual caller authenticates exact bearer and sends only verified user/session plus exact private binding in one transaction',async t=>{
 const f=await setup(t),c=claims(),response=await f.host(req(c));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(await response.json(),fixture());
 const call=f.calls.find(x=>x.sql?.startsWith('select mip_native_caller.read_current('));
 assert.deepEqual(call.args,[uuid(40),uuid(41),c.exp,expected.scope,expected.binding_id,expected.manifest_hash]);
 assert.ok(f.calls.findIndex(x=>x.sql==='commit')<f.calls.indexOf('close'));
 assert.equal(f.calls.at(-1),'close');
 assert.equal(JSON.stringify(call.args).includes(secret),false);
});
test('wrong verified user, expired/sessionless token, service identity and Auth rejection never open DB',async t=>{
 for(const [options,c] of [[{user:uuid(42)},claims()],[{},claims({exp:1})],[{},claims({session_id:undefined})],[{},claims({role:'service_role'})],[{authStatus:401},claims()]]){
  const f=await setup(t,options),response=await f.host(req(c));assert.equal(response.status,401);assert.equal(f.calls.includes('connect'),false);
  t.mock.restoreAll();
 }
});
test('public IDs cannot substitute for exact binding request; client broker, login and nested payload keys refuse before Auth',async t=>{
 for(const body of [{event_id:uuid(2),scope:uuid(1),manifest_hash:hash},{...expected,broker:{session:uuid(44),runtime:'forged'}},{...expected,connection:conn},{...expected,payload:{body:secret}}]){
  const f=await setup(t),response=await f.host(req(claims(),body));assert.equal(response.status,400);assert.equal(f.calls.length,0);t.mock.restoreAll();
 }
});
test('wrong gateway or inherited authority returns no DTO',async t=>{
 for(const options of [{wrongGateway:true},{extraMembership:true}]){
  const f=await setup(t,options),response=await f.host(req());assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:{code:'service_unavailable'}});
  assert.equal(f.calls.some(x=>x.sql?.startsWith('select mip_native_caller.read_current(')),false);t.mock.restoreAll();
 }
});
test('composed SQL refusal including missing/revoked admission/session/binding/broker never falls back',async t=>{
 const f=await setup(t,{denied:true}),response=await f.host(req());
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'service_unavailable'}});
 assert.ok(f.calls.some(x=>x.sql==='rollback'));assert.equal(f.calls.at(-1),'close');
 assert.equal(f.calls.filter(x=>x.sql?.startsWith('select mip_native_caller.read_current(')).length,1);
});
test('lost commit acknowledgement, rollback failure and close failure discard all private data',async t=>{
 for(const options of [{commitFailure:true},{commitFailure:true,rollbackFailure:true},{closeFailure:true}]){
  const f=await setup(t,options),response=await f.host(req());assert.equal(response.status,503);
  const text=await response.text();assert.equal(text.includes(secret),false);assert.equal(text.includes('private_projection'),false);
  assert.equal(f.calls.at(-1),'close');t.mock.restoreAll();
 }
});
test('nested unknown private fields and publication promotion are rejected by the existing exact DTO parser',async t=>{
 for(const mutate of [v=>v.comparison.evidence[0].raw_capture=secret,v=>v.private_projection.display.attached=true,v=>v.publication_allowed=true]){
  const dto=fixture();mutate(dto);const f=await setup(t,{dto}),response=await f.host(req());
  assert.equal(response.status,503);assert.equal((await response.text()).includes(secret),false);
  assert.equal(f.calls.some(x=>x.sql==='commit'),false);t.mock.restoreAll();
 }
});
test('wrong origin and oversized body are unavailable without exposing any server configuration',async t=>{
 const f=await setup(t),wrong=await f.host(req(claims(),expected,{origin:'https://synthetic.invalid'}));
 assert.equal(wrong.status,403);assert.equal(wrong.headers.has('access-control-allow-origin'),false);
 const large=await f.host(req(claims(),{...expected,extra:'x'.repeat(5000)}));assert.equal(large.status,400);assert.equal(f.calls.length,0);
});
