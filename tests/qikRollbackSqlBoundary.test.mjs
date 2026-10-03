import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { loadSqlPackage, deriveMinimalAuthorityPlan, SOURCE_IDENTITY }
  from '../scripts/qualification/backend-rollback-sql/boundary.mjs'

const pkg=await loadSqlPackage()
const q=async (db,sql,params=[]) => (await db.query(sql,params)).rows[0]
const snapshot=async db=>(await q(db,pkg.sql.snapshotPublic)).snapshot
const privateRows=async db=>(await q(db,pkg.sql.captureRowsPrivate)).private_rows
const compareRows=(db,rows,transformed=false)=>q(db,pkg.sql.compareRowsPrivate,[JSON.stringify(rows),'/synthetic/ca.pem',transformed])
const compareSecurity=(db,baseline,phase='rollback')=>q(db,pkg.sql.compareSecurity,[JSON.stringify(baseline),phase])
const privateSecurity=async db=>(await q(db,pkg.sql.captureSecurityPrivate)).private_snapshot
const comparePrivateSecurity=(db,baseline,phase='rollback')=>q(db,pkg.sql.compareSecurityPrivate,[JSON.stringify(baseline),phase])
const source='postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:dummy_sslrootcert=system_sentinel@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslrootcert=system&sslmode=verify-full&connect_timeout=5'
const db=new PGlite({postgresqlconf:"ssl_ca_file='/synthetic/ca.pem'"})
const executed=[]
for (const method of ['exec','query']) {
 const original=db[method].bind(db)
 db[method]=async(sql,...args)=>{
  const record={sequence:executed.length+1,method,bytes:Buffer.byteLength(sql),sha256:createHash('sha256').update(sql).digest('hex'),sql}
  executed.push(record)
  try {const result=await original(sql,...args);record.outcome='completed';return result}
  catch(error){record.outcome='refused';record.sqlstate=/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'UNKNOWN';throw error}
 }
}
const bootstrap=await readFile(new URL('../scripts/qualification/qik-audit-route-synthetic/bootstrap.sql',import.meta.url),'utf8')
// Disposable fixture only. Exact checked-in templates remain unchanged; no extension,
// real credential, network connection or native PG17 is used by this test.
await db.exec(`CREATE ROLE bootstrap_super LOGIN SUPERUSER;
 SET SESSION AUTHORIZATION bootstrap_super;
 ALTER ROLE postgres RENAME TO pglite_bootstrap;
 ${bootstrap}
 ALTER TABLE mip_factual.audit_connection ALTER COLUMN connection_string SET NOT NULL;
 ALTER FUNCTION mip_factual_transport_raw.dblink(text,text) STRICT;
 REVOKE synthetic_reader FROM postgres;
 REVOKE SELECT ON mip_factual.audit_connection FROM synthetic_reader;
 GRANT pg_read_all_data TO postgres WITH ADMIN FALSE,INHERIT TRUE,SET TRUE;
 CREATE ROLE mip_native_audit_v1 NOLOGIN NOSUPERUSER NOBYPASSRLS;
 CREATE ROLE synthetic_existing_set NOLOGIN NOSUPERUSER NOBYPASSRLS;
 GRANT synthetic_existing_set TO postgres WITH ADMIN FALSE,INHERIT FALSE,SET TRUE;
 SET log_parameter_max_length_on_error=0;
 CREATE ROLE synthetic_extra_grantor NOLOGIN;
 GRANT mip_cutover_schema_owner_v1 TO synthetic_extra_grantor WITH ADMIN TRUE,INHERIT FALSE,SET TRUE;
 SET ROLE synthetic_extra_grantor;
 GRANT mip_cutover_schema_owner_v1 TO postgres WITH ADMIN FALSE,INHERIT FALSE,SET FALSE;
 RESET ROLE;
 SET SESSION AUTHORIZATION postgres;`)
