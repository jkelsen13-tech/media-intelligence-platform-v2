// Disposable source-free qualification driver; no connection, credential or publication API.
import {createInterface} from 'node:readline'
import {randomUUID,createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {runGenerationWorker} from '../../supabase/functions/source-comparison-generation-candidate/workerV2.js'
if(process.env.MIP_R5_ISOLATION!=='network-none-socket-only')throw Error('isolated invocation required')
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]()
const next=async()=>{const line=await lines.next();if(line.done)throw Error('broker closed');return JSON.parse(line.value)}
const config=await next()
const rpc=async(name,args)=>{
  process.stdout.write(JSON.stringify({rpc:name,args})+'\n')
  const reply=await next()
  if(reply.error)throw Error(reply.error)
  return reply.result
}
const started=performance.now()
const result=await runGenerationWorker({
  rpc,requestId:()=>randomUUID(),session:config.session,runtime:config.runtime,
  implementation:config.implementation,
  sha256:s=>createHash('sha256').update(s).digest('hex')
})
const initialState=result.state
if(result.retry)result.state=await result.retry()
process.stdout.write(JSON.stringify({result:{state:result.state,initial_state:initialState,
  generation:result.generation,worker_elapsed_ms:performance.now()-started}})+'\n')
process.exit(0)
