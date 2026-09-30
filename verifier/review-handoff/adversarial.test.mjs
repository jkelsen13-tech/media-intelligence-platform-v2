import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,validateReport,reserve,accept,requestKey} from './controller.mjs';
import {validate,receive} from './protocol.mjs';
import {hash,digest} from './validation.mjs';
import {controllerFixture,protocolFixture,rebindController,rebindProtocol,finding,blocker,memoryStore} from './fixtures.mjs';
const transport={kind:'synthetic-test-double'};

for(const [name,mutate,code] of [
 ['backend inventory omitted',f=>f.q.evidence.splice(1,1),'missing_layer_evidence'],
 ['cross-layer inventory omitted',f=>f.q.evidence.splice(2,1),'missing_layer_evidence'],
 ['backend mislabeled frontend path',f=>f.q.evidence[1].path='src/backend.txt','evidence_layer'],
 ['unknown token',f=>f.r.coverage[1].references=['packet:'+f.q.packet+'/absent'],'unbound_evidence'],
 ['backend references frontend',f=>f.r.coverage[1].references=f.r.coverage[0].references.slice(),'misreferenced_layer_evidence'],
 ['cross-layer references backend',f=>f.r.coverage[2].references=f.r.coverage[1].references.slice(),'misreferenced_layer_evidence'],
 ['undeclared requirement',f=>f.q.evidence[1].requirements=['unknown'],'evidence_requirement'],
 ['bytes altered',f=>f.q.evidence[1].content+='x','file_binding'],
 ['size altered',f=>f.q.evidence[1].bytes++,'file_binding'],
 ['hash altered',f=>f.q.evidence[1].sha256='f'.repeat(64),'file_binding'],
 ['duplicate token',f=>f.q.evidence[1].id='e1','evidence_identity'],
 ['duplicate path',f=>f.q.evidence[1].path=f.q.evidence[0].path,'evidence_identity'],
 ['unknown inventory field',f=>f.q.evidence[0].approve=true,'schema']
])test('controller rejects '+name,()=>{
 const f=controllerFixture();mutate(f);rebindController(f);
 assert.throws(()=>validateReport(f.q,f.r),new RegExp(code));
});
test('controller rejects stale packet hash despite fresh request key',()=>{
 const f=controllerFixture();f.q.evidence[0].content+='x';f.q.evidence[0].bytes++;f.q.evidence[0].sha256=hash(Buffer.from(f.q.evidence[0].content));f.r.requestKey=requestKey(f.q);
 assert.throws(()=>validateReport(f.q,f.r),/packet_binding/);
});
for(const [name,mutate,code] of [
 ['backend inventory omitted',a=>{const [e]=a[0].files.splice(1,1);a[1].delete(e.path)},'missing_layer_evidence'],
 ['cross-layer inventory omitted',a=>{const [e]=a[0].files.splice(2,1);a[1].delete(e.path)},'missing_layer_evidence'],
 ['backend references frontend',a=>a[3].coverage[1].references=a[3].coverage[0].references.slice(),'misreferenced_layer_evidence'],
 ['cross-layer references frontend',a=>a[3].coverage[2].references=a[3].coverage[0].references.slice(),'misreferenced_layer_evidence'],
 ['cross-layer references backend',a=>a[3].coverage[2].references=a[3].coverage[1].references.slice(),'misreferenced_layer_evidence'],
 ['backend path is src',a=>{const e=a[0].files[1],b=a[1].get(e.path);a[1].delete(e.path);e.path='src/backend.txt';a[1].set(e.path,b);a[3].coverage[1].references=[e.path]},'evidence_layer'],
 ['requirement bound to wrong row',a=>a[0].files[1].requirements=['frontend_behavior'],'evidence_requirement'],
])test('protocol rejects '+name+' with refreshed authority and packet digest',()=>{
 const a=protocolFixture();mutate(a);rebindProtocol(a);
 assert.throws(()=>validate(...a),new RegExp(code));
});
for(const path of ['supabase/config.toml','supabase/seed.sql','supabase/.env','supabase/functions/../.env','supabase/functions/.env','supabase/functions/x/AGENTS.md','supabase/qualification/./receipt.txt']){
 test('both validators reject '+path,()=>{
  const f=controllerFixture();f.q.evidence[1].path=path;rebindController(f);assert.throws(()=>validateReport(f.q,f.r),/unsafe_path/);
  const a=protocolFixture();a[0].files[1].path=path;rebindProtocol(a);assert.throws(()=>validate(...a),/unsafe_path/);
 });
}
for(const path of ['supabase/functions/synthetic/index.ts','supabase/qualification/synthetic-receipt.txt']){
 test('both validators allow bounded '+path,()=>{
  const f=controllerFixture();f.q.evidence[1].path=path;rebindController(f);assert.equal(validateReport(f.q,f.r).outcome,'PASS');
  const a=protocolFixture(),entry=a[0].files[1],bytes=a[1].get(entry.path);a[1].delete(entry.path);entry.path=path;a[1].set(path,bytes);a[3].coverage[1].references=[path];rebindProtocol(a);assert.equal(validate(...a).outcome,'PASS');
 });
}
for(const [target,index] of [['packet',0],['authority',2],['result',3],['origin',4]]){
 for(const key of ['approve','merge','publish','hidden']){
  test('protocol rejects unknown '+target+'.'+key+' before persistence',async()=>{
   const a=protocolFixture();a[index][key]=true;let writes=0;
   assert.throws(()=>validate(...a),/schema/);
   await assert.rejects(receive(a,{putOnce:async()=>{writes++}}),/schema/);assert.equal(writes,0);
  });
 }
}
for(const [target,mutate] of [['coverage',a=>a[3].coverage[0].approve=true],['file',a=>a[0].files[0].approve=true],['finding',a=>{a[3].outcome='FAIL';a[3].coverage[0].status='FAIL';a[3].findings=[{...finding(a[3]),approve:true}]}],['blocker',a=>{a[3].outcome='BLOCKED';a[3].coverage[0].status='BLOCKED';a[3].blockers=[{...blocker(a[3]),approve:true}]}]]){
 test('protocol nested '+target+' exact schema',()=>{const a=protocolFixture();mutate(a);rebindProtocol(a);assert.throws(()=>validate(...a),/schema/)});
}
for(const outcome of ['FAIL','BLOCKED']){
 for(const detail of ['string',{},null]){
  test('protocol rejects non-concrete '+outcome+' detail '+JSON.stringify(detail),()=>{
   const a=protocolFixture();a[3].outcome=outcome;a[3].coverage[0].status=outcome;a[3][outcome==='FAIL'?'findings':'blockers']=[detail];assert.throws(()=>validate(...a),/object|schema/);
  });
 }
}
test('finding evidence must be from its coverage row',()=>{
 const a=protocolFixture();a[3].outcome='FAIL';a[3].coverage[0].status='FAIL';a[3].findings=[{...finding(a[3]),evidence:a[3].coverage[1].references}];assert.throws(()=>validate(...a),/finding_evidence/);
});
test('each failed row needs its own concrete finding',()=>{
 const a=protocolFixture();a[3].outcome='FAIL';a[3].coverage[0].status=a[3].coverage[1].status='FAIL';a[3].findings=[finding(a[3])];assert.throws(()=>validate(...a),/missing_finding/);
});
test('each blocked row needs its own concrete blocker',()=>{
 const a=protocolFixture();a[3].outcome='BLOCKED';a[3].coverage[0].status=a[3].coverage[1].status='BLOCKED';a[3].blockers=[blocker(a[3])];assert.throws(()=>validate(...a),/missing_blocker/);
});
test('same-layer evidence cannot be reused for an undeclared requirement',()=>{
 const f=controllerFixture();f.q.requirements.push('frontend_other');f.q.requirementLayers.frontend_other='frontend';
 const e={...structuredClone(f.q.evidence[0]),id:'e4',path:'docs/other.md',requirements:['frontend_other']};f.q.evidence.push(e);
 f.r.coverage.push({...structuredClone(f.r.coverage[0]),id:'frontend_other'});rebindController(f);assert.throws(()=>validateReport(f.q,f.r),/misreferenced_layer_evidence/);
});
for(const boundary of ['request','result','create']){
 test('accept retains validated snapshot across '+boundary+' adapter mutation',async()=>{
  const {q,r}=controllerFixture(),s=memoryStore();await reserve(s,q);
  const originalQ=structuredClone(q),originalR=structuredClone(r),oldGet=s.get,oldCreate=s.create;
  const mutate=()=>{q.request='attacker';q.evidence[0].content='changed';r.approve=true;r.outcome='FAIL';r.coverage[0].references=[]};
  s.get=async k=>{if(k.startsWith(boundary+'/'))mutate();return oldGet(k)};
  s.create=async(k,v)=>{if(boundary==='create')mutate();return oldCreate(k,v)};
  const d=await accept(s,q,r,transport);
  assert.equal(d.outcome,'PASS');assert.equal(d.approve,false);
  assert.equal(s.rows.get('result/'+originalQ.request),JSON.stringify(originalR));
  assert.equal(d.deliveryKey,digest({request:requestKey(originalQ),result:digest(originalR)}));
  assert.equal(s.rows.has('result/attacker'),false);
 });
}
test('reserve retains original request and embedded bytes across await',async()=>{
 const {q}=controllerFixture(),expected=JSON.stringify(q),s=memoryStore();s.get=async()=>{q.request='changed';q.evidence[0].content='changed';return undefined};
 await reserve(s,q);assert.equal(s.rows.get('request/s1'),expected);assert.equal(s.rows.size,1);
});
test('receive captures result bytes before adapter reentry',async()=>{
 const a=protocolFixture(),expected=JSON.stringify(a[3]);let retained;
 const d=await receive(a,{putOnce:async(k,v)=>{a[3].approve=true;a[3].outcome='FAIL';a[1].get('src/example.jsx').fill(0);retained=v}});
 assert.equal(retained,expected);assert.equal(d.outcome,'PASS');
});