const enter=()=>db.exec('BEGIN;')
const grant=async()=>{
 for (const id of ['grant_set_membership','set_owner_for_grant','grant_column_update','reset_role_for_operation']) await db.exec(pkg.authority[id])
 for (const command of pkg.deadlineCommands) await db.exec(command)
}
const cleanup=async()=>{
 for (const id of ['set_owner_for_cleanup','revoke_introduced_column_update','reset_role_after_cleanup','revoke_introduced_set_membership']) await db.exec(pkg.authority[id])
}
const asBootstrap=async sql=>{
 await db.exec('SET SESSION AUTHORIZATION bootstrap_super;')
 try { await db.exec(sql) } finally { await db.exec('SET SESSION AUTHORIZATION postgres;') }
}
test.after(async()=>{
 await db.exec('ROLLBACK;');await db.close()
 if (process.env.QIK_SQL_RECEIPT_DIR) {
  const directory=resolve(process.env.QIK_SQL_RECEIPT_DIR)
  if (!directory.startsWith('/tmp/')) throw new Error('SYNTHETIC_RECEIPT_PATH_REFUSED')
  await mkdir(directory,{recursive:true})
  // Explicit fixture-only SQL provenance. No parameter values or parameter digests.
  for (const item of executed) await writeFile(join(directory,`${String(item.sequence).padStart(4,'0')}.sql`),item.sql,{mode:0o600})
  await writeFile(join(directory,'executed-manifest.json'),JSON.stringify({
   mode:'disposable-pglite-synthetic-only',engine:'PostgreSQL 18.3 / PGlite 0.5.8 / wasm32',
   node:process.version,sourceIdentity:SOURCE_IDENTITY,templateHashes:pkg.hashes,
   testSourceSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
   statements:executed.map(({sql,...metadata})=>metadata),parameterValuesCaptured:false,
   nativePg17:false,realDblinkTlsClientMultiSession:false,
  },null,2)+'\n',{mode:0o600})
 }
})

test('package binds unchanged frozen DO/deadline and exposes separate SELECT templates',async()=>{
 assert.equal(createHash('sha256').update(pkg.guardedOperation).digest('hex'),SOURCE_IDENTITY.guardedOperation)
 assert.equal(pkg.deadlineCommands.length,2)
 assert.match(pkg.deadlineCommands[0],/^SET LOCAL statement_timeout/)
 assert.match(pkg.deadlineCommands[1],/^SET LOCAL lock_timeout/)
 for (const name of ['snapshotPublic','inspectRowsPublic','inspectRowsPrivateBooleans','captureRowsPrivate','compareRowsPrivate','compareSecurity','captureSecurityPrivate','compareSecurityPrivate']) {
  const sql=pkg.sql[name].replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''")
  assert.match(sql.trim(),/^(WITH|SELECT)\b/)
  assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|DELETE|UPDATE|COMMIT|set_config)\b/i)
 }
 assert.doesNotMatch(pkg.sql.snapshotPublic,/\bconnection_string\b[^\n]*FROM mip_factual.audit_connection/)
 assert.doesNotMatch(pkg.sql.inspectRowsPublic.replace(/--[^\n]*/g,''),/connection_string/)
 assert.doesNotMatch(Object.values(pkg.authority).join('\n'),/GRANT SELECT|WITH GRANT OPTION|CASCADE|ADMIN TRUE|INHERIT TRUE|ALTER ROLE|ALTER TABLE/i)
})

test('fresh nonsecret snapshot includes every grantor/options row and NULL column ACL',async()=>{
 const b=await snapshot(db)
 assert.equal(b.identity.database,'postgres')
 assert.match((await q(db,'SELECT version() AS version')).version,/PostgreSQL 18\.3 \(PGlite 0\.5\.8\)/)
 assert.equal(b.columns.find(c=>c.name==='connection_string').acl_raw,null)
 assert.equal(b.effective.select_connection,true)
 assert.ok(b.memberships.some(m=>m.role==='pg_read_all_data'&&m.member_name==='postgres'&&m.inherit===true))
 assert.ok(b.roles.some(r=>r.name==='mip_factual_owner_v3'&&r.superuser===false&&r.bypass_rls===false))
 const owner=b.memberships.filter(m=>m.role==='mip_cutover_schema_owner_v1'&&m.member_name==='postgres')
 assert.equal(owner.length,2)
 assert.deepEqual(owner.find(m=>m.grantor_name==='supabase_admin'),{
  ...owner.find(m=>m.grantor_name==='supabase_admin'),admin:true,inherit:false,set:false })
 const inspection=await q(db,pkg.sql.inspectRowsPrivateBooleans)
 const plan=deriveMinimalAuthorityPlan(b,inspection)
 assert.equal(plan.liveReady,false);assert.equal(plan.addsSelect,false)
 assert.equal(plan.permission.membershipGrantor,'postgres')
 assert.equal(plan.permission.mandatoryEnd,'ROLLBACK')
})

