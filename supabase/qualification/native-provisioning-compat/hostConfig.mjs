// Nonsecret held-host configuration parser. Never reflects rejected input.
import {createHash} from 'node:crypto'
const keys=['auditLogin','c3ManifestSha256','c3OperationId','disposable','expectedLogin','expectedMetadataAuditor','operationId','provisioningProfile'].sort().join()
export function validateProvisioningHostConfig(raw,expectedHash){
 const fail=()=>{throw Error('managed_host_configuration_refused')}
 if(typeof raw!=='string'||Buffer.byteLength(raw)>4096||!/^[a-f0-9]{64}$/.test(expectedHash??'')||createHash('sha256').update(raw).digest('hex')!==expectedHash)fail()
 let c;try{c=JSON.parse(raw)}catch{fail()}
 if(!c||Array.isArray(c)||Object.keys(c).sort().join()!==keys||c.disposable!==false
 ||!['supabase-managed-v1','supabase-managed-solo-development-v1','supabase-managed-solo-session-lock-v1'].includes(c.provisioningProfile)||c.expectedLogin!=='postgres'
 ||c.auditLogin!=='mip_native_audit_v1'||c.expectedMetadataAuditor!=='mip_native_metadata_audit_v1'
 ||!/^[a-f0-9]{32}$/.test(c.operationId??'')||!/^[a-f0-9]{32}$/.test(c.c3OperationId??'')
 ||!/^[a-f0-9]{64}$/.test(c.c3ManifestSha256??''))fail()
 return Object.freeze(c)
}
