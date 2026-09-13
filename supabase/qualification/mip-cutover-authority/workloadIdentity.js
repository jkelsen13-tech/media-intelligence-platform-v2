// Non-deployed broker-side verifier. Never run with a worker-controlled trust store.
// No key fetching, credential issuance, role selection from token claims, or defaults.
import {createPublicKey,verify} from 'node:crypto'
const deny=()=>{throw Error('mip_workload_identity_denied')}
const decode=s=>{
 if(typeof s!=='string'||!s.length||!/^[A-Za-z0-9_-]+$/.test(s))deny()
 const b=Buffer.from(s,'base64url');if(b.toString('base64url')!==s)deny();return b
}
export function verifyWorkloadIdentity({token,policy,now}){
 if(typeof token!=='string'||token.length>16384||!Number.isSafeInteger(now)||
   !policy||typeof policy.issuer!=='string'||!policy.issuer||
   typeof policy.audience!=='string'||!policy.audience||
   !Number.isSafeInteger(policy.maxLifetimeSeconds)||policy.maxLifetimeSeconds<=0||
   !Array.isArray(policy.keys)||!Array.isArray(policy.mappings))deny()
 const parts=token.split('.');if(parts.length!==3)deny()
 let h,c;try{h=JSON.parse(decode(parts[0]).toString('utf8'));c=JSON.parse(decode(parts[1]).toString('utf8'))}catch{deny()}
 if(!h||h.alg!=='RS256'||typeof h.kid!=='string'||h.typ!=='JWT'||
   Object.keys(h).some(k=>!['alg','kid','typ'].includes(k))||!c||Array.isArray(c))deny()
 const keys=policy.keys.filter(k=>k.kid===h.kid&&k.revoked!==true&&
   Number.isSafeInteger(k.validFrom)&&Number.isSafeInteger(k.validUntil)&&k.validFrom<=now&&now<k.validUntil)
 if(keys.length!==1)deny()
 let key;try{key=createPublicKey({key:keys[0].jwk,format:'jwk'})}catch{deny()}
 if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048||
   !verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,decode(parts[2])))deny()
 if(c.iss!==policy.issuer||c.aud!==policy.audience||typeof c.sub!=='string'||!c.sub||
   !Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||c.iat>now||c.exp<=now||
   c.exp<=c.iat||c.exp-c.iat>policy.maxLifetimeSeconds||
   (c.nbf!==undefined&&(!Number.isSafeInteger(c.nbf)||c.nbf>now)))deny()
 const mappings=policy.mappings.filter(m=>m.subject===c.sub&&m.revoked!==true)
 if(mappings.length!==1)deny()
 const m=mappings[0]
 if(typeof m.runtime!=='string'||!m.runtime||
   !['mip_comparison_producer_v1','mip_comparison_worker_v1','mip_projection_publisher_v1'].includes(m.principal)||
   typeof m.authorizationRevision!=='string'||!m.authorizationRevision)deny()
 // Token role/runtime/user_metadata claims cannot grant authority.
 // Final session issue MUST recheck this mapping revision and key under DB locks.
 return Object.freeze({runtime:m.runtime,principal:m.principal,
  authorizationRevision:m.authorizationRevision,issuer:policy.issuer,subject:c.sub,kid:h.kid,
  expiresAt:c.exp})
}
