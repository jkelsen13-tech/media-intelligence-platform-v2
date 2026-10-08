-- CONDITIONAL SCOPE MANIFEST ONLY. No current owner authorization request.
-- Never submit before accepted private credential delivery, custody/memory and
-- database/provider/executor log behavior, exact-file review and owner approval.
-- Privileged postgres observation: pg_get_functiondef reads full definitions of
-- mip_comparison_install.audit_probe(boolean), mip_factual.guard_publication(),
-- mip_factual.log_rejection(jsonb,text),
-- mip_factual_transport.dblink_exec(text,text), and
-- mip_factual_transport_raw.dblink_exec(text,text) inside the database session.
-- Credential-adjacent source text may be processed transiently in server memory;
-- fixed boolean output does not remove that read or establish logging/zeroization.
-- proconfig, ACLs and selected dependencies are also compared internally.
-- Only 49 fixed labels and two booleans are returned; no observed definition,
-- configuration, ACL, URI, credential, new hash, operational row or error text.
-- See approval-scope.md for the exact conditional scope and unmet prerequisites.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL lock_timeout = '500ms';
SET LOCAL search_path = pg_catalog;
WITH expected(label,schema_name,function_name,argtypes,return_type,owner_name,
              language_name,security_definer,configuration,sql_atomic_body,
              definition_sha256,acl,dependencies) AS (VALUES
 ('audit_probe', 'mip_comparison_install', 'audit_probe', '16'::pg_catalog.oidvector, 16::pg_catalog.oid, 'mip_factual_owner_v3', 'plpgsql', true, ARRAY['search_path=""']::pg_catalog.text[], false, 'f05ab29fd1728625511302c318866d2ff0bb1f9970c1344884546263852b0e89', '[["mip_factual_owner_v3","mip_factual_owner_v3","EXECUTE",false],["postgres","mip_factual_owner_v3","EXECUTE",false]]'::pg_catalog.jsonb, '[["pg_language","plpgsql","n"],["pg_namespace","mip_comparison_install","n"]]'::pg_catalog.jsonb),
 ('guard_publication', 'mip_factual', 'guard_publication', ''::pg_catalog.oidvector, 2279::pg_catalog.oid, 'mip_factual_owner_v3', 'plpgsql', true, ARRAY['search_path=""']::pg_catalog.text[], false, '1bf1476ebf36f99be40812137ab19153d6faaed84cc9bcc4da5e720ea0207d6a', '[["mip_factual_owner_v3","mip_factual_owner_v3","EXECUTE",false]]'::pg_catalog.jsonb, '[["pg_language","plpgsql","n"],["pg_namespace","mip_factual","n"]]'::pg_catalog.jsonb),
 ('log_rejection', 'mip_factual', 'log_rejection', '3802 25'::pg_catalog.oidvector, 2278::pg_catalog.oid, 'mip_factual_owner_v3', 'plpgsql', true, ARRAY['search_path=""']::pg_catalog.text[], false, '5d1b9f31195716772944385fe96429d2071f070b4e713151caa090f01958a289', '[["mip_factual_owner_v3","mip_factual_owner_v3","EXECUTE",false]]'::pg_catalog.jsonb, '[["pg_language","plpgsql","n"],["pg_namespace","mip_factual","n"]]'::pg_catalog.jsonb),
 ('managed_transport', 'mip_factual_transport', 'dblink_exec', '25 25'::pg_catalog.oidvector, 25::pg_catalog.oid, 'postgres', 'sql', true, ARRAY['search_path=""']::pg_catalog.text[], true, '9f50aa7873a267005e436b40d9aaa9cb32d7ef065201426f1e2595ae9f40dcd1', '[["mip_factual_owner_v3","postgres","EXECUTE",false],["postgres","postgres","EXECUTE",false]]'::pg_catalog.jsonb, '[["pg_namespace","mip_factual_transport","n"],["pg_proc","mip_factual_transport_raw.dblink_exec(text,text)","n"]]'::pg_catalog.jsonb)
), found AS MATERIALIZED (
 SELECT e.*,p.oid,p.proowner,p.prokind,p.prolang,p.prorettype,p.prosecdef,
        p.proconfig,p.prosqlbody,p.proacl,n.oid AS namespace_oid,
        l.lanname,owner_role.oid AS owner_oid
 FROM expected e
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname=e.schema_name
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid
  AND p.proname=e.function_name AND p.proargtypes=e.argtypes
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 LEFT JOIN pg_catalog.pg_roles owner_role ON owner_role.rolname=e.owner_name
), raw AS MATERIALIZED (
 SELECT p.oid,p.proowner,p.prokind,p.prorettype,p.prosecdef,p.proisstrict,
        p.proconfig,p.prosqlbody,n.oid AS namespace_oid,n.nspowner AS namespace_owner,
        n.nspacl AS namespace_acl,l.lanname
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE n.nspname='mip_factual_transport_raw' AND p.proname='dblink_exec'
  AND p.proargtypes='25 25'::pg_catalog.oidvector
), extension AS MATERIALIZED (
 SELECT e.oid,e.extversion,e.extowner,e.extnamespace,e.extrelocatable,n.nspname FROM pg_catalog.pg_extension e
 JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
 WHERE e.extname='dblink'
), roles AS MATERIALIZED (
 SELECT r.oid,r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,
        r.rolreplication,r.rolbypassrls,r.rolinherit FROM pg_catalog.pg_roles r
 WHERE r.rolname IN ('postgres','supabase_admin','mip_factual_owner_v3',
                    'mip_native_audit_v1','anon','authenticated','service_role')
), function_checks AS (
 SELECT f.label||'_function_present' AS property,true AS in_scoped_approval,
        f.oid IS NOT NULL AND f.prokind='f' AS matches FROM found f
 UNION ALL
 SELECT f.label||'_owner_matches',true,
        f.oid IS NOT NULL AND f.owner_oid IS NOT NULL AND f.proowner=f.owner_oid FROM found f
 UNION ALL
 SELECT f.label||'_language_return_and_security_match',true,
        f.oid IS NOT NULL AND f.lanname=f.language_name
        AND f.prorettype=f.return_type AND f.prosecdef=f.security_definer FROM found f
 UNION ALL
 SELECT f.label||'_search_path_and_body_mode_match',true,
        f.oid IS NOT NULL AND f.proconfig IS NOT DISTINCT FROM f.configuration
        AND (f.prosqlbody IS NOT NULL)=f.sql_atomic_body FROM found f
 UNION ALL
 SELECT f.label||'_compiled_definition_matches',true,
        CASE WHEN f.oid IS NULL OR f.prokind<>'f' THEN false
        ELSE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
         pg_catalog.pg_get_functiondef(f.oid),'UTF8')),'hex')=f.definition_sha256 END FROM found f
 UNION ALL
 SELECT f.label||'_exact_execute_acl_matches',true,
        f.oid IS NOT NULL AND (SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname::text END,
           grantor_role.rolname::text,a.privilege_type,a.is_grantable)
          ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname::text END,
           grantor_role.rolname::text,a.privilege_type,a.is_grantable)
         FROM pg_catalog.aclexplode(coalesce(f.proacl,
          pg_catalog.acldefault('f',f.proowner))) a
         LEFT JOIN pg_catalog.pg_roles gr ON gr.oid=a.grantee
         LEFT JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid=a.grantor)=f.acl FROM found f
 UNION ALL
 SELECT f.label||'_exact_parsed_catalog_dependencies_match',true,
        f.oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend extra
          WHERE extra.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND extra.objid=f.oid
           AND (extra.objsubid<>0 OR extra.refobjsubid<>0))
        AND (SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(
           CASE d.refclassid WHEN 'pg_catalog.pg_namespace'::pg_catalog.regclass THEN 'pg_namespace'
            WHEN 'pg_catalog.pg_language'::pg_catalog.regclass THEN 'pg_language'
            WHEN 'pg_catalog.pg_proc'::pg_catalog.regclass THEN 'pg_proc' ELSE 'unsupported_reference' END,
           CASE d.refclassid WHEN 'pg_catalog.pg_namespace'::pg_catalog.regclass THEN rn.nspname::text
            WHEN 'pg_catalog.pg_language'::pg_catalog.regclass THEN rl.lanname::text
            WHEN 'pg_catalog.pg_proc'::pg_catalog.regclass THEN
             CASE WHEN d.refobjid=(SELECT oid FROM raw)
              THEN 'mip_factual_transport_raw.dblink_exec(text,text)' ELSE 'unsupported_function' END
            ELSE 'unsupported_reference' END,d.deptype::text)
          ORDER BY CASE d.refclassid WHEN 'pg_catalog.pg_namespace'::pg_catalog.regclass THEN 'pg_namespace'
            WHEN 'pg_catalog.pg_language'::pg_catalog.regclass THEN 'pg_language'
            WHEN 'pg_catalog.pg_proc'::pg_catalog.regclass THEN 'pg_proc' ELSE 'unsupported_reference' END,
           CASE d.refclassid WHEN 'pg_catalog.pg_namespace'::pg_catalog.regclass THEN rn.nspname::text
            WHEN 'pg_catalog.pg_language'::pg_catalog.regclass THEN rl.lanname::text
            ELSE 'mip_factual_transport_raw.dblink_exec(text,text)' END,d.deptype::text)
         FROM pg_catalog.pg_depend d
         LEFT JOIN pg_catalog.pg_namespace rn ON d.refclassid='pg_catalog.pg_namespace'::pg_catalog.regclass AND rn.oid=d.refobjid
         LEFT JOIN pg_catalog.pg_language rl ON d.refclassid='pg_catalog.pg_language'::pg_catalog.regclass AND rl.oid=d.refobjid
         WHERE d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid=f.oid
          AND d.objsubid=0 AND d.refobjsubid=0)=f.dependencies FROM found f
), other_checks(property,in_scoped_approval,matches) AS (
 SELECT 'catalog_observer_identity_and_readonly_context',true,
        current_user='postgres' AND session_user='postgres'
        AND pg_catalog.current_database()='postgres'
        AND pg_catalog.current_setting('server_version_num') ~ '^17[0-9]{4}$'
        AND pg_catalog.current_setting('transaction_read_only')='on'
        AND pg_catalog.current_setting('search_path')='pg_catalog'
        AND pg_catalog.current_setting('session_replication_role')='origin'
        AND pg_catalog.current_setting('statement_timeout')='5s'
        AND pg_catalog.current_setting('lock_timeout')='500ms'
 UNION ALL
 SELECT 'installer_nonsuperuser_bypassrls_selected_attributes_match',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         NOT r.rolsuper AND r.rolbypassrls),false) FROM roles r WHERE r.rolname='postgres')
 UNION ALL
 SELECT 'provider_expected_superuser_identity_metadata_matches',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         r.oid=10 AND r.rolsuper),false) FROM roles r WHERE r.rolname='supabase_admin')
 UNION ALL
 SELECT 'publication_before_insert_update_attachment_matches',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         t.tgfoid=(SELECT oid FROM found WHERE label='guard_publication')
         AND t.tgtype=23 AND t.tgenabled='O' AND NOT t.tgisinternal
         AND t.tgconstraint=0 AND t.tgqual IS NULL AND t.tgnargs=0
         AND pg_catalog.octet_length(t.tgargs)=0 AND t.tgattr=''::pg_catalog.int2vector
         AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL),false)
         FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='explanations'
          AND t.tgname='factual_publication_guard')
 UNION ALL
 SELECT 'raw_exec_selected_provider_metadata_matches',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         r.prokind='f' AND r.lanname='c' AND r.prorettype=25
         AND NOT r.prosecdef AND r.proisstrict AND r.proconfig IS NULL
         AND r.prosqlbody IS NULL AND r.proowner=(SELECT oid FROM roles WHERE rolname='supabase_admin')),false)
         FROM raw r)
 UNION ALL
 SELECT 'raw_exec_selected_compiled_definition_matches',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         CASE WHEN r.prokind<>'f' THEN false ELSE
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
           pg_catalog.pg_get_functiondef(r.oid),'UTF8')),'hex')='6d8df7ffdab11f960dc914a3b82e080c013f783f30c34ba05b39c67836e001da' END),false) FROM raw r)
 UNION ALL
 SELECT 'dblink_selected_extension_provider_metadata_matches',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         e.extversion='1.2' AND e.extrelocatable AND e.nspname='mip_factual_transport_raw'
         AND e.extowner=(SELECT oid FROM roles WHERE rolname='supabase_admin')),false) FROM extension e)
 UNION ALL
 SELECT 'raw_exec_extension_membership_dependency_matches',true,
        (SELECT pg_catalog.count(*)=1 FROM pg_catalog.pg_depend d
         WHERE d.classid='pg_catalog.pg_proc'::pg_catalog.regclass
          AND d.objid=(SELECT oid FROM raw) AND d.objsubid=0
          AND d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass
          AND d.refobjid=(SELECT oid FROM extension) AND d.refobjsubid=0 AND d.deptype='e')
 UNION ALL
 SELECT 'raw_schema_installer_owner_and_exact_acl_match',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         n.nspowner=(SELECT oid FROM roles WHERE rolname='postgres') AND
         (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
           CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname::text END,
           grantor_role.rolname::text,a.privilege_type,a.is_grantable)
          ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname::text END,
           grantor_role.rolname::text,a.privilege_type,a.is_grantable)
          FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
          LEFT JOIN pg_catalog.pg_roles gr ON gr.oid=a.grantee
          LEFT JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid=a.grantor)=
           '[["postgres","postgres","CREATE",false],["postgres","postgres","USAGE",false]]'::pg_catalog.jsonb),false)
         FROM pg_catalog.pg_namespace n WHERE n.nspname='mip_factual_transport_raw')
 UNION ALL
 SELECT 'factual_role_selected_attributes_match',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         NOT (r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)),false)
         FROM roles r WHERE r.rolname='mip_factual_owner_v3')
 UNION ALL
 SELECT 'audit_login_selected_attributes_match',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)),false)
         FROM roles r WHERE r.rolname='mip_native_audit_v1')
 UNION ALL
 SELECT 'audit_login_fixed_provider_admin_edge_matches',true,
        (SELECT pg_catalog.count(*)=1 AND coalesce(pg_catalog.bool_and(
         a.roleid=(SELECT oid FROM roles WHERE rolname='mip_native_audit_v1')
         AND a.member=(SELECT oid FROM roles WHERE rolname='postgres')
         AND a.grantor=10 AND a.grantor=(SELECT oid FROM roles WHERE rolname='supabase_admin')
         AND a.admin_option AND NOT a.inherit_option AND NOT a.set_option),false)
         FROM pg_catalog.pg_auth_members a
         WHERE a.roleid=(SELECT oid FROM roles WHERE rolname='mip_native_audit_v1')
            OR a.member=(SELECT oid FROM roles WHERE rolname='mip_native_audit_v1'))
 UNION ALL
 SELECT 'selected_shim_and_logger_api_execute_denied',true,
        (SELECT pg_catalog.count(*)=3 AND coalesce(pg_catalog.bool_and(
         NOT pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE')),false)
         FROM roles r CROSS JOIN found f WHERE r.rolname IN ('anon','authenticated','service_role') AND f.label='managed_transport')
        AND (SELECT pg_catalog.count(*)=3 AND coalesce(pg_catalog.bool_and(
         NOT pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE')),false)
         FROM roles r CROSS JOIN found f WHERE r.rolname IN ('anon','authenticated','service_role') AND f.label='log_rejection')
 UNION ALL
 SELECT 'selected_raw_namespace_access_denied_to_factual_and_audit_roles',true,
        (SELECT pg_catalog.count(*)=2 AND coalesce(pg_catalog.bool_and(
         NOT pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE,CREATE')),false)
         FROM roles r CROSS JOIN pg_catalog.pg_namespace n
         WHERE r.rolname IN ('mip_factual_owner_v3','mip_native_audit_v1')
          AND n.nspname='mip_factual_transport_raw')
 UNION ALL
 SELECT 'raw_exec_exact_acl_unqualified_excluded',false,false
 UNION ALL
 SELECT 'uncompiled_review_publish_source_hash_record_hash_and_raw_dblink_excluded',false,false
 UNION ALL
 SELECT 'complete_table_policy_acl_and_transitive_role_inventory_excluded',false,false
 UNION ALL
 SELECT 'operational_operation_manifest_and_installed_disabled_rows_excluded',false,false
 UNION ALL
 SELECT 'server_trust_credentials_logging_privacy_and_autonomous_durability_excluded',false,false
 UNION ALL
 SELECT 'complete_correspondence_or_live_execution_qualification_excluded',false,false
), checks AS (
 SELECT property,in_scoped_approval,coalesce(matches,false) AS matches FROM function_checks
 UNION ALL SELECT property,in_scoped_approval,coalesce(matches,false) FROM other_checks
)
SELECT property,in_scoped_approval,matches FROM checks
UNION ALL
SELECT 'all_selected_catalog_properties_match',true,
       coalesce(pg_catalog.bool_and(matches) FILTER (WHERE in_scoped_approval),false) FROM checks
ORDER BY property;
ROLLBACK;
