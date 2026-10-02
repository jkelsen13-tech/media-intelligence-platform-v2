BEGIN;CREATE TEMP TABLE qik_baseline ON COMMIT DROP AS SELECT jsonb_build_object('row',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM mip_factual.audit_connection t),'relacl',(SELECT relacl::text FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass),'attacl',(SELECT jsonb_agg(jsonb_build_array(attname,attacl::text) ORDER BY attnum) FROM pg_attribute WHERE attrelid='mip_factual.audit_connection'::regclass AND attnum>0),'membership',(SELECT jsonb_agg(jsonb_build_array(roleid::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) ORDER BY roleid::regrole::text,grantor::regrole::text) FROM pg_auth_members WHERE member='postgres'::regrole),'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('postgres','mip_cutover_schema_owner_v1')),'rls',(SELECT jsonb_build_array(relowner::regrole::text,relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY polname) FROM pg_policy p WHERE polrelid='mip_factual.audit_connection'::regclass)) AS value;
GRANT mip_cutover_schema_owner_v1 TO postgres WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
SET ROLE mip_cutover_schema_owner_v1;DO $owner$ DECLARE n integer;BEGIN UPDATE mip_factual.audit_connection SET connection_string=connection_string WHERE id;GET DIAGNOSTICS n=ROW_COUNT;IF n<>0 THEN RAISE EXCEPTION 'synthetic_owner_force_rls_not_zero';END IF;END $owner$;GRANT UPDATE(connection_string) ON mip_factual.audit_connection TO postgres;RESET ROLE;
UPDATE mip_factual.audit_connection SET connection_string='postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:dummy_sslrootcert=system_sentinel@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslrootcert=system&sslmode=verify-full&connect_timeout=5' WHERE id;SELECT set_config('synthetic.expected_password','dummy_sslrootcert=system_sentinel',true);
CREATE TEMP TABLE qik_source_before ON COMMIT DROP AS SELECT jsonb_agg(to_jsonb(t) ORDER BY id) AS value FROM mip_factual.audit_connection t;-- PROPOSAL-ONLY client submission fragment, not authority or live authorization.
-- In an already-open transaction, submit EACH SET command and wait for completion
-- BEFORE submitting the unchanged guarded DO. After any error, ROLLBACK explicitly.
SET LOCAL statement_timeout = '7000ms';
SET LOCAL lock_timeout = '500ms';
DO $outer$ BEGIN BEGIN  EXECUTE $source$-- One-time, held qik audit-route maintenance successor. SOURCE ONLY until independently
-- qualified/reviewed and the provider temporarily grants UPDATE(connection_string)
-- to the existing postgres installer. Never run as part of installation.
-- No credential literal, Auth row, article material, or returned connection string.
do $qik_audit_route_v1$
declare
 old_uri text;
 new_uri text;
 ca_path text;
 changed_rows integer;
