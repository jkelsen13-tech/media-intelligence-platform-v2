// Existing SQL packages are installed atomically with operation identity.
// PostgreSQL transactional DDL includes CREATE ROLE; no hosted execution here.
import {installQikIngest,cleanupQikIngest} from '../qik-ingest/installQikIngest.mjs'
import {installCaptureCas,cleanupCaptureCas} from '../content-addressed-storage/installCaptureCas.mjs'
import {operationNames,readForwardWatermark} from './authenticatedBootstrap.mjs'
function transport(admin) {
  return async sql => {
    if(sql==='set session authorization postgres')return
    // Package files delimit SQL transactions at standalone top-level lines.
    // PL/pgSQL BEGIN has no semicolon and is intentionally unaffected.
    const body=sql.replace(/^\s*(begin|commit);\s*$/gim,'')
    if(body.trim().toLowerCase()==='rollback')throw Error('cnc_package_failed')
    return admin.query(body)
  }
}
export async function installOwnedPackages(admin,operationId) {
  operationNames(operationId)
  await admin.query('begin')
  let commitAttempted=false
  try {
    const baseline=await readForwardWatermark(admin)
    const exec=transport(admin)
    await installQikIngest(exec)
    await installCaptureCas(exec)
    const installed=await readForwardWatermark(admin)
    await admin.query('create table qik_ingest_operation.authenticated_package_watermark(operation_id text primary key,baseline jsonb,installed jsonb)')
    await admin.query('revoke all on qik_ingest_operation.authenticated_package_watermark from public,anon,authenticated,service_role,qik_ingest_runtime')
    await admin.query('insert into qik_ingest_operation.authenticated_package_watermark values($1,$2::jsonb,$3::jsonb)',[operationId,JSON.stringify(baseline),JSON.stringify(installed)])
    await admin.query("comment on schema qik_ingest_operation is 'cnc-owner:"+operationId+"'")
    await admin.query("comment on schema mip_cas_source_install is 'cnc-owner:"+operationId+"'")
    commitAttempted=true
    await admin.query('commit')
  } catch(error) {
    await admin.query('rollback').catch(()=>{})
    const failure=Error('cnc_owned_install_failed')
    failure.code=/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'CNC_INSTALL'
    failure.recoveryRequired=commitAttempted
    throw failure
  }
}
export async function cleanupOwnedPackages(admin,operationId) {
  operationNames(operationId)
  await admin.query('begin')
  try {
    const rows=(await admin.query("select nspname,obj_description(oid,'pg_namespace') owner_marker from pg_namespace where nspname in ('qik_ingest_operation','mip_cas_source_install')")).rows
    if(rows.length!==2||rows.some(r=>r.owner_marker!=='cnc-owner:'+operationId))throw Error('cnc_package_ownership_mismatch')
    const owned=(await admin.query('select baseline,installed from qik_ingest_operation.authenticated_package_watermark where operation_id=$1 for update',[operationId])).rows[0]
    if(!owned)throw Error('cnc_watermark_ownership_missing')
    const current=(await admin.query("select watermark,captured_at::text as captured_at from public.mip_consolidation_watermarks where source_project_ref='qikvmopbtijoebdqosyq' and channel='ingest_forward' for update")).rows[0]??null
    const canonical=value=>JSON.stringify(value,function(_key,item){return item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item})
    const runIds=[1,2,3].map(n=>'qik-cnc-'+operationId+'-run'+n)
    if(!runIds.includes(current?.watermark?.last_run_id)&&canonical(current)!==canonical(owned.installed))throw Error('cnc_foreign_watermark_advancement')
    if(owned.baseline===null)await admin.query("delete from public.mip_consolidation_watermarks where source_project_ref='qikvmopbtijoebdqosyq' and channel='ingest_forward'")
    else await admin.query("update public.mip_consolidation_watermarks set watermark=$1::jsonb,captured_at=$2::timestamptz where source_project_ref='qikvmopbtijoebdqosyq' and channel='ingest_forward'",[JSON.stringify(owned.baseline.watermark),owned.baseline.captured_at])
    await admin.query('drop table qik_ingest_operation.authenticated_package_watermark')
    const exec=transport(admin)
    await cleanupCaptureCas(exec)
    await cleanupQikIngest(exec)
    await admin.query('commit')
  } catch(error) {
    await admin.query('rollback').catch(()=>{})
    const failure=Error('cnc_owned_cleanup_failed')
    failure.code=/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'CNC_CLEANUP'
    throw failure
  }
}
