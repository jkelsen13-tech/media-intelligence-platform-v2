-- READ ONLY. Empty/false required results mean HOLD; does not run extraction or admission.
begin read only;
set local search_path=pg_catalog;
select current_database() database_name,current_user actor,current_setting('server_version_num') server_version,
 to_regprocedure('public.mip_legacy_extraction_v1(text,jsonb)') exact_executor,
 to_regprocedure('public.mip_legacy_reviewed_completion_v1(uuid,uuid,text,uuid,jsonb)') exact_reviewed_owner,
 to_regprocedure('mip_private.require_reviewed_public_article_version(uuid,uuid,text)') exact_native_version_lock,
 not has_table_privilege('service_role','public.articles','UPDATE') service_general_article_update_denied;
select r.rolname,not r.rolcanlogin and not r.rolinherit and not r.rolsuper and not r.rolbypassrls
 and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication as restricted_owner,
 not pg_has_role('service_role',r.oid,'MEMBER') and not pg_has_role('anon',r.oid,'MEMBER') and not pg_has_role('authenticated',r.oid,'MEMBER') as no_executor_or_reader_membership
from pg_roles r where r.rolname='mip_legacy_completion_owner';
select p.oid::regprocedure signature,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl,
 encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p where p.oid=any(array['public.mip_legacy_extraction_v1(text,jsonb)'::regprocedure,
 'mip_private.legacy_extraction_apply_v1(text,jsonb)'::regprocedure,'public.mip_legacy_reviewed_completion_v1(uuid,uuid,text,uuid,jsonb)'::regprocedure,
 'mip_private.require_reviewed_public_article_version(uuid,uuid,text)'::regprocedure]);
select c.oid::regclass relation,c.relrowsecurity,
 has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service_any_access,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_any_access,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated_any_access
from pg_class c where c.oid=any(array['mip_private.legacy_extraction_completions'::regclass,'mip_private.legacy_reviewed_completions'::regclass]);
select a.attname,has_column_privilege('mip_legacy_completion_owner','public.articles',a.attname,'UPDATE') lock_owner_update
from pg_attribute a where a.attrelid='public.articles'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum;
select false as legacy_reactivated,false as article_or_claim_admission_authorized,0 as provider_or_source_requests;
rollback;
