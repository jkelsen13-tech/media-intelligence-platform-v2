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
 'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'inherit',r.rolinherit,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
  'memberships',(select coalesce(jsonb_agg(p.rolname order by p.rolname),'[]') from pg_roles p where p.oid<>r.oid and pg_has_role(r.oid,p.oid,'MEMBER'))) order by r.rolname) from pg_roles r where r.rolname in ('anon','authenticated','service_role','qik_ingest_fn_owner','mip_legacy_completion_owner')),
 'new_relations',(select coalesce(jsonb_agg(c.oid::regclass::text order by c.oid::regclass::text),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_private' and c.relname in ('legacy_extraction_completions','legacy_reviewed_completions')),
 'new_signatures',jsonb_build_array(to_regprocedure('public.mip_legacy_extraction_v1(text,jsonb)')::text,to_regprocedure('mip_private.legacy_extraction_apply_v1(text,jsonb)')::text,
  to_regprocedure('public.mip_legacy_reviewed_completion_v1(uuid,uuid,text,uuid,jsonb)')::text,to_regprocedure('mip_private.legacy_source_snapshot_v1(public.articles)')::text)
) into actual;
-- END LEGACY ATOMIC INSTALLED BASELINE
 if nullif(expected,'') is null or actual is distinct from expected::jsonb then raise exception 'legacy atomic rollback catalog missing or drifted'; end if;
end $rollback$;
revoke execute on function public.mip_legacy_extraction_v1(text,jsonb),mip_private.legacy_extraction_apply_v1(text,jsonb) from service_role;
commit;
-- Do not deploy the predecessor handler: its historical after-RETURNING race remains reproduced.
-- This stop does not delete audit history or revoke unrelated overloads/publication owners.
