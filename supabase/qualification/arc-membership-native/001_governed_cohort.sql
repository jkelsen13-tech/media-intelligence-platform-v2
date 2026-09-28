-- Native-only C9 private chosen. Explicit successor, never automatic deployment.
begin;
set local lock_timeout='5s';
create role mip_arc_native_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role mip_arc_native_worker nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant mip_arc_native_owner to current_user with set true;
create schema mip_arc_native authorization mip_arc_native_owner;
revoke all on schema mip_arc_native from public;
grant usage on schema mip_mentions,mip_arc_qik_source,mip_identity,mip_cutover_authority,evidence_pipeline,public to mip_arc_native_owner;
grant select(id,article_id,arc_id,state,updated_at) on public.arc_membership_candidates to mip_arc_native_owner;
grant select(id,title,summary,started_at,last_update_at) on public.story_arcs to mip_arc_native_owner;
grant select(id,arc_id) on public.articles to mip_arc_native_owner;
grant select(id,job_id,article_id,content_hash,payload,captured_at) on evidence_pipeline.article_captures to mip_arc_native_owner;
grant select(id,article_id,input_hash,state) on evidence_pipeline.import_jobs to mip_arc_native_owner;
grant select(id,relation_name,native_retention_version,operation,before_identity,after_identity,before_hash,after_hash)
 on mip_identity.source_changes to mip_arc_native_owner;
create policy arc_native_source_changes on mip_identity.source_changes for select to mip_arc_native_owner using(true);
grant select(id),update(id) on mip_identity.collector_fence,mip_cutover_authority.publication_fence to mip_arc_native_owner;
create policy arc_native_candidates on public.arc_membership_candidates for select to mip_arc_native_owner using(true);
create policy arc_native_arcs on public.story_arcs for select to mip_arc_native_owner using(true);
create policy arc_native_articles on public.articles for select to mip_arc_native_owner using(true);
create policy arc_native_captures on evidence_pipeline.article_captures for select to mip_arc_native_owner using(true);
create policy arc_native_jobs on evidence_pipeline.import_jobs for select to mip_arc_native_owner using(true);
create policy arc_native_collector on mip_identity.collector_fence to mip_arc_native_owner using(true);
create policy arc_native_publication on mip_cutover_authority.publication_fence to mip_arc_native_owner using(true);
grant execute on function mip_arc_qik_source.prepare_governed_article(uuid,uuid,uuid),
 mip_arc_qik_source.read_governed_relation(uuid,uuid,uuid,uuid) to mip_arc_native_owner;
-- The existing mention owner alone can enter its private policy/member/scope
-- boundary. No raw mention/source privilege is granted to callers or C9 owner.
grant usage,create on schema mip_arc_native to mip_mentions_owner;
create function mip_arc_native.context(s uuid,review boolean default false,exclusive_policy boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $context$
declare p mip_mentions.policy;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'arc_native_isolation';end if;
 perform mip_mentions.canonical_begin(s,review,exclusive_policy);
 p:=mip_mentions.lock_policy();
 return jsonb_build_object('version',p.version,'max_fields',p.max_fields,'max_context',p.max_context,'max_total_bytes',p.max_total_bytes);
end $context$;
alter function mip_arc_native.context(uuid,boolean,boolean) owner to mip_mentions_owner;
revoke create on schema mip_arc_native from mip_mentions_owner;
revoke all on function mip_arc_native.context(uuid,boolean,boolean) from public;
grant execute on function mip_arc_native.context(uuid,boolean,boolean) to mip_arc_native_owner;
grant execute on function mip_mentions.canonical_prelock_articles(uuid,uuid[],uuid[]) to mip_arc_native_owner;
set role mip_arc_native_owner;
create table mip_arc_native.scalar_bindings(
 scope uuid not null,id uuid not null,article uuid not null,capture uuid not null,job uuid not null,
 content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),
 field text not null check(field in('title','summary','outlet','published_at')),
 value_kind text not null check(value_kind in('string','null','missing')),
 field_hash text not null check(field_hash~'^[0-9a-f]{64}$'),
 principal name not null default session_user,primary key(scope,id),unique(scope,capture,field));
create table mip_arc_native.scalar_access(
 scope uuid not null,binding uuid not null,allowed boolean not null,
 primary key(scope,binding),foreign key(scope,binding) references mip_arc_native.scalar_bindings(scope,id));
create table mip_arc_native.extraction_reviews(
 scope uuid not null,id uuid not null,article uuid not null,capture uuid not null,content_hash text not null,
 version integer not null check(version>0),predecessor uuid,
 state text not null check(state in('completed','unavailable','revoked')),
 reason text not null check(reason in('reviewed_complete','not_performed','method_does_not_provide_entities','revocation')),
 article_set_digest text not null check(article_set_digest~'^[0-9a-f]{64}$'),
 principal name not null default session_user,primary key(scope,id),unique(scope,article,version),
 foreign key(scope,predecessor) references mip_arc_native.extraction_reviews(scope,id),
 check((state='completed' and reason='reviewed_complete') or(state='unavailable' and reason in('not_performed','method_does_not_provide_entities')) or(state='revoked' and reason='revocation')));
create table mip_arc_native.selection_policies(
 scope uuid not null,id uuid not null,version integer not null check(version>0),predecessor uuid,
 cutoff numeric not null check(cutoff between 0 and 1),active boolean not null,
 max_members integer not null check(max_members between 0 and 31),max_fields integer not null check(max_fields between 4 and 128),
 max_total_bytes integer not null check(max_total_bytes between 1 and 8388608),
 max_hash_work_bytes bigint not null check(max_hash_work_bytes between 1 and 134217728),
 principal name not null default session_user,primary key(scope,id),unique(scope,version),
 foreign key(scope,predecessor) references mip_arc_native.selection_policies(scope,id));
create table mip_arc_native.cohorts(
 scope uuid not null,id uuid not null,candidate uuid not null,candidate_revision text not null,
 article uuid not null,arc uuid not null,members uuid[] not null,
 -- Exact scalar IDs in article UUID then title/summary/outlet/publication order
 bindings uuid[] not null,extraction_reviews uuid[] not null,policy uuid not null,
 native_revision_digest text not null check(length(native_revision_digest)=64),
 membership_binding jsonb not null check(octet_length(membership_binding::text)<=8192),
 principal name not null default session_user,primary key(scope,id),
 foreign key(scope,policy) references mip_arc_native.selection_policies(scope,id),
 check(cardinality(members)<=31 and cardinality(bindings)<=128 and cardinality(extraction_reviews)<=32));
create table mip_arc_native.generations(
 scope uuid not null,id uuid not null,cohort uuid not null,manifest jsonb not null,
 manifest_hash text not null,expanded_hash text not null,
 primary key(scope,id),foreign key(scope,cohort) references mip_arc_native.cohorts(scope,id),
 check(octet_length(manifest::text)<=1048576),
 check(manifest_hash=encode(sha256(convert_to(manifest::text,'UTF8')),'hex')));
