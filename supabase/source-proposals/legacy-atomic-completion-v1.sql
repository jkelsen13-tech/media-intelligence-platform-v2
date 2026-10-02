-- UNAPPLIED SOURCE PROPOSAL. No role/grant/install/activation authority is asserted.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local search_path=pg_catalog;
lock table public.articles,evidence_pipeline.record_versions,evidence_pipeline.import_jobs,
  evidence_pipeline.article_captures,public.entities,public.article_entities,public.citations,
  mip_private.reviewed_public_article_versions,mip_private.reviewed_public_article_evidence in share row exclusive mode;
do $preflight$
declare actual jsonb; expected text:=current_setting('mip.legacy_atomic_expected_catalog',true);
begin
-- BEGIN LEGACY ATOMIC BASELINE
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
) into actual;
-- END LEGACY ATOMIC BASELINE
 if nullif(expected,'') is null or actual is distinct from expected::jsonb then raise exception 'legacy atomic catalog baseline missing or drifted'; end if;
 if actual->'new_relations'<>'[]'::jsonb or actual->'new_signatures'<>'[null,null,null,null]'::jsonb
  or exists(select 1 from pg_roles where rolname='mip_legacy_completion_owner') then raise exception 'legacy atomic exact names occupied'; end if;
 if current_user in ('anon','authenticated','service_role') or current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid='public.articles'::regclass) then raise exception 'exact existing article publication owner required'; end if;
 if has_table_privilege('service_role','public.articles','UPDATE') then raise exception 'service general article UPDATE must remain denied'; end if;
 if current_setting('createrole_self_grant')<>'' then raise exception 'legacy atomic requires empty createrole_self_grant; unexpected creator authority is not accepted'; end if;
end $preflight$;

-- This role exists solely for a fixed SQL body to lock private rows. The
-- ingestion service receives no membership or SET/INHERIT/ADMIN authority.
create role mip_legacy_completion_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema public,evidence_pipeline,mip_private to mip_legacy_completion_owner;
grant select on public.articles,evidence_pipeline.record_versions,evidence_pipeline.import_jobs,evidence_pipeline.article_captures,evidence_pipeline.evidence_changes to mip_legacy_completion_owner;
-- PostgreSQL SELECT FOR UPDATE requires UPDATE on at least one column. Native
-- immutable identity triggers forbid changing id; the fixed body never UPDATEs articles.
grant update(id) on public.articles to mip_legacy_completion_owner;
create policy mip_legacy_atomic_private_read on public.articles for select to mip_legacy_completion_owner using(reader_state<>'eligible' or source_status<>'active');
create policy mip_legacy_atomic_private_lock on public.articles for update to mip_legacy_completion_owner using(reader_state<>'eligible' or source_status<>'active') with check(reader_state<>'eligible' or source_status<>'active');
grant insert on evidence_pipeline.import_jobs,evidence_pipeline.import_receipts,evidence_pipeline.job_events,evidence_pipeline.article_captures,evidence_pipeline.evidence_changes,evidence_pipeline.change_jobs to mip_legacy_completion_owner;
grant usage on sequence evidence_pipeline.job_events_id_seq,evidence_pipeline.evidence_changes_position_seq to mip_legacy_completion_owner;
create policy mip_legacy_atomic_versions_read on evidence_pipeline.record_versions for select to mip_legacy_completion_owner using(true);
create policy mip_legacy_atomic_jobs_read on evidence_pipeline.import_jobs for select to mip_legacy_completion_owner using(true);
create policy mip_legacy_atomic_jobs_append on evidence_pipeline.import_jobs for insert to mip_legacy_completion_owner with check(true);
create policy mip_legacy_atomic_captures_read on evidence_pipeline.article_captures for select to mip_legacy_completion_owner using(true);
create policy mip_legacy_atomic_captures_append on evidence_pipeline.article_captures for insert to mip_legacy_completion_owner with check(true);
create policy mip_legacy_atomic_receipts_append on evidence_pipeline.import_receipts for insert to mip_legacy_completion_owner with check(true);
create policy mip_legacy_atomic_events_append on evidence_pipeline.job_events for insert to mip_legacy_completion_owner with check(true);
create policy mip_legacy_atomic_changes_read on evidence_pipeline.evidence_changes for select to mip_legacy_completion_owner using(true);
create policy mip_legacy_atomic_changes_append on evidence_pipeline.evidence_changes for insert to mip_legacy_completion_owner with check(true);
create policy mip_legacy_atomic_change_jobs_append on evidence_pipeline.change_jobs for insert to mip_legacy_completion_owner with check(true);
grant execute on function evidence_pipeline.canonical_url(text) to mip_legacy_completion_owner;

