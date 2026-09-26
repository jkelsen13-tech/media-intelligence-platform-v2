// Source-only, operation-owned bootstrap. Requires an explicit owner-authorized
// administrator connection. Native membership is BROAD service_role authority.
import {createHash} from 'node:crypto'
import {installCredentialHelper,assignCredential,removeCredentialHelper} from './credentialDelivery.mjs'
const canonical = value => JSON.stringify(value, function(_key,item) {
  return item && typeof item==='object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item
})
const ident = value => {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw Error('cnc_identifier_invalid')
  return '"' + value + '"'
}
const secretLiteral = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(value)) throw Error('cnc_secret_invalid')
  return "'" + value + "'"
}
export function operationNames(operationId) {
  if (!/^[a-f0-9]{32}$/.test(operationId ?? '')) throw Error('cnc_operation_id_invalid')
  const stem = 'cnc_' + operationId
  return Object.freeze({collector: stem + '_collector',native: stem + '_native',cas: stem + '_cas'})
}
export async function readForwardWatermark(admin) {
  return (await admin.query("select watermark,captured_at::text as captured_at from public.mip_consolidation_watermarks where source_project_ref='qikvmopbtijoebdqosyq' and channel='ingest_forward'")).rows[0] ?? null
}
export async function bootstrapAuthenticatedOperation(admin, config) {
  const {operationId, passwords, token, sourceId, investigation, userId} = config
  const names = operationNames(operationId)
  for (const password of Object.values(passwords ?? {})) secretLiteral(password)
  for (const name of ['collector','native','cas']) secretLiteral(passwords?.[name])
  secretLiteral(token)
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const prefix = 'https://qualification.invalid/collector-native-capture/' + operationId + '/'
  await admin.query('begin')
  try {
    const existing = await admin.query("select to_regclass('qik_ingest_operation.authenticated_driver_operation') as ledger")
    if (existing.rows[0].ledger) throw Error('cnc_operation_already_present')
    if ((await admin.query('select 1 from pg_roles where rolname=any($1::text[])',[Object.values(names)])).rowCount) throw Error('cnc_role_already_present')
    if ((await admin.query('select 1 from public.ingest_sources where id=$1::uuid or feed_url=$2',[sourceId,prefix+'feed.xml'])).rowCount) throw Error('cnc_source_already_present')
    if ((await admin.query('select 1 from mip_cas.principals where login=$1 or user_id=$2::uuid',[names.cas,userId])).rowCount
        || (await admin.query('select 1 from mip_cas.access where investigation=$1::uuid',[investigation])).rowCount
        || (await admin.query('select 1 from mip_cas.source_identities where investigation=$1::uuid',[investigation])).rowCount
        || (await admin.query('select 1 from mip_cas.source_permissions where investigation=$1::uuid',[investigation])).rowCount) throw Error('cnc_cas_scope_already_present')
    if ((await admin.query('select 1 from qik_ingest.runtime_credentials where credential_hash=$1',[tokenHash])).rowCount) throw Error('cnc_token_already_present')
    if ((await admin.query('select collection_authorized from qik_ingest.collection_gate where id')).rows[0]?.collection_authorized !== false) throw Error('cnc_gate_not_closed')
    if ((await admin.query('select 1 from public.ingest_sources where enabled and collection_enabled')).rowCount) throw Error('cnc_other_source_enabled')
    await admin.query('create table qik_ingest_operation.authenticated_driver_operation (id text primary key, manifest jsonb not null)')
    await admin.query('revoke all on qik_ingest_operation.authenticated_driver_operation from public,anon,authenticated,service_role,qik_ingest_runtime')
    const priorStatementTimeout=(await admin.query("select current_setting('statement_timeout') timeout")).rows[0].timeout
    await admin.query("set local statement_timeout='1000ms'")
    await installCredentialHelper(admin)
    // Passwordless CREATE statements are safe under existing DDL logging.
    for (const kind of ['collector','native','cas']) {
      await admin.query('create role '+ident(names[kind])+' login nosuperuser nocreatedb nocreaterole nobypassrls '+(kind==='native'?'noinherit':'inherit'))
      await assignCredential(admin,names[kind],passwords[kind])
    }
    await removeCredentialHelper(admin)
    await admin.query("select set_config('statement_timeout',$1,true)",[priorStatementTimeout])
    await admin.query('grant qik_ingest_runtime to '+ident(names.collector))
    await admin.query('grant service_role to '+ident(names.native))
    await admin.query('grant mip_cas_gateway to '+ident(names.cas))
    await admin.query('insert into mip_cas.principals(login,user_id) values($1,$2::uuid)',[names.cas,userId])
    await admin.query("insert into mip_cas.access values($1::uuid,$2::uuid,clock_timestamp()+interval '30 minutes')",[userId,investigation])
    await admin.query('insert into qik_ingest.runtime_credentials(credential_hash,active,notes) values($1,true,$2)',[tokenHash,'synthetic qualification '+operationId])
    await admin.query('insert into public.ingest_sources(id,feed_url,outlet_name,enabled,collection_enabled) values($1::uuid,$2,$3,false,false)',[sourceId,prefix+'feed.xml','CNC qualification '+operationId])
    const installedWatermark=await readForwardWatermark(admin)
    const watermarkBaseline=Object.hasOwn(config,'watermarkBaseline')?config.watermarkBaseline:installedWatermark
    const memberships=(await admin.query('select parent.rolname as parent,child.rolname as child,m.admin_option from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles child on child.oid=m.member where child.rolname=any($1::text[]) or parent.rolname=any($1::text[]) order by parent.rolname,child.rolname',[Object.values(names)])).rows
    const manifest = {operationId,names,sourceId,investigation,userId,tokenHash,prefix,memberships,watermarkBaseline,installedWatermark,sourceVersions:[],captureIds:[]}
    await admin.query('insert into qik_ingest_operation.authenticated_driver_operation values($1,$2::jsonb)',[operationId,JSON.stringify(manifest)])
    await admin.query('commit')
    return manifest
  } catch (error) {
    await admin.query('rollback').catch(()=>{})
    // Driver callers must not log PostgreSQL error objects (DDL may contain secrets).
    throw Error('cnc_bootstrap_failed')
  }
}
export async function authorizeSyntheticCapture(admin, manifest, capture, provenance) {
  await admin.query('begin')
  try {
    const locked=(await admin.query('select manifest from qik_ingest_operation.authenticated_driver_operation where id=$1 for update',[manifest.operationId])).rows[0]?.manifest
    if (!locked || canonical(locked.names)!==canonical(manifest.names)) throw Error('cnc_ledger_mismatch')
    if (!capture.url.startsWith(locked.prefix) || provenance.source_version !== 'capture:'+capture.id) throw Error('cnc_capture_not_owned')
    if ((await admin.query('select 1 from mip_cas.source_identities where capture_id=$1::uuid',[capture.id])).rowCount) throw Error('cnc_capture_already_authorized')
    await admin.query('insert into mip_cas.source_identities values($1::uuid,$2::uuid,$3,$4,$5,$6::timestamptz)',[capture.id,locked.investigation,provenance.source_version,capture.content_hash,capture.bytes.length,provenance.acquired_at])
    await admin.query("insert into mip_cas.source_permissions values($1::uuid,$2,$3,$4,clock_timestamp()+interval '30 minutes')",[locked.investigation,provenance.source_version,provenance.rights_ref,provenance.privacy_ref])
    locked.sourceVersions.push(provenance.source_version); locked.captureIds.push(capture.id)
    await admin.query('update qik_ingest_operation.authenticated_driver_operation set manifest=$2::jsonb where id=$1',[locked.operationId,JSON.stringify(locked)])
    await admin.query('commit')
    return locked
  } catch {
    await admin.query('rollback').catch(()=>{})
    throw Error('cnc_capture_authorization_failed')
  }
}
export async function cleanupAuthenticatedOperation(admin, operationId) {
  operationNames(operationId)
  await admin.query('begin')
  try {
    const manifest=(await admin.query('select manifest from qik_ingest_operation.authenticated_driver_operation where id=$1 for update',[operationId])).rows[0]?.manifest
    if (!manifest) throw Error('cnc_ledger_missing')
    const expected=operationNames(operationId)
    if (canonical(manifest.names)!==canonical(expected)) throw Error('cnc_ledger_mismatch')
    // Refuse externally added memberships before touching any owned object.
    const memberships=(await admin.query('select parent.rolname as parent,child.rolname as child,m.admin_option from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles child on child.oid=m.member where child.rolname=any($1::text[]) or parent.rolname=any($1::text[]) order by parent.rolname,child.rolname',[Object.values(expected)])).rows
    if (!Array.isArray(manifest.memberships) || canonical(memberships)!==canonical(manifest.memberships)) throw Error('cnc_unrelated_membership')
    if ((await admin.query('select 1 from mip_cas.principals where login=$1 and user_id<>$2::uuid',[expected.cas,manifest.userId])).rowCount
        || (await admin.query('select 1 from mip_cas.access where user_id=$1::uuid and investigation<>$2::uuid',[manifest.userId,manifest.investigation])).rowCount
        || (await admin.query('select 1 from mip_cas.source_permissions where investigation=$1::uuid and not(source_version=any($2::text[]))',[manifest.investigation,manifest.sourceVersions])).rowCount) throw Error('cnc_unrelated_cas_authority')
    await admin.query('update public.ingest_sources set collection_enabled=false,enabled=false where id=$1::uuid and feed_url=$2',[manifest.sourceId,manifest.prefix+'feed.xml'])
    await admin.query('update qik_ingest.collection_gate set collection_authorized=false where id')
    await admin.query('delete from qik_ingest.runtime_credentials where credential_hash=$1',[manifest.tokenHash])
    await admin.query('delete from mip_cas.source_permissions where investigation=$1::uuid and source_version=any($2::text[])',[manifest.investigation,manifest.sourceVersions])
    await admin.query('delete from mip_cas.access where user_id=$1::uuid and investigation=$2::uuid',[manifest.userId,manifest.investigation])
    await admin.query('delete from mip_cas.principals where login=$1 and user_id=$2::uuid',[expected.cas,manifest.userId])
    await admin.query('revoke qik_ingest_runtime from '+ident(expected.collector))
    await admin.query('revoke service_role from '+ident(expected.native))
    await admin.query('revoke mip_cas_gateway from '+ident(expected.cas))
    // DROP ROLE refuses unexpected owned objects or grants; no DROP OWNED.
    for (const name of Object.values(expected)) await admin.query('drop role '+ident(name))
    await admin.query('drop table qik_ingest_operation.authenticated_driver_operation')
    await admin.query('commit')
    // Immutable native evidence and CAS identities remain until authorized package
    // cleanup; native articles/captures/history are intentionally never deleted.
    return {operationId,sourceId:manifest.sourceId,sourceDisabled:true,nativeEvidenceRetained:true,casCaptureIds:manifest.captureIds}
  } catch {
    await admin.query('rollback').catch(()=>{})
    throw Error('cnc_cleanup_refused')
  }
}