create function mip_arc_native.immutable() returns trigger language plpgsql set search_path='' as $immutable$
begin raise exception 'arc_native_immutable';end $immutable$;
do $tables$
declare n text;
begin
 foreach n in array array['scalar_bindings','scalar_access','extraction_reviews','selection_policies','cohorts','generations'] loop
  execute format('alter table mip_arc_native.%I enable row level security',n);
  execute format('alter table mip_arc_native.%I force row level security',n);
  execute format('create policy owner_only on mip_arc_native.%I to mip_arc_native_owner using(true) with check(true)',n);
  if n<>'scalar_access' then
   execute format('create trigger immutable_rows before update or delete on mip_arc_native.%I for each row execute function mip_arc_native.immutable()',n);
   execute format('create trigger immutable_table before truncate on mip_arc_native.%I for each statement execute function mip_arc_native.immutable()',n);
  end if;
 end loop;
end $tables$;
create function mip_arc_native.fences() returns void language plpgsql set search_path='' as $fence$
begin
 perform 1 from mip_identity.collector_fence where id for share;
 if not found then raise exception 'arc_native_fence_missing';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception 'arc_native_fence_missing';end if;
end $fence$;
create function mip_arc_native.require_current_capture(a uuid,c uuid) returns void language plpgsql set search_path='' as $current$
declare selected uuid;
begin
 select id into selected from evidence_pipeline.article_captures where article_id=a order by captured_at desc,id desc limit 1;
 if selected is distinct from c then raise exception 'arc_native_capture_not_current';end if;
end $current$;
-- A scalar is resolved exclusively from its original immutable capture. Its
-- digest encodes JSON null separately from missing; no title/latest fallback.
create function mip_arc_native.scalar_value(b mip_arc_native.scalar_bindings,check_access boolean default true)
returns jsonb language plpgsql set search_path='' as $scalar$
declare c record;value jsonb;kind text;allow_read boolean;
begin
 perform mip_arc_native.require_current_capture(b.article,b.capture);
 if check_access then
  select allowed into allow_read from mip_arc_native.scalar_access where scope=b.scope and binding=b.id for share;
  if allow_read is distinct from true then raise exception 'arc_native_source_access';end if;
 end if;
 select x.payload,x.content_hash,x.article_id,x.job_id,j.state,j.input_hash,j.article_id job_article
 into c from evidence_pipeline.article_captures x join evidence_pipeline.import_jobs j on j.id=x.job_id
 where x.id=b.capture and x.article_id=b.article and x.job_id=b.job;
 if not found or c.state is distinct from 'completed' or c.job_article is distinct from b.article
  or c.input_hash is distinct from b.content_hash or c.content_hash is distinct from b.content_hash
  or octet_length(c.payload::text)>262144
  or encode(sha256(convert_to(c.payload::text,'UTF8')),'hex')<>b.content_hash
 then raise exception 'arc_native_capture_binding';end if;
 kind:=case when not(c.payload?b.field) then 'missing' when c.payload->b.field='null'::jsonb then 'null' else jsonb_typeof(c.payload->b.field) end;
 value:=jsonb_build_object('present',c.payload?b.field,'value',c.payload->b.field);
 if kind not in('string','null','missing') or kind<>b.value_kind
  or octet_length(value::text)>65536
  or encode(sha256(convert_to(value::text,'UTF8')),'hex')<>b.field_hash
 then raise exception 'arc_native_field_binding';end if;
 return value;
end $scalar$;
create function mip_arc_native.review_scalar(s uuid,i uuid,a uuid,c uuid,j uuid,ch text,f text,k text,fh text)
returns uuid language plpgsql security definer set search_path='' as $review$
declare proposed mip_arc_native.scalar_bindings;old mip_arc_native.scalar_bindings;
begin
 perform mip_arc_native.context(s,true);perform mip_arc_native.fences();
 perform mip_arc_native.assert_source_authority();
 proposed:=row(s,i,a,c,j,ch,f,k,fh,session_user)::mip_arc_native.scalar_bindings;
 if i is null or a is null or c is null or j is null or f is null or k is null or ch is null or fh is null or f not in('title','summary','outlet','published_at')
  or k not in('string','null','missing') or ch!~'^[0-9a-f]{64}$' or fh!~'^[0-9a-f]{64}$'
 then raise exception 'arc_native_scalar_shape';end if;
 perform mip_arc_native.scalar_value(proposed,false);
 select * into old from mip_arc_native.scalar_bindings where scope=s and id=i;
 if found then if old is distinct from proposed then raise exception 'arc_native_retry_conflict';end if;return i;end if;
 insert into mip_arc_native.scalar_bindings values(proposed.*);return i;
end $review$;
create function mip_arc_native.set_scalar_access(s uuid,i uuid,allowed_value boolean)
returns void language plpgsql security definer set search_path='' as $access$
begin
 if not pg_has_role(session_user,'mip_mentions_admin','MEMBER') then raise exception 'arc_native_admin_required';end if;
 perform mip_arc_native.context(s,false,true);
 if allowed_value is null then delete from mip_arc_native.scalar_access where scope=s and binding=i;
 else insert into mip_arc_native.scalar_access values(s,i,allowed_value)
 on conflict(scope,binding) do update set allowed=excluded.allowed;end if;
end $access$;
create function mip_arc_native.review_selection_policy(s uuid,i uuid,v integer,prev uuid,cut numeric,enabled boolean,member_limit integer,field_limit integer,byte_limit integer,hash_limit bigint)
returns uuid language plpgsql security definer set search_path='' as $policy$
declare h mip_arc_native.selection_policies;o mip_arc_native.selection_policies;
begin
 perform mip_arc_native.context(s,true);
 if i is null or v is null or cut is null or cut not between 0 and 1 or enabled is null or member_limit is null or member_limit not between 0 and 31
 or field_limit is null or field_limit not between 4 and 128 or byte_limit is null or byte_limit not between 1 and 8388608 or hash_limit is null or hash_limit not between 1 and 134217728 then raise exception 'arc_native_policy_shape';end if;
 select * into o from mip_arc_native.selection_policies where scope=s and id=i;
 if found then
  if(o.version,o.predecessor,o.cutoff,o.active,o.max_members,o.max_fields,o.max_total_bytes,o.max_hash_work_bytes,o.principal) is distinct from(v,prev,cut,enabled,member_limit,field_limit,byte_limit,hash_limit,session_user)
   then raise exception 'arc_native_retry_conflict';end if;return i;
 end if;
 select * into h from mip_arc_native.selection_policies where scope=s order by version desc limit 1;
 if v<>coalesce(h.version,0)+1 or prev is distinct from h.id then raise exception 'arc_native_predecessor';end if;
 insert into mip_arc_native.selection_policies values(s,i,v,prev,cut,enabled,member_limit,field_limit,byte_limit,hash_limit,session_user);return i;
