-- PROPOSAL ONLY. SELECT-only nonsecret catalog baseline. No stored URI is read.
WITH RECURSIVE actors(oid) AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN
 ('postgres','mip_cutover_schema_owner_v1','mip_factual_owner_v3','mip_native_audit_v1')
 UNION SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname IN
 ('mip_factual','mip_comparison_install','mip_native_activation','mip_factual_transport_raw')
 UNION SELECT proowner FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='mip_factual_transport_raw' AND p.proname='dblink'
 UNION SELECT pg_catalog.unnest(polroles) FROM pg_catalog.pg_policy WHERE polrelid=pg_catalog.to_regclass('mip_factual.audit_connection')
), reachable(oid) AS (
 SELECT oid FROM actors
 UNION SELECT dependency.oid FROM pg_catalog.pg_auth_members m JOIN reachable r ON m.member=r.oid
 CROSS JOIN LATERAL (VALUES (m.roleid),(m.grantor)) AS dependency(oid)
), memberships AS (
 SELECT m.roleid, m.member, m.grantor, r.rolname AS role, u.rolname AS member_name,
        g.rolname AS grantor_name, m.admin_option AS admin, m.inherit_option AS inherit, m.set_option AS set
 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
 JOIN pg_catalog.pg_roles u ON u.oid=m.member JOIN pg_catalog.pg_roles g ON g.oid=m.grantor
 WHERE m.member IN (SELECT oid FROM reachable)
), relevant_roles AS (
 SELECT oid FROM reachable UNION SELECT grantor FROM memberships
), relation AS (
 SELECT c.oid, c.relowner, r.rolname AS owner, c.relkind,
        c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
        c.relacl::text[] AS acl_raw
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
 WHERE n.nspname='mip_factual' AND c.relname='audit_connection'
)
SELECT pg_catalog.jsonb_build_object(
 'version','qik-rollback-sql-boundary-1',
 'identity',pg_catalog.jsonb_build_object('session_user',session_user,'current_user',current_user,
   'database',pg_catalog.current_database(),'server_version_num',pg_catalog.current_setting('server_version_num'),
   'role_setting',pg_catalog.current_setting('role'),'createrole_self_grant',pg_catalog.current_setting('createrole_self_grant')),
 'deadlines',pg_catalog.jsonb_build_object('statement_timeout',pg_catalog.current_setting('statement_timeout'),
   'lock_timeout',pg_catalog.current_setting('lock_timeout')),
 'roles',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',r.oid,'name',r.rolname,
   'superuser',r.rolsuper,'inherit',r.rolinherit,'createrole',r.rolcreaterole,
   'createdb',r.rolcreatedb,'login',r.rolcanlogin,'replication',r.rolreplication,
   'bypass_rls',r.rolbypassrls,'connection_limit',r.rolconnlimit,'valid_until',r.rolvaliduntil,
   'config_present',r.rolconfig IS NOT NULL) ORDER BY r.oid),'[]'::jsonb) FROM pg_catalog.pg_roles r
   WHERE r.oid IN (SELECT oid FROM relevant_roles)),
 'memberships',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY roleid,member,grantor),'[]'::jsonb) FROM memberships m),
 'relation',(SELECT pg_catalog.to_jsonb(r) FROM relation r),
 'columns',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('attnum',a.attnum,'name',a.attname,
   'type_oid',a.atttypid,'not_null',a.attnotnull,'acl_raw',a.attacl::text[]) ORDER BY a.attnum),'[]'::jsonb)
   FROM pg_catalog.pg_attribute a WHERE a.attrelid=(SELECT oid FROM relation) AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',p.oid,'name',p.polname,
   'command',p.polcmd,'permissive',p.polpermissive,'role_oids',p.polroles,
   'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.oid),'[]'::jsonb)
   FROM pg_catalog.pg_policy p WHERE p.polrelid=(SELECT oid FROM relation)),
 'schemas',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',n.oid,'name',n.nspname,
   'owner_oid',n.nspowner,'acl_raw',n.nspacl::text[],
   'postgres_usage',pg_catalog.has_schema_privilege('postgres',n.oid,'USAGE')) ORDER BY n.oid),'[]'::jsonb)
   FROM pg_catalog.pg_namespace n WHERE n.nspname IN
   ('mip_factual','mip_comparison_install','mip_native_activation','mip_factual_transport_raw')),
 'publications',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.pubname),'[]'::jsonb)
   FROM pg_catalog.pg_publication_tables p WHERE p.schemaname='mip_factual' AND p.tablename='audit_connection'),
 'effective',pg_catalog.jsonb_build_object('select_id',pg_catalog.has_column_privilege('postgres','mip_factual.audit_connection','id','SELECT'),
   'select_connection',pg_catalog.has_column_privilege('postgres','mip_factual.audit_connection','connection_string','SELECT'),
   'update_id',pg_catalog.has_column_privilege('postgres','mip_factual.audit_connection','id','UPDATE'),
   'update_connection',pg_catalog.has_column_privilege('postgres','mip_factual.audit_connection','connection_string','UPDATE'),
   'table_update',pg_catalog.has_table_privilege('postgres','mip_factual.audit_connection','UPDATE'),
   'dblink_execute',CASE WHEN pg_catalog.to_regprocedure('mip_factual_transport_raw.dblink(text,text)') IS NULL THEN false
     ELSE pg_catalog.has_function_privilege('postgres','mip_factual_transport_raw.dblink(text,text)','EXECUTE') END,
   'owner_set',pg_catalog.pg_has_role('postgres','mip_cutover_schema_owner_v1','SET'),
   'owner_usage',pg_catalog.pg_has_role('postgres','mip_cutover_schema_owner_v1','USAGE')),
 'logging',(SELECT pg_catalog.jsonb_object_agg(s.name,s.setting ORDER BY s.name) FROM pg_catalog.pg_settings s
   WHERE s.name IN ('log_statement','log_min_duration_statement','log_min_duration_sample',
   'log_transaction_sample_rate','log_parameter_max_length_on_error','log_parameter_max_length',
   'log_min_error_statement','log_error_verbosity','pgaudit.log','pgaudit.log_parameter',
   'auto_explain.log_nested_statements','auto_explain.log_min_duration','pg_stat_statements.track',
   'shared_preload_libraries','session_preload_libraries','local_preload_libraries')),
 'optional_logging',pg_catalog.jsonb_build_object('pgaudit.log',pg_catalog.current_setting('pgaudit.log',true),
   'pgaudit.log_parameter',pg_catalog.current_setting('pgaudit.log_parameter',true),
   'auto_explain.log_nested_statements',pg_catalog.current_setting('auto_explain.log_nested_statements',true),
   'auto_explain.log_min_duration',pg_catalog.current_setting('auto_explain.log_min_duration',true),
   'pg_stat_statements.track',pg_catalog.current_setting('pg_stat_statements.track',true)),
 'ca_path',pg_catalog.current_setting('ssl_ca_file',true),
 'dblink',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',p.oid,'owner_oid',p.proowner,
   'security_definer',p.prosecdef,'strict',p.proisstrict,'acl_raw',p.proacl::text[],
   'kind',p.prokind,'argument_type_oids',p.proargtypes::oid[],'result_type_oid',p.prorettype,
   'returns_set',p.proretset,'config_present',p.proconfig IS NOT NULL,
   'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid)) ORDER BY p.oid),'[]'::jsonb)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='mip_factual_transport_raw' AND p.proname='dblink')
) AS snapshot;
