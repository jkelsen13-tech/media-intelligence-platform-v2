// INERT candidate Edge entrypoint. No config, credentials, schedule or deployment.
import {qikWorkerHost} from './host.js'
const required=(name:string)=>{const value=Deno.env.get(name);if(!value)throw Error('mip_host_configuration');return value}
Deno.serve(qikWorkerHost({
 rpcUrl:required('MIP_QIK_WORKER_RPC_URL'),apiKey:required('MIP_QIK_PUBLISHABLE_KEY'),
 workerJwt:required('MIP_QIK_WORKER_JWT'),invokeToken:required('MIP_QIK_WORKER_INVOKE_TOKEN'),
 session:required('MIP_QIK_WORKER_SESSION'),runtime:required('MIP_QIK_WORKER_RUNTIME'),
 implementation:required('MIP_QIK_WORKER_IMPLEMENTATION')
}))