end $policy$;
create function mip_arc_native.review_extraction(s uuid,i uuid,a uuid,c uuid,ch text,v integer,prev uuid,st text,why text,expected_set text)
returns uuid language plpgsql security definer set search_path='' as $extract$
declare receipt jsonb;h mip_arc_native.extraction_reviews;o mip_arc_native.extraction_reviews;
begin
 perform mip_arc_native.context(s,true);perform mip_arc_native.fences();
 perform mip_arc_native.assert_source_authority();
 perform mip_arc_native.require_current_capture(a,c);
 receipt:=mip_arc_qik_source.prepare_governed_article(s,a,c);
 if i is null or a is null or c is null or ch is null or v is null or st is null or why is null or expected_set is null
  or receipt->>'article_set_digest' is distinct from expected_set
  or st not in('completed','unavailable','revoked')
  or(st='unavailable' and jsonb_array_length(receipt->'groups')<>0)
  or not exists(select 1 from evidence_pipeline.article_captures where id=c and article_id=a and content_hash=ch)
 then raise exception 'arc_native_extraction_binding';end if;
 select * into o from mip_arc_native.extraction_reviews where scope=s and id=i;
 if found then
  if(o.article,o.capture,o.content_hash,o.version,o.predecessor,o.state,o.reason,o.article_set_digest,o.principal)
   is distinct from(a,c,ch,v,prev,st,why,expected_set,session_user) then raise exception 'arc_native_retry_conflict';end if;return i;
 end if;
 select * into h from mip_arc_native.extraction_reviews where scope=s and article=a order by version desc limit 1;
 if v<>coalesce(h.version,0)+1 or prev is distinct from h.id then raise exception 'arc_native_predecessor';end if;
 insert into mip_arc_native.extraction_reviews values(s,i,a,c,ch,v,prev,st,why,expected_set,session_user);return i;
end $extract$;

create table mip_arc_native.cohort_revocations(
 scope uuid not null,cohort uuid not null,id uuid not null,principal name not null default session_user,
 primary key(scope,cohort),unique(scope,id),foreign key(scope,cohort) references mip_arc_native.cohorts(scope,id));
alter table mip_arc_native.cohort_revocations enable row level security;
alter table mip_arc_native.cohort_revocations force row level security;
create policy owner_only on mip_arc_native.cohort_revocations to mip_arc_native_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_arc_native.cohort_revocations for each row execute function mip_arc_native.immutable();
create trigger immutable_table before truncate on mip_arc_native.cohort_revocations for each statement execute function mip_arc_native.immutable();

