// One-shot, separately authorized runtime access for an installed disabled C3.
// No source, gate, scheduler, issuer or queue mutation. Secrets stay parameters.
import {assertCredentialLogging,installCredentialHelper,assignCredential,removeCredentialHelper} from '../collector-native-capture/credentialDelivery.mjs'

const operation = value => {
  if (!/^[a-f0-9]{32}$/.test(value ?? '')) throw Error('persistent_runtime_operation_invalid')
  return value
}
const roleName = id => 'cnc_' + operation(id) + '_collector'
const quote = value => '"' + value.replaceAll('"','""') + '"'
async function installer(db, expectedLogin) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(expectedLogin ?? '')) throw Error('persistent_runtime_installer_invalid')
  const row=(await db.query("select session_user::text login,current_user::text effective,r.rolsuper,r.rolcreaterole,d.datdba=r.oid database_owner from pg_roles r join pg_database d on d.datname=current_database() where r.rolname=session_user")).rows[0]
  if (!row || row.login!==expectedLogin || row.effective!==expectedLogin || row.rolsuper || !row.rolcreaterole || !row.database_owner)
    throw Error('persistent_runtime_installer_refused')
}
async function receipt(db, operationId, expectedLogin) {
  const row=(await db.query('select * from qik_ingest_operation.persistent_install_receipt where id for update')).rows[0]
  if (!row || row.operation_id!==operationId || row.installer!==expectedLogin) throw Error('persistent_runtime_receipt_refused')
  return row
}
async function closed(db) {
  const row=(await db.query("select (select collection_authorized from qik_ingest.collection_gate where id) gate_on,exists(select 1 from public.ingest_sources where enabled and collection_enabled) source_on,exists(select 1 from public.ingestion_runs where mode='discover' and state='running') run_on")).rows[0]
  if (!row || row.gate_on || row.source_on || row.run_on) throw Error('persistent_runtime_activity_refused')
}
async function membership(db, name) {
  return (await db.query("select member.rolname member,role.rolname granted,grantor.rolname grantor,m.admin_option,m.inherit_option,m.set_option from pg_auth_members m join pg_roles member on member.oid=m.member join pg_roles role on role.oid=m.roleid join pg_roles grantor on grantor.oid=m.grantor where member.rolname=$1 or role.rolname=$1",[name])).rows
}
function failed(action, error, commitAttempted) {
  const result=Error('persistent_runtime_'+action+'_failed')
  result.code=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'PERSISTENT'
  result.needs_reconciliation=commitAttempted
  return result
}
export async function provisionPersistentRuntime(db,{operationId,expectedLogin,runtimePassword,token,authorization}) {
  const runtimeLogin=roleName(operationId)
  if (authorization!=='owner-authorized-restricted-runtime' || !/^[A-Za-z0-9_-]{40,128}$/.test(runtimePassword??'') || !/^[A-Za-z0-9_-]{40,128}$/.test(token??''))
    throw Error('persistent_runtime_authorization_required')
  await installer(db,expectedLogin)
  await db.query('begin')
  let commitAttempted=false
  try {
    await db.query("set local statement_timeout='30000ms'")
    const row=await receipt(db,operationId,expectedLogin)
    if (row.runtime_login!==null || row.runtime_token_hash!==null) throw Error('persistent_runtime_already_provisioned')
    // Serialize with gate and source activation before deciding that collection is stopped.
    await db.query('lock table public.ingest_sources, qik_ingest.collection_gate in share row exclusive mode')
    await closed(db)
    // No password-bearing DDL occurs before the logging guard.
    await db.query("set local statement_timeout='1000ms'")
    await assertCredentialLogging(db)
    if ((await db.query('select 1 from pg_roles where rolname=$1',[runtimeLogin])).rowCount ||
        (await db.query('select 1 from qik_ingest.runtime_credentials')).rowCount)
      throw Error('persistent_runtime_preexisting_identity')
    await db.query('create role '+quote(runtimeLogin)+' login inherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication')
    await installCredentialHelper(db)
    await assignCredential(db,runtimeLogin,runtimePassword)
    await removeCredentialHelper(db)
    await db.query('grant qik_ingest_runtime to '+quote(runtimeLogin)+' with admin false, inherit true, set false')
    const members=await membership(db,runtimeLogin)
    const runtime=members.filter(m=>m.member===runtimeLogin && m.granted==='qik_ingest_runtime')
    const creator=members.filter(m=>m.member===expectedLogin && m.granted===runtimeLogin)
    if (members.length!==2 || runtime.length!==1 || runtime[0].grantor!==expectedLogin || runtime[0].admin_option || !runtime[0].inherit_option || runtime[0].set_option ||
        creator.length!==1 || !creator[0].admin_option || creator[0].inherit_option || creator[0].set_option)
      throw Error('persistent_runtime_membership_refused')
    const inserted=await db.query("insert into qik_ingest.runtime_credentials(credential_hash,active,notes) values(encode(sha256(convert_to($1,'UTF8')),'hex'),true,'operation-owned one-shot runtime') returning credential_hash",[token])
    await db.query('update qik_ingest_operation.persistent_install_receipt set runtime_login=$1,runtime_token_hash=$2,runtime_creator_grantor=$3 where id',[runtimeLogin,inserted.rows[0].credential_hash,creator[0].grantor])
    commitAttempted=true;await db.query('commit')
    return {state:'restricted_runtime_provisioned',operation_id:operationId,runtime_login:runtimeLogin,password_valid_minutes:30,collection_unchanged:true,needs_reconciliation:false}
  } catch(error) { await db.query('rollback').catch(()=>{});throw failed('provision',error,commitAttempted) }
}
export async function revokePersistentRuntime(db,{operationId,expectedLogin,authorization}) {
  const runtimeLogin=roleName(operationId)
  if (authorization!=='owner-authorized-restricted-runtime-revocation') throw Error('persistent_runtime_revoke_authorization_required')
  await installer(db,expectedLogin)
  await db.query('begin')
  let commitAttempted=false
  try {
    await db.query("set local statement_timeout='30000ms'")
    const row=await receipt(db,operationId,expectedLogin)
    if (row.runtime_login!==runtimeLogin || !/^[a-f0-9]{64}$/.test(row.runtime_token_hash??'') || !row.runtime_creator_grantor)
      throw Error('persistent_runtime_receipt_refused')
    // require_token holds FOR SHARE through every admitted RPC transaction.
    // DELETE waits for them, then prevents any later token admission.
    const credential=await db.query('delete from qik_ingest.runtime_credentials where credential_hash=$1 and active returning credential_hash',[row.runtime_token_hash])
    if (credential.rowCount!==1 || (await db.query('select 1 from qik_ingest.runtime_credentials')).rowCount)
      throw Error('persistent_runtime_credential_drift')
    // Prevent a concurrent source/gate activation while checking the stopped state.
    await db.query('lock table public.ingest_sources, qik_ingest.collection_gate in share row exclusive mode')
    await closed(db)
    if ((await db.query('select 1 from pg_stat_activity where usename=$1 and pid<>pg_backend_pid()',[runtimeLogin])).rowCount)
      throw Error('persistent_runtime_session_active')
    // Do not strand token-bound native work or a run needing reconciliation,
    // including extraction incomplete after the native job completed.
    if ((await db.query("select 1 from qik_ingest.observed_items o left join evidence_pipeline.import_jobs j on j.id=o.native_job_id where o.credential_hash=$1 and (j.id is null or j.state not in ('completed','dead_letter')) limit 1",[row.runtime_token_hash])).rowCount)
      throw Error('persistent_runtime_jobs_unresolved')
    if ((await db.query("select 1 from public.ingestion_runs r where r.mode='discover' and exists(select 1 from qik_ingest.observed_items o where o.run_id=r.run_id and o.credential_hash=$1) and (r.state<>'completed' or coalesce((r.counters->>'unresolved')::int,0)>0 or coalesce((r.counters->>'failed_jobs')::int,0)>0 or coalesce((r.counters->>'extraction_incomplete')::int,0)>0) limit 1",[row.runtime_token_hash])).rowCount)
      throw Error('persistent_runtime_run_unresolved')
    // Empty qik runs have no credential attribution; refuse their debt conservatively.
    if ((await db.query("select 1 from public.ingestion_runs r where r.mode='discover' and r.algorithm_version='qik-ingest-rss-v1-retain-from-yhb-v8' and not exists(select 1 from qik_ingest.observed_items o where o.run_id=r.run_id) and (r.state<>'completed' or coalesce((r.counters->>'unresolved')::int,0)>0 or coalesce((r.counters->>'failed_jobs')::int,0)>0 or coalesce((r.counters->>'extraction_incomplete')::int,0)>0) limit 1")).rowCount)
      throw Error('persistent_runtime_run_unattributed')
    const members=await membership(db,runtimeLogin)
    const runtime=members.filter(m=>m.member===runtimeLogin && m.granted==='qik_ingest_runtime')
    const creator=members.filter(m=>m.member===expectedLogin && m.granted===runtimeLogin)
    if (members.length!==2 || runtime.length!==1 || runtime[0].grantor!==expectedLogin || runtime[0].admin_option || !runtime[0].inherit_option || runtime[0].set_option ||
        creator.length!==1 || creator[0].grantor!==row.runtime_creator_grantor || !creator[0].admin_option || creator[0].inherit_option || creator[0].set_option)
      throw Error('persistent_runtime_membership_drift')
    await db.query('revoke qik_ingest_runtime from '+quote(runtimeLogin))
    await db.query('drop role '+quote(runtimeLogin))
    await db.query('update qik_ingest_operation.persistent_install_receipt set runtime_login=null,runtime_token_hash=null,runtime_creator_grantor=null where id')
    await db.query('select qik_ingest_operation.refuse_membership_drift()')
    commitAttempted=true;await db.query('commit')
    return {state:'restricted_runtime_revoked',operation_id:operationId,runtime_login:runtimeLogin,collection_unchanged:true,needs_reconciliation:false}
  } catch(error) { await db.query('rollback').catch(()=>{});throw failed('revoke',error,commitAttempted) }
}
