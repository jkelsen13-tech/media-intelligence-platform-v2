import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync} from 'node:crypto'
import {createSupabaseHypothesisAuthenticator as create} from '../supabase/qualification/hypothesis-assessments/supabaseAuthenticator.mjs'
import {syntheticAuthProvider} from './hypothesisAuthProviderFixture.mjs'
const user='00000000-0000-4000-8000-000000000001'
test('provider verifier defaults closed and rejects elevated or ambiguous configuration',async()=>{
 assert.equal(await create()('Bearer synthetic'),null)
 const f=syntheticAuthProvider(user)
 for(const patch of [{publishableKey:'sb_secret_synthetic'},{publishableKey:'eyJ.legacy.service_role'},
  {projectUrl:'http://synthetic.invalid'},{projectUrl:f.configuration.projectUrl+'/'},
  {issuer:'https://other.invalid/auth/v1'},{audience:''},{timeoutMs:0}]){
  assert.throws(()=>create({...f.configuration,...patch}),/invalid_hypothesis_auth_configuration/)
 }
 assert.equal(f.state.calls.length,0)
})
test('real SDK getUser verifies signed synthetic token via pinned endpoint and strips metadata',async()=>{
 const f=syntheticAuthProvider(user),verify=create(f.configuration),jwt=f.token()
 assert.deepEqual(await verify('Bearer '+jwt),{id:user,is_anonymous:false})
 assert.deepEqual(f.state.calls,[{url:f.configuration.projectUrl+'/auth/v1/user',method:'GET',credentials:'omit',redirect:'error'}])
 assert.deepEqual(await verify('Bearer '+jwt),{id:user,is_anonymous:false});assert.equal(f.state.calls.length,2)
})
test('wrong issuer audience expired future anonymous and malformed claims fail before disclosure',async()=>{
 const f=syntheticAuthProvider(user),verify=create(f.configuration)
 for(const patch of [{iss:'https://other.invalid/auth/v1'},{aud:'other'},{exp:1},{iat:Math.floor(Date.now()/1000)+60},
  {is_anonymous:true},{role:'service_role'},{sub:'bad'},{session_id:null},{nbf:Math.floor(Date.now()/1000)+60}]){
  assert.equal(await verify('Bearer '+f.token(patch)),null)
 }
 for(const input of ['Bearer synthetic','Basic value','Bearer a.b.c','Bearer ',''])assert.equal(await verify(input),null)
 assert.equal(f.state.calls.length,0)
})
test('wrong signing key and provider-revoked token cannot return identity',async()=>{
 const f=syntheticAuthProvider(user),verify=create(f.configuration)
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048})
 assert.equal(await verify('Bearer '+f.token({},privateKey)),null)
 f.state.revoked=true;assert.equal(await verify('Bearer '+f.token()),null)
 assert.equal(f.state.calls.length,2)
})
test('provider identity audience role and anonymous substitution fails closed',async()=>{
 const f=syntheticAuthProvider(user),verify=create(f.configuration)
 for(const change of [{id:'00000000-0000-4000-8000-000000000002'},{aud:'foreign'},{role:'service_role'},{is_anonymous:true},{is_anonymous:undefined}]){
  f.state.userOverride={id:user,aud:'authenticated',role:'authenticated',is_anonymous:false,...change}
  assert.equal(await verify('Bearer '+f.token()),null)
 }
})
test('redirect malformed oversized and unavailable provider responses return no identity',async()=>{
 const f=syntheticAuthProvider(user),jwt=f.token()
 for(const fetchImpl of [async()=>{throw Error('synthetic private diagnostic')},
  async()=>new Response('{}',{status:503,headers:{'content-type':'application/json'}}),
  async()=>new Response('not-json',{headers:{'content-type':'application/json'}}),
  async()=>new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),
  async()=>{const r=new Response('{}',{headers:{'content-type':'application/json'}});Object.defineProperty(r,'redirected',{value:true});return r}]){
  assert.equal(await create({...f.configuration,fetchImpl,timeoutMs:100})('Bearer '+jwt),null)
 }
})
test('bounded deadline suppresses late successful response and does not retry network',async()=>{
 const f=syntheticAuthProvider(user);let release,calls=0,signal
 const verify=create({...f.configuration,timeoutMs:30,fetchImpl:(_,o)=>{calls++;signal=o.signal;return new Promise(r=>release=r)}})
 const pending=verify('Bearer '+f.token());assert.equal(await pending,null);assert.equal(calls,1);assert.equal(signal.aborted,true)
 release(new Response(JSON.stringify({id:user,aud:'authenticated',role:'authenticated',is_anonymous:false}),{headers:{'content-type':'application/json'}}))
 await new Promise(r=>setTimeout(r,0));assert.equal(calls,1)
})
