// Hosted-synthetic installer. Disposable / local. Not live qik apply.
// Wraps 005+20 in one transaction so the 005 public-source GRANT never commits
// without 20's revoke. Records catalog deltas into hosted_synthetic_operation.
import {readFile} from 'node:fs/promises'

const repo=p=>readFile(new URL('../../../'+p,import.meta.url),'utf8')

export const HOSTED_SYNTHETIC_INSTALL=Object.freeze([
 {id:0,path:'supabase/qualification/hosted-synthetic/05_operation_ledger.sql'},
 {id:1,path:'supabase/qualification/comparison-generations/contract.sql'},
 {id:2,path:'supabase/qualification/comparison-generations/selection.sql'},
 {id:3,path:'supabase/qualification/comparison-generations/capability.sql'},
 {id:4,path:'supabase/qualification/hosted-synthetic/10_synthetic_source_adapter.sql'},
 {id:7,path:'supabase/qualification/mip-cutover-authority/001_execute_only_identities.sql'},
 {id:8,path:'supabase/qualification/mip-cutover-authority/002_candidate_interfaces.sql'},
 {id:9,path:'supabase/qualification/mip-cutover-authority/003_scoped_queue.sql'},
 {id:10,path:'supabase/qualification/mip-cutover-authority/004_publication_staging.sql'},
 {id:11,path:'supabase/qualification/mip-cutover-authority/005_broker_sessions.sql'},
 {id:12,path:'supabase/qualification/hosted-synthetic/20_grant_rebind.sql'},
 {id:13,path:'supabase/qualification/mip-cutover-authority/013_worker_journal.sql'},
 {id:14,path:'supabase/qualification/mip-cutover-authority/014_worker_journal_discovery.sql'},
 {id:15,path:'supabase/qualification/mip-cutover-authority/015_worker_claim_resumption.sql'},
 {id:16,path:'supabase/qualification/mip-cutover-authority/016_worker_broker_recovery.sql'},
 {id:17,path:'supabase/qualification/hosted-synthetic/30_seed_runtime_and_work.sql'}
])

export function stripOuterTransaction(sql){
 const out=[]
 let strippedBegin=false,strippedCommit=false
 for(const line of sql.split('\n')){
  if(!strippedBegin&&/^\s*begin\s*;\s*$/i.test(line)){strippedBegin=true;continue}
  if(strippedBegin&&!strippedCommit&&/^\s*commit\s*;\s*$/i.test(line)){
   strippedCommit=true;continue
  }
  out.push(line)
 }
 return out.join('\n')
}

async function capture(db,step){
 await db.query('select hosted_synthetic_operation.capture_step($1)',[String(step)])
}

export async function installHostedSynthetic(db,{until=17,from=0,atomicWindow=true}={}){
 for(const step of HOSTED_SYNTHETIC_INSTALL){
  if(step.id<from||step.id>until)continue
  if(atomicWindow&&step.id===11&&until>=12){
   await db.exec('begin')
   try{
    await db.exec(stripOuterTransaction(await repo(step.path)))
    await capture(db,'005')
    await db.query("update hosted_synthetic_operation.operation set window_005_20='needs_recovery'")
    await db.exec(stripOuterTransaction(await repo('supabase/qualification/hosted-synthetic/20_grant_rebind.sql')))
    await db.exec('commit')
   }catch(error){
    try{await db.exec('rollback')}catch{}
    throw error
   }
   continue
  }
  if(atomicWindow&&step.id===12&&until>=12)continue
  await db.exec(await repo(step.path))
  await capture(db,step.id)
  if(!atomicWindow&&step.id===11){
   await db.query("update hosted_synthetic_operation.operation set window_005_20='needs_recovery'")
  }
 }
}

export async function recoverPublicSourceWindow(db){
 await db.exec(await repo('supabase/qualification/hosted-synthetic/25_window_recovery.sql'))
}

export async function cleanupHostedSynthetic(db){
 await db.exec(await repo('supabase/qualification/hosted-synthetic/90_cleanup.sql'))
}
