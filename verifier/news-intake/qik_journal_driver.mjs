// Source-free R5 process-restart fixture. No credential/environment discovery.
import {createInterface} from 'node:readline'
import {randomUUID,createHash} from 'node:crypto'
import {runQikJournaledWorker,recoverQikJournaledRequest} from '../../supabase/functions/source-comparison-generation-candidate/qikWorkerJournal.js'
if(process.env.MIP_R5_ISOLATION!=='network-none-socket-only')throw Error('isolated invocation required')
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]()
const next=async()=>{const line=await lines.next();if(line.done)throw Error('broker closed');return JSON.parse(line.value)}
const config=await next()
const allowed=new Set(['worker_claim','worker_complete','worker_fail','worker_journal_put','worker_journal_get'])
const rpc=async(name,args)=>{
 if(!allowed.has(name))throw Error('RPC denied')
 process.stdout.write(JSON.stringify({rpc:name,args})+'\n')
 const reply=await next()
 if(reply.error)throw Error('broker rejected')
 return reply.result
}
const options={rpc,runtime:config.runtime,session:config.session,implementation:config.implementation,
 requestId:()=>randomUUID(),sha256:s=>createHash('sha256').update(s).digest('hex')}
let result
if(config.mode==='run')result=await runQikJournaledWorker(options)
else if(config.mode==='recover')result=await recoverQikJournaledRequest({...options,key:config.key})
else throw Error('mode denied')
process.stdout.write(JSON.stringify({result:typeof result==='string'?{state:result}: {state:result.state}})+'\n')
process.exit(0)