-- Complete source read and exact current revalidation. One generation contains
-- one candidate and its entire bounded arc cohort; audit population is exactly 1.
create function mip_arc_native.membership_now(s uuid,arc_key uuid,candidate_article uuid)
returns jsonb language plpgsql set search_path='' as $membership$
declare public_ids uuid[];private_set jsonb;union_ids uuid[];payload jsonb;
begin
 select coalesce(array_agg(q.id order by q.id),'{}'::uuid[]) into public_ids from
 (select x.id from public.articles x where x.arc_id=arc_key and x.id is distinct from candidate_article order by x.id limit 33)q;
 if to_regprocedure('mip_arc_native.attachment_members(uuid,uuid,uuid)') is null then
  payload:=jsonb_build_object('contract','private_arc_members_v1','scope',s,'arc_id',arc_key,
   'arc_revision',0,'head_ids','[]'::jsonb,'article_ids','[]'::jsonb);
  private_set:=jsonb_build_object('arc_revision',0,'head_ids','[]'::jsonb,'article_ids','[]'::jsonb,
   'set_digest',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
 else
  execute 'select mip_arc_native.attachment_members($1,$2,$3)' into private_set using s,arc_key,candidate_article;
 end if;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into union_ids from
 (select unnest(public_ids) x union all select value::uuid from jsonb_array_elements_text(private_set->'article_ids'))q;
 if cardinality(union_ids)>32 or jsonb_array_length(private_set->'head_ids')>32 then raise exception 'arc_native_union_budget';end if;
 return jsonb_build_object('public_member_ids',public_ids,'private_head_ids',private_set->'head_ids',
 'private_arc_revision',private_set->'arc_revision','private_set_digest',private_set->'set_digest',
 'private_article_ids',private_set->'article_ids','member_ids',union_ids);
end $membership$;
-- One transient source cache for the complete current dependency union. Private:
-- callers cannot inject this cache or use it to bypass current source checks.
create function mip_arc_native.resolve_union(s uuid,requested_bindings uuid[],requested_reviews uuid[],selection mip_arc_native.selection_policies)
returns jsonb language plpgsql set search_path='' set timezone='UTC' set datestyle='ISO,YMD' as $union$
declare articles uuid[];captures uuid[];a uuid;budget jsonb;
 binding mip_arc_native.scalar_bindings;extraction mip_arc_native.extraction_reviews;
 values_by_article jsonb:='{}';bound_fields jsonb;article_record jsonb;entity_states jsonb:='[]';
 capture_bytes bigint:=0;hash_work_bytes bigint:=0;total_bytes bigint:=0;field_count integer:=0;
 grp jsonb;projected jsonb;entity_list jsonb;field_value jsonb;receipt jsonb;result jsonb;
 all_bindings uuid[]:='{}';all_reviews uuid[]:='{}';group_refs jsonb:='[]';
begin
 if cardinality(requested_reviews)>32 or cardinality(requested_bindings)>128 then raise exception 'arc_native_union_budget';end if;
 select array_agg(x.article order by x.article) into articles from mip_arc_native.extraction_reviews x
 where x.scope=s and x.id=any(requested_reviews);
 if cardinality(articles) is distinct from cardinality(requested_reviews)
 or cardinality(articles)<>(select count(distinct x) from unnest(articles)x)
 or cardinality(requested_bindings)<>4*cardinality(articles)
 then raise exception 'arc_native_union_binding';end if;
 -- Determine only immutable metadata before prelocking the complete mention
 -- union. No scalar access rows or bytes are touched before that union lock.
 captures:='{}';
 foreach a in array articles loop
  select * into extraction from mip_arc_native.extraction_reviews where scope=s and article=a and id=any(requested_reviews);
  if not found or extraction.state='revoked'
   or exists(select 1 from mip_arc_native.extraction_reviews x where x.scope=s and x.article=a and x.version>extraction.version)
   then raise exception 'arc_native_extraction_stale';end if;
  perform mip_arc_native.require_current_capture(a,extraction.capture);
  captures:=array_append(captures,extraction.capture);
 end loop;
 budget:=mip_mentions.canonical_prelock_articles(s,articles,captures);
 field_count:=(budget->>'field_count')::integer;
 total_bytes:=(budget->>'source_and_span_bytes')::bigint;
 -- Memory/input charge counts each original capture once. Cumulative hash
 -- work is a separate reviewed ceiling; scalar hashing visits each four times.
 select coalesce(sum(octet_length(payload::text)),0) into capture_bytes
 from evidence_pipeline.article_captures where id=any(captures);
 -- Duplicate captures across mention/scalar paths are conservatively charged
 -- twice; this is an upper bound, never an undercount.
 total_bytes:=total_bytes+capture_bytes+coalesce((budget->>'native_capture_bytes_unique')::bigint,8388609);
 -- A<=64 active admissions is enforced by the shared C6 prelock. Each
 -- later field validation is a subset of that locked union. This deliberately
 -- charges the upper bound even when the actual number is smaller.
 hash_work_bytes:=4*capture_bytes
  +coalesce((budget->>'native_capture_hash_bytes')::bigint,134217729)*(1+cardinality(articles)+4*64)
  +coalesce((budget->>'selected_field_bytes')::bigint,134217729)*(1+cardinality(articles)+4*64)
  +coalesce((budget->>'span_bytes')::bigint,134217729)*(1+cardinality(articles)+4*64)
  +16384::bigint*2*64
  +131072::bigint*(1+cardinality(articles)+4*64)+8388608;
 -- The selected Node operation expands once to read and once again on private
 -- completion. Reserve BOTH expansions before either can finish successfully.
 -- Caller reserves two complete union passes and exact reconstruction work.
 if hash_work_bytes>selection.max_hash_work_bytes then raise exception 'arc_native_hash_work_budget';end if;
 if total_bytes>selection.max_total_bytes then raise exception 'arc_native_byte_budget';end if;
 foreach a in array articles loop
  select * into extraction from mip_arc_native.extraction_reviews where scope=s and article=a and id=any(requested_reviews);
  all_reviews:=array_append(all_reviews,extraction.id);
  receipt:=mip_arc_qik_source.prepare_governed_article(s,a,extraction.capture);
  if receipt->>'article_set_digest' is distinct from extraction.article_set_digest
   or(extraction.state='unavailable' and jsonb_array_length(receipt->'groups')<>0)
   then raise exception 'arc_native_extraction_stale';end if;
  entity_list:='[]';
  for grp in select value from jsonb_array_elements(receipt->'groups') order by value->>'entity_id' loop
   if grp->>'projection_status' is distinct from 'projected_current' then raise exception 'arc_native_relation_unprojected';end if;
   projected:=mip_arc_qik_source.read_governed_relation(s,a,(grp->>'entity_id')::uuid,(grp->>'current_projection_id')::uuid);
   if projected->>'set_digest' is distinct from grp->>'set_digest' or projected->>'semantic_kind' is distinct from 'reviewed_evidence_weight_v1'
    then raise exception 'arc_native_relation_stale';end if;
   entity_list:=entity_list||jsonb_build_array(jsonb_build_object('entity_id',projected->'entity_id',
    'evidence_weight',projected->'evidence_weight','projection_id',projected->'projection_id'));
   group_refs:=group_refs||jsonb_build_array(jsonb_build_object('article_id',a,'entity_id',projected->'entity_id',
    'projection_id',projected->'projection_id','set_digest',projected->'set_digest'));
  end loop;
  entity_states:=entity_states||jsonb_build_array(jsonb_build_object('article_id',a,'state',extraction.state,'reason',extraction.reason,
   'attestation_id',extraction.id,'article_set_digest',extraction.article_set_digest,'entities',entity_list));
  bound_fields:='{}';
  for binding in select * from mip_arc_native.scalar_bindings b where b.scope=s and b.article=a and b.id=any(requested_bindings) order by b.field loop
   if binding.capture<>extraction.capture or binding.content_hash<>extraction.content_hash or bound_fields?binding.field
    then raise exception 'arc_native_binding_set';end if;
   field_count:=field_count+1;
   if field_count>selection.max_fields then raise exception 'arc_native_field_budget';end if;
   field_value:=mip_arc_native.scalar_value(binding);
   total_bytes:=total_bytes+octet_length(coalesce(field_value->>'value',''));
   if total_bytes>selection.max_total_bytes
    or octet_length(coalesce(field_value->>'value',''))>65536
    then raise exception 'arc_native_byte_budget';end if;
   bound_fields:=bound_fields||jsonb_build_object(binding.field,field_value->'value');
   all_bindings:=array_append(all_bindings,binding.id);
  end loop;
  if not(bound_fields?&array['title','summary','outlet','published_at']) then raise exception 'arc_native_binding_set';end if;
  article_record:=jsonb_build_object('id',a)||bound_fields;
  values_by_article:=values_by_article||jsonb_build_object(a::text,article_record);
 end loop;
 if cardinality(all_bindings)<>cardinality(requested_bindings) or cardinality(all_reviews)<>cardinality(requested_reviews)
 then raise exception 'arc_native_binding_set';end if;

 result:=jsonb_build_object('values',values_by_article,'entities',entity_states,'groups',group_refs,
 'source_bytes',total_bytes,'hash_work_bytes',hash_work_bytes);
 if octet_length(result::text)>2097152 or total_bytes+octet_length(result::text)>selection.max_total_bytes
 or 2*hash_work_bytes>selection.max_hash_work_bytes then raise exception 'arc_native_union_budget';end if;
 return result;
end $union$;
create function mip_arc_native.expand_cached(s uuid,chosen mip_arc_native.cohorts,g uuid,cache jsonb,membership jsonb)
returns jsonb language plpgsql set search_path='' set timezone='UTC' set datestyle='ISO,YMD' as $expand$
declare policy_limits jsonb;budget jsonb;actual_members uuid[];articles uuid[];captures uuid[];
 selection mip_arc_native.selection_policies;candidate record;arc record;
 binding mip_arc_native.scalar_bindings;extraction mip_arc_native.extraction_reviews;
 values_by_article jsonb:='{}';bound_fields jsonb;article_record jsonb;entity_states jsonb:='[]';
 capture_bytes bigint:=0;hash_work_bytes bigint:=0;
 groups jsonb;grp jsonb;projected jsonb;entity_list jsonb;field_value jsonb;receipt jsonb;
 a uuid;c uuid;total_bytes bigint:=0;field_count integer:=0;heads integer:=0;
 all_bindings uuid[]:='{}';all_reviews uuid[]:='{}';group_refs jsonb:='[]';
 native_changes jsonb;native_digest text;native_change_ids uuid[];
 candidate_json jsonb;members_json jsonb:='[]';manifest jsonb;expanded jsonb;observed_arc jsonb;
begin
 policy_limits:=mip_arc_native.context(s,false);perform mip_arc_native.fences();
 perform mip_arc_native.assert_source_authority();
 select * into selection from mip_arc_native.selection_policies where scope=s order by version desc limit 1;
 if not found or selection.id<>chosen.policy or not selection.active then raise exception 'arc_native_selection_stale';end if;
 if chosen.scope is distinct from s or exists(select 1 from mip_arc_native.cohort_revocations where scope=s and cohort=chosen.id)
 then raise exception 'arc_native_cohort_revoked';end if;
 select x.id,x.article_id,x.arc_id,x.state,x.updated_at::text revision into candidate
 from public.arc_membership_candidates x where x.id=chosen.candidate;
 if not found or (candidate.article_id,candidate.arc_id,candidate.revision) is distinct from(chosen.article,chosen.arc,chosen.candidate_revision)
  or candidate.state not in('pending','rejected','invalidated') then raise exception 'arc_native_candidate_stale';end if;
 select x.id,x.title,x.summary,x.started_at::text started_at,x.last_update_at::text last_update_at
 into arc from public.story_arcs x where x.id=chosen.arc;
 if not found then raise exception 'arc_native_arc_missing';end if;
 observed_arc:=jsonb_build_object('id',arc.id,'title',arc.title,'summary',arc.summary,'started_at',arc.started_at,'last_update_at',arc.last_update_at);
 if octet_length(observed_arc::text)>131072 then raise exception 'arc_native_arc_budget';end if;
 select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[]) into actual_members
 from jsonb_array_elements_text(membership->'member_ids');
 if cardinality(actual_members)>selection.max_members or actual_members is distinct from chosen.members
 or chosen.membership_binding is distinct from (membership-array['private_article_ids','member_ids'])
 or not exists(select 1 from public.articles where id=chosen.article)
 then raise exception 'arc_native_cohort_changed';end if;
 select array_agg(x order by x) into articles from unnest(actual_members||array[chosen.article])x;
 if cardinality(chosen.bindings)<>4*cardinality(articles) or cardinality(chosen.extraction_reviews)<>cardinality(articles)
 then raise exception 'arc_native_binding_set';end if;
 -- Determine only immutable metadata before prelocking the complete mention
 -- union. No scalar access rows or bytes are touched before that union lock.
 captures:='{}';
 foreach a in array articles loop
  select * into extraction from mip_arc_native.extraction_reviews where scope=s and article=a and id=any(chosen.extraction_reviews);
  if not found or extraction.state='revoked'
   or exists(select 1 from mip_arc_native.extraction_reviews x where x.scope=s and x.article=a and x.version>extraction.version)
   then raise exception 'arc_native_extraction_stale';end if;
  perform mip_arc_native.require_current_capture(a,extraction.capture);
  captures:=array_append(captures,extraction.capture);
 end loop;
 -- The existing native metadata recorder includes complete source-image hashes.
 -- New capture/candidate deltas relevant to this original cohort invalidate its
 -- reviewed boundary. Neither row images nor unrelated historical payloads read.
 select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) into native_changes from(
  select id,relation_name,operation,before_identity,after_identity,before_hash,after_hash
  from mip_identity.source_changes
  where native_retention_version=1 and(
   (relation_name='evidence_pipeline.article_captures' and
    ((before_identity->>'article_id')::uuid=any(articles) or(after_identity->>'article_id')::uuid=any(articles)))
   or(relation_name='evidence_pipeline.evidence_candidates' and
    ((before_identity->>'capture_id')::uuid=any(captures) or(after_identity->>'capture_id')::uuid=any(captures))))
  order by id limit 257)q;
 if jsonb_array_length(native_changes)>256 or octet_length(native_changes::text)>262144
 then raise exception 'arc_native_revision_budget';end if;
 native_digest:=encode(sha256(convert_to(native_changes::text,'UTF8')),'hex');
 if chosen.native_revision_digest is not null and chosen.native_revision_digest<>native_digest
 then raise exception 'arc_native_native_revision_stale';end if;
 select coalesce(array_agg((value->>'id')::uuid order by value->>'id'),'{}'::uuid[]) into native_change_ids from jsonb_array_elements(native_changes);

 -- Each original generation must own its exact full field/review set; a
 -- different origin's cache entries cannot fill omitted or duplicated bindings.
 if (select count(*) from mip_arc_native.scalar_bindings b where b.scope=s and b.id=any(chosen.bindings)
  and b.article=any(articles))<>cardinality(chosen.bindings)
 or exists(select 1 from unnest(articles)article_key where
  (select count(distinct b.field) from mip_arc_native.scalar_bindings b
   join mip_arc_native.extraction_reviews e on e.scope=b.scope and e.article=b.article
    and e.capture=b.capture and e.content_hash=b.content_hash and e.id=any(chosen.extraction_reviews)
   where b.scope=s and b.article=article_key and b.id=any(chosen.bindings))<>4)
 then raise exception 'arc_native_binding_set';end if;
 -- Reconstruct only from the protected once-validated transient union cache.
 foreach a in array articles loop
  article_record:=cache->'values'->a::text;
  if article_record is null then raise exception 'arc_native_union_binding';end if;
  if a=chosen.article then candidate_json:=article_record;else members_json:=members_json||jsonb_build_array(article_record);end if;
 end loop;
 select coalesce(jsonb_agg(value order by value->>'article_id'),'[]'::jsonb) into entity_states
 from jsonb_array_elements(cache->'entities') where(value->>'article_id')::uuid=any(articles);
 select coalesce(jsonb_agg(value order by value->>'article_id',value->>'entity_id'),'[]'::jsonb) into group_refs
 from jsonb_array_elements(cache->'groups') where(value->>'article_id')::uuid=any(articles);
 total_bytes:=(cache->>'source_bytes')::bigint+octet_length(cache::text);
 hash_work_bytes:=(cache->>'hash_work_bytes')::bigint;

 manifest:=jsonb_build_object('version','arc-native-manifest-v2','cohort',chosen.id,'candidate',chosen.candidate,
  'candidate_revision',candidate.revision,'candidate_state',candidate.state,
  'arc_source_revision',(select coalesce(max(sequence),0) from mip_arc_native.source_revisions where relation_name='public.story_arcs' and (before_id=chosen.arc or after_id=chosen.arc)),
  'candidate_source_revision',(select coalesce(max(sequence),0) from mip_arc_native.source_revisions where relation_name='public.arc_membership_candidates' and (before_id=chosen.candidate or after_id=chosen.candidate)),'article',chosen.article,'arc',observed_arc,
  'native_revision_digest',native_digest,'native_change_ids',native_change_ids,
  'members',chosen.members,'membership_binding',chosen.membership_binding,'scalar_binding_ids',chosen.bindings,'extraction_review_ids',chosen.extraction_reviews,
  'group_refs',group_refs,'selection_policy',selection.id,'cutoff',selection.cutoff,'max_members',selection.max_members,
  'max_fields',selection.max_fields,'max_total_bytes',selection.max_total_bytes,
  'max_hash_work_bytes',selection.max_hash_work_bytes,
  'runtime','22.14.0','scorer_blob','08ce23092cfbbe8dcb7eb7c26cf6e3943e177531',
  'audit_low_confidence',0.70,'audit_high_sample_size',1);
 expanded:=jsonb_build_object('version','arc-native-expanded-v1','codec','postgres17-jsonb-text-utf8-v1',
  'runtime','22.14.0','scorer_blob','08ce23092cfbbe8dcb7eb7c26cf6e3943e177531','scorer_version','arc-v1-membership-2026-08-23.2',
  'generation_id',g,'candidate_id',chosen.candidate,'candidate_revision',candidate.revision,'candidate',candidate_json,
  'arc',observed_arc,'members',members_json,'entity_states',entity_states,
  'selection',jsonb_build_object('policy_id',selection.id,'domain','reviewed_evidence_weight_v1','cutoff',selection.cutoff),
  'audit',jsonb_build_object('low_confidence',0.70,'high_sample_size',1,
    'seed','arc-native:'||g::text||':arc-v1-membership-2026-08-23.2:'||selection.id::text));
 if total_bytes+octet_length(expanded::text)+octet_length(manifest::text)>selection.max_total_bytes
  or hash_work_bytes>selection.max_hash_work_bytes then raise exception 'arc_native_operation_budget';end if;
 if octet_length(expanded::text)>2097152 or octet_length(manifest::text)>1048576 then raise exception 'arc_native_generation_budget';end if;
 return jsonb_build_object('manifest',manifest,'expanded',expanded,'reconstruction_hash_bytes',octet_length(native_changes::text)+2*octet_length(manifest::text)+octet_length(expanded::text));
