import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePrivateRead,privateBindingSelection} from '../src/lib/nativePrivateComparisonRead.js';
import {buildPrivateWorkspace} from '../supabase/qualification/native-comparison-display/displayContract.mjs';
import {uuid,expected,fixture} from './nativePrivateUiFixture.mjs';

const URL='https://qikvmopbtijoebdqosyq.supabase.co';
const session=()=>({user:{id:uuid(90),is_anonymous:false},access_token:'synthetic.synthetic.synthetic',expires_at:2000000000});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const response=(value=fixture(),status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function harness({fetchImpl=async()=>response(),initial=session(),lookup=null,url=URL,anonKey='sb_publishable_synthetic'}={}){
 let authEvent=()=>{},calls=[];
 const client=createNativePrivateRead({url,anonKey,getSession:()=>lookup??Promise.resolve(initial),onAuthChange:fn=>{authEvent=fn;return()=>{authEvent=()=>{}}},now:()=>1900000000,fetchImpl:(...args)=>{calls.push(args);return fetchImpl(...args)}});
 await tick();
 return {client,calls,auth:next=>authEvent(next)};
}
test('selection is exactly three lowercase values, never a public ID alias',()=>{
 assert.deepEqual(privateBindingSelection(expected),expected);
 for(const value of [null,{}, {scope:expected.scope}, {...expected,binding_id:''},{...expected,manifest_hash:'A'.repeat(64)},
 {...expected,binding_id:'public-event-id'},{...expected,event_id:uuid(2)}])assert.equal(privateBindingSelection(value),null);
});
test('absent and invalid selection, missing authentication, wrong target and secret key make no request',async()=>{
 for(const options of [{initial:null},{initial:{...session(),user:{id:uuid(90),is_anonymous:true}}},{url:'https://other.invalid'},{anonKey:'sb_secret_synthetic'}]){
  const h=await harness(options);try{await h.client.load(expected);assert.equal(h.calls.length,0);assert.equal(h.client.getState().workspace,null)}finally{h.client.dispose()}
 }
 const h=await harness();try{await h.client.load(null);assert.equal(h.client.getState().status,'invalid_selection');assert.equal(h.calls.length,0)}finally{h.client.dispose()}
});
test('exact POST returns only canonical private workspace and preserves source excerpt',async()=>{
 const h=await harness();
 try{
  await h.client.load(expected);const state=h.client.getState(),[url,init]=h.calls[0];
  assert.equal(url,URL+'/functions/v1/native-comparison-display');assert.equal(init.method,'POST');
  assert.deepEqual(JSON.parse(init.body),expected);assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
  assert.equal(init.headers.apikey,'sb_publishable_synthetic');assert.equal(init.headers.Authorization,'Bearer synthetic.synthetic.synthetic');
  assert.equal(state.status,'ready');assert.equal(state.workspace.comparison.evidence[0].excerpt,'A😀é');
  assert.equal(state.workspace.arc.identity_kind,'private_projection');assert.equal(state.workspace.timeline.identity_kind,'private_news_record');
  assert.equal(state.workspace.timeline.event_occurrence.state,'unverified');
  assert.equal(state.workspace.publication_allowed,false);assert.equal(state.workspace.attachment_allowed,false);
 }finally{h.client.dispose()}
});
test('unavailable, malformed and extra nested fields never become empty success',async()=>{
 for(const getResponse of [()=>response({error:{code:'service_unavailable'}},503),
 ()=>new Response('not json',{headers:{'Content-Type':'application/json'}}),
 ()=>{const v=fixture();v.comparison.evidence[0].body='not allowed';return response(v)},
 ()=>{const v=fixture();v.private_projection.display.node.debug=true;return response(v)},
 ()=>{const v=fixture();v.publication_allowed=true;return response(v)},
 ()=>{const v=fixture();v.binding_id=uuid(999);return response(v)}]){
  const h=await harness({fetchImpl:async()=>getResponse()});try{await h.client.load(expected);assert.notEqual(h.client.getState().status,'ready');assert.equal(h.client.getState().workspace,null)}finally{h.client.dispose()}
 }
});
test('editing selection while fetch ignores abort discards old response',async()=>{
 const wait=deferred(),h=await harness({fetchImpl:()=>wait.promise});
 try{
  const work=h.client.load(expected);h.client.invalidate();wait.resolve(response());await work;await tick();
  assert.equal(h.client.getState().status,'selection_required');assert.equal(h.client.getState().workspace,null);
 }finally{h.client.dispose()}
});
test('new selection outranks old response and cannot reuse an old binding',async()=>{
 const first=deferred();let n=0;const next={...expected,binding_id:uuid(99)};
 const h=await harness({fetchImpl:()=>++n===1?first.promise:Promise.resolve(response({...fixture(),binding_id:next.binding_id}))});
 try{
  const old=h.client.load(expected);await h.client.load(next);first.resolve(response());await old;await tick();
  assert.equal(h.client.getState().workspace.selection.binding_id,next.binding_id);
 }finally{h.client.dispose()}
});
test('session change and signout discard responses and already-rendered records',async()=>{
 const first=deferred(),h=await harness({fetchImpl:()=>first.promise});
 try{
  const old=h.client.load(expected);h.auth({...session(),access_token:'new.synthetic.synthetic'});first.resolve(response());await old;await tick();
  assert.equal(h.client.getState().status,'selection_required');assert.equal(h.client.getState().workspace,null);
  await h.client.load(expected);assert.equal(h.client.getState().status,'ready');
  h.auth(null);assert.equal(h.client.getState().status,'authentication_required');assert.equal(h.client.getState().workspace,null);
 }finally{h.client.dispose()}
});
test('provider event wins over late initial session lookup',async()=>{
 const lookup=deferred(),h=await harness({lookup:lookup.promise});
 try{h.auth(null);lookup.resolve(session());await tick();await h.client.load(expected);assert.equal(h.calls.length,0);assert.equal(h.client.getState().status,'authentication_required')}finally{h.client.dispose()}
});
test('canonical byte validation remains deterministic without Buffer and counts UTF-8 bytes',()=>{
 const prior=globalThis.Buffer;
 try{
  globalThis.Buffer=undefined;
  assert.equal(buildPrivateWorkspace(fixture(),expected).comparison.evidence[0].excerpt,'A😀é');
  const value=fixture();value.private_projection.display.node.description='é'.repeat(8193);
  assert.throws(()=>buildPrivateWorkspace(value,expected));
 }finally{globalThis.Buffer=prior}
});
