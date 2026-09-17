import test from 'node:test'
import assert from 'node:assert/strict'
import {createEftaReviewHandler} from '../supabase/qualification/mip-cutover-authority/eftaReviewHandler.mjs'
import {createEftaReviewClient} from '../src/lib/eftaReviewClient.js'
test('gateway denies unauthenticated/read-unassigned and browser write attempts before SQL',async()=>{
 let calls=0;const h=createEftaReviewHandler({authenticate:async()=>null,sql:async()=>{calls++}});
 assert.equal((await h(new Request('https://fixture.invalid'))).status,403);
 assert.equal((await h(new Request('https://fixture.invalid',{method:'POST'}))).status,405);
 assert.equal(calls,0);
});
test('gateway uses server-resolved broker scope and hides failures',async()=>{
 let args;const h=createEftaReviewHandler({authenticate:async()=>({canReadEfta:true,session:'server-session',runtime:'server-runtime'}),sql:async(name,values)=>{args={name,values};return {contract:'efta-private-review-v1',public_release:false}}});
 const r=await h(new Request('https://fixture.invalid?runtime=attacker'));
 assert.equal(r.status,200);assert.equal(args.name,'efta_private_read');assert.deepEqual(args.values.slice(1),['server-session','server-runtime']);assert.equal(r.headers.get('cache-control'),'no-store');
 const client=createEftaReviewClient({request:async()=>r});assert.equal((await client.read()).public_release,false);
 const bad=createEftaReviewHandler({authenticate:async()=>{throw Error('private secret')},sql:async()=>null});
 const failed=await bad(new Request('https://fixture.invalid'));assert.equal(failed.status,503);assert.equal(await failed.text(),'Unavailable');
});
