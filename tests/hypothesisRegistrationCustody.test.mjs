// Filesystem fixture executes on GitHub-hosted CI only. It is not a production custodian.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,open,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {registrationEnvelope,registrationDigest,retainRegistration,createCustodyBoundTransport} from '../supabase/qualification/hypothesis-assessments/registrationCustody.mjs'
const id=n=>String(n).repeat(8)+'-'+String(n).repeat(4)+'-4'+String(n).repeat(3)+'-8'+String(n).repeat(3)+'-'+String(n).repeat(12)
const e=()=>({version:1,sequence:1,previous:'',source:id(1),stream:id(2),bindingId:id(3),incarnationId:id(4),recoveryEvidence:'a'.repeat(64)})
const capture=()=>({session:id(5),bindingId:id(3),before:'0/10',request:id(6)})
const prepare=()=>({...capture(),source:id(1),stream:id(2),end:'0/20',hash:'b'.repeat(64),capture:id(7),bootstrap:'c'.repeat(64),frames:'d'.repeat(64)})
function preparation(){const p=prepare();delete p.before;return p}
const gate={skip:process.env.GITHUB_ACTIONS!=='true'}
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'mip-custody-ci-'))
 t.after(()=>rm(dir,{recursive:true,force:true}))
 const file=join(dir,'external-journal.jsonl')
 let queue=Promise.resolve(),authorized=true
 const load=async()=>{try{return (await readFile(file,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)}catch(err){if(err.code==='ENOENT')return [];throw err}}
 const append=async row=>{
  const f=await open(file,'a',0o600)
  try{await f.writeFile(JSON.stringify(row)+'\n');await f.sync()}finally{await f.close()}
  const d=await open(dir,'r');try{await d.sync()}finally{await d.close()}
 }
 const exclusive=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next}
 const withAuthority=(scope,fn)=>exclusive(async()=>{
  if(!authorized)throw Error('revoked')
  const rows=await load()
  const tx={
   head:async source=>rows.filter(r=>r.kind==='registration'&&r.envelope.source===source).at(-1)?.digest??null,
   read:async digest=>rows.find(r=>r.kind==='registration'&&r.digest===digest)?.envelope,
   append:async(digest,envelope,previous)=>{
    if((await tx.head(envelope.source)??'')!==previous)throw Error('stale')
    const row={kind:'registration',digest,envelope};await append(row);rows.push(row)
   },
   bindRequest:async(request,scope)=>{
    const existing=await tx.readRequest(request)
    if(existing){assert.deepEqual(existing,scope);return}
    const row={kind:'request',request,scope};await append(row);rows.push(row)
   },
   readRequest:async request=>rows.find(r=>r.kind==='request'&&r.request===request)?.scope
  }
  // Independently read the durable bytes, not the just-written in-memory row.
  const read=tx.read;tx.read=async digest=>(await load()).find(r=>r.kind==='registration'&&r.digest===digest)?.envelope
  tx.readRequest=async request=>(await load()).find(r=>r.kind==='request'&&r.request===request)?.scope
  return fn(tx)
 })
 return {withAuthority,revoke:()=>exclusive(()=>{authorized=false}),load,
  transport:(envelope=e(),call=async()=>true)=>createCustodyBoundTransport({envelope,expectedHead:registrationDigest(envelope),withAuthority,call})}
}
test('envelopes reject missing, malformed, accessors, extra fields and automatic source pins',()=>{
 for(const value of [{}, {...e(),sequence:0},{...e(),previous:'bad'},{...e(),auto:true},{...e(),source:'auto'}])
  assert.throws(()=>registrationEnvelope(value),/custody/)
 const value=e();Object.defineProperty(value,'source',{get:()=>id(1)})
 assert.throws(()=>registrationEnvelope(value),/custody/)
 assert.throws(()=>createCustodyBoundTransport({envelope:e(),expectedHead:'f'.repeat(64),withAuthority:()=>{},call:()=>{}}),/custody/)
})
test('durable exact registration replay, restart reconstruction and request continuity',gate,async t=>{
 const f=await fixture(t),envelope=e()
 const digest=await retainRegistration({envelope,withAuthority:f.withAuthority})
 assert.equal(digest,registrationDigest(envelope))
 assert.equal(await retainRegistration({envelope,withAuthority:f.withAuthority}),digest)
 assert.equal((await f.load()).length,1)
 await f.transport().prepare(preparation())
 // Reconstruct a transport: only durable journal bytes supply request/head state.
 assert.equal(await f.transport().advance({session:id(5),request:id(6)}),true)
})
test('recovery requires exact predecessor, new incarnation/binding and current head',gate,async t=>{
 const f=await fixture(t),first=e()
 await retainRegistration({envelope:first,withAuthority:f.withAuthority})
 const next={...first,sequence:2,previous:registrationDigest(first),bindingId:id(8),incarnationId:id(9)}
 for(const bad of [{...next,previous:'f'.repeat(64)},{...next,sequence:3},{...next,bindingId:first.bindingId},{...next,incarnationId:first.incarnationId}])
  await assert.rejects(()=>retainRegistration({envelope:bad,withAuthority:f.withAuthority}),/custody/)
 await retainRegistration({envelope:next,withAuthority:f.withAuthority})
 await assert.rejects(()=>retainRegistration({envelope:first,withAuthority:f.withAuthority}),/custody/)
 await assert.rejects(()=>f.transport().capture(capture()),/custody/)
 await assert.rejects(()=>retainRegistration({envelope:{...next,recoveryEvidence:'f'.repeat(64)},withAuthority:f.withAuthority}),/custody/)
})
test('missing predecessor record or changed durable readback is denied',async()=>{
 const first=e(),next={...e(),sequence:2,previous:registrationDigest(first),bindingId:id(8),incarnationId:id(9)}
 await assert.rejects(()=>retainRegistration({envelope:next,withAuthority:async(_,fn)=>fn({head:async()=>next.previous,read:async()=>undefined})}),/custody/)
 let called=0
 const transport=createCustodyBoundTransport({envelope:first,expectedHead:registrationDigest(first),call:async()=>{called++},
  withAuthority:async(_,fn)=>fn({head:async()=>registrationDigest(first),read:async()=>({...first,recoveryEvidence:'f'.repeat(64)})})})
 await assert.rejects(()=>transport.capture(capture()),/custody/)
 assert.equal(called,0)
})
test('scope mismatch and unretained advancement fail before a source call',gate,async t=>{
 const f=await fixture(t);await retainRegistration({envelope:e(),withAuthority:f.withAuthority})
 let calls=0;const tr=f.transport(e(),async()=>{calls++})
 assert.throws(()=>tr.capture({...capture(),bindingId:id(9)}),/custody/)
 assert.throws(()=>tr.prepare({...preparation(),source:id(9)}),/custody/)
 assert.throws(()=>tr.prepare({...preparation(),stream:id(9)}),/custody/)
 await assert.rejects(()=>tr.advance({session:id(5),request:id(6)}),/custody/)
 assert.equal(calls,0)
})
test('authority excludes revocation through source completion and freezes inputs before awaits',gate,async t=>{
 const f=await fixture(t);await retainRegistration({envelope:e(),withAuthority:f.withAuthority})
 let enter,release;const entered=new Promise(r=>enter=r),pending=new Promise(r=>release=r)
 let actual
 const tr=f.transport(e(),async(name,args)=>{actual={name,args};enter();await pending;return true})
 const p=capture(),operation=tr.capture(p);p.request=id(9)
 await entered
 let revoked=false;const revocation=f.revoke().then(()=>{revoked=true})
 await Promise.resolve();assert.equal(revoked,false)
 release();assert.equal(await operation,true);await revocation
 assert.equal(actual.args.at(-1),id(6))
 await assert.rejects(()=>tr.capture(capture()),/revoked/)
})
test('co-restoring ledger and its pin remains undetectable: no external antirollback claim',gate,async t=>{
 const f=await fixture(t);await retainRegistration({envelope:e(),withAuthority:f.withAuthority})
 // An independently retained newer head refuses the old ledger at construction.
 const newer={...e(),sequence:2,previous:registrationDigest(e()),bindingId:id(8),incarnationId:id(9)}
 assert.throws(()=>createCustodyBoundTransport({envelope:e(),expectedHead:registrationDigest(newer),withAuthority:f.withAuthority,call:async()=>true}),/custody/)
 // If that separate pin is ALSO restored, this primitive cannot detect the rollback.
 assert.equal(await f.transport(e()).capture(capture()),true)
})
