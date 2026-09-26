// Explicit one-shot runtime provision/revoke. No generated secret or retry.
import {createInterface} from 'node:readline/promises'
import {Writable} from 'node:stream'
import {connectPersistentInstaller} from './persistentInstall.mjs'
import {provisionPersistentRuntime,revokePersistentRuntime} from './persistentRuntime.mjs'
async function hidden(label) {
  if (!process.stdin.isTTY) throw Error('persistent_runtime_prompt_requires_tty')
  const muted=new Writable({write(_chunk,_encoding,done){done()}})
  const prompt=createInterface({input:process.stdin,output:muted,terminal:true})
  process.stderr.write(label+' (input hidden): ')
  try {return await prompt.question('')} finally {prompt.close();muted.end();process.stderr.write('\n')}
}
let db,receipt,closed=false
try {
  const action=process.argv[2]
  const authority=action==='provision'?'owner-authorized-restricted-runtime':'owner-authorized-restricted-runtime-revocation'
  if (!['provision','revoke'].includes(action) || !process.argv.includes('--execute') ||
      process.env.MIP_C3_RUNTIME_AUTHORIZATION!==authority) throw Error('persistent_runtime_authorization_required')
  const prompted=process.argv.includes('--prompt-secrets')
  const connectionString=prompted?await hidden('Installer database URL'):process.env.MIP_C3_INSTALLER_DATABASE_URL
  const runtimePassword=action==='provision'?(prompted?await hidden('One-shot runtime password'):process.env.MIP_C3_RUNTIME_PASSWORD):undefined
  const token=action==='provision'?(prompted?await hidden('One-shot runtime token'):process.env.MIP_C3_RUNTIME_TOKEN):undefined
  db=await connectPersistentInstaller({connectionString,expectedLogin:process.env.MIP_C3_INSTALLER_LOGIN,
    disposable:process.argv.includes('--disposable'),sessionPoolerHost:process.env.MIP_C3_SESSION_POOLER_HOST||null})
  const options={operationId:process.env.MIP_C3_OPERATION_ID,expectedLogin:process.env.MIP_C3_INSTALLER_LOGIN,
    authorization:authority,runtimePassword,token}
  receipt=action==='provision'?await provisionPersistentRuntime(db,options):await revokePersistentRuntime(db,options)
} catch(error) {
  receipt={state:'persistent_runtime_refused',needs_reconciliation:error.needs_reconciliation??true}
  process.exitCode=1
} finally {if(db)try{await db.end();closed=true}catch{process.exitCode=1}}
process.stdout.write(JSON.stringify({...receipt,connection_closed:closed})+'\n')
if(!closed)process.exitCode=1
