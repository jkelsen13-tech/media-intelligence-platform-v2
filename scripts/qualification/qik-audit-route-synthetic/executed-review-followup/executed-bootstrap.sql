CREATE ROLE postgres LOGIN NOSUPERUSER BYPASSRLS;
CREATE ROLE mip_cutover_schema_owner_v1 NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
CREATE ROLE mip_factual_owner_v3 NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE supabase_admin LOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE;
GRANT mip_cutover_schema_owner_v1 TO supabase_admin WITH ADMIN TRUE, INHERIT FALSE, SET TRUE;
SET ROLE supabase_admin;
GRANT mip_cutover_schema_owner_v1 TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
RESET ROLE;
CREATE SCHEMA mip_factual AUTHORIZATION mip_cutover_schema_owner_v1;
CREATE TABLE mip_factual.audit_connection(id boolean PRIMARY KEY,connection_string text);
INSERT INTO mip_factual.audit_connection VALUES(true,'postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:dummy_sslrootcert=system_sentinel@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslrootcert=system&sslmode=verify-full&connect_timeout=5');
ALTER TABLE mip_factual.audit_connection OWNER TO mip_cutover_schema_owner_v1;
ALTER TABLE mip_factual.audit_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE mip_factual.audit_connection FORCE ROW LEVEL SECURITY;
CREATE POLICY factual_kernel ON mip_factual.audit_connection TO mip_factual_owner_v3 USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA mip_factual TO postgres,mip_factual_owner_v3;
GRANT SELECT,INSERT ON mip_factual.audit_connection TO mip_factual_owner_v3;
CREATE ROLE synthetic_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT SELECT ON mip_factual.audit_connection TO synthetic_reader;
GRANT synthetic_reader TO postgres WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
CREATE SCHEMA mip_comparison_install;
CREATE TABLE mip_comparison_install.receipts(operation_id text,manifest_sha256 text,state text,installer text,audit_login text);
INSERT INTO mip_comparison_install.receipts VALUES('a382dcdbf2924852b711b6a8b0c713eb','221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320','installed_disabled_audit_pending','postgres','mip_native_audit_v1');
CREATE TABLE mip_comparison_install.audit_qualifications(dummy text);
CREATE SCHEMA mip_native_activation;
CREATE TABLE mip_native_activation.bootstrap(singleton boolean,operation_id text,install_manifest text,installer text);
INSERT INTO mip_native_activation.bootstrap VALUES(true,'a382dcdbf2924852b711b6a8b0c713eb','221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320','postgres');
CREATE TABLE mip_native_activation.head(singleton boolean,revision text);
INSERT INTO mip_native_activation.head VALUES(true,null);
CREATE SCHEMA mip_factual_transport_raw;
CREATE FUNCTION mip_factual_transport_raw.dblink(uri text,query text) RETURNS SETOF record LANGUAGE plpgsql AS $$ BEGIN
 RETURN QUERY SELECT CASE WHEN split_part(split_part(uri,'@',1),'mip_native_audit_v1:',2)='dummy_sslrootcert=system_sentinel' THEN 'mip_native_audit_v1' ELSE 'wrong_synthetic_password' END::text,true;
END $$;
GRANT USAGE ON SCHEMA mip_comparison_install,mip_native_activation,mip_factual_transport_raw TO postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA mip_comparison_install,mip_native_activation TO postgres;
GRANT UPDATE,DELETE,INSERT ON ALL TABLES IN SCHEMA mip_comparison_install,mip_native_activation TO postgres;
CREATE OR REPLACE FUNCTION mip_factual_transport_raw.dblink(uri text,query text) RETURNS SETOF record LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('synthetic.probe_mode',true)='slow' THEN PERFORM pg_sleep(8); END IF;
 RETURN QUERY SELECT CASE WHEN current_setting('synthetic.probe_mode',true)='badidentity'
   OR split_part(split_part(uri,'@',1),'mip_native_audit_v1:',2) IS DISTINCT FROM current_setting('synthetic.expected_password',true)
   THEN 'wrong_synthetic_auditor' ELSE 'mip_native_audit_v1' END::text,
   coalesce(current_setting('synthetic.probe_mode',true),'')<>'badtls';
END $$;
CREATE FUNCTION mip_factual.synthetic_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('synthetic.suppress_update',true)='on' THEN RETURN NULL; END IF; RETURN NEW; END $$;
CREATE TRIGGER synthetic_suppress BEFORE UPDATE ON mip_factual.audit_connection FOR EACH ROW EXECUTE FUNCTION mip_factual.synthetic_suppress();