test('minimal planner refuses absent SELECT, broad UPDATE, existing transient row, option drift and unsafe inputs',async()=>{
 const b=await snapshot(db), r=await q(db,pkg.sql.inspectRowsPrivateBooleans)
 const mutations=[x=>x.effective.select_id=false,x=>x.effective.select_connection=false,
  x=>x.effective.update_connection=true,x=>x.effective.update_id=true,x=>x.effective.table_update=true,
  x=>x.effective.owner_set=true,x=>x.roles.find(r=>r.name==='postgres').bypass_rls=false,
  x=>x.roles.find(r=>r.name==='mip_cutover_schema_owner_v1').bypass_rls=true,
  x=>x.relation.force_rls=false,x=>x.memberships.find(m=>m.grantor_name==='supabase_admin'&&m.member_name==='postgres').inherit=true,
  x=>x.memberships.find(m=>m.grantor_name==='supabase_admin'&&m.member_name==='postgres').set=true,
  x=>x.memberships.find(m=>m.grantor_name==='supabase_admin'&&m.member_name==='postgres').admin=false,
  x=>x.roles.find(r=>r.name==='mip_cutover_schema_owner_v1').login=true,
  x=>x.columns.find(c=>c.name==='id').type_oid='25',x=>x.columns.find(c=>c.name==='connection_string').not_null=false,
  x=>x.columns.push({...x.columns[0],name:'unexpected',attnum:3}),x=>x.effective.dblink_execute=false,
  x=>x.dblink[0].security_definer=true,x=>x.dblink[0].strict=false,x=>x.dblink[0].argument_type_oids=['25','16'],
  x=>{const m=structuredClone(x.memberships.find(m=>m.member_name==='postgres'&&m.role==='mip_cutover_schema_owner_v1'));m.grantor=x.roles.find(r=>r.name==='postgres').oid;m.grantor_name='postgres';x.memberships.push(m)}]
 for (const mutate of mutations) {const changed=structuredClone(b);mutate(changed);assert.throws(()=>deriveMinimalAuthorityPlan(changed,r),/QIK_SQL_BASELINE_REFUSED/)}
 for (const changed of [{...r,selected_count:0},{...r,selected_count:2},{...r,selected_nonnull:false},{...r,selected_source_matches:false}])
  assert.throws(()=>deriveMinimalAuthorityPlan(b,changed),/QIK_SQL_BASELINE_REFUSED/)
 let evaluated=false;const evil={};Object.defineProperty(evil,'version',{enumerable:true,get(){evaluated=true;return b.version}})
 assert.throws(()=>deriveMinimalAuthorityPlan(evil,r),/QIK_SQL_BASELINE_REFUSED/);assert.equal(evaluated,false)
})