end $expand$;
-- Current set and every stored origin are validated as a bounded DAG without
-- recursive calls. All dependencies must already be current heads in this set.
create function mip_arc_native.expand_batch(s uuid,arc_key uuid,chosen mip_arc_native.cohorts,g uuid)
returns jsonb language plpgsql set search_path='' set timezone='UTC' set datestyle='ISO,YMD' as $batch$
declare full_membership jsonb;current_membership jsonb;origin_membership jsonb;origin_record jsonb;
 ids uuid[];h uuid;origins jsonb:='[]';entry jsonb;cache jsonb;data jsonb;current_data jsonb;
 original mip_arc_native.cohorts;saved mip_arc_native.generations;selection mip_arc_native.selection_policies;
 bindings uuid[]:='{}';reviews uuid[]:='{}';hash_bytes bigint:=0;union_members uuid[];
begin
 perform mip_arc_native.context(s,false);perform mip_arc_native.fences();perform mip_arc_native.assert_source_authority();
 select * into selection from mip_arc_native.selection_policies where scope=s order by version desc limit 1;
 if not found or not selection.active then raise exception 'arc_native_selection_stale';end if;
 full_membership:=mip_arc_native.membership_now(s,arc_key,null);
 select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[]) into ids
 from jsonb_array_elements_text(full_membership->'private_head_ids');
 if chosen.id is not null then
  current_membership:=mip_arc_native.membership_now(s,arc_key,chosen.article);
  if chosen.scope is distinct from s or chosen.arc is distinct from arc_key or chosen.policy is distinct from selection.id
  or chosen.membership_binding is distinct from(current_membership-array['private_article_ids','member_ids'])
  then raise exception 'arc_native_cohort_changed';end if;
  bindings:=chosen.bindings;reviews:=chosen.extraction_reviews;
 end if;
 foreach h in array ids loop
  execute 'select mip_arc_native.attachment_origin_record($1,$2)' into origin_record using s,h;
  if(origin_record->>'scope')::uuid is distinct from s or(origin_record->>'attachment_id')::uuid is distinct from h
  or(origin_record->>'arc_id')::uuid is distinct from arc_key or origin_record->>'state' is distinct from 'attached_private'
  or not exists(select 1 from public.articles x where x.id=(origin_record->>'article_id')::uuid and x.arc_id is null)
  then raise exception 'arc_native_attachment_origin';end if;
  select * into saved from mip_arc_native.generations where scope=s and id=(origin_record->>'generation_id')::uuid;
  if not found or(saved.expanded_hash,saved.manifest_hash) is distinct from(origin_record->>'input_hash',origin_record->>'manifest_hash')
  then raise exception 'arc_native_attachment_origin';end if;
  select * into original from mip_arc_native.cohorts where scope=s and id=saved.cohort;
  if not found or original.article is distinct from(origin_record->>'article_id')::uuid or original.arc is distinct from arc_key
  or original.policy is distinct from selection.id
  or original.membership_binding->'public_member_ids' is distinct from full_membership->'public_member_ids'
  or original.membership_binding->'private_head_ids' is distinct from origin_record->'dependency_head_ids'
  or exists(select 1 from jsonb_array_elements_text(origin_record->'dependency_head_ids')x where not(x.value::uuid=any(ids)))
  then raise exception 'arc_native_attachment_dependency';end if;
  execute 'select mip_arc_native.assert_attachment_score($1,$2)' using s,origin_record;
  bindings:=bindings||original.bindings;reviews:=reviews||original.extraction_reviews;
  origins:=origins||jsonb_build_array(origin_record);
 end loop;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into bindings from unnest(bindings)x;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into reviews from unnest(reviews)x;
 if cardinality(bindings)>128 or cardinality(reviews)>32 then raise exception 'arc_native_union_budget';end if;
 if cardinality(reviews)>0 then
  cache:=mip_arc_native.resolve_union(s,bindings,reviews,selection);
  hash_bytes:=(cache->>'hash_work_bytes')::bigint;
  for entry in select value from jsonb_array_elements(origins) loop
   select * into strict saved from mip_arc_native.generations where scope=s and id=(entry->>'generation_id')::uuid;
   select * into strict original from mip_arc_native.cohorts where scope=s and id=saved.cohort;
   origin_membership:=original.membership_binding||jsonb_build_object('member_ids',original.members,'private_article_ids','[]'::jsonb);
   data:=mip_arc_native.expand_cached(s,original,saved.id,cache,origin_membership);
   hash_bytes:=hash_bytes+(data->>'reconstruction_hash_bytes')::bigint;
   if 2*hash_bytes>selection.max_hash_work_bytes then raise exception 'arc_native_hash_work_budget';end if;
   if data->'manifest' is distinct from saved.manifest
   or encode(sha256(convert_to((data->'expanded')::text,'UTF8')),'hex')<>saved.expanded_hash
   then raise exception 'arc_native_attachment_origin_stale';end if;
  end loop;
 end if;
 if chosen.id is not null then
  current_data:=mip_arc_native.expand_cached(s,chosen,g,cache,current_membership);
  hash_bytes:=hash_bytes+(current_data->>'reconstruction_hash_bytes')::bigint;
  if 2*hash_bytes>selection.max_hash_work_bytes then raise exception 'arc_native_hash_work_budget';end if;
 end if;
 return jsonb_build_object('current',current_data,'membership',full_membership);
