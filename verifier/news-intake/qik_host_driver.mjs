// Disposable native host qualification: fake HTTP provider seam, actual RPC SQL.
import {createInterface} from 'node:readline'
import {webcrypto} from 'node:crypto'
import {qikWorkerHost} from '../../supabase/functions/source-comparison-generation-candidate/host.js'
if(process.env.MIP_R5_ISOLATION!=='network-none-socket-only')throw Error('isolation required')
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]()
const next=async()=>{const line=await lines.next();if(line.done)throw Error('broker closed');return JSON.parse(line.value)}
const config=await next()
const fetchImpl=async(url,options)=>{
 const name=new URL(url).pathname.split('/').at(-1)
 process.stdout.write(JSON.stringify({rpc:name,args:JSON.parse(options.body)})+'\n')
 const reply=await next()
 return new Response(JSON.stringify(reply.result??null),{status:reply.error?403:200})
}
const jwt='dummy.'+Buffer.from(JSON.stringify({role:'mip_comparison_worker_v1'})).toString('base64url')+'.dummy'
const host=qikWorkerHost({rpcUrl:'https://qualification.invalid/rest/v1/rpc/',apiKey:'synthetic-publishable',
 workerJwt:jwt,invokeToken:'synthetic-invoke',session:config.session,runtime:config.runtime,
 implementation:config.implementation,fetchImpl,cryptoImpl:webcrypto})
const response=await host(new Request('https://qualification.invalid/worker',{method:'POST',headers:{authorization:'Bearer synthetic-invoke'}}))
process.stdout.write(JSON.stringify({result:await response.json()})+'\n')
process.exit(0)
