-- READ ONLY. Pin this full result before separately authorizing the unapplied install.
begin read only;
set local search_path=pg_catalog;
select jsonb_build_object(
 'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text) order by n.nspname) from pg_namespace n where n.nspname in ('public','evidence_pipeline','mip_private')),
 'sequences',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text) order by c.oid::regclass::text) from pg_class c where c.oid=any(array['evidence_pipeline.job_events_id_seq'::regclass,'evidence_pipeline.evidence_changes_position_seq'::regclass])),
 'relations',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
  'kind',c.relkind,'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
  'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
  'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.oid::regclass::text)
  from pg_class c where c.oid=any(array['public.articles'::regclass,'public.entities'::regclass,'public.article_entities'::regclass,'public.citations'::regclass,
  'evidence_pipeline.record_versions'::regclass,'evidence_pipeline.import_jobs'::regclass,'evidence_pipeline.import_receipts'::regclass,'evidence_pipeline.job_events'::regclass,'evidence_pipeline.article_captures'::regclass,
  'evidence_pipeline.evidence_changes'::regclass,'evidence_pipeline.change_jobs'::regclass,'mip_private.reviewed_public_article_versions'::regclass,'mip_private.reviewed_public_article_evidence'::regclass])),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p where p.oid=any(array[
  'mip_private.require_reviewed_public_article_version(uuid,uuid,text)'::regprocedure,'mip_private.public_article_version_is_visible(uuid)'::regprocedure,
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
) ;
rollback;
