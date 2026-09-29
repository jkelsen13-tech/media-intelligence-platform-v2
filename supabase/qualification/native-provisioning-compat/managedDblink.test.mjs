// Focused managed transport mechanism proof; not an installed successor or qik installer.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import pg from 'pg'
const armed=process.env.MIP_CUSTODIAN_LIFECYCLE_ARM==='synthetic-pg17-local-only'&&process.env.MIP_DISPOSABLE_POSTGRES==='qik-persistent-install'
const connect=async(user,password)=>{const c=new pg.Client({host:'127.0.0.1',port:5432,database:'postgres',user,password,connectionTimeoutMillis:5000});await c.connect();return c}
test('managed provider-owned transport: isolation, autonomous rollback and exact retry',{skip:!armed},async()=>{
 let db,worker,denied,phase='identity',lastState=null; const pw=randomBytes(32).toString('hex'), wp=randomBytes(32).toString('hex'),dp=randomBytes(32).toString('hex')
 try{
 db=await connect('postgres',process.env.MIP_COMPAT_CUSTOMER_PASSWORD)
 const identity=(await db.query("select current_user,session_user,(select rolsuper from pg_roles where rolname=current_user) super,current_setting('server_version_num') version")).rows[0]
 assert.equal(identity.current_user,'postgres');assert.equal(identity.session_user,'postgres');assert.equal(identity.super,false);assert.equal(identity.version,'170006')
 phase='logging';for(const setting of ['log_statement','log_min_error_statement','log_parameter_max_length','log_parameter_max_length_on_error','pgaudit.log']){
 const val=(await db.query("select current_setting($1,true) val",[setting])).rows[0].val
 assert.equal(val,({log_statement:'none',log_min_error_statement:'panic',log_parameter_max_length:'0',log_parameter_max_length_on_error:'0','pgaudit.log':'none'})[setting])
 }
 phase='absence';assert.equal((await db.query("select exists(select 1 from pg_extension where extname='dblink') present")).rows[0].present,false)
 await db.query('BEGIN')
 await db.query('CREATE SCHEMA mip_mcp_raw; REVOKE ALL ON SCHEMA mip_mcp_raw FROM PUBLIC,anon,authenticated,service_role; CREATE SCHEMA mip_mcp_api; REVOKE ALL ON SCHEMA mip_mcp_api FROM PUBLIC,anon,authenticated,service_role')
 phase='extension';await db.query('CREATE EXTENSION dblink WITH SCHEMA extensions; ALTER EXTENSION dblink SET SCHEMA mip_mcp_raw')
 const ext=(await db.query("select extversion,pg_get_userbyid(extowner) owner,nspname from pg_extension join pg_namespace on extnamespace=pg_namespace.oid where extname='dblink'")).rows[0]
 phase='extension-shape';assert.deepEqual(ext,{extversion:'1.2',owner:'supabase_admin',nspname:'mip_mcp_raw'})
 phase='roles';await db.query("CREATE ROLE mip_mcp_audit LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS PASSWORD '"+pw+"'")
 await db.query("CREATE ROLE mip_mcp_worker LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS PASSWORD '"+wp+"'")
 await db.query("CREATE ROLE mip_mcp_denied LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS PASSWORD '"+dp+"'")
 phase='tables';await db.query("CREATE TABLE mip_mcp_api.audit_receipt(id integer primary key); REVOKE ALL ON mip_mcp_api.audit_receipt FROM PUBLIC,anon,authenticated,service_role; GRANT USAGE ON SCHEMA mip_mcp_api TO mip_mcp_audit,mip_mcp_worker; GRANT INSERT ON mip_mcp_api.audit_receipt TO mip_mcp_audit; CREATE TABLE mip_mcp_api.config(connection text); REVOKE ALL ON mip_mcp_api.config FROM PUBLIC,anon,authenticated,service_role")
 await db.query("INSERT INTO mip_mcp_api.config VALUES($1)",['host=127.0.0.1 port=5432 dbname=postgres user=mip_mcp_audit password='+pw+' connect_timeout=5'])
 phase='wrapper';await db.query(`CREATE FUNCTION mip_mcp_api.record_rejection() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
 DECLARE c text;
 BEGIN
 IF session_user<>'mip_mcp_worker' THEN RAISE EXCEPTION 'caller_refused'; END IF;
 SELECT connection INTO STRICT c FROM mip_mcp_api.config;
 PERFORM mip_mcp_raw.dblink_exec(c,'INSERT INTO mip_mcp_api.audit_receipt VALUES (1) ON CONFLICT DO NOTHING');
 RAISE EXCEPTION USING ERRCODE='PZ003',MESSAGE='fixture_transition_rejected';
 END $f$;
 REVOKE ALL ON FUNCTION mip_mcp_api.record_rejection() FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION mip_mcp_api.record_rejection() TO mip_mcp_worker`)
 await db.query('COMMIT')
 phase='authenticate';worker=await connect('mip_mcp_worker',wp);denied=await connect('mip_mcp_denied',dp)
 phase='raw-and-config-denials';for(const c of [worker,denied]){
 await assert.rejects(c.query("select mip_mcp_raw.dblink_get_connections()"),e=>e.code==='42501')
 await assert.rejects(c.query('select * from mip_mcp_api.config'),e=>e.code==='42501')
 }
 phase='wrapper-denial';await assert.rejects(denied.query('select mip_mcp_api.record_rejection()'),e=>e.code==='42501')
 phase='autonomous-rejection';for(let n=0;n<2;n++)await assert.rejects(worker.query('select mip_mcp_api.record_rejection()'),e=>{lastState=/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:null;return e.code==='PZ003'})
 phase='receipt';assert.equal((await db.query('select count(*)::int n from mip_mcp_api.audit_receipt')).rows[0].n,1)
 console.log('PASS managed provider-owned transport; denied raw/config access; autonomous audit survives caller rollback; retry records exactly once')
 } catch(e){throw new Error('managed_transport_fixture_failed:'+phase+':observed_'+lastState+':'+(/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:'assertion'))}
 finally{
 await worker?.end();await denied?.end()
 if(db){try{await db.query('ROLLBACK');await db.query('BEGIN; DROP FUNCTION IF EXISTS mip_mcp_api.record_rejection(); DROP TABLE IF EXISTS mip_mcp_api.config; DROP TABLE IF EXISTS mip_mcp_api.audit_receipt; DROP SCHEMA IF EXISTS mip_mcp_api; ALTER EXTENSION dblink SET SCHEMA extensions; DROP EXTENSION dblink; DROP SCHEMA IF EXISTS mip_mcp_raw; DROP ROLE IF EXISTS mip_mcp_audit; DROP ROLE IF EXISTS mip_mcp_worker; DROP ROLE IF EXISTS mip_mcp_denied; COMMIT')}catch{await db.query('ROLLBACK').catch(()=>{});console.log('Customer fixture cleanup incomplete; owned container teardown remains required')}finally{await db.end()}}
 }
})
