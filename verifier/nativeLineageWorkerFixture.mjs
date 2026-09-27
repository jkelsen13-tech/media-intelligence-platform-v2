// UNAPPROVED — SOURCE CANDIDATE ONLY — NOT AUTHORIZED FOR EXECUTION OR TRANSMISSION
// Authored; NOT RUN. Future synthetic stdin bridge; no network or persistence.
import {createHash,randomUUID} from 'node:crypto'
import {processGenerationClaim} from '../supabase/functions/source-comparison-generation-candidate/workerV2.js'
let text='';for await(const chunk of process.stdin)text+=chunk
const {claim,session,runtime}=JSON.parse(text);let completion
const result=await processGenerationClaim({rpc:async(name,args)=>{
 if(name!=='worker_complete')throw Error('synthetic_worker_failed');completion=args;return 'completed'
},requestId:()=>randomUUID(),session,runtime,implementation:claim.implementation_ref,
sha256:s=>createHash('sha256').update(s).digest('hex')},claim)
if(result.state!=='completed'||!completion)throw Error('synthetic_completion_missing')
process.stdout.write(JSON.stringify(completion))
