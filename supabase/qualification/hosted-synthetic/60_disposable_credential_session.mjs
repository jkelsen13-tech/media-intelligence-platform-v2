// Disposable credential/session procedure for hosted-synthetic qualification.
// Not a new MIP issuer, controller, queue, broker, or backend.
// Not authorization to mint live JWTs or write Edge secrets.
//
// Route A (HS256 project JWT secret): owner-only. This file only shapes the
// role claim host.js checks. See liveHs256WorkerJwtSpec() and
// 40_credential_operators.md. No in-repo HS256 signer.
// Route B (RS256 workload): verifyWorkloadIdentity + issueWorkloadSession as
// mip_identity_broker_v2. mip_identity.issue returns a session UUID only.
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto'
import {issueWorkloadSession} from '../mip-cutover-authority/brokerSession.js'

export const DISPOSABLE_RUNTIME='hosted-synthetic-qik-v1'
export const DISPOSABLE_PRINCIPAL='mip_comparison_worker_v1'
export const DISPOSABLE_IMPLEMENTATION='hosted-synthetic-event-projection-v1'
export const DISPOSABLE_ISSUER='https://qualification.invalid'
export const DISPOSABLE_AUDIENCE='synthetic-broker'
export const DISPOSABLE_KID='synthetic'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function shapeWorkerJwt(role=DISPOSABLE_PRINCIPAL){
 if(typeof role!=='string'||!role)throw Error('hosted_synthetic_worker_jwt_role')
 return 'dummy.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.dummy'
}

export function liveHs256WorkerJwtSpec(){
 return Object.freeze({
  algorithm:'HS256',
  secret:'Supabase project JWT secret (owner-held; never in this repository)',
  requiredClaim:Object.freeze({role:'mip_comparison_worker_v1'}),
  delivery:'MIP_QIK_WORKER_JWT only if that name is absent',
  signer:'none in-repo',
  see:'40_credential_operators.md Route A'
 })
}

export function mintWorkloadRs256({privateKey,kid=DISPOSABLE_KID,iss=DISPOSABLE_ISSUER,
 aud=DISPOSABLE_AUDIENCE,sub,now,exp}){
 if(!privateKey||typeof sub!=='string'||!sub||!Number.isSafeInteger(now)||!Number.isSafeInteger(exp))
  throw Error('hosted_synthetic_rs256_binding')
 const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
 const input=enc({alg:'RS256',typ:'JWT',kid})+'.'+enc({iss,aud,sub,iat:now,exp})
 return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')
}

export function generateDisposableWorkloadKey(){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
 return {privateKey,publicJwk:publicKey.export({format:'jwk'})}
}

export async function seedDisposableIdentity(db,{
 runtime=DISPOSABLE_RUNTIME,principal=DISPOSABLE_PRINCIPAL,publicJwk,kid=DISPOSABLE_KID,
 issuer=DISPOSABLE_ISSUER,audience=DISPOSABLE_AUDIENCE,
 subject=`${runtime}:${principal}`,keyRevision=randomUUID(),mappingRevision=randomUUID(),
 maxLifetimeSeconds=600,approvalRef='hosted-synthetic-disposable-fixture'}={}){
 if(!publicJwk)throw Error('hosted_synthetic_public_jwk_required')
 await db.query(
  'insert into mip_identity.key_versions values($1,$2,$3,$4::jsonb,$5::timestamptz,$6::timestamptz,$7)',
  [keyRevision,issuer,kid,JSON.stringify(publicJwk),'2000-01-01','2999-01-01',approvalRef])
 await db.query('insert into mip_identity.key_heads values($1,$2,$3,true)',[issuer,kid,keyRevision])
 await db.query(
  'insert into mip_identity.mapping_versions values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
  [mappingRevision,runtime,principal,issuer,audience,subject,keyRevision,maxLifetimeSeconds,approvalRef])
 await db.query('insert into mip_identity.mapping_heads values($1,$2,$3,true)',
  [runtime,principal,mappingRevision])
 return {keyRevision,mappingRevision,issuer,audience,subject,kid}
}

export function brokerSql(db){
 return async(name,args)=>{
  if(name!=='configuration'&&name!=='issue')throw Error('hosted_synthetic_broker_rpc_denied')
  await db.exec('set role mip_identity_broker_v2')
  try{
   if(name==='configuration'){
    const r=await db.query('select mip_identity.configuration($1,$2) result',args)
    return r.rows[0].result
   }
   const r=await db.query('select mip_identity.issue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',args)
   const sid=String(r.rows[0].result??'')
   if(!UUID.test(sid))throw Error('hosted_synthetic_issue_not_uuid')
   return sid
  }finally{await db.exec('reset role')}
 }
}

export async function issueDisposableWorkerSession(db,{
 runtime=DISPOSABLE_RUNTIME,principal=DISPOSABLE_PRINCIPAL,privateKey,publicJwk,
 kid=DISPOSABLE_KID,issuer=DISPOSABLE_ISSUER,audience=DISPOSABLE_AUDIENCE,
 now=Math.floor(Date.now()/1000),lifetimeSeconds=500,request=randomUUID()}={}){
 let key=privateKey,jwk=publicJwk
 if(!key||!jwk){
  const generated=generateDisposableWorkloadKey()
  key=generated.privateKey
  jwk=generated.publicJwk
 }
 const seeded=await seedDisposableIdentity(db,{runtime,principal,publicJwk:jwk,kid,issuer,audience})
 const token=mintWorkloadRs256({privateKey:key,kid,iss:issuer,aud:audience,sub:seeded.subject,
  now,exp:now+lifetimeSeconds})
 const session=await issueWorkloadSession({sql:brokerSql(db),token,runtime,principal,request,now})
 if(typeof session!=='string'||!UUID.test(session))throw Error('hosted_synthetic_issue_not_uuid')
 return {session,token,...seeded}
}