test('actual minimal authority templates preserve all grantors/FORCE RLS/NULL ACL and roll back exact full DO change',async()=>{
 const b=await snapshot(db),rows=await privateRows(db)
 await enter()
 try {
  await grant()
  const window=await snapshot(db), m=window.memberships.find(m=>m.role==='mip_cutover_schema_owner_v1'&&m.grantor_name==='postgres')
  assert.deepEqual([m.admin,m.inherit,m.set],[false,false,true])
  assert.equal(window.effective.update_connection,true);assert.equal(window.effective.update_id,false);assert.equal(window.effective.table_update,false)
  assert.equal(window.effective.owner_usage,false)
  for (const original of b.memberships) assert.ok(window.memberships.some(m=>JSON.stringify(m)===JSON.stringify(original)))
  await db.exec(pkg.authority.set_owner_for_grant)
  const ownerWrite=await db.query("UPDATE mip_factual.audit_connection SET connection_string=connection_string WHERE id IS TRUE;")
  assert.equal(ownerWrite.affectedRows,0)
  await db.exec(pkg.authority.reset_role_for_operation)
  await db.exec(pkg.guardedOperation)
  assert.ok(Object.values(await compareRows(db,rows,true)).every(v=>v===true))
  await cleanup()
  assert.ok(Object.values(await compareSecurity(db,b,'restored')).every(v=>v===true))
  assert.equal((await snapshot(db)).columns.find(c=>c.name==='connection_string').acl_raw,null)
 } finally { await db.exec('ROLLBACK;') }
 assert.ok(Object.values(await compareRows(db,rows)).every(v=>v===true))
 assert.ok(Object.values(await compareSecurity(db,b)).every(v=>v===true))
})

test('pre-existing column grants and legitimate extra grantor survive exact cleanup',async()=>{
 await asBootstrap(`GRANT REFERENCES(id) ON mip_factual.audit_connection TO synthetic_reader;
  GRANT REFERENCES(connection_string) ON mip_factual.audit_connection TO postgres WITH GRANT OPTION;`)
 const b=await snapshot(db),rows=await privateRows(db)
 assert.ok(b.columns.every(c=>c.acl_raw!==null))
 await enter()
 try {await grant();await db.exec(pkg.guardedOperation);await cleanup();assert.equal((await compareSecurity(db,b,'restored')).security_matches,true)}
 finally {await db.exec('ROLLBACK;')}
 assert.equal((await compareSecurity(db,b)).security_matches,true)
 assert.equal((await compareRows(db,rows)).all_rows_match,true)
 await asBootstrap(`REVOKE REFERENCES(id) ON mip_factual.audit_connection FROM synthetic_reader;
  REVOKE REFERENCES(connection_string) ON mip_factual.audit_connection FROM postgres;`)
})

test('unrelated false row and opaque password bytes remain unchanged by actual DO',async()=>{
 await asBootstrap("INSERT INTO mip_factual.audit_connection VALUES(false,'synthetic-unrelated');")
 const rows=await privateRows(db)
 await enter()
 try {await grant();await db.exec(pkg.guardedOperation);const post=await compareRows(db,rows,true);assert.equal(post.all_rows_match,true);assert.equal(post.unrelated_rows_match,true);assert.equal(post.opaque_credential_match,true)}
 finally {await db.exec('ROLLBACK;')}
 assert.equal((await compareRows(db,rows)).all_rows_match,true)
 await asBootstrap('DELETE FROM mip_factual.audit_connection WHERE id IS FALSE;')
})

