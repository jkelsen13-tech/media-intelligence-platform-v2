import {hash,digest} from './validation.mjs';
import {requestKey} from './controller.mjs';
export function controllerFixture(){
 const requirements=['frontend_behavior','backend_contract','cross_layer_semantics'];
 const requirementLayers={frontend_behavior:'frontend',backend_contract:'backend',cross_layer_semantics:'cross_layer'};
 const evidence=[['src/example.jsx','export const View=()=>null;'],['supabase/migrations/20260914000000_synthetic.sql','select 1;'],['tests/cross-layer.txt','Synthetic UI/API contract receipt.']].map(([path,content],i)=>({id:'e'+(i+1),path,content,bytes:Buffer.byteLength(content),sha256:hash(Buffer.from(content)),role:requirementLayers[requirements[i]],requirements:[requirements[i]]}));
 const q={version:2,synthetic:true,request:'s1',candidate:'a'.repeat(40),packet:digest(evidence),implementer:'author',reviewer:'reviewer',model:'synthetic-grok-double',requirements,requirementLayers,controller:'c'.repeat(40),evidence};
 const r={version:2,synthetic:true,requestKey:requestKey(q),candidate:q.candidate,packet:q.packet,reviewer:q.reviewer,model:q.model,outcome:'PASS',coverage:requirements.map((id,i)=>({id,status:'PASS',evidenceClass:'artifact_inspection',references:['packet:'+q.packet+'/e'+(i+1)]})),findings:[],blockers:[]};
 return {q,r};
}
export function rebindController({q,r}){
 const old=q.packet;q.packet=digest(q.evidence);r.packet=q.packet;r.requestKey=requestKey(q);
 for(const c of r.coverage)c.references=c.references.map(x=>x.replace(old,q.packet));
}
export function protocolFixture(){
 const {q}=controllerFixture();
 const files=q.evidence.map(({path,bytes,sha256,role,requirements})=>({path,bytes,sha256,role,requirements}));
 const p={candidate:q.candidate,synthetic:true,request:'synthetic-1',implementer:'synthetic-author',disclosure:'synthetic-only',files,requirements:q.requirements,requirementLayers:q.requirementLayers};
 const a={candidate:p.candidate,disclosure:p.disclosure,files:structuredClone(files),requirements:structuredClone(p.requirements),requirementLayers:structuredClone(p.requirementLayers)};
 const r={candidate:p.candidate,packet:digest(p),request:p.request,synthetic:true,reviewer:'synthetic-reviewer',model:'test-double',outcome:'PASS',coverage:p.requirements.map((id,i)=>({id,status:'PASS',evidence_class:'artifact_inspection',references:[files[i].path]})),findings:[],blockers:[]};
 const o={packet:r.packet,synthetic:true,verified:true,reviewer:r.reviewer,model:r.model};
 return [p,new Map(q.evidence.map(e=>[e.path,Buffer.from(e.content)])),a,r,o];
}
export function rebindProtocol(a){
 a[2]={candidate:a[0].candidate,disclosure:a[0].disclosure,files:structuredClone(a[0].files),requirements:structuredClone(a[0].requirements),requirementLayers:structuredClone(a[0].requirementLayers)};
 a[3].packet=a[4].packet=digest(a[0]);
}
export const finding=r=>({id:'f1',requirement:r.coverage[0].id,severity:'high',summary:'Synthetic defect',evidence:r.coverage[0].references.slice(),remediation:'Correct the defect on a new candidate'});
export const blocker=r=>({kind:'owner_decision',requirement:r.coverage[0].id,detail:'Synthetic owner decision needed'});
export function memoryStore(){
 const rows=new Map();return {rows,get:async k=>rows.get(k),create:async(k,v)=>{if(rows.has(k))throw Error('exists');rows.set(k,v)}};
}
