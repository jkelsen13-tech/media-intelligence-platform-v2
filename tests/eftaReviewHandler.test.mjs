import test from 'node:test';
import assert from 'node:assert/strict';
import {createEftaReviewHandler} from '../supabase/qualification/mip-cutover-authority/eftaReviewHandler.mjs';
import {createEftaReviewClient} from '../src/lib/eftaReviewClient.js';

const request=()=>new Request('https://fixture.invalid?runtime=attacker',{headers:{authorization:'Bearer fixture'}});
test('browser path is GET-only and supplies only server-created receipt plus bound context',async()=>{
 let call;const authority={invoke:async(req,operation,builder)=>{call={operation,values:builder({session:'server-session',runtime:'server-runtime',assignment:'server-assignment'})};
  return {contract:'efta-private-review-v2',public_release:false,sources:[]}}};
 const h=createEftaReviewHandler({authority,randomUUID:()=> '99999999-9999-4999-8999-999999999999'});
 for(const method of ['POST','PUT','DELETE']) assert.equal((await h(new Request('https://fixture.invalid',{method}))).status,405);
 const response=await h(request());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(call.operation,'private_read');assert.deepEqual(call.values,
  ['99999999-9999-4999-8999-999999999999','server-session','server-runtime','server-assignment']);
 const client=createEftaReviewClient({request:async options=>{assert.deepEqual(options,{method:'GET',cache:'no-store'});return response}});
 assert.equal((await client.read()).contract,'efta-private-review-v2');
});

test('gateway and client fail closed without leaking private errors or accepting old contract',async()=>{
 const h=createEftaReviewHandler({authority:{invoke:async()=>{throw Error('database password and SQL')}}});
 const failed=await h(request());assert.equal(failed.status,403);assert.equal(await failed.text(),'Unavailable');
 const client=createEftaReviewClient({request:async()=>new Response(JSON.stringify({contract:'efta-private-review-v1',public_release:false}),
  {status:200,headers:{'content-type':'application/json'}})});
 await assert.rejects(client.read(),/efta_reader_invalid_contract/);
});

