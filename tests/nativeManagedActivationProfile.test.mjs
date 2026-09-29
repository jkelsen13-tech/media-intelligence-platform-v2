import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {prepareNativeActivation,SQL_PATH} from '../supabase/qualification/native-governed-activation/prepare.mjs'
import {managedOptions,managedTransportSQL,managedSnapshotSQL} from '../supabase/qualification/native-provisioning-compat/managedPolicy.mjs'
const read=path=>readFile(new URL('../'+path,import.meta.url))
const original={expectedLogin:'postgres',operationId:'1'.repeat(32),expectedMetadataAuditor:'mip_native_metadata_audit_v1'}
const managed={...original,provisioningProfile:'supabase-managed-v1',provisioningOperationId:'2'.repeat(32)}
test('managed successor is explicit and old compiled output retains strict auditor isolation',async()=>{
 const legacy=await prepareNativeActivation(read,original),next=await prepareNativeActivation(read,managed)
 assert.equal(legacy.provisioningProfile,undefined)
 assert.equal(legacy.sql.includes('managed_metadata'),false)
 assert.equal(legacy.sql.split('or exists(select 1 from pg_auth_members where roleid=b.metadata_auditor_oid or member=b.metadata_auditor_oid)').length,4)
 assert.equal(next.provisioningProfile,'supabase-managed-v1')
 assert.notEqual(next.program_sha256,legacy.program_sha256)
 assert.equal(next.sql.split("raise exception 'managed_provisioning_drift'").length,4)
 assert.match(next.sql,/managed_metadata jsonb not null/)
 assert.match(next.sql,/managed_extension_dependency/)
 assert.match(next.sql,/a.grantor=10/)
 assert.match(next.sql,/not a.inherit_option and not a.set_option/)
 assert.equal((await read(SQL_PATH)).includes(Buffer.from('managed_metadata')),false)
})
test('managed option rejects incomplete and alternative identities',()=>{
 assert.equal(managedOptions(original),false)
 for(const bad of [{...managed,provisioningProfile:'other'},{...managed,expectedLogin:'other'},{...managed,expectedMetadataAuditor:'other'},{...managed,provisioningOperationId:null},{...managed,auditLogin:'other'},{...original,provisioningOperationId:'2'.repeat(32)}])
  assert.throws(()=>managedOptions(bad),/boundary_refused/)
})
test('shim is fixed bound SQL and does not change provider extension ACL or relocate it',()=>{
 const sql=managedTransportSQL()
 assert.match(sql,/security definer set search_path='' begin atomic/)
 assert.match(sql,/select mip_factual_transport_raw.dblink_exec\(conn,command\)/)
 assert.doesNotMatch(sql,/alter extension|create extension|create schema|grant .*raw/i)
 const snapshot=managedSnapshotSQL(managed)
 for(const expected of ['pg_catalog.pg_extension','pg_catalog.pg_depend','definitions_sha256','provisioning_operation_id','prosqlbody','inherit_option','set_option'])
  assert.ok(snapshot.includes(expected),expected)
})