for(const kind of ['controller','protocol']){
 test(kind+' accepts supporting verifier receipt alongside primary layer artifacts',()=>{
  if(kind==='controller'){
   const f=controllerFixture(),content='Synthetic supplemental receipt.';
   f.q.evidence.push({id:'support',path:'verifier/run/receipt.txt',content,bytes:Buffer.byteLength(content),sha256:hash(Buffer.from(content)),role:'supporting',requirements:f.q.requirements.slice()});
   for(const c of f.r.coverage)c.references.push('packet:'+f.q.packet+'/support');
   rebindController(f);assert.equal(validateReport(f.q,f.r).outcome,'PASS');
   f.r.coverage[1].references=['packet:'+f.q.packet+'/support'];
   assert.throws(()=>validateReport(f.q,f.r),/unsupported_pass/);
   f.q.evidence.splice(1,1);rebindController(f);
   assert.throws(()=>validateReport(f.q,f.r),/missing_layer_evidence/);
  }else{
   const a=protocolFixture(),bytes=Buffer.from('Synthetic supplemental receipt.'),path='verifier/run/receipt.txt';
   a[0].files.push({path,bytes:bytes.length,sha256:hash(bytes),role:'supporting',requirements:a[0].requirements.slice()});a[1].set(path,bytes);
   for(const c of a[3].coverage)c.references.push(path);
   rebindProtocol(a);assert.equal(validate(...a).outcome,'PASS');
   a[3].coverage[1].references=[path];assert.throws(()=>validate(...a),/unsupported_pass/);
   const [e]=a[0].files.splice(1,1);a[1].delete(e.path);rebindProtocol(a);
   assert.throws(()=>validate(...a),/missing_layer_evidence/);
  }
 });
}