create table mip_private.legacy_extraction_completions (
 completion_id uuid primary key default gen_random_uuid(),article_id uuid not null references public.articles(id),
 record_version_id uuid not null references evidence_pipeline.record_versions(id),source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
 capture_id uuid not null references evidence_pipeline.article_captures(id),capture_hash text not null check(capture_hash ~ '^[0-9a-f]{64}$'),
 extractor_version text not null check(extractor_version='legacy-pure-candidates-v1'),source_snapshot jsonb not null,plan jsonb not null,
 plan_hash text not null,recorded_at timestamptz not null default clock_timestamp(),publication text not null default 'withheld' check(publication='withheld'),
 unique(article_id,record_version_id,extractor_version)
);
create table mip_private.legacy_reviewed_completions (
 review_completion_id uuid primary key default gen_random_uuid(),completion_id uuid not null references mip_private.legacy_extraction_completions(completion_id),
 public_version_id uuid not null references mip_private.reviewed_public_article_versions(public_version_id),capture_id uuid not null references evidence_pipeline.article_captures(id),
 capture_hash text not null,review_ref text not null,reviewed_plan jsonb not null,reviewed_by name not null,recorded_at timestamptz not null default clock_timestamp(),
 unique(public_version_id,review_ref)
);
alter table mip_private.legacy_extraction_completions enable row level security;
alter table mip_private.legacy_reviewed_completions enable row level security;
revoke all on mip_private.legacy_extraction_completions,mip_private.legacy_reviewed_completions from public,anon,authenticated,service_role;
grant select,insert on mip_private.legacy_extraction_completions to mip_legacy_completion_owner;
create policy mip_legacy_atomic_completion_read on mip_private.legacy_extraction_completions for select to mip_legacy_completion_owner using(true);
create policy mip_legacy_atomic_completion_append on mip_private.legacy_extraction_completions for insert to mip_legacy_completion_owner with check(true);
create trigger no_rewrite before update or delete on mip_private.legacy_extraction_completions for each row execute function evidence_pipeline.reject_history_mutation();
create trigger no_truncate before truncate on mip_private.legacy_extraction_completions for each statement execute function evidence_pipeline.reject_history_mutation();
create trigger no_rewrite before update or delete on mip_private.legacy_reviewed_completions for each row execute function evidence_pipeline.reject_history_mutation();
create trigger no_truncate before truncate on mip_private.legacy_reviewed_completions for each statement execute function evidence_pipeline.reject_history_mutation();

create function mip_private.legacy_source_snapshot_v1(a public.articles) returns jsonb
language sql stable security invoker set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('id',a.id,'url',a.url,'feed',a.feed,'outlet',a.outlet,'title',a.title,'summary',a.summary,'body_text',a.body_text,
 'published_at',a.published_at,'fetched_at',a.fetched_at,'image_url',a.image_url,'image_alt',a.image_alt,'ingestion_run_id',a.ingestion_run_id,
 'reader_state',a.reader_state,'source_status',a.source_status,'entities_extracted_at',a.entities_extracted_at)
$$;

