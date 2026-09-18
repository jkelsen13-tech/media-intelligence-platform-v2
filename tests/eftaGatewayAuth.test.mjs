import test from 'node:test';
import assert from 'node:assert/strict';
import {createEftaGatewayAuthority,EFTA_RPC_ALLOWLIST} from '../supabase/qualification/mip-cutover-authority/eftaGatewayAuth.mjs';

const ids={subject:'f576f162-b6c6-46b7-9aaf-96b1ea90e194',authSession:'11111111-1111-4111-8111-111111111111',
 auth:'22222222-2222-4222-8222-222222222222',mapping:'33333333-3333-4333-8333-333333333333',
 key:'44444444-4444-4444-8444-444444444444',credential:'55555555-5555-4555-8555-555555555555',
 assignment:'66666666-6666-4666-8666-666666666666',revocation:'77777777-7777-4777-8777-777777777777',
 broker:'88888888-8888-4888-8888-888888888888',request:'99999999-9999-4999-8999-999999999999'};
const hash='a'.repeat(64), now=2_000_000_000;
const req=()=>new Request('https://qualification.invalid/efta',{headers:{authorization:'Bearer signed-token'}});

function fixture(overrides={}){
 const calls=[];
 const verified={verified:true,sub:ids.subject,session_id:ids.authSession,jti:'token-id',
  authentication_revision:ids.auth,key_revision:ids.key,algorithm:'ES256',kid:'current-es256',
  token_binding_hash:hash,issuer:'https://issuer.invalid',audience:'efta-gateway',
  expires_at:now+600,not_before:now-60,...overrides.verified};
 const assignment={revision:ids.assignment,subject_id:ids.subject,subject_principal:`auth_user:${ids.subject}`,
  database_principal:'mip_efta_private_reader_v1',scope:'efta-bounded-demo-v1',approval_state:'owner_approved',
  active:true,current:true,mapping_revision:ids.mapping,key_revision:ids.key,credential_revision:ids.credential,
  owner_approval_receipt_hash:hash,owner_approval_payload_hash:hash,
  valid_from:'2030-01-01T00:00:00.000Z',valid_until:'2040-01-01T00:00:00.000Z',...overrides.assignment};
 const broker={session_id:ids.broker,runtime:'efta-qualification-v1',database_principal:assignment.database_principal,
  subject_id:ids.subject,assignment_revision:ids.assignment,authentication_revision:ids.auth,
  auth_session_id:ids.authSession,mapping_revision:ids.mapping,key_revision:ids.key,credential_revision:ids.credential,
  token_binding_hash:hash,live_session_revision:ids.revocation,
  invokeExact:async(signature,values,attribution)=>{calls.push({signature,values,attribution});return {ok:true}},
  close:async()=>{calls.push({closed:true})},...overrides.broker};
 let validations=0;
 const deps={now:()=>now,issuer:'https://issuer.invalid',audience:'efta-gateway',kid:'current-es256',runtime:'efta-qualification-v1',verifyAccessToken:async()=>verified,
  validateLiveSession:async()=>({active:true,subject_id:ids.subject,auth_session_id:ids.authSession,
   authentication_revision:ids.auth,revision:ids.revocation,...(overrides.liveSession?.(++validations)??{})}),
  lookupAssignment:async query=>{calls.push({assignmentQuery:query});return overrides.noAssignment?null:assignment},
  openBrokerSession:async context=>{calls.push({brokerContext:context});return broker},...overrides.deps};
 return {authority:createEftaGatewayAuthority(deps),calls,verified,assignment,broker};
}

test('private read binds verified human, assignment and exact broker/RPC revisions',async()=>{
 const f=fixture();
 const result=await f.authority.invoke(req(),'private_read',ctx=>[ids.request,ctx.session,ctx.runtime,ctx.assignment]);
 assert.deepEqual(result,{ok:true});
 const rpc=f.calls.find(x=>x.signature);
 assert.equal(rpc.signature,EFTA_RPC_ALLOWLIST.private_read.signature);
 assert.deepEqual(rpc.values,[ids.request,ids.broker,'efta-qualification-v1',ids.assignment]);
 assert.equal(rpc.attribution.subject_principal,`auth_user:${ids.subject}`);
 assert.equal(rpc.attribution.authentication_revision,ids.auth);
 assert.equal(rpc.attribution.credential_revision,ids.credential);
 assert.equal(f.calls.at(-1).closed,true);
 assert.equal(JSON.stringify(f.calls).includes('signed-token'),false);
});

test('owner-selectable subject without an approved assignment is denied before broker',async()=>{
 const f=fixture({noAssignment:true});
 await assert.rejects(f.authority.invoke(req(),'private_read',()=>[]),/efta_gateway_denied/);
 assert.equal(f.calls.some(x=>x.brokerContext),false);
});

test('live session revocation, subject mismatch and revision drift fail closed',async()=>{
 for(const liveSession of [()=>({active:false}),()=>({subject_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),
  n=>n===2?{revision:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}:{}]){
  const f=fixture({liveSession});
  await assert.rejects(f.authority.invoke(req(),'private_read',()=>[]),/efta_gateway_denied/);
  assert.equal(f.calls.some(x=>x.signature),false);
 }
});

test('invalid token, assignment and broker fields fail closed',async()=>{
 const cases=[
  {verified:{verified:false}},{verified:{sub:'not-a-uuid'}},{verified:{expires_at:now}},{verified:{not_before:now+1}},
  {verified:{algorithm:'HS256'}},{verified:{kid:'legacy'}},
  {assignment:{approval_state:'proposed'}},{assignment:{active:false}},{assignment:{current:false}},
  {assignment:{subject_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}},{assignment:{scope:'other'}},
  {assignment:{mapping_revision:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}},
  {broker:{database_principal:'mip_projection_publisher_v1'}},{broker:{credential_revision:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}},
  {broker:{token_binding_hash:'b'.repeat(64)}},{broker:{auth_session_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}},
  {broker:{live_session_revision:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}},
  {broker:{password:'must-never-enter-adapter'}}
 ];
 for(const x of cases){const f=fixture(x);await assert.rejects(f.authority.invoke(req(),'private_read',()=>[]),/efta_gateway_denied/);}
});

test('missing or malformed bearer and arbitrary operations are denied',async()=>{
 const f=fixture();
 for(const request of [new Request('https://qualification.invalid'),new Request('https://qualification.invalid',{headers:{authorization:'Basic no'}})])
  await assert.rejects(f.authority.invoke(request,'private_read',()=>[]),/efta_gateway_denied/);
 for(const operation of ['efta_admit','review_publish','stage_review','release_isolated','release_public','mip_identity.efta_private_read'])
  await assert.rejects(f.authority.invoke(req(),operation,()=>[]),/efta_gateway_denied/);
 assert.equal(f.calls.some(x=>x.signature),false);
});

test('broker is closed when exact invocation fails',async()=>{
 let closed=false;const f=fixture({broker:{invokeExact:async()=>{throw Error('database-secret')},close:async()=>{closed=true}}});
 await assert.rejects(f.authority.invoke(req(),'private_read',()=>[]),/database-secret/);
 assert.equal(closed,true);
});

