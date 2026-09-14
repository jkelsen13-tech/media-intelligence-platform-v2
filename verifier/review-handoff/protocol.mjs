import {createHash} from 'node:crypto';
export const hash = b => createHash('sha256').update(b).digest('hex');
const require = (v, code) => {if(!v) throw Error(code)};
export function validate(packet, files, authority, result, origin) {
 require(/^[a-f0-9]{40}$/.test(packet.candidate),'candidate_not_frozen');
 require(packet.synthetic===true,'real_transport_not_configured');
 require(authority?.candidate===packet.candidate && authority.disclosure===packet.disclosure && JSON.stringify(authority.files)===JSON.stringify(packet.files),'disclosure_unbound');
 require(Array.isArray(packet.files) && packet.files.length>0 && packet.files.length===files.size,'file_set');
 const seen=new Set();
 for(const f of packet.files) {
  require(typeof f.path==='string' && /^(docs|tests|src|verifier)\/[a-zA-Z0-9_./-]+$/.test(f.path) && !f.path.split('/').some(p=>!p || p==='..' || p==='.' || p.startsWith('.')) && !f.path.endsWith('/AGENTS.md') && !seen.has(f.path),'unsafe_path');
  seen.add(f.path);const bytes=files.get(f.path);
  require(Buffer.isBuffer(bytes) && bytes.length===f.bytes && hash(bytes)===f.sha256,'file_binding');
 }
 const digest=hash(JSON.stringify(packet));
 require(origin?.synthetic===true && origin.verified===true && origin.packet===digest,'unverified_origin');
 require(result.packet===digest && result.candidate===packet.candidate && result.request===packet.request && result.synthetic===true,'result_binding');
 require(result.reviewer===origin.reviewer && result.reviewer!==packet.implementer && result.model===origin.model,'self_or_wrong_reviewer');
 require(['PASS','FAIL','BLOCKED'].includes(result.outcome),'outcome');
 require(Array.isArray(packet.requirements) && packet.requirements.length>0 && new Set(packet.requirements).size===packet.requirements.length,'requirements');
 require(Array.isArray(result.coverage) && result.coverage.length===packet.requirements.length && new Set(result.coverage.map(c=>c.id)).size===packet.requirements.length,'coverage');
 for(const c of result.coverage) {
  require(packet.requirements.includes(c.id) && ['PASS','FAIL','BLOCKED','NOT_TESTED'].includes(c.status),'coverage');
  require(['artifact_inspection','independently_reproduced_this_run','supplied_implementation_agent_result','missing_evidence','NOT_TESTED','BLOCKED'].includes(c.evidence_class),'evidence_class');
  require(Array.isArray(c.references) && c.references.every(p=>seen.has(p)),'unbound_evidence');
  if(c.status==='PASS') require(c.references.length>0 && ['artifact_inspection','independently_reproduced_this_run'].includes(c.evidence_class),'unsupported_pass');
 }
 require(Array.isArray(result.findings) && Array.isArray(result.blockers),'findings');
 if(result.outcome==='PASS') require(!result.findings.length && !result.blockers.length && result.coverage.every(c=>c.status==='PASS'),'false_pass');
 if(result.outcome==='FAIL') require(result.findings.length>0 && result.coverage.some(c=>c.status==='FAIL'),'unsupported_fail');
 if(result.outcome==='BLOCKED') require(result.blockers.length>0 && result.coverage.some(c=>['BLOCKED','NOT_TESTED'].includes(c.status)),'unsupported_blocked');
 return {outcome:result.outcome,action:'synthetic_only',merge:false,approve:false};
}
export async function receive(args, store) {
 const decision=validate(...args);
 const result=args[3];
 await store.putOnce(result.request,JSON.stringify(result));
 return decision;
}
