-- UNAPPLIED NONDESTRUCTIVE STOP. Requires exact installed catalog pinned separately.
-- Retains immutable receipts/native captures and the NOLOGIN narrow role for audit.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local search_path=pg_catalog;
lock table public.articles,evidence_pipeline.article_captures,mip_private.legacy_extraction_completions,
 mip_private.legacy_reviewed_completions in share row exclusive mode;
do $rollback$
declare actual jsonb; expected text:=current_setting('mip.legacy_atomic_rollback_expected_catalog',true);
begin
-- BEGIN LEGACY ATOMIC INSTALLED BASELINE
select jsonb_build_object(
 'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text) order by n.nspname) from pg_namespace n where n.nspname in ('public','evidence_pipeline','mip_private')),
 'sequences',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text) order by c.oid::regclass::text) from pg_class c where c.oid=any(array['evidence_pipeline.job_events_id_seq'::regclass,'evidence_pipeline.evidence_changes_position_seq'::regclass])),
 'relations',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
  'kind',c.relkind,'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
  'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
  'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.oid::regclass::text)
  from pg_class c where c.oid=any(array['mip_private.legacy_extraction_completions'::regclass,'mip_private.legacy_reviewed_completions'::regclass,'public.articles'::regclass,'public.entities'::regclass,'public.article_entities'::regclass,'public.citations'::regclass,
  'evidence_pipeline.record_versions'::regclass,'evidence_pipeline.import_jobs'::regclass,'evidence_pipeline.import_receipts'::regclass,'evidence_pipeline.job_events'::regclass,'evidence_pipeline.article_captures'::regclass,
  'evidence_pipeline.evidence_changes'::regclass,'evidence_pipeline.change_jobs'::regclass,'mip_private.reviewed_public_article_versions'::regclass,'mip_private.reviewed_public_article_evidence'::regclass])),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p where p.oid=any(array[
  'mip_private.legacy_source_snapshot_v1(public.articles)'::regprocedure,'mip_private.legacy_extraction_apply_v1(text,jsonb)'::regprocedure,'public.mip_legacy_extraction_v1(text,jsonb)'::regprocedure,'public.mip_legacy_reviewed_completion_v1(uuid,uuid,text,uuid,jsonb)'::regprocedure,'mip_private.require_reviewed_public_article_version(uuid,uuid,text)'::regprocedure,'mip_private.public_article_version_is_visible(uuid)'::regprocedure,
  'mip_private.public_article_evidence_is_visible(uuid,uuid)'::regprocedure,'evidence_pipeline.canonical_url(text)'::regprocedure,
  'evidence_pipeline.reject_history_mutation()'::regprocedure,'evidence_pipeline.capture_evidence_change()'::regprocedure,'evidence_pipeline.dispatch_evidence_change()'::regprocedure])),
 'installer_context',jsonb_build_object('current_user',current_user,'session_user',session_user,'current_user_oid',(select oid::text from pg_roles where rolname=current_user),'session_user_oid',(select oid::text from pg_roles where rolname=session_user),'createrole_self_grant',current_setting('createrole_self_grant')),
 'roles',(select jsonb_agg(jsonb_build_object('oid',r.oid::text,'name',r.rolname,'login',r.rolcanlogin,'inherit',r.rolinherit,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
  'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,'replication',r.rolreplication,'configuration',r.rolconfig,
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('membership_oid',m.oid::text,'role_oid',m.roleid::text,'member_oid',m.member::text,'grantor_oid',m.grantor::text,'role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),
   'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) order by m.roleid,m.grantor),'[]') from pg_auth_members m where m.member=r.oid)) order by r.rolname) from pg_roles r),
 'new_relations',(select coalesce(jsonb_agg(c.oid::regclass::text order by c.oid::regclass::text),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_private' and c.relname in ('legacy_extraction_completions','legacy_reviewed_completions')),
 'new_signatures',jsonb_build_array(to_regprocedure('public.mip_legacy_extraction_v1(text,jsonb)')::text,to_regprocedure('mip_private.legacy_extraction_apply_v1(text,jsonb)')::text,
  to_regprocedure('public.mip_legacy_reviewed_completion_v1(uuid,uuid,text,uuid,jsonb)')::text,to_regprocedure('mip_private.legacy_source_snapshot_v1(public.articles)')::text)
) into actual;
-- END LEGACY ATOMIC INSTALLED BASELINE
 if nullif(expected,'') is null or actual is distinct from expected::jsonb then raise exception 'legacy atomic rollback catalog missing or drifted'; end if;
end $rollback$;
revoke execute on function public.mip_legacy_extraction_v1(text,jsonb) from service_role;
-- Separate D stop authority: the non-super creator temporarily SETs the narrow
-- owner solely to revoke this exact private signature. No schema CREATE grant.
-- The provider OID10 ADMIN-only edge and all existing memberships are retained.
do $stop_owner$
declare installer oid:=(select oid from pg_roles where rolname=current_user);
 installer_name name:=current_user; target oid:='mip_legacy_completion_owner'::regrole;
 super boolean; memberships_before jsonb; memberships_after jsonb; schema_acl_before text;
begin
 select rolsuper into strict super from pg_roles where oid=installer;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]') into memberships_before
   from pg_auth_members m where m.roleid=target;
 select nspacl::text into strict schema_acl_before from pg_namespace where nspname='mip_private';
 if not super then
   if current_setting('createrole_self_grant')<>''
     or not exists(select 1 from pg_auth_members m where m.roleid=target and m.member=installer and m.grantor=10
       and m.grantor<>installer and m.admin_option and not m.inherit_option and not m.set_option)
     or exists(select 1 from pg_auth_members m where m.roleid=target and m.member=installer and m.grantor=installer)
     or pg_has_role(installer,target,'SET') then raise exception 'unexpected creator authority before exact legacy stop'; end if;
   execute format('grant mip_legacy_completion_owner to %I with admin false,inherit false,set true granted by %I',installer_name,installer_name);
   if not exists(select 1 from pg_auth_members m where m.roleid=target and m.member=installer and m.grantor=installer
     and not m.admin_option and not m.inherit_option and m.set_option) then raise exception 'bounded stop SET grant missing'; end if;
   execute 'set local role mip_legacy_completion_owner';
 end if;
 revoke execute on function mip_private.legacy_extraction_apply_v1(text,jsonb) from service_role;
 if not super then
   execute format('set local role %I',installer_name);
   execute format('revoke mip_legacy_completion_owner from %I granted by %I restrict',installer_name,installer_name);
 end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]') into memberships_after
   from pg_auth_members m where m.roleid=target;
 if current_user is distinct from installer_name or memberships_after is distinct from memberships_before
   or (select nspacl::text from pg_namespace where nspname='mip_private') is distinct from schema_acl_before
   or (not super and pg_has_role(installer,target,'SET')) then raise exception 'legacy stop temporary authority restoration failed'; end if;
end $stop_owner$;
commit;
-- Do not deploy the predecessor handler: its historical after-RETURNING race remains reproduced.
-- This stop does not delete audit history or revoke unrelated overloads/publication owners.