end $batch$;
create function mip_arc_native.expand(s uuid,chosen mip_arc_native.cohorts,g uuid)
returns jsonb language plpgsql set search_path='' as $expand$
declare result jsonb;
begin
 result:=mip_arc_native.expand_batch(s,chosen.arc,chosen,g);
 return result->'current';
end $expand$;
create function mip_arc_native.review_cohort(s uuid,i uuid,c uuid,rev text,a uuid,arc_id uuid,m uuid[],b uuid[],e uuid[],policy_id uuid)
returns uuid language plpgsql security definer set search_path='' as $cohort$
declare proposed mip_arc_native.cohorts;old mip_arc_native.cohorts;sorted uuid[];checked jsonb;membership jsonb;
begin
 perform mip_arc_native.context(s,true);
 if i is null or c is null or a is null or arc_id is null or rev is null or octet_length(rev)>80
  or m is null or b is null or e is null or array_position(m,null) is not null
  or array_position(b,null) is not null or array_position(e,null) is not null
  or cardinality(m)>31 or cardinality(b)>128 or cardinality(e)>32 then raise exception 'arc_native_cohort_shape';end if;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into sorted from unnest(m)x;
 if sorted<>m or a=any(m) then raise exception 'arc_native_cohort_shape';end if;
 perform mip_arc_native.fences();perform mip_arc_native.assert_source_authority();
 membership:=mip_arc_native.membership_now(s,arc_id,a);
 proposed:=row(s,i,c,rev,a,arc_id,m,b,e,policy_id,null::text,
 membership-array['private_article_ids','member_ids'],session_user)::mip_arc_native.cohorts;
 checked:=mip_arc_native.expand(s,proposed,i);
 proposed.native_revision_digest:=checked->'manifest'->>'native_revision_digest';
 select * into old from mip_arc_native.cohorts where scope=s and id=i;
 if found then if old is distinct from proposed then raise exception 'arc_native_retry_conflict';end if;return i;end if;
 insert into mip_arc_native.cohorts values(proposed.*);return i;
