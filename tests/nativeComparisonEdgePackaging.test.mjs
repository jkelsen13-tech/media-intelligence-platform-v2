import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeComparisonEdge,nativeComparisonEdgeConfigurationNames} from '../supabase/functions/native-comparison-display/adapter.mjs';
import {createPrivateUserAuthenticator} from '../supabase/functions/_shared/privateGateway.mjs';
const ORIGIN='https://qikvmopbtijoebdqosyq.supabase.co',PAGES='https://jkelsen13-tech.github.io';
const values=()=>({
 SUPABASE_URL:ORIGIN,
 MIP_NATIVE_COMPARISON_DATABASE_URL:'postgresql://synthetic_gateway.qikvmopbtijoebdqosyq:synthetic-password@aws-0-us-west-1.pooler.supabase.com:5432/postgres',
 MIP_NATIVE_COMPARISON_DATABASE_LOGIN:'synthetic_gateway',
 MIP_NATIVE_COMPARISON_AUTH_PUBLIC_KEY:'sb_publishable_synthetic',
});
const request=()=>new Request(ORIGIN+'/functions/v1/native-comparison-display',{method:'POST',headers:{Origin:PAGES,Authorization:'Bearer synthetic.synthetic.synthetic','Content-Type':'application/json'},body:'{"scope":"synthetic"}'});
test('exact four configuration names and immutable gateway connection are passed unchanged',async()=>{
 const env=values(),read=[],created=[];
 const response=new Response('synthetic private DTO',{status:200});
 const handler=await createNativeComparisonEdge({readSecret:name=>{read.push(name);return env[name]},loadCaller:async()=>({createNativeComparisonCaller:options=>{created.push(options);return async req=>{assert.equal(req.bodyUsed,false);return response}}})});
 const req=request(),out=await handler(req);
 assert.equal(out,response);assert.deepEqual(read,nativeComparisonEdgeConfigurationNames);
 assert.equal(created.length,1);assert.deepEqual(created[0],{anonKey:env.MIP_NATIVE_COMPARISON_AUTH_PUBLIC_KEY,connection:{connectionString:env.MIP_NATIVE_COMPARISON_DATABASE_URL,expectedLogin:'synthetic_gateway',sessionPoolerHost:'aws-0-us-west-1.pooler.supabase.com',disposable:false}});
 assert.ok(Object.isFrozen(created[0]));assert.ok(Object.isFrozen(created[0].connection));assert.equal(req.bodyUsed,false);
});
test('missing configuration and wrong qik or connection target refuse before loading caller',async()=>{
 const bad=[
 env=>delete env.SUPABASE_URL,
 env=>env.SUPABASE_URL='https://other.supabase.co',
 env=>delete env.MIP_NATIVE_COMPARISON_DATABASE_URL,
 env=>env.MIP_NATIVE_COMPARISON_DATABASE_LOGIN='postgres',
 env=>env.MIP_NATIVE_COMPARISON_DATABASE_LOGIN='synthetic_collector',
 env=>env.MIP_NATIVE_COMPARISON_AUTH_PUBLIC_KEY='sb_secret_synthetic',
 env=>env.MIP_NATIVE_COMPARISON_DATABASE_URL=env.MIP_NATIVE_COMPARISON_DATABASE_URL.replace(':5432/',':6543/'),
 env=>env.MIP_NATIVE_COMPARISON_DATABASE_URL=env.MIP_NATIVE_COMPARISON_DATABASE_URL.replace('/postgres','/other'),
 env=>env.MIP_NATIVE_COMPARISON_DATABASE_URL+='?sslmode=disable',
 env=>env.MIP_NATIVE_COMPARISON_DATABASE_URL=env.MIP_NATIVE_COMPARISON_DATABASE_URL.replace('aws-0-us-west-1.pooler.supabase.com','other.invalid'),
 ];
 for(const mutate of bad){
  const env=values();mutate(env);let calls=0;
  const handler=await createNativeComparisonEdge({readSecret:name=>env[name],loadCaller:async()=>{calls++;throw Error('must not load')}});
  const out=await handler(request());assert.equal(calls,0);assert.equal(out.status,503);assert.deepEqual(await out.json(),{error:{code:'service_unavailable'}});
 }
});
test('module, construction and request failures are sanitized without error contents',async()=>{
 for(const loadCaller of [
  async()=>{throw Error('synthetic-secret-module')},
  async()=>({createNativeComparisonCaller:()=>{throw Error('synthetic-secret-constructor')}}),
  async()=>({createNativeComparisonCaller:()=>async()=>{throw Error('synthetic-private-payload')}}),
 ]){
  const env=values(),handler=await createNativeComparisonEdge({readSecret:name=>env[name],loadCaller});
  const out=await handler(request());assert.equal(out.status,503);
  assert.equal(out.headers.get('Cache-Control'),'private, no-store');
  assert.deepEqual(await out.json(),{error:{code:'service_unavailable'}});
 }
});
test('wrapper preserves exact Request identity, signal and host refusal Response',async()=>{
 const env=values(),req=request(),refusal=new Response('{"error":{"code":"origin_denied"}}',{status:403});
 const handler=await createNativeComparisonEdge({readSecret:name=>env[name],loadCaller:async()=>({createNativeComparisonCaller:()=>async received=>{assert.equal(received,req);assert.equal(received.signal,req.signal);return refusal}})});
 assert.equal(await handler(req),refusal);
});
test('unavailable wrapper only returns CORS allow-origin for existing Pages origin',async()=>{
 const handler=await createNativeComparisonEdge();
 assert.equal((await handler(request())).headers.get('Access-Control-Allow-Origin'),PAGES);
 const out=await handler(new Request(ORIGIN,{headers:{Origin:'https://other.invalid'}}));
 assert.equal(out.headers.get('Access-Control-Allow-Origin'),null);assert.equal(out.status,503);
});
test('real Auth callback sends exact user bearer to qik getUser endpoint, never a database service key',async()=>{
 const claims={sub:'00000000-0000-4000-8000-000000000001',session_id:'00000000-0000-4000-8000-000000000002'};
 const token='synthetic.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.synthetic',authorization='Bearer '+token;
 const user={id:claims.sub,is_anonymous:false},calls=[],controller=new AbortController();
 const authenticate=createPrivateUserAuthenticator({url:ORIGIN,anonKey:'sb_publishable_synthetic',fetchImpl:async(...args)=>{calls.push(args);return new Response(JSON.stringify(user),{headers:{'Content-Type':'application/json'}})}});
 const out=await authenticate(authorization,{signal:controller.signal});
 assert.deepEqual(out,{user,claims});assert.equal(calls[0][0],ORIGIN+'/auth/v1/user');
 assert.equal(calls[0][1].headers.Authorization,authorization);assert.equal(calls[0][1].headers.apikey,'sb_publishable_synthetic');
 assert.equal(calls[0][1].signal,controller.signal);assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].credentials,'omit');
});
test('real Auth callback refuses 401 and redirects without substituting JWT claims as authentication',async()=>{
 const controller=new AbortController();
 const unauthorized=createPrivateUserAuthenticator({url:ORIGIN,anonKey:'sb_publishable_synthetic',fetchImpl:async()=>new Response(null,{status:401})});
 assert.equal(await unauthorized('Bearer synthetic.synthetic.synthetic',{signal:controller.signal}),null);
 const redirected=createPrivateUserAuthenticator({url:ORIGIN,anonKey:'sb_publishable_synthetic',fetchImpl:async()=>new Response(null,{status:302})});
 await assert.rejects(()=>redirected('Bearer synthetic.synthetic.synthetic',{signal:controller.signal}),{message:'service_unavailable'});
});