test('NULL actual source bypasses original source guard, while new private guard and planner refuse before probe',async()=>{
 await asBootstrap('ALTER TABLE mip_factual.audit_connection ALTER COLUMN connection_string DROP NOT NULL;UPDATE mip_factual.audit_connection SET connection_string=NULL WHERE id IS TRUE;')
 const b=await snapshot(db),inspection=await q(db,pkg.sql.inspectRowsPrivateBooleans)
 assert.equal(inspection.selected_nonnull,false);assert.equal(inspection.selected_source_matches,false)
 assert.throws(()=>deriveMinimalAuthorityPlan(b,inspection),/QIK_SQL_BASELINE_REFUSED/)
 // A fixed synthetic probe sentinel proves control flow reaches the probe with NULL.
 await asBootstrap(`CREATE OR REPLACE FUNCTION mip_factual_transport_raw.dblink(uri text,query text)
  RETURNS SETOF record LANGUAGE plpgsql AS $$ BEGIN
   IF uri IS NULL THEN RAISE EXCEPTION 'synthetic_null_reached_probe'; END IF;
   RETURN QUERY SELECT 'mip_native_audit_v1'::text,true; END $$;`)
 await enter()
 try {
  await grant()
  await assert.rejects(db.exec(pkg.guardedOperation),e=>e.message==='qik_audit_route_probe_refused')
 } finally {await db.exec('ROLLBACK;')}
 // A valid-return NULL stub reaches the CAS and is refused by ROW_COUNT=0.
 await asBootstrap(`CREATE OR REPLACE FUNCTION mip_factual_transport_raw.dblink(uri text,query text)
  RETURNS SETOF record LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY SELECT 'mip_native_audit_v1'::text,true; END $$;`)
 await enter()
 try {await grant();await assert.rejects(db.exec(pkg.guardedOperation),e=>e.message==='qik_audit_route_write_refused')}
 finally {await db.exec('ROLLBACK;')}
 await asBootstrap("UPDATE mip_factual.audit_connection SET connection_string='"+source+"' WHERE id IS TRUE;")
 await asBootstrap('ALTER TABLE mip_factual.audit_connection ALTER COLUMN connection_string SET NOT NULL;')
 await asBootstrap('ALTER FUNCTION mip_factual_transport_raw.dblink(text,text) STRICT;')
})

test('stale locked URI fails actual compare-and-update predicate and exact rollback restores baseline',async()=>{
 const rows=await privateRows(db),b=await snapshot(db)
 // Same-session fixture interleaving at the probe boundary exercises the exact CAS.
 // This is not evidence of a multi-session race (PGlite has one backend).
 await asBootstrap(`CREATE OR REPLACE FUNCTION mip_factual_transport_raw.dblink(uri text,query text)
  RETURNS SETOF record LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
   UPDATE mip_factual.audit_connection SET connection_string='synthetic-stale' WHERE id IS TRUE;
   RETURN QUERY SELECT 'mip_native_audit_v1'::text,true; END $$;`)
 const changedSecurity=await snapshot(db)
 await enter()
 try {await grant();await assert.rejects(db.exec(pkg.guardedOperation),e=>e.message==='qik_audit_route_write_refused')}
 finally {await db.exec('ROLLBACK;')}
 assert.equal((await compareRows(db,rows)).all_rows_match,true)
 assert.equal((await compareSecurity(db,changedSecurity)).security_matches,true)
 await asBootstrap(`CREATE OR REPLACE FUNCTION mip_factual_transport_raw.dblink(uri text,query text)
  RETURNS SETOF record LANGUAGE plpgsql STRICT SECURITY INVOKER AS $$ BEGIN RETURN QUERY SELECT 'mip_native_audit_v1'::text,true; END $$;`)
 assert.equal((await compareSecurity(db,b)).security_matches,true)
})

test('actual DO refuses suppressed ROW_COUNT=0; rollback restores private/security baselines',async()=>{
 await asBootstrap(`CREATE FUNCTION mip_factual.synthetic_suppress_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
  CREATE TRIGGER synthetic_suppress BEFORE UPDATE ON mip_factual.audit_connection FOR EACH ROW EXECUTE FUNCTION mip_factual.synthetic_suppress_update();`)
 const rows=await privateRows(db),b=await snapshot(db)
 await enter()
 try {await grant();await assert.rejects(db.exec(pkg.guardedOperation),e=>e.message==='qik_audit_route_write_refused')}
 finally {await db.exec('ROLLBACK;')}
 assert.equal((await compareRows(db,rows)).all_rows_match,true)
 assert.equal((await compareSecurity(db,b)).security_matches,true)
 await asBootstrap('DROP TRIGGER synthetic_suppress ON mip_factual.audit_connection;DROP FUNCTION mip_factual.synthetic_suppress_update();')
})