end $cohort$;
create function mip_arc_native.revoke_cohort(s uuid,c uuid,i uuid) returns uuid language plpgsql security definer set search_path='' as $revoke$
declare old mip_arc_native.cohort_revocations;
begin
 perform mip_arc_native.context(s,true);
 select * into old from mip_arc_native.cohort_revocations where scope=s and cohort=c;
 if found then if old.id<>i or old.principal<>session_user then raise exception 'arc_native_retry_conflict';end if;return i;end if;
 insert into mip_arc_native.cohort_revocations values(s,c,i,session_user);return i;
end $revoke$;
create function mip_arc_native.snapshot(s uuid,c uuid,g uuid) returns jsonb language plpgsql security definer set search_path='' as $snapshot$
declare selected mip_arc_native.cohorts;data jsonb;m jsonb;x jsonb;mh text;xh text;old mip_arc_native.generations;
begin
 perform mip_arc_native.context(s,false);
 select * into selected from mip_arc_native.cohorts where scope=s and id=c;
 if not found or g is null then raise exception 'arc_native_cohort_missing';end if;
 data:=mip_arc_native.expand(s,selected,g);m:=data->'manifest';x:=data->'expanded';
 mh:=encode(sha256(convert_to(m::text,'UTF8')),'hex');xh:=encode(sha256(convert_to(x::text,'UTF8')),'hex');
 select * into old from mip_arc_native.generations where scope=s and id=g;
 if found then
  if (old.cohort,old.manifest_hash,old.expanded_hash) is distinct from(c,mh,xh) then raise exception 'arc_native_generation_stale';end if;
 else insert into mip_arc_native.generations values(s,g,c,m,mh,xh);end if;
 return jsonb_build_object('generation_id',g,'input_hash',xh,'manifest_hash',mh,'publication_allowed',false,'attached',false);
end $snapshot$;
create function mip_arc_native.read_scoring_input(s uuid,g uuid,expected_hash text) returns jsonb
language plpgsql security definer set search_path='' as $input$
declare saved mip_arc_native.generations;c mip_arc_native.cohorts;data jsonb;x text;
begin
 perform mip_arc_native.context(s,false);
 select * into saved from mip_arc_native.generations where scope=s and id=g;
 if not found or saved.expanded_hash is distinct from expected_hash then raise exception 'arc_native_generation_missing';end if;
 select * into strict c from mip_arc_native.cohorts where scope=s and id=saved.cohort;
 data:=mip_arc_native.expand(s,c,g);x:=(data->'expanded')::text;
 if data->'manifest' is distinct from saved.manifest or encode(sha256(convert_to(x,'UTF8')),'hex')<>expected_hash
 then raise exception 'arc_native_generation_stale';end if;
 return jsonb_build_object('input_text',x,'input_hash',expected_hash,'manifest_hash',saved.manifest_hash);
end $input$;

-- These revisions describe ONLY the named selected projection. They are not
-- historical full-row hashes and do not modify any existing change recorder.
create table mip_arc_native.source_revisions(
 sequence bigint generated always as identity primary key,
 source_contract text not null default 'native_arc_source_revision_v1'
  check(source_contract='native_arc_source_revision_v1'),
 relation_name text not null check(relation_name in('public.story_arcs','public.arc_membership_candidates')),
 operation text not null check(operation in('INSERT','UPDATE','DELETE')),
 before_id uuid,after_id uuid,before_projection_hash text,after_projection_hash text,
 transaction_id text not null,
 check((operation='INSERT' and before_id is null and before_projection_hash is null and after_id is not null and after_projection_hash is not null)
 or(operation='UPDATE' and before_id is not null and before_projection_hash is not null and after_id is not null and after_projection_hash is not null)
 or(operation='DELETE' and before_id is not null and before_projection_hash is not null and after_id is null and after_projection_hash is null)));
alter table mip_arc_native.source_revisions enable row level security;
alter table mip_arc_native.source_revisions force row level security;
create policy owner_only on mip_arc_native.source_revisions to mip_arc_native_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_arc_native.source_revisions for each statement execute function mip_arc_native.immutable();
create trigger immutable_table before truncate on mip_arc_native.source_revisions for each statement execute function mip_arc_native.immutable();
create function mip_arc_native.record_source_revision() returns trigger
language plpgsql security definer set search_path='' set timezone='UTC' set datestyle='ISO,YMD' as $revision$
declare prior jsonb;next_value jsonb;before_key uuid;after_key uuid;
begin
 if tg_op<>'INSERT' then
  before_key:=old.id;
  if tg_table_name='story_arcs' then
   prior:=jsonb_build_array(old.id,old.title,old.summary,old.started_at::text,old.last_update_at::text);
  else prior:=jsonb_build_array(old.id,old.article_id,old.arc_id,old.state,old.updated_at::text);end if;
 end if;
 if tg_op<>'DELETE' then
  after_key:=new.id;
  if tg_table_name='story_arcs' then
   next_value:=jsonb_build_array(new.id,new.title,new.summary,new.started_at::text,new.last_update_at::text);
  else next_value:=jsonb_build_array(new.id,new.article_id,new.arc_id,new.state,new.updated_at::text);end if;
 end if;
 insert into mip_arc_native.source_revisions(relation_name,operation,before_id,after_id,before_projection_hash,after_projection_hash,transaction_id)
 values(tg_table_schema||'.'||tg_table_name,tg_op,before_key,after_key,
  case when prior is null then null else encode(sha256(convert_to(prior::text,'UTF8')),'hex') end,
  case when next_value is null then null else encode(sha256(convert_to(next_value::text,'UTF8')),'hex') end,
  pg_current_xact_id()::text);
 return null;
