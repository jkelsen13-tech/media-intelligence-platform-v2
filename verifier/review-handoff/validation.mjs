import {createHash} from 'node:crypto';
export const check=(value,code)=>{if(!value)throw Error(code)};
export const exact=(value,keys)=>{
 check(value&&Object.getPrototypeOf(value)===Object.prototype,'object');
 check(Reflect.ownKeys(value).every(k=>typeof k==='string')&&Object.keys(value).sort().join('|')===keys.split(' ').sort().join('|'),'schema');
 check(Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>'value' in d&&d.enumerable),'schema');
};
export const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(value);
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const digest=value=>hash(JSON.stringify(value));
export const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=4000;
export const layers=['frontend','backend','cross_layer'];
export function safePath(path){
 return typeof path==='string'&&/^(docs|tests|src|verifier|supabase\/(functions|migrations|qualification))\/[a-zA-Z0-9_./-]+$/.test(path)&&!path.split('/').some(p=>!p||p.startsWith('.'))&&!path.endsWith('/AGENTS.md');
}
export function pathLayer(path){
 if(/^(src|docs)\//.test(path))return 'frontend';
 if(/^supabase\/(functions|migrations|qualification)\//.test(path))return 'backend';
 if(/^tests\//.test(path))return 'cross_layer';
 return null;
}
export function requirements(q){
 check(Array.isArray(q.requirements)&&q.requirements.length>=3&&q.requirements.every(id)&&new Set(q.requirements).size===q.requirements.length,'requirements');
 check(q.requirementLayers&&Object.getPrototypeOf(q.requirementLayers)===Object.prototype,'requirement_layers');
 exact(q.requirementLayers,q.requirements.join(' '));
 check(q.requirements.every(k=>layers.includes(q.requirementLayers[k])),'requirement_layer');
 check(layers.every(layer=>Object.values(q.requirementLayers).includes(layer)),'full_stack_required');
}
// This proves declared byte/path/requirement association, never semantic adequacy.
export function evidenceBinding(entry,q){
 check(safePath(entry.path),'unsafe_path');
 check(Number.isSafeInteger(entry.bytes)&&entry.bytes>=0&&typeof entry.sha256==='string'&&/^[a-f0-9]{64}$/.test(entry.sha256),'file_binding');
 check(layers.includes(entry.role)&&entry.role===pathLayer(entry.path),'evidence_layer');
 check(Array.isArray(entry.requirements)&&entry.requirements.length>0&&new Set(entry.requirements).size===entry.requirements.length&&entry.requirements.every(k=>q.requirements.includes(k)&&q.requirementLayers[k]===entry.role),'evidence_requirement');
}
export function fullInventory(q,entries){
 check(q.requirements.every(k=>entries.some(e=>e.requirements.includes(k)&&e.role===q.requirementLayers[k])),'missing_layer_evidence');
}
export function details(q,r){
 check(Array.isArray(r.findings)&&Array.isArray(r.blockers),'details');
 check(new Set(r.findings.map(f=>f?.id)).size===r.findings.length,'duplicate_finding');
 for(const f of r.findings){
  exact(f,'id requirement severity summary evidence remediation');
  check(id(f.id)&&q.requirements.includes(f.requirement)&&['low','medium','high','critical'].includes(f.severity)&&text(f.summary)&&text(f.remediation),'finding');
  const row=r.coverage.find(c=>c.id===f.requirement);
  check(row?.status==='FAIL','finding_status');
  check(Array.isArray(f.evidence)&&f.evidence.length>0&&f.evidence.every(ref=>row.references.includes(ref)),'finding_evidence');
 }
 for(const b of r.blockers){
  exact(b,'kind requirement detail');
  check(['engineering','missing_evidence','owner_decision','permission','disclosure','production','spending'].includes(b.kind)&&q.requirements.includes(b.requirement)&&text(b.detail),'blocker');
  check(['BLOCKED','NOT_TESTED'].includes(r.coverage.find(c=>c.id===b.requirement)?.status),'blocker_status');
 }
 check(r.coverage.every(c=>c.status!=='FAIL'||r.findings.some(f=>f.requirement===c.id)),'missing_finding');
 check(r.coverage.every(c=>!['BLOCKED','NOT_TESTED'].includes(c.status)||r.blockers.some(b=>b.requirement===c.id)),'missing_blocker');
 if(r.outcome==='PASS')check(!r.findings.length&&!r.blockers.length&&r.coverage.every(c=>c.status==='PASS'),'false_pass');
 if(r.outcome==='FAIL')check(r.findings.length>0&&r.coverage.some(c=>c.status==='FAIL'),'unsupported_fail');
 if(r.outcome==='BLOCKED')check(r.blockers.length>0&&r.coverage.some(c=>['BLOCKED','NOT_TESTED'].includes(c.status)),'unsupported_blocked');
}
export function coverage(q,r,lookup,classKey){
 check(['PASS','FAIL','BLOCKED'].includes(r.outcome),'outcome');
 check(Array.isArray(r.coverage)&&r.coverage.length===q.requirements.length&&new Set(r.coverage.map(c=>c?.id)).size===q.requirements.length,'coverage');
 for(const c of r.coverage){
  exact(c,'id status '+classKey+' references');
  check(q.requirements.includes(c.id)&&['PASS','FAIL','BLOCKED','NOT_TESTED'].includes(c.status),'coverage');
  check(['artifact_inspection','independently_reproduced_this_run','supplied_implementation_agent_result','missing_evidence','NOT_TESTED','BLOCKED'].includes(c[classKey]),'evidence_class');
  check(Array.isArray(c.references)&&new Set(c.references).size===c.references.length&&c.references.every(ref=>typeof ref==='string'&&lookup.has(ref)),'unbound_evidence');
  // Every cited artifact is explicitly declared for this requirement and layer.
  check(c.references.every(ref=>{const e=lookup.get(ref);return e.requirements.includes(c.id)&&e.role===q.requirementLayers[c.id]}),'misreferenced_layer_evidence');
  if(c.status==='PASS')check(c.references.length>0&&['artifact_inspection','independently_reproduced_this_run'].includes(c[classKey]),'unsupported_pass');
 }
 details(q,r);
}
// Snapshot once before validation and before the first adapter await. Only the
// validated snapshot bytes and their digest may cross the persistence boundary.
export const snapshot=value=>structuredClone(value);
