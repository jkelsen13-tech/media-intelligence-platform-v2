import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
import {verifyWorkloadIdentity} from './workloadIdentity.js'
const hash=s=>createHash('sha256').update(s).digest('hex')
// sql is a trusted execute-only broker transport, never a worker-supplied callback.
export async function issueWorkloadSession({sql,token,runtime,principal,request,now}){
 const policy=await sql('configuration',[runtime,principal])
 const identity=verifyWorkloadIdentity({token,policy,now})
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'))
 if(identity.runtime!==runtime||identity.principal!==principal)throw Error('mip_identity_runtime_mismatch')
 return sql('issue',[request,runtime,principal,policy.mappingRevision,policy.keyRevision,
  identity.issuer,policy.audience,identity.subject,claims.iat,claims.exp,hash(token)])
}
// Keys remain in the journal gateway. The worker receives this RPC interface only.
export function encryptedRemoteJournal({sql,session,keyProvider}){
 const context=async()=>sql('journal_runtime',[session])
 const aad=(runtime,key)=>Buffer.from(JSON.stringify([runtime,key]))
 function decrypt(envelope,runtime,key){
  const material=keyProvider(runtime,envelope.keyVersion)
  const decipher=createDecipheriv('aes-256-gcm',material.key,Buffer.from(envelope.iv,'base64'))
  decipher.setAAD(aad(runtime,key));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'))
  return Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8')
 }
 return {
  async putOnce(key,value){
   const runtime=await context(),material=keyProvider(runtime),plain=JSON.stringify(value)
   if(plain===undefined)throw Error('mip_journal_invalid_content')
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',material.key,iv)
   cipher.setAAD(aad(runtime,key))
   const data=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()])
   const envelope={keyVersion:material.version,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}
   // Transport resolves only after PostgreSQL commits. Conflicts return the retained
   // ciphertext; exact plaintext comparison (not just a hash) decides idempotence.
   const retained=await sql('journal_put',[session,key,envelope])
   if(decrypt(retained,runtime,key)!==plain)throw Error('mip_journal_content_conflict')
   return {committed:true}
  },
  async get(key){
   const runtime=await context(),envelope=await sql('journal_get',[session,key])
   return envelope===null?null:JSON.parse(decrypt(envelope,runtime,key))
  }
 }
}