end $revision$;
-- Assert the complete-view authority, including restrictive policies and exact
-- selected columns. Called on every current read after the collector lock.
create function mip_arc_native.assert_source_authority() returns void language plpgsql set search_path='' as $authority$
declare rel regclass;pol text;cols text[];a record;owner_oid oid:='mip_arc_native_owner'::regrole;
begin
 for rel,pol,cols in select * from(values
 ('public.articles'::regclass,'arc_native_articles',array['id','arc_id']),
 ('public.story_arcs'::regclass,'arc_native_arcs',array['id','title','summary','started_at','last_update_at']),
 ('public.arc_membership_candidates'::regclass,'arc_native_candidates',array['id','article_id','arc_id','state','updated_at']),
 ('evidence_pipeline.article_captures'::regclass,'arc_native_captures',array['id','job_id','article_id','content_hash','payload','captured_at']),
 ('evidence_pipeline.import_jobs'::regclass,'arc_native_jobs',array['id','article_id','input_hash','state']),
 ('mip_identity.source_changes'::regclass,'arc_native_source_changes',array['id','relation_name','native_retention_version','operation','before_identity','after_identity','before_hash','after_hash']))v(rel,pol,cols)
 loop
  if not exists(select 1 from pg_class where oid=rel and relkind='r' and relrowsecurity and relowner<>owner_oid)
   or not exists(select 1 from pg_policy where polrelid=rel and polname=pol and polpermissive and polcmd='r'
    and polroles=array[owner_oid] and pg_get_expr(polqual,polrelid)='true')
   or exists(select 1 from pg_policy where polrelid=rel and not polpermissive and polcmd in('r','*')
    and (0=any(polroles) or owner_oid=any(polroles)))
   or has_table_privilege(owner_oid,rel,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
   or has_any_column_privilege(owner_oid,rel,'INSERT,UPDATE,REFERENCES')
  then raise exception 'arc_native_source_authority';end if;
  for a in select attname from pg_attribute where attrelid=rel and attnum>0 and not attisdropped loop
   if has_column_privilege(owner_oid,rel,a.attname,'SELECT') is distinct from(a.attname=any(cols))
   then raise exception 'arc_native_source_columns';end if;
  end loop;
 end loop;
 if exists(select 1 from(values
 ('public.story_arcs'::regclass,'arc_native_arc_lock','mip_identity.collector_lock()'::regprocedure,62),
 ('public.arc_membership_candidates'::regclass,'arc_native_candidate_lock','mip_identity.collector_lock()'::regprocedure,62),
 ('public.story_arcs'::regclass,'arc_native_arc_revision','mip_arc_native.record_source_revision()'::regprocedure,29),
 ('public.arc_membership_candidates'::regclass,'arc_native_candidate_revision','mip_arc_native.record_source_revision()'::regprocedure,29))v(rel,n,f,t)
 where (select count(*) from pg_trigger where tgrelid=v.rel and tgname=v.n and tgfoid=v.f and tgtype=v.t
  and tgenabled='A' and tgqual is null and tgattr=''::int2vector and not tgisinternal)<>1)
 then raise exception 'arc_native_fence_boundary';end if;
 foreach rel in array array['evidence_pipeline.article_captures'::regclass,'evidence_pipeline.evidence_candidates'::regclass] loop
  if(select count(*) from pg_trigger where tgrelid=rel and tgfoid='mip_identity.collector_lock()'::regprocedure
    and tgtype=62 and tgenabled='O' and tgqual is null and not tgisinternal)<>1
   or(select count(*) from pg_trigger where tgrelid=rel and tgfoid='mip_identity.collector_native_change()'::regprocedure
    and tgtype=29 and tgenabled='O' and tgqual is null and not tgisinternal)<>1
  then raise exception 'arc_native_native_recorder_boundary';end if;
 end loop;
 if exists(select 1 from pg_auth_members where roleid=owner_oid or member=owner_oid)
 then raise exception 'arc_native_owner_membership';end if;
end $authority$;
reset role;
create trigger arc_native_arc_lock before insert or update or delete or truncate on public.story_arcs
 for each statement execute function mip_identity.collector_lock();
create trigger arc_native_candidate_lock before insert or update or delete or truncate on public.arc_membership_candidates
 for each statement execute function mip_identity.collector_lock();
create trigger arc_native_arc_revision after insert or update or delete on public.story_arcs
 for each row execute function mip_arc_native.record_source_revision();
create trigger arc_native_candidate_revision after insert or update or delete on public.arc_membership_candidates
 for each row execute function mip_arc_native.record_source_revision();
create trigger arc_native_arc_no_truncate before truncate on public.story_arcs
 for each statement execute function mip_arc_native.immutable();
create trigger arc_native_candidate_no_truncate before truncate on public.arc_membership_candidates
 for each statement execute function mip_arc_native.immutable();
alter table public.story_arcs enable always trigger arc_native_arc_lock;
alter table public.story_arcs enable always trigger arc_native_arc_revision;
alter table public.arc_membership_candidates enable always trigger arc_native_candidate_lock;
alter table public.arc_membership_candidates enable always trigger arc_native_candidate_revision;
-- Clear provider-created default ACLs ONLY on these new owned objects.
revoke all on all tables in schema mip_arc_native from public;
revoke all on all sequences in schema mip_arc_native from public;
do $acl$
declare r record;a record;
begin
 for r in select distinct acl_entry.grantee from pg_class c cross join lateral aclexplode(c.relacl) acl_entry
  where c.relnamespace='mip_arc_native'::regnamespace and acl_entry.grantee<>c.relowner and acl_entry.grantee<>0 loop
  execute format('revoke all on all tables in schema mip_arc_native from %I',r.grantee::regrole);
  execute format('revoke all on all sequences in schema mip_arc_native from %I',r.grantee::regrole);
 end loop;
 for r in select p.oid,p.oid::regprocedure sig,p.proowner,p.proname from pg_proc p where pronamespace='mip_arc_native'::regnamespace loop
  execute format('revoke all on function %s from public',r.sig);
  for a in select distinct grantee from aclexplode((select proacl from pg_proc where oid=r.oid))
   where grantee<>r.proowner and grantee<>0 and not(r.proname='context' and grantee='mip_arc_native_owner'::regrole) loop
   execute format('revoke all on function %s from %I',r.sig,a.grantee::regrole);
  end loop;
 end loop;
end $acl$;
grant usage on schema mip_arc_native to mip_arc_native_worker,mip_mentions_gateway,mip_mentions_admin;
grant execute on function mip_arc_native.snapshot(uuid,uuid,uuid),mip_arc_native.read_scoring_input(uuid,uuid,text)
 to mip_arc_native_worker;
grant execute on function mip_arc_native.review_scalar(uuid,uuid,uuid,uuid,uuid,text,text,text,text),
 mip_arc_native.review_selection_policy(uuid,uuid,integer,uuid,numeric,boolean,integer,integer,integer,bigint),
 mip_arc_native.review_extraction(uuid,uuid,uuid,uuid,text,integer,uuid,text,text,text),
 mip_arc_native.review_cohort(uuid,uuid,uuid,text,uuid,uuid,uuid[],uuid[],uuid[],uuid),
 mip_arc_native.revoke_cohort(uuid,uuid,uuid) to mip_mentions_gateway;
grant execute on function mip_arc_native.set_scalar_access(uuid,uuid,boolean) to mip_mentions_admin;
revoke mip_arc_native_owner from current_user;
do $final$
declare r record;
begin
 select * into r from pg_roles where rolname='mip_arc_native_owner';
 if r.rolcanlogin or r.rolinherit or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
  or exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid)
  or has_schema_privilege(r.oid,'public','CREATE')
  or has_schema_privilege(r.oid,'mip_mentions','CREATE')
 then raise exception 'arc_native_owner_boundary';end if;
 perform mip_arc_native.assert_source_authority();
 if exists(select 1 from pg_class c where relnamespace='mip_arc_native'::regnamespace and relkind='r'
   and (not relrowsecurity or not relforcerowsecurity or relowner<>'mip_arc_native_owner'::regrole))
 then raise exception 'arc_native_table_boundary';end if;
end $final$;
commit;