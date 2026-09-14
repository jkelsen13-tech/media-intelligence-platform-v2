// Synthetic transport contract tests. No production identity, signature or attestation.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createIncarnationBoundTransport} from '../supabase/qualification/hypothesis-assessments/sourceIncarnation.mjs'
const id='11111111-1111-4111-8111-111111111111'
const other='22222222-2222-4222-8222-222222222222'
const capture=()=>({session:id,bindingId:id,before:'0/10',request:other})
const prepare=()=>({session:id,bindingId:id,source:id,stream:id,request:other,end:'0/20',hash:'a'.repeat(64),capture:id,bootstrap:'b'.repeat(64),frames:'c'.repeat(64)})
test('source registration is explicit and cannot be discovered from a source response',()=>{
 for(const value of [undefined,{}, {incarnationId:id},{incarnationId:null,call:()=>{}},{incarnationId:'auto',call:()=>{}}])
  assert.throws(()=>createIncarnationBoundTransport(value),/mip_source_registration_required/)
})
test('fixed external registration travels through every sensitive RPC and ignores later config mutation',async()=>{
 const calls=[],config={incarnationId:id,call:async(name,args)=>{calls.push({name,args});return 'synthetic-result'}}
 const transport=createIncarnationBoundTransport(config);config.incarnationId=other
 const c=capture(),p=prepare()
 assert.equal(await transport.capture(c),'synthetic-result')
 await transport.prepare(p);await transport.advance({session:id,request:other})
 assert.deepEqual(calls,[
  {name:'capture_incarnation',args:[id,id,id,'0/10',other]},
  {name:'prepare_incarnation',args:[id,id,id,other,id,id,'0/20',p.bootstrap,p.frames,p.hash]},
  {name:'advance_incarnation',args:[id,other,id]}])
 assert.equal(Object.isFrozen(transport),true)
})
test('caller-supplied registration overrides and unexpected fields are refused before transport',async()=>{
 let calls=0
 const transport=createIncarnationBoundTransport({incarnationId:id,call:async()=>{calls++}})
 for(const [method,args] of [['capture',capture()],['prepare',prepare()],['advance',{session:id,request:other}]])
  await assert.rejects(()=>transport[method]({...args,incarnationId:other}),/mip_source_registration_required/)
 await assert.rejects(()=>transport.capture(Object.assign(Object.create({}),capture())),/mip_source_registration_required/)
 await assert.rejects(()=>transport.prepare(null),/mip_source_registration_required/)
 assert.equal(calls,0)
})
