// Explicit source-only installation/removal command. Never provisions credentials.
import {createInterface} from 'node:readline/promises'
import {Writable} from 'node:stream'
import {connectPersistentInstaller,installPersistentQik,cleanupPersistentQik} from './persistentInstall.mjs'
async function hidden(){
  if(!process.stdin.isTTY)throw Error('persistent_prompt_requires_tty')
  const muted=new Writable({write(_chunk,_encoding,done){done()}})
  const prompt=createInterface({input:process.stdin,output:muted,terminal:true})
  process.stderr.write('Installer database URL (input hidden): ')
  try{return await prompt.question('')}finally{prompt.close();muted.end();process.stderr.write('\n')}
}
let db,receipt,closed=false
try{
  const action=process.argv[2]
  if(!['install','cleanup'].includes(action)||!process.argv.includes('--execute')
    ||process.env.MIP_C3_PERSISTENT_AUTHORIZATION!==(action==='install'?'owner-authorized-disabled-install':'owner-authorized-persistent-cleanup'))
    throw Error('persistent_authorization_required')
  db=await connectPersistentInstaller({
    connectionString:process.argv.includes('--prompt-secrets')?await hidden():process.env.MIP_C3_INSTALLER_DATABASE_URL,
    expectedLogin:process.env.MIP_C3_INSTALLER_LOGIN,
    disposable:process.argv.includes('--disposable'),
    sessionPoolerHost:process.env.MIP_C3_SESSION_POOLER_HOST||null,
  })
  const config={operationId:process.env.MIP_C3_OPERATION_ID,expectedLogin:process.env.MIP_C3_INSTALLER_LOGIN}
  receipt=action==='install'?await installPersistentQik(db,config):await cleanupPersistentQik(db,{...config,cleanupAuthorization:process.env.MIP_C3_PERSISTENT_AUTHORIZATION})
}catch(error){
  receipt={state:'persistent_operation_refused',needs_reconciliation:error.needs_reconciliation??true}
  process.exitCode=1
}finally{
  if(db)try{await db.end();closed=true}catch{process.exitCode=1}
}
process.stdout.write(JSON.stringify({...receipt,connection_closed:closed})+'\n')
if(!closed)process.exitCode=1
