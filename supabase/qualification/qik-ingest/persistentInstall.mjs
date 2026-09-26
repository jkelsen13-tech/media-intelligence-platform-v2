// C3-only source candidate. No credential issuer, source activation or scheduler.
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {LOAD_ORDER,CLEANUP_FILE,installQikIngest,cleanupQikIngest} from './installQikIngest.mjs'
import {connectionTarget} from '../collector-native-capture/authenticatedPgDriver.mjs'

const operation=id=>{
  if(!/^[a-f0-9]{32}$/.test(id??''))throw Error('persistent_operation_invalid')
  return id
}
const expected=name=>{
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(name??''))throw Error('persistent_login_invalid')
  return name
}
async function identity(db,login) {
  expected(login)
  const row=(await db.query("select session_user::text login,current_user::text effective,r.rolsuper,r.rolcreaterole,d.datdba=r.oid database_owner from pg_roles r join pg_database d on d.datname=current_database() where r.rolname=session_user")).rows[0]
  if(!row||row.login!==login||row.effective!==login||row.rolsuper||!row.rolcreaterole||!row.database_owner)
    throw Error('persistent_installer_identity_refused')
  return row
}
async function sourcesClosed(db) {
  if((await db.query('select exists(select 1 from public.ingest_sources where enabled and collection_enabled) active')).rows[0].active)
    throw Error('persistent_active_sources_refused')
}
async function manifest() {
  const hashes=[]
  for(const name of [...LOAD_ORDER,CLEANUP_FILE])hashes.push([name,createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex')])
  return createHash('sha256').update(JSON.stringify(hashes)).digest('hex')
}
function atomicExec(db) {
  return async sql=>{
    if(/\bset\s+session\s+authorization\b/i.test(sql))throw Error('persistent_impersonation_refused')
    const body=sql.replace(/^\s*(begin|commit);\s*$/gim,'')
    if(body.trim().toLowerCase()==='rollback')throw Error('persistent_package_step_failed')
    return db.query(body)
  }
}
function failure(action,error,commitAttempted) {
  const result=Error('persistent_'+action+'_failed')
  result.code=/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'PERSISTENT'
  result.needs_reconciliation=commitAttempted
  return result
}
export async function connectPersistentInstaller({connectionString,expectedLogin,sessionPoolerHost=null,disposable=false}) {
  expected(expectedLogin)
  if(disposable&&process.env.MIP_DISPOSABLE_POSTGRES!=='qik-persistent-install')throw Error('persistent_disposable_refused')
  const url=connectionTarget(connectionString,expectedLogin,disposable,sessionPoolerHost)
  if(!disposable&&url.pathname!=='/postgres')throw Error('persistent_database_refused')
  const db=new pg.Client({connectionString:url.href,ssl:disposable?false:{rejectUnauthorized:true},
    connectionTimeoutMillis:10000,statement_timeout:30000,query_timeout:40000,
    application_name:'mip-c3-persistent-install-source'})
  try {await db.connect();await identity(db,expectedLogin);return db}
  catch {await db.end().catch(()=>{});throw Error('persistent_authenticated_connection_failed')}
}
export async function installPersistentQik(db,{operationId,expectedLogin}) {
  operation(operationId);await identity(db,expectedLogin);await sourcesClosed(db)
  const sqlHash=await manifest()
  await db.query('begin')
  let commitAttempted=false
  try {
    // Serialize source activation against the disabled installation snapshot.
    await db.query('lock table public.ingest_sources in share row exclusive mode')
    await sourcesClosed(db)
    await installQikIngest(atomicExec(db),{sessionAuthorization:'current'})
    await identity(db,expectedLogin)
    const closed=(await db.query("select (select collection_authorized=false from qik_ingest.collection_gate where id) gate_closed,(select count(*)=0 from qik_ingest.runtime_credentials) credentials_empty,(select bool_and(not active) from qik_ingest.schedule_intent) schedule_inactive")).rows[0]
    if(!closed.gate_closed||!closed.credentials_empty||!closed.schedule_inactive)throw Error('persistent_default_state_refused')
    await db.query('create table qik_ingest_operation.persistent_install_receipt(id boolean primary key check(id),operation_id text not null,installer name not null,sql_manifest_sha256 text not null,installed_at timestamptz not null default clock_timestamp())')
    await db.query('revoke all on qik_ingest_operation.persistent_install_receipt from public,anon,authenticated,service_role,qik_ingest_runtime')
    await db.query('insert into qik_ingest_operation.persistent_install_receipt(id,operation_id,installer,sql_manifest_sha256) values(true,$1,session_user,$2)',[operationId,sqlHash])
    await db.query("comment on schema qik_ingest_operation is 'persistent-c3:"+operationId+"'")
    commitAttempted=true;await db.query('commit')
    return {state:'installed_disabled',operation_id:operationId,installer:expectedLogin,sql_manifest_sha256:sqlHash,
      gate_closed:true,credentials_empty:true,schedule_inactive:true,needs_reconciliation:false}
  }catch(error){
    await db.query('rollback').catch(()=>{})
    throw failure('install',error,commitAttempted)
  }
}
export async function cleanupPersistentQik(db,{operationId,expectedLogin,cleanupAuthorization}) {
  // Explicit action only. Installation never automatically calls this cleanup.
  operation(operationId)
  if(cleanupAuthorization!=='owner-authorized-persistent-cleanup')throw Error('persistent_cleanup_authorization_required')
  await identity(db,expectedLogin)
  await db.query('begin')
  let commitAttempted=false
  try {
    const marker=(await db.query("select obj_description(oid,'pg_namespace') marker,nspowner=current_user::regrole owned from pg_namespace where nspname='qik_ingest_operation'")).rows[0]
    if(!marker?.owned||marker.marker!=='persistent-c3:'+operationId)throw Error('persistent_cleanup_ownership_refused')
    const receipt=(await db.query('select * from qik_ingest_operation.persistent_install_receipt where id for update')).rows[0]
    if(!receipt||receipt.operation_id!==operationId||receipt.installer!==expectedLogin||receipt.sql_manifest_sha256!==await manifest())
      throw Error('persistent_cleanup_receipt_refused')
    // Existing cleanup checks gate/sources, ledger drift and external grants.
    // Preserve watermarks and native audit rows after persistent use.
    await db.query('drop table qik_ingest_operation.persistent_install_receipt')
    await cleanupQikIngest(atomicExec(db),{sessionAuthorization:'current'})
    await identity(db,expectedLogin)
    commitAttempted=true;await db.query('commit')
    return {state:'package_removed',operation_id:operationId,native_evidence_retained:true,watermarks_retained:true,needs_reconciliation:false}
  }catch(error){
    await db.query('rollback').catch(()=>{})
    throw failure('cleanup',error,commitAttempted)
  }
}