begin
 if current_user <> 'postgres' or session_user <> 'postgres' or current_database() <> 'postgres'
  or (select rolsuper from pg_catalog.pg_roles where rolname=current_user) is distinct from false
 then raise exception 'qik_audit_route_identity_refused'; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('qik-comparison-audit-v1',0))
 then raise exception 'qik_audit_route_inflight'; end if;
 if (select count(*) from mip_comparison_install.receipts
     where operation_id='a382dcdbf2924852b711b6a8b0c713eb'
       and manifest_sha256='221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320'
       and state='installed_disabled_audit_pending' and installer='postgres'
       and audit_login='mip_native_audit_v1') <> 1
   or (select count(*) from mip_native_activation.bootstrap
       where singleton and operation_id='a382dcdbf2924852b711b6a8b0c713eb'
       and install_manifest='221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320'
       and installer='postgres') <> 1
   or (select count(*) from mip_native_activation.head where singleton and revision is null) <> 1
   or exists(select 1 from mip_comparison_install.audit_qualifications)
 then raise exception 'qik_audit_route_state_refused'; end if;
 -- The DO body is static but dblink takes a password-bearing variable. Refuse
 -- unsafe server logging before reading the stored value; bound duration below
 -- the representative auto_explain threshold and the URI's 5s connect timeout.
 perform pg_catalog.set_config('statement_timeout','7000ms',true);
 perform pg_catalog.set_config('lock_timeout','500ms',true);
 if pg_catalog.current_setting('log_statement') not in ('none','ddl','mod')
    or pg_catalog.current_setting('log_min_duration_statement') <> '-1'
    or pg_catalog.current_setting('log_min_duration_sample') <> '-1'
    or pg_catalog.current_setting('log_transaction_sample_rate')::numeric <> 0
    or pg_catalog.current_setting('log_parameter_max_length_on_error') <> '0'
    or coalesce(pg_catalog.current_setting('pgaudit.log',true),'none') not in ('none','')
    or coalesce(pg_catalog.current_setting('pgaudit.log_parameter',true),'off') <> 'off'
    or coalesce(pg_catalog.current_setting('auto_explain.log_nested_statements',true),'off') <> 'off'
    or coalesce(pg_catalog.current_setting('pg_stat_statements.track',true),'top') = 'all'
    or exists(select 1 from pg_catalog.pg_settings
       where name='auto_explain.log_min_duration' and setting::integer >= 0
         and setting::integer < 7000)
 then raise exception 'qik_audit_route_logging_refused'; end if;
 if not pg_catalog.has_column_privilege(current_user,'mip_factual.audit_connection','connection_string','SELECT')
    or not pg_catalog.has_column_privilege(current_user,'mip_factual.audit_connection','connection_string','UPDATE')
 then raise exception 'qik_audit_route_grant_missing'; end if;
 ca_path := pg_catalog.current_setting('ssl_ca_file',true);
 if ca_path is null or ca_path !~ '^/[A-Za-z0-9_./-]+$'
 then raise exception 'qik_audit_route_ca_refused'; end if;
 select connection_string into strict old_uri
 from mip_factual.audit_connection where id for update;
 if old_uri ~ '^postgresql://mip_native_audit_v1:[^@]+@db[.]qikvmopbtijoebdqosyq[.]supabase[.]co:5432/postgres[?]'
   and pg_catalog.regexp_count(old_uri,'@')=1
   and pg_catalog.regexp_count(old_uri,'[?]')=1
   and pg_catalog.array_length(pg_catalog.string_to_array(pg_catalog.split_part(old_uri,'?',2),'&'),1)=3
   and pg_catalog.string_to_array(pg_catalog.split_part(old_uri,'?',2),'&')
       @> array['sslrootcert='||pg_catalog.replace(ca_path,'/','%2F'),'sslmode=verify-full','connect_timeout=5']
 then raise exception 'qik_audit_route_already_applied'; end if;
 if old_uri !~ '^postgresql://mip_native_audit_v1[.]qikvmopbtijoebdqosyq:[^@]+@aws-0-us-west-1[.]pooler[.]supabase[.]com:5432/postgres[?]'
   or pg_catalog.regexp_count(old_uri,'@') <> 1
   or pg_catalog.regexp_count(old_uri,'[?]') <> 1
   or pg_catalog.array_length(pg_catalog.string_to_array(pg_catalog.split_part(old_uri,'?',2),'&'),1) <> 3
   or not pg_catalog.string_to_array(pg_catalog.split_part(old_uri,'?',2),'&')
      @> array['sslrootcert=system','sslmode=verify-full','connect_timeout=5']
 then raise exception 'qik_audit_route_source_refused'; end if;
 new_uri := pg_catalog.replace(
  pg_catalog.replace(
   pg_catalog.replace(old_uri,
    'postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:',
    'postgresql://mip_native_audit_v1:'),
   '@aws-0-us-west-1.pooler.supabase.com:5432/postgres?',
   '@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?'),
  'sslrootcert=system',
  'sslrootcert='||pg_catalog.replace(ca_path,'/','%2F'));
 if new_uri = old_uri
   or new_uri !~ '^postgresql://mip_native_audit_v1:[^@]+@db[.]qikvmopbtijoebdqosyq[.]supabase[.]co:5432/postgres[?]'
   or pg_catalog.regexp_count(new_uri,'@') <> 1
   or pg_catalog.regexp_count(new_uri,'[?]') <> 1
   or pg_catalog.array_length(pg_catalog.string_to_array(pg_catalog.split_part(new_uri,'?',2),'&'),1) <> 3
   or not pg_catalog.string_to_array(pg_catalog.split_part(new_uri,'?',2),'&')
      @> array['sslrootcert='||pg_catalog.replace(ca_path,'/','%2F'),'sslmode=verify-full','connect_timeout=5']
 then raise exception 'qik_audit_route_target_refused'; end if;
 -- Authenticate the distinct auditor over the exact target before changing the row.
 begin
  if not exists(
    select 1 from mip_factual_transport_raw.dblink(
     new_uri,
     'select current_user::text,(select ssl from pg_catalog.pg_stat_ssl where pid=pg_catalog.pg_backend_pid())'
    ) as t(auditor text,tls boolean)
    where auditor='mip_native_audit_v1' and tls
  ) then raise exception 'qik_audit_route_probe_refused'; end if;
 exception when query_canceled or assert_failure then
  raise exception 'qik_audit_route_probe_refused';
 when others then
  raise exception 'qik_audit_route_probe_refused';
 end;
 update mip_factual.audit_connection
 set connection_string=new_uri where id and connection_string=old_uri;
 get diagnostics changed_rows = row_count;
 if changed_rows <> 1 then raise exception 'qik_audit_route_write_refused'; end if;
 -- No result or stored secret leaves this fixed, single-statement transaction.