create function mip_private.legacy_extraction_apply_v1(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare a public.articles; rv uuid; snap jsonb; plan jsonb; prior mip_private.legacy_extraction_completions; cap evidence_pipeline.article_captures;
 raw_payload jsonb; h text; j uuid; result uuid; src_hash text; batch jsonb; x jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>300000 then raise exception 'invalid legacy request'; end if;
 if p_input->>'extractor_version' is distinct from 'legacy-pure-candidates-v1' then raise exception 'unsupported legacy extractor version'; end if;
 if p_action='read_pending' then
  if p_input-array['run_tag','limit','extractor_version']<>'{}'::jsonb or not p_input ?& array['run_tag','limit','extractor_version'] or jsonb_typeof(p_input->'limit') is distinct from 'number'
   or (p_input->>'limit')::integer not between 1 and 25 or jsonb_typeof(p_input->'run_tag') not in ('string','null')
   or char_length(coalesce(p_input->>'run_tag',''))>120 then raise exception 'invalid private selection'; end if;
  select coalesce(jsonb_agg(item order by fetched_at,id),'[]') into batch from (
   select ar.fetched_at,ar.id,mip_private.legacy_source_snapshot_v1(ar)||jsonb_build_object('record_version_id',v.id,
    'source_hash',encode(sha256(convert_to(mip_private.legacy_source_snapshot_v1(ar)::text,'UTF8')),'hex')) item
   from public.articles ar cross join lateral (select id from evidence_pipeline.record_versions where record_kind='article' and record_key=ar.id::text order by ordinal desc limit 1)v
   where ar.entities_extracted_at is null and (ar.reader_state<>'eligible' or ar.source_status<>'active')
    and (p_input->>'run_tag' is null or ar.ingestion_run_id=p_input->>'run_tag')
    and not exists(select 1 from mip_private.legacy_extraction_completions c where c.article_id=ar.id and c.record_version_id=v.id and c.extractor_version=p_input->>'extractor_version')
   order by ar.fetched_at,ar.id limit (p_input->>'limit')::integer
  )selected;
  return jsonb_build_object('articles',batch,'publication','withheld');
 elsif p_action is distinct from 'complete_private' then raise exception 'unsupported legacy action'; end if;
 if p_input-array['article_id','record_version_id','source_hash','extractor_version','plan']<>'{}'::jsonb
  or not p_input ?& array['article_id','record_version_id','source_hash','extractor_version','plan'] then raise exception 'invalid private completion'; end if;
 select * into a from public.articles where id=(p_input->>'article_id')::uuid for update;
 if not found or (a.reader_state<>'eligible' or a.source_status<>'active') is not true or a.entities_extracted_at is not null then raise exception 'private legacy source required'; end if;
 select id into rv from evidence_pipeline.record_versions where record_kind='article' and record_key=a.id::text order by ordinal desc limit 1;
 snap:=mip_private.legacy_source_snapshot_v1(a);src_hash:=encode(sha256(convert_to(snap::text,'UTF8')),'hex');
 if rv is null or rv is distinct from (p_input->>'record_version_id')::uuid or src_hash is distinct from p_input->>'source_hash' then raise exception 'selected legacy source version/hash conflict'; end if;
 plan:=p_input->'plan';
 if jsonb_typeof(plan) is distinct from 'object' or plan-array['metadata_only','normalization','claims','entities','citations','proposed_digest']<>'{}'::jsonb
  or not plan ?& array['metadata_only','normalization','claims','entities','citations','proposed_digest']
  or jsonb_typeof(plan->'metadata_only') is distinct from 'boolean' or jsonb_typeof(plan->'proposed_digest') is distinct from 'boolean'
  or jsonb_typeof(plan->'normalization') is distinct from 'object'
  or (plan->'normalization')-array['title','summary','body_text','image_url','image_alt']<>'{}'::jsonb
  or not (plan->'normalization') ?& array['title','summary','body_text','image_url','image_alt']
  or exists(select 1 from jsonb_each(plan->'normalization') kv where jsonb_typeof(value) not in ('string','null'))
  or jsonb_typeof(plan->'claims') is distinct from 'array' or jsonb_array_length(plan->'claims')>6
  or jsonb_typeof(plan->'entities') is distinct from 'array' or jsonb_array_length(plan->'entities')>50
  or jsonb_typeof(plan->'citations') is distinct from 'array' or jsonb_array_length(plan->'citations')>6
  or octet_length(plan::text)>262144 then raise exception 'invalid bounded private plan'; end if;
 if btrim(coalesce(a.body_text,''))='Read-only reference import: public source metadata only. No original body text, embeddings, entities, claims, or relationship data were copied.' and not (plan->>'metadata_only')::boolean then raise exception 'metadata reference relations withheld'; end if;
 if (plan->>'metadata_only')::boolean and (plan->'claims'<>'[]'::jsonb or plan->'entities'<>'[]'::jsonb or plan->'citations'<>'[]'::jsonb or (plan->>'proposed_digest')::boolean) then raise exception 'metadata reference relations withheld'; end if;
 -- These are untrusted private interpretations, never executable identifiers.
 for x in select value from jsonb_array_elements(plan->'claims') loop
  if jsonb_typeof(x)<>'object' or x-array['text','kind']<>'{}'::jsonb or char_length(coalesce(x->>'text','')) not between 1 and 4000 or x->>'kind' not in ('substantive','framing') then raise exception 'invalid claim proposal'; end if;
 end loop;
 for x in select value from jsonb_array_elements(plan->'entities') loop
  if jsonb_typeof(x)<>'object' or x-array['surface','role','mentions','entity_type']<>'{}'::jsonb or char_length(coalesce(x->>'surface','')) not between 1 and 500 or x->>'entity_type' not in ('person','organization','institution','other') then raise exception 'invalid entity proposal'; end if;
 end loop;
 for x in select value from jsonb_array_elements(plan->'citations') loop
  if jsonb_typeof(x)<>'object' or x-array['cited_entity','cited_type','documentation_strength']<>'{}'::jsonb or char_length(coalesce(x->>'cited_entity','')) not between 1 and 500 or x->>'cited_type' not in ('court_doc','agency_release','named_official','anonymous_official','study','prior_reporting') or jsonb_typeof(x->'documentation_strength') is distinct from 'number' then raise exception 'invalid citation proposal'; end if;
 end loop;
 select * into prior from mip_private.legacy_extraction_completions where article_id=a.id and record_version_id=rv and extractor_version=p_input->>'extractor_version';
 if found then
  if prior.plan is distinct from plan or prior.source_snapshot is distinct from snap then raise exception 'private completion idempotency conflict'; end if;
  return jsonb_build_object('completion_id',prior.completion_id,'capture_id',prior.capture_id,'capture_hash',prior.capture_hash,'publication','withheld');
 end if;
 raw_payload:=jsonb_build_object('url',a.url,'title',a.title,'outlet',a.outlet,'summary',a.summary,'body_text',a.body_text,'published_at',a.published_at);
 if octet_length(raw_payload::text)>262144 or evidence_pipeline.canonical_url(a.url) is null then raise exception 'bounded retained source required'; end if;
 h:=encode(sha256(convert_to(raw_payload::text,'UTF8')),'hex');
 select * into cap from evidence_pipeline.article_captures where article_id=a.id and content_hash=h and payload=raw_payload order by captured_at,id limit 1;
 if cap.id is null then
  insert into evidence_pipeline.import_jobs(canonical_url,input_hash,payload,first_run_id,state,article_id,outcome,completed_at)
   values(evidence_pipeline.canonical_url(a.url),h,raw_payload,'legacy-private:'||rv::text,'completed',a.id,'existing',clock_timestamp()) on conflict(canonical_url,input_hash) do nothing returning id into j;
  if j is null then raise exception 'native source capture job already exists; reconcile with native owner'; end if;
  insert into evidence_pipeline.import_receipts(run_id,job_id,original_url) values('legacy-private:'||rv::text,j,a.url);
  insert into evidence_pipeline.article_captures(article_id,job_id,content_hash,payload) values(a.id,j,h,raw_payload) returning * into cap;
  insert into evidence_pipeline.job_events(job_id,attempt,state,code) values(j,0,'completed','legacy_private_capture');
 end if;
 insert into mip_private.legacy_extraction_completions(article_id,record_version_id,source_hash,capture_id,capture_hash,extractor_version,source_snapshot,plan,plan_hash)
 values(a.id,rv,src_hash,cap.id,h,p_input->>'extractor_version',snap,plan,encode(sha256(convert_to(plan::text,'UTF8')),'hex')) returning completion_id into result;
 return jsonb_build_object('completion_id',result,'capture_id',cap.id,'capture_hash',h,'publication','withheld');
end $$;

create function public.mip_legacy_extraction_v1(p_action text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' and current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid='public.articles'::regclass) then raise exception 'private legacy executor required'; end if;
 return mip_private.legacy_extraction_apply_v1(p_action,p_input);
end $$;

-- Explicit reviewed derived completion, called only by the existing publication
-- owner. It creates no canonical entity, alias, claim, event or article admission.
create function public.mip_legacy_reviewed_completion_v1(p_public_version_id uuid,p_capture_id uuid,p_capture_hash text,p_completion_id uuid,p_plan jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare article uuid; c mip_private.legacy_extraction_completions; x jsonb; result uuid; prior mip_private.legacy_reviewed_completions;
begin
 article:=mip_private.require_reviewed_public_article_version(p_public_version_id,p_capture_id,p_capture_hash);
 select * into c from mip_private.legacy_extraction_completions where completion_id=p_completion_id for key share;
 if not found or c.article_id<>article or c.capture_id<>p_capture_id or c.capture_hash<>p_capture_hash or (c.plan->>'metadata_only')::boolean then raise exception 'exact private proposal capture required'; end if;
 if jsonb_typeof(p_plan) is distinct from 'object' or p_plan-array['review_ref','entities','citations']<>'{}'::jsonb or not p_plan ?& array['review_ref','entities','citations']
  or char_length(btrim(coalesce(p_plan->>'review_ref',''))) not between 1 and 500 or octet_length(p_plan::text)>65536
  or jsonb_typeof(p_plan->'entities') is distinct from 'array' or jsonb_array_length(p_plan->'entities')>50
  or jsonb_typeof(p_plan->'citations') is distinct from 'array' or jsonb_array_length(p_plan->'citations')>6 then raise exception 'invalid explicit reviewed plan'; end if;
 for x in select value from jsonb_array_elements(p_plan->'entities') union all select value from jsonb_array_elements(p_plan->'citations') loop
  if not exists(select 1 from mip_private.reviewed_public_article_evidence e where e.public_version_id=p_public_version_id
    and e.article_claim_id=(x->>'article_claim_id')::uuid and e.capture_id=p_capture_id and e.capture_hash=p_capture_hash
    and mip_private.public_article_evidence_is_visible(e.public_version_id,e.article_claim_id)) then raise exception 'derived write requires exact admitted evidence'; end if;
 end loop;
 for x in select value from jsonb_array_elements(p_plan->'entities') loop
  if x-array['entity_id','article_claim_id','surface','role','confidence']<>'{}'::jsonb or not x ?& array['entity_id','article_claim_id','surface','role','confidence']
   or char_length(coalesce(x->>'surface','')) not between 1 and 500 or char_length(coalesce(x->>'role',''))>100
   or jsonb_typeof(x->'confidence') is distinct from 'number' or (x->>'confidence')::numeric not between 0 and 1
   or not exists(select 1 from public.entities where id=(x->>'entity_id')::uuid)
   or not exists(select 1 from mip_private.reviewed_public_article_evidence where public_version_id=p_public_version_id and article_claim_id=(x->>'article_claim_id')::uuid and strpos(excerpt,x->>'surface')>0) then raise exception 'invalid reviewed entity link'; end if;
 end loop;
 for x in select value from jsonb_array_elements(p_plan->'citations') loop
  if x-array['article_claim_id','cited_entity','cited_type','documentation_strength']<>'{}'::jsonb or not x ?& array['article_claim_id','cited_entity','cited_type','documentation_strength']
   or x->>'cited_type' not in ('court_doc','agency_release','named_official','anonymous_official','study','prior_reporting')
   or jsonb_typeof(x->'documentation_strength') is distinct from 'number' or (x->>'documentation_strength')::numeric not between 0 and 1
   or char_length(coalesce(x->>'cited_entity','')) not between 1 and 500
   or not exists(select 1 from mip_private.reviewed_public_article_evidence where public_version_id=p_public_version_id and article_claim_id=(x->>'article_claim_id')::uuid and strpos(excerpt,x->>'cited_entity')>0) then raise exception 'invalid reviewed citation'; end if;
 end loop;
 select * into prior from mip_private.legacy_reviewed_completions where public_version_id=p_public_version_id and review_ref=p_plan->>'review_ref';
 if found then
  if prior.completion_id<>p_completion_id or prior.reviewed_plan is distinct from p_plan then raise exception 'reviewed completion idempotency conflict'; end if;
  return prior.review_completion_id;
 end if;
 delete from public.article_entities where article_id=article;
 delete from public.citations where article_id=article;
 for x in select value from jsonb_array_elements(p_plan->'entities') loop
  insert into public.article_entities(article_id,entity_id,confidence,extraction_method,role)
   values(article,(x->>'entity_id')::uuid,(x->>'confidence')::numeric,'explicit_reviewed_legacy_v1',x->>'role');
 end loop;
 for x in select value from jsonb_array_elements(p_plan->'citations') loop
  insert into public.citations(article_id,cited_entity,cited_type,documentation_strength)
   values(article,x->>'cited_entity',x->>'cited_type',(x->>'documentation_strength')::numeric);
 end loop;
 insert into mip_private.legacy_reviewed_completions(completion_id,public_version_id,capture_id,capture_hash,review_ref,reviewed_plan,reviewed_by)
 values(p_completion_id,p_public_version_id,p_capture_id,p_capture_hash,p_plan->>'review_ref',p_plan,current_user) returning review_completion_id into result;
 return result;
end $$;

-- Exact signatures only: overload owners and ACLs are not swept or replaced.
revoke all on function mip_private.legacy_source_snapshot_v1(public.articles),mip_private.legacy_extraction_apply_v1(text,jsonb),public.mip_legacy_extraction_v1(text,jsonb),public.mip_legacy_reviewed_completion_v1(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function mip_private.legacy_source_snapshot_v1(public.articles) to mip_legacy_completion_owner;
grant execute on function mip_private.legacy_extraction_apply_v1(text,jsonb),public.mip_legacy_extraction_v1(text,jsonb) to service_role;
-- Separate D: bounded schema CREATE and creator-grantor SET windows for the
-- exact owner transfer. The bootstrap/provider ADMIN-only creator grant is
-- preserved byte-for-byte; it is neither edited nor revoked by the installer.
-- PostgreSQL17 pg_authid.dat defines OID10 as BOOTSTRAP_SUPERUSERID;
-- user.c uses this identity for the automatic creator grant. Its name varies.
do $owner_transfer$
declare installer oid:=(select oid from pg_roles where rolname=current_user);
 target oid:='mip_legacy_completion_owner'::regrole; super boolean;
 memberships_before jsonb; memberships_after jsonb; schema_acl_before text;
begin
 select rolsuper into strict super from pg_roles where oid=installer;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]') into memberships_before
   from pg_auth_members m where m.roleid=target;
 select nspacl::text into strict schema_acl_before from pg_namespace where nspname='mip_private';
 if has_schema_privilege(target,'mip_private','CREATE') then raise exception 'unexpected narrow-owner schema CREATE before transfer'; end if;
 if not super then
   if not exists(select 1 from pg_auth_members m where m.roleid=target and m.member=installer and m.grantor=10
     and m.grantor<>installer and m.admin_option and not m.inherit_option and not m.set_option)
     or exists(select 1 from pg_auth_members m where m.roleid=target and m.member=installer and m.grantor=installer)
     or pg_has_role(installer,target,'SET') then
     raise exception 'unexpected bootstrap/provider creator grant before legacy owner transfer';
   end if;
   execute format('grant mip_legacy_completion_owner to %I with admin false,inherit false,set true granted by %I',current_user,current_user);
   if not exists(select 1 from pg_auth_members m where m.roleid=target and m.member=installer and m.grantor=installer
     and not m.admin_option and not m.inherit_option and m.set_option) then raise exception 'bounded installer SET grant missing'; end if;
 end if;
 grant create on schema mip_private to mip_legacy_completion_owner;
 if not pg_has_role(installer,target,'SET') or not has_schema_privilege(target,'mip_private','CREATE') then
   raise exception 'exact legacy ownership transfer authority unavailable'; end if;
 alter function mip_private.legacy_extraction_apply_v1(text,jsonb) owner to mip_legacy_completion_owner;
 revoke create on schema mip_private from mip_legacy_completion_owner;
 if not super then
   execute format('revoke mip_legacy_completion_owner from %I granted by %I restrict',current_user,current_user);
 end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]') into memberships_after
   from pg_auth_members m where m.roleid=target;
 if memberships_after is distinct from memberships_before
   or (select nspacl::text from pg_namespace where nspname='mip_private') is distinct from schema_acl_before
   or has_schema_privilege(target,'mip_private','CREATE')
   or (not super and pg_has_role(installer,target,'SET')) then
   raise exception 'legacy temporary ownership authority restoration failed';
 end if;
end $owner_transfer$;
comment on table mip_private.legacy_extraction_completions is 'Private candidate gather and exact raw native capture in one transaction. Withheld; not article/claim publication, canonical entity resolution or legacy graph reactivation.';
comment on function public.mip_legacy_reviewed_completion_v1(uuid,uuid,text,uuid,jsonb) is 'Only actual existing article owner with newest visible reviewed proposition capture may apply explicit literal-evidence linked derived rows atomically.';
commit;
