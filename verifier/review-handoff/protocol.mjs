import {check,exact,id,hash,digest,requirements,evidenceBinding,fullInventory,coverage,snapshot} from './validation.mjs';
export {hash};
export function validate(packet,files,authority,result,origin){
 exact(packet,'candidate synthetic request implementer disclosure files requirements requirementLayers');
 exact(authority,'candidate disclosure files requirements requirementLayers');
 exact(result,'candidate packet request synthetic reviewer model outcome coverage findings blockers');
 exact(origin,'packet synthetic verified reviewer model');
 check(typeof packet.candidate==='string'&&/^[a-f0-9]{40}$/.test(packet.candidate),'candidate_not_frozen');
 check(packet.synthetic===true,'real_transport_not_configured');
 check(id(packet.request)&&id(packet.implementer)&&id(packet.disclosure),'packet_identity');
 requirements(packet);
 check(authority.candidate===packet.candidate&&authority.disclosure===packet.disclosure&&JSON.stringify(authority.files)===JSON.stringify(packet.files)&&JSON.stringify(authority.requirements)===JSON.stringify(packet.requirements)&&JSON.stringify(authority.requirementLayers)===JSON.stringify(packet.requirementLayers),'disclosure_unbound');
 check(files instanceof Map&&Array.isArray(packet.files)&&packet.files.length>0&&packet.files.length===files.size,'file_set');
 const seen=new Map();
 for(const f of packet.files){
  exact(f,'path bytes sha256 role requirements');
  evidenceBinding(f,packet);check(!seen.has(f.path),'unsafe_path');
  seen.set(f.path,f);const bytes=files.get(f.path);
  check(Buffer.isBuffer(bytes)&&bytes.length===f.bytes&&hash(bytes)===f.sha256,'file_binding');
 }
 fullInventory(packet,packet.files);
 const packetDigest=digest(packet);
 check(origin.synthetic===true&&origin.verified===true&&origin.packet===packetDigest,'unverified_origin');
 check(result.packet===packetDigest&&result.candidate===packet.candidate&&result.request===packet.request&&result.synthetic===true,'result_binding');
 check(id(result.reviewer)&&id(result.model)&&result.reviewer===origin.reviewer&&result.reviewer!==packet.implementer&&result.model===origin.model,'self_or_wrong_reviewer');
 coverage(packet,result,seen,'evidence_class');
 return {outcome:result.outcome,action:'synthetic_only',merge:false,approve:false};
}
export async function receive(args,store){
 // Buffer copies retain the validator's Buffer contract; structuredClone alone
 // converts Buffer to Uint8Array. Capture all inputs before validation.
 const [packet,files,authority,result,origin]=args;
 const frozen=[snapshot(packet),new Map([...files].map(([k,v])=>[k,Buffer.isBuffer(v)?Buffer.from(v):v])),snapshot(authority),snapshot(result),snapshot(origin)];
 const decision=validate(...frozen);
 const bytes=JSON.stringify(frozen[3]),key=frozen[3].request;
 await store.putOnce(key,bytes);
 return decision;
}