test('boolean postconditions detect extra false rows, changed credential, stale/NULL row and postrollback security mismatch',async()=>{
 const rows=await privateRows(db),b=await snapshot(db)
 await enter()
 try {
  await grant();await db.exec(pkg.guardedOperation)
  await db.exec("UPDATE mip_factual.audit_connection SET connection_string='synthetic-tampered' WHERE id IS TRUE;")
  const bad=await compareRows(db,rows,true);assert.equal(bad.all_rows_match,false);assert.equal(bad.opaque_credential_match,false)
 } finally {await db.exec('ROLLBACK;')}
 await asBootstrap("INSERT INTO mip_factual.audit_connection VALUES(false,'unexpected');")
 assert.equal((await compareRows(db,rows)).unrelated_rows_match,false)
 await asBootstrap('DELETE FROM mip_factual.audit_connection WHERE id IS FALSE;')
 for (const field of ['relation','columns','memberships','roles','policies','logging','deadlines']) {
  const wrong=structuredClone(b);wrong[field]=null
  assert.equal((await compareSecurity(db,wrong)).security_matches,false)
 }
 const rawAclMismatch=structuredClone(b)
 rawAclMismatch.columns.find(c=>c.name==='connection_string').acl_raw=[]
 assert.equal((await compareSecurity(db,rawAclMismatch,'restored')).security_matches,false)
 assert.equal((await compareSecurity(db,rawAclMismatch,'rollback')).security_matches,false)
 for (const option of ['admin','inherit','set']) {
  const changed=structuredClone(b),m=changed.memberships.find(m=>m.role==='synthetic_existing_set'&&m.member_name==='postgres')
  m[option]=!m[option]
  assert.equal((await compareSecurity(db,changed)).security_matches,false)
 }
 const invalidComparison=await q(db,pkg.sql.compareRowsPrivate,[JSON.stringify(rows),'/synthetic/ca.pem',null])
 assert.equal(invalidComparison.comparison_inputs_valid,false)
 assert.equal((await compareSecurity(db,b,'unknown')).phase_valid,false)
 assert.equal((await compareSecurity(db,b)).security_matches,true)
})

test('private security comparator detects nonnull config and dblink-definition drift without returning those values',async()=>{
 await asBootstrap(`ALTER ROLE mip_cutover_schema_owner_v1 SET search_path='pg_catalog';
  ALTER FUNCTION mip_factual_transport_raw.dblink(text,text) SET search_path='pg_catalog';`)
 const b=await snapshot(db),privateBaseline=await privateSecurity(db)
 await asBootstrap("ALTER ROLE mip_cutover_schema_owner_v1 SET search_path='public';")
 assert.equal((await compareSecurity(db,b)).security_matches,true)
 const roleResult=await comparePrivateSecurity(db,privateBaseline)
 assert.equal(roleResult.security_matches,false);assert.ok(Object.values(roleResult).every(v=>typeof v==='boolean'))
 await asBootstrap("ALTER ROLE mip_cutover_schema_owner_v1 SET search_path='pg_catalog';ALTER FUNCTION mip_factual_transport_raw.dblink(text,text) SET search_path='public';")
 assert.equal((await compareSecurity(db,b)).security_matches,true)
 assert.equal((await comparePrivateSecurity(db,privateBaseline)).security_matches,false)
 await asBootstrap(`ALTER FUNCTION mip_factual_transport_raw.dblink(text,text) SET search_path='pg_catalog';
  CREATE OR REPLACE FUNCTION mip_factual_transport_raw.dblink(uri text,query text)
  RETURNS SETOF record LANGUAGE plpgsql STRICT SET search_path='pg_catalog' AS $$ BEGIN RETURN QUERY SELECT 'altered_synthetic_auditor'::text,true; END $$;`)
 assert.equal((await compareSecurity(db,b)).security_matches,true)
 assert.equal((await comparePrivateSecurity(db,privateBaseline)).security_matches,false)
 await asBootstrap(`ALTER ROLE mip_cutover_schema_owner_v1 RESET search_path;
  CREATE OR REPLACE FUNCTION mip_factual_transport_raw.dblink(uri text,query text)
  RETURNS SETOF record LANGUAGE plpgsql STRICT AS $$ BEGIN RETURN QUERY SELECT 'mip_native_audit_v1'::text,true; END $$;
  ALTER FUNCTION mip_factual_transport_raw.dblink(text,text) RESET search_path;`)
})
