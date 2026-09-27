// Portable command entrypoint; execution remains disabled unless explicitly configured.
import {FORWARD_SOURCE} from './forwardSourceContract.mjs'
import {runOperationalHost} from './operationalHost.mjs'

let interrupted=false
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{interrupted=true;process.exitCode=1})
const receipt=await runOperationalHost({env:process.env,source:FORWARD_SOURCE,
  disposable:process.argv.includes('--disposable')})
const safe=interrupted
  ?{state:'operational_host_interrupted',needs_reconciliation:true,connection_closed:receipt.connection_closed===true}
  :receipt
process.stdout.write(JSON.stringify(safe)+'\n')
if(safe.state!=='completed'||safe.needs_reconciliation||!safe.connection_closed)process.exitCode=1
