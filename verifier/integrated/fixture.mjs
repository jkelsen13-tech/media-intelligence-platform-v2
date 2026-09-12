import {readFile} from 'node:fs/promises'
import {randomUUID,generateKeyPairSync,sign,randomBytes} from 'node:crypto'
import {raw,quote as q,transport,guard} from './transport.mjs'
import {issueWorkloadSession,encryptedRemoteJournal} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
export const workerRole='mip_comparison_worker_v1',producerRole='mip_comparison_producer_v1'
export const implementation='isolated-event-projection-candidate'
export async function fixture(t){
 guard();const db='mip_integrated_'+randomUUID().replaceAll('-','')
 await raw('postgres','create database '+db)
 t.after(()=>raw('postgres','drop database '+db+' with (force)'))
 const admin=sql=>raw(db,sql)
 for(const f of ['contract.sql','selection.sql','capability.sql','source-fixture.sql','source-snapshot.sql'])
  await admin(await readFile(new URL('../../supabase/qualification/comparison-generations/'+f,import.meta.url),'utf8'))
 for(const f of ['001_execute_only_identities.sql','002_candidate_interfaces.sql','003_scoped_queue.sql','004_publication_staging.sql','005_broker_sessions.sql'])
  await admin(await readFile(new URL('../../supabase/qualification/mip-cutover-authority/'+f,import.meta.url),'utf8'))
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
 const keyRevision=randomUUID(),issuer='https://isolated.invalid',audience='isolated-broker'
 await admin("insert into mip_identity.key_versions values("+q(keyRevision)+","+q(issuer)+",'synthetic',"+q(publicKey.export({format:'jwk'}))+",'2000-01-01','2999-01-01','synthetic-owner-fixture');insert into mip_identity.key_heads values("+q(issuer)+",'synthetic',"+q(keyRevision)+",true);")
 const mappings={}
 for(const runtime of ['runtime-a','runtime-b']){
  await admin("insert into mip_cutover_authority.runtime_config values("+q(runtime)+",'source',"+q(implementation)+",'{\"entries\":[]}');select comparison_qualification.bind_source_scope("+q(runtime)+",'source');select comparison_qualification.bind_evaluated_implementation("+q(runtime)+","+q(implementation)+");")
  for(const principal of [workerRole,producerRole]){
   for(const rpc of principal===workerRole?['worker_claim','worker_complete','worker_fail']:['producer_enqueue'])
    await admin('select comparison_qualification.bind_runtime('+[runtime,principal,rpc].map(q).join(',')+');')
   const revision=randomUUID(),subject=runtime+':'+principal
   mappings[runtime+principal]=revision
   await admin('insert into mip_identity.mapping_versions values('+[revision,runtime,principal,issuer,audience,subject,keyRevision,600,'synthetic-owner-fixture'].map(q).join(',')+');insert into mip_identity.mapping_heads values('+[runtime,principal,revision].map(q).join(',')+',true);')
  }
 }
 const broker=transport(db,'mip_identity_broker_v2')
 function token(runtime='runtime-a',principal=workerRole,override={}){
  const now=Math.floor(Date.now()/1000),enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
  const input=enc({alg:'RS256',typ:'JWT',kid:'synthetic'})+'.'+enc({iss:issuer,aud:audience,sub:runtime+':'+principal,iat:now,exp:now+500,jti:randomUUID(),...override})
  return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')
 }
 const issue=async(runtime='runtime-a',principal=workerRole,extra={})=>issueWorkloadSession({sql:broker,token:token(runtime,principal),runtime,principal,request:randomUUID(),now:Math.floor(Date.now()/1000),...extra})
 const session=await issue(),producer=await issue('runtime-a',producerRole)
 const rpc=transport(db,workerRole),producerRpc=transport(db,producerRole)
 const capture=()=>producerRpc('producer_enqueue',[randomUUID(),producer,'runtime-a',{},null])
 const keys=new Map(['runtime-a','runtime-b'].map(r=>[r,{version:'synthetic-v1',key:randomBytes(32)}]))
 const keyProvider=(runtime,version)=>{const key=keys.get(runtime);if(!key||(version&&version!==key.version))throw Error('mip_journal_key_unavailable');return key}
 const journal=s=>encryptedRemoteJournal({sql:transport(db,'mip_journal_gateway_v2'),session:s,keyProvider})
 return {db,admin,broker,token,issue,session,producer,rpc,producerRpc,capture,mappings,keyRevision,journal}
}
