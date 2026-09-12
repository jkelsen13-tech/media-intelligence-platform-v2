// Isolated host adapter. journal MUST be a remote, access-controlled durable store.
// No filesystem, browser storage, credentials, or provider client is created here.
import {runGenerationWorker} from './worker.js'

const allowed=new Set(['worker_claim','worker_complete','worker_fail'])
function immutable(value){return JSON.parse(JSON.stringify(value))}
function validate(entry,runtime){
 if(!entry||entry.version!==1||!allowed.has(entry.operation)||
   entry.args?.p_runtime!==runtime||typeof entry.args?.p_request!=='string'||
   Object.hasOwn(entry.args,'p_session'))throw new Error('mip_recovery_binding')
}
export function durableWorkerRpc({rpc,journal,runtime,session}){
 if(!journal||typeof journal.putOnce!=='function'||typeof journal.get!=='function')
  throw new Error('mip_remote_journal_required')
 return async(operation,args)=>{
  if(!allowed.has(operation)||args.p_runtime!==runtime||args.p_session!==session)
   throw new Error('mip_recovery_binding')
  const retained=immutable(args);delete retained.p_session
  const entry={version:1,operation,args:retained}
  validate(entry,runtime)
  const key=operation+':'+args.p_request
  // putOnce must compare exact content on conflict and acknowledge only durable commit.
  // Lease tokens are secrets: keep this journal outside public artifacts and logs.
  await journal.putOnce(key,entry)
  const result=await rpc(operation,immutable(args))
  const receipt=operation==='worker_claim'?(result?{generation_id:result.generation_id}:null):immutable(result)
  await journal.putOnce(key+':receipt',{version:1,result:receipt})
  return result
 }
}
export async function runDurableGenerationWorker(options){
 return runGenerationWorker({...options,rpc:durableWorkerRpc(options)})
}
export async function recoverGenerationRequest({rpc,journal,runtime,session,key}){
 const entry=await journal.get(key)
 validate(entry,runtime)
 if(key!==entry.operation+':'+entry.args.p_request)throw new Error('mip_recovery_binding')
 // Explicit recovery always calls the server with fresh current authority.
 // A local receipt is not authority and cannot bypass revocation.
 const result=await durableWorkerRpc({rpc,journal,runtime,session})(
  entry.operation,{...immutable(entry.args),p_session:session})
 if(entry.operation==='worker_claim'&&result&&!result.lease_token)
  return {state:'retained_pending_explicit_recovery',generation:result.generation_id}
 return result
}
