// Explicit remote execution only. No .env reads, credential logs, or local files.
import pg from 'pg'
import {createInterface} from 'node:readline/promises'
import {Writable} from 'node:stream'
import {randomUUID,randomBytes} from 'node:crypto'
import {installOwnedPackages,cleanupOwnedPackages} from './ownedPackageInstall.mjs'
import {connectAuthenticatedPg,connectionTarget} from './authenticatedPgDriver.mjs'
import {bootstrapAuthenticatedOperation,cleanupAuthenticatedOperation,operationNames,readForwardWatermark} from './authenticatedBootstrap.mjs'
import {runAuthenticatedQualification} from './authenticatedQualification.mjs'
async function hiddenAdminUrl() {
  if(!process.stdin.isTTY)throw Error('cnc_hidden_prompt_requires_tty')
  const muted=new Writable({write(_chunk,_encoding,done){done()}})
  const prompt=createInterface({input:process.stdin,output:muted,terminal:true})
  process.stderr.write('qik administrator database URL (input hidden): ')
  try{return await prompt.question('')}finally{prompt.close();muted.end();process.stderr.write('\n')}
}
const env=process.env
if(process.argv[2]!=='--execute' || env.MIP_CNC_AUTHORIZATION!=='owner-authorized-qik-synthetic-driver') throw Error('cnc_explicit_remote_execution_authorization_required')
const operationId=env.MIP_CNC_OPERATION_ID||randomBytes(16).toString('hex'),names=operationNames(operationId)
const sessionPoolerHost=env.MIP_CNC_OBSERVED_SESSION_POOLER_HOST||null
const adminUrl=process.argv.includes('--prompt-admin-url')?await hiddenAdminUrl():env.MIP_CNC_ADMIN_DATABASE_URL
const url=connectionTarget(adminUrl,'postgres',false,sessionPoolerHost)
const passwords=Object.fromEntries(['collector','native','cas'].map(kind=>[kind,randomBytes(32).toString('hex')]))
const token=randomBytes(32).toString('hex')
const admin=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,statement_timeout:30000,application_name:'mip-cnc-owner-bootstrap'})
const clients=[]
let installed=false,bootstrapped=false,result=null,failed=false,cleanupFailed=false
try {
  await admin.connect()
  const who=(await admin.query('select session_user::text login,current_user::text effective')).rows[0]
  if(who.login!=='postgres'||who.effective!=='postgres')throw Error('cnc_admin_identity_refused')
  const watermarkBaseline=await readForwardWatermark(admin)
  await installOwnedPackages(admin,operationId);installed=true
  const manifest=await bootstrapAuthenticatedOperation(admin,{operationId,passwords,token,watermarkBaseline,sourceId:randomUUID(),investigation:randomUUID(),userId:randomUUID()})
  bootstrapped=true
  for(const kind of ['collector','native','cas']) {
    const runtimeUrl=new URL(url.href)
    runtimeUrl.username=names[kind]+(sessionPoolerHost&&url.hostname===sessionPoolerHost?'.qikvmopbtijoebdqosyq':'')
    runtimeUrl.password=passwords[kind]
    clients.push(await connectAuthenticatedPg({connectionString:runtimeUrl.href,expectedLogin:names[kind],effectiveRole:kind==='native'?'service_role':null,sessionPoolerHost}))
  }
  result=await runAuthenticatedQualification({admin,collector:clients[0],native:clients[1],cas:clients[2],manifest,token})
} catch(error) { failed=true;if(error.recoveryRequired)cleanupFailed=true } finally {
  for(const client of clients)try{await client.end()}catch{cleanupFailed=true}
  const exec=sql=>sql==='set session authorization postgres'?Promise.resolve():admin.query(sql)
  if(bootstrapped)try{await cleanupAuthenticatedOperation(admin,operationId)}catch{cleanupFailed=true}
  if(!cleanupFailed&&installed)try{await cleanupOwnedPackages(admin,operationId)}catch{cleanupFailed=true}
  try{await admin.end()}catch{cleanupFailed=true}
}
if(failed||cleanupFailed) {
  process.stderr.write(JSON.stringify({operationId,state:cleanupFailed?'cleanup_requires_owner_recovery':'qualification_failed'})+'\n')
  process.exitCode=1
} else {
  const {manifest,...safe}=result
  process.stdout.write(JSON.stringify({...safe,state:'temporary_qualification_complete',cleanup:'package_objects_and_operation_authority_removed'})+'\n')
}