end
$qik_audit_route_v1$;
$source$; RAISE EXCEPTION 'synthetic_expected_refusal_missing'; EXCEPTION WHEN others THEN IF SQLERRM <> 'qik_audit_route_probe_refused'  THEN RAISE; END IF; END; END $outer$;
DO $unchanged$ BEGIN IF (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM mip_factual.audit_connection t) IS DISTINCT FROM (SELECT value FROM qik_source_before) THEN RAISE EXCEPTION 'synthetic_refusal_changed_source_row'; END IF; END $unchanged$;


SET ROLE mip_cutover_schema_owner_v1;REVOKE UPDATE(connection_string) ON mip_factual.audit_connection FROM postgres;RESET ROLE;
REVOKE mip_cutover_schema_owner_v1 FROM postgres GRANTED BY postgres;
DO $restore$ BEGIN IF (SELECT value-'row' FROM qik_baseline) IS DISTINCT FROM (SELECT jsonb_build_object('row',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM mip_factual.audit_connection t),'relacl',(SELECT relacl::text FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass),'attacl',(SELECT jsonb_agg(jsonb_build_array(attname,attacl::text) ORDER BY attnum) FROM pg_attribute WHERE attrelid='mip_factual.audit_connection'::regclass AND attnum>0),'membership',(SELECT jsonb_agg(jsonb_build_array(roleid::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) ORDER BY roleid::regrole::text,grantor::regrole::text) FROM pg_auth_members WHERE member='postgres'::regrole),'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('postgres','mip_cutover_schema_owner_v1')),'rls',(SELECT jsonb_build_array(relowner::regrole::text,relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY polname) FROM pg_policy p WHERE polrelid='mip_factual.audit_connection'::regclass)) AS value)-'row' THEN RAISE EXCEPTION 'synthetic_authority_restoration_failed'; END IF; END $restore$;
DO $denial$ BEGIN IF has_column_privilege('postgres','mip_factual.audit_connection','connection_string','UPDATE') THEN RAISE EXCEPTION 'synthetic_update_cleanup_failed'; END IF; IF (SELECT count(*) FROM pg_auth_members WHERE member='postgres'::regrole AND roleid='mip_cutover_schema_owner_v1'::regrole AND grantor='postgres'::regrole)<>0 THEN RAISE EXCEPTION 'synthetic_stray_grantor_row'; END IF;END $denial$;SELECT 'WITHIN_TRANSACTION_SEMANTIC_AUTHORITY_RESTORED';SELECT 'PRE_ROLLBACK_ATTACL_EXACT:'||((SELECT value->'attacl' FROM qik_baseline)=(SELECT jsonb_build_object('row',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM mip_factual.audit_connection t),'relacl',(SELECT relacl::text FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass),'attacl',(SELECT jsonb_agg(jsonb_build_array(attname,attacl::text) ORDER BY attnum) FROM pg_attribute WHERE attrelid='mip_factual.audit_connection'::regclass AND attnum>0),'membership',(SELECT jsonb_agg(jsonb_build_array(roleid::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) ORDER BY roleid::regrole::text,grantor::regrole::text) FROM pg_auth_members WHERE member='postgres'::regrole),'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('postgres','mip_cutover_schema_owner_v1')),'rls',(SELECT jsonb_build_array(relowner::regrole::text,relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY polname) FROM pg_policy p WHERE polrelid='mip_factual.audit_connection'::regclass)) AS value)->'attacl')::text;ROLLBACK;SELECT jsonb_build_object('row',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM mip_factual.audit_connection t),'relacl',(SELECT relacl::text FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass),'attacl',(SELECT jsonb_agg(jsonb_build_array(attname,attacl::text) ORDER BY attnum) FROM pg_attribute WHERE attrelid='mip_factual.audit_connection'::regclass AND attnum>0),'membership',(SELECT jsonb_agg(jsonb_build_array(roleid::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) ORDER BY roleid::regrole::text,grantor::regrole::text) FROM pg_auth_members WHERE member='postgres'::regrole),'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('postgres','mip_cutover_schema_owner_v1')),'rls',(SELECT jsonb_build_array(relowner::regrole::text,relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY polname) FROM pg_policy p WHERE polrelid='mip_factual.audit_connection'::regclass)) AS value;