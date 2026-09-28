-- Source-only governed canonical admission qualification. Not hosted installation.
-- Requires native reliability -> mentions001 -> native003 -> candidate-review004 -> qik001.
begin;
set local lock_timeout='5s';
do $shape$
declare col text;
begin
 if not exists(select 1 from pg_class where oid='public.entities'::regclass and relkind='r' and relrowsecurity)
 then raise exception 'canonical_entity_shape';end if;
 foreach col in array array['canonical_name','normalized_name','type'] loop
  if not exists(select 1 from pg_attribute where attrelid='public.entities'::regclass and attname=col and atttypid='text'::regtype and not attisdropped)
  then raise exception 'canonical_entity_shape';end if;
 end loop;
 if not exists(select 1 from pg_attribute where attrelid='public.entities'::regclass and attname='aliases' and atttypid='text[]'::regtype and not attisdropped)
 then raise exception 'canonical_entity_shape';end if;
end $shape$;
grant select(id,canonical_name,normalized_name,type,aliases) on public.entities to mip_mentions_owner;
create policy canonical_identity_read on public.entities for select to mip_mentions_owner using(true);
set role mip_mentions_owner;
create table mip_mentions.canonical_mappings(
 scope uuid not null,id uuid not null,actor_id uuid not null,entity_id uuid not null,
 version integer not null check(version>0),predecessor_id uuid,state text not null check(state in('active','revoked')),
 identity_kind text not null check(identity_kind='qik_entity_identity_v1'),identity_digest text not null check(identity_digest~'^[0-9a-f]{64}$'),
 reason text not null check(reason in('identity_reviewed','identity_replaced','identity_revoked')),
 principal name not null,primary key(scope,id),unique(scope,actor_id,version),
 foreign key(scope,actor_id) references mip_mentions.actors(scope,id),
 foreign key(scope,predecessor_id) references mip_mentions.canonical_mappings(scope,id));
create table mip_mentions.canonical_mapping_heads(
 scope uuid not null,actor_id uuid not null,revision uuid not null,primary key(scope,actor_id),
 foreign key(scope,revision) references mip_mentions.canonical_mappings(scope,id));
create table mip_mentions.canonical_weight_policies(
 scope uuid not null,id uuid not null,policy_key uuid not null,version integer not null check(version>0),predecessor_id uuid,
 state text not null check(state in('active','revoked')),semantic_kind text not null check(semantic_kind='reviewed_evidence_weight_v1'),
 reason text not null check(reason in('weight_policy_reviewed','weight_policy_replaced','weight_policy_revoked')),
 principal name not null,primary key(scope,id),unique(scope,policy_key,version),
 foreign key(scope,predecessor_id) references mip_mentions.canonical_weight_policies(scope,id));
create table mip_mentions.canonical_weight_heads(
 scope uuid not null,policy_key uuid not null,revision uuid not null,primary key(scope,policy_key),
 foreign key(scope,revision) references mip_mentions.canonical_weight_policies(scope,id));
create table mip_mentions.canonical_admissions(
 scope uuid not null,id uuid not null,mention_id uuid not null,version integer not null check(version>0),predecessor_id uuid,
 state text not null check(state in('active','revoked')),decision_id uuid not null,mapping_revision uuid not null,policy_revision uuid not null,
 evidence_weight numeric not null check(evidence_weight>=0 and evidence_weight<=1 and octet_length(trim_scale(evidence_weight)::text)<=64),
 article_id uuid not null,entity_id uuid not null,field_id uuid not null,capture_id uuid not null,job_id uuid not null,
 content_hash text not null,field_hash text not null,source_version text not null,field_version text not null,
 start_pos integer not null,end_pos integer not null,span_hash text not null,
 reason text not null check(reason in('evidence_reviewed','evidence_replaced','evidence_revoked')),principal name not null,
 primary key(scope,id),unique(scope,mention_id,version),
 foreign key(scope,mention_id) references mip_mentions.mentions(scope,id),
 foreign key(scope,decision_id) references mip_mentions.decisions(scope,id),
 foreign key(scope,mapping_revision) references mip_mentions.canonical_mappings(scope,id),
 foreign key(scope,policy_revision) references mip_mentions.canonical_weight_policies(scope,id),
 foreign key(scope,predecessor_id) references mip_mentions.canonical_admissions(scope,id));
create table mip_mentions.canonical_admission_heads(
 scope uuid not null,mention_id uuid not null,revision uuid not null,primary key(scope,mention_id),
 foreign key(scope,revision) references mip_mentions.canonical_admissions(scope,id));
create index canonical_admissions_group on mip_mentions.canonical_admissions(scope,article_id,entity_id,id);
do $tables$
declare t text;
begin
 foreach t in array array['canonical_mappings','canonical_mapping_heads','canonical_weight_policies','canonical_weight_heads','canonical_admissions','canonical_admission_heads'] loop
  execute format('alter table mip_mentions.%I enable row level security',t);
  execute format('alter table mip_mentions.%I force row level security',t);
  execute format('create policy owner_scoped on mip_mentions.%I to mip_mentions_owner using(exists(select 1 from mip_mentions.members m where m.scope=%I.scope and m.principal=session_user)) with check(exists(select 1 from mip_mentions.members m where m.scope=%I.scope and m.principal=session_user))',t,t,t);
  execute format('revoke all on mip_mentions.%I from public,mip_mentions_gateway,mip_mentions_admin',t);
 end loop;
 foreach t in array array['canonical_mappings','canonical_weight_policies','canonical_admissions'] loop
  execute format('create trigger immutable_rows before update or delete on mip_mentions.%I for each row execute function mip_mentions.immutable()',t);
  execute format('create trigger immutable_table before truncate on mip_mentions.%I for each statement execute function mip_mentions.immutable()',t);
 end loop;
end $tables$;
-- Source identity mutations serialize against the existing policy head before
-- becoming visible. Counter-only updates do not target identity columns and do not take this lock.
-- BEFORE STATEMENT acquires policy lock before any entity row locks.
create function mip_mentions.canonical_entity_mutation() returns trigger
language plpgsql security definer set search_path='' as $entity_lock$
begin
 perform 1 from mip_mentions.policy_head where singleton for update;
 return null;
end $entity_lock$;
create function mip_mentions.canonical_begin(s uuid,review boolean,exclusive_policy boolean default false) returns void
language plpgsql set search_path='' as $begin$
begin
 if exclusive_policy then perform 1 from mip_mentions.policy_head where singleton for update;
 else perform mip_mentions.lock_policy();end if;
 perform mip_mentions.authorize(s,review);
 perform pg_advisory_xact_lock(hashtextextended('canonical-scope:'||s::text,0));
end $begin$;
create function mip_mentions.canonical_entity_digest(e uuid) returns text
language plpgsql set search_path='' as $identity$
declare identity jsonb;
begin
 select jsonb_build_object('id',id,'canonical_name',canonical_name,'normalized_name',normalized_name,'type',type,'aliases',aliases)
 into identity from public.entities where id=e;
 if not found or octet_length(identity::text)>16384
  or (identity->'aliases'<>'null'::jsonb and jsonb_array_length(identity->'aliases')>64)
 then raise exception 'canonical_entity_unavailable';end if;
 return encode(sha256(convert_to(identity::text,'UTF8')),'hex');
end $identity$;
create function mip_mentions.canonical_receipt(kind text,i uuid,v integer,st text) returns jsonb
language sql immutable set search_path='' as $receipt$
 select jsonb_build_object('kind',kind,'revision_id',i,'version',v,'state',st,
 'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false)
$receipt$;
create function mip_mentions.admit_actor_locator(s uuid,a uuid) returns jsonb
language plpgsql security definer set search_path='' as $locator$
begin
 perform mip_mentions.canonical_begin(s,true);
 if a is null then raise exception 'canonical_actor_locator_invalid';end if;
 insert into mip_mentions.actors(scope,id,label) values(s,a,a::text) on conflict(scope,id) do nothing;
 return jsonb_build_object('scope',s,'actor_id',a,'locator_only',true,'identity_accepted',false,
  'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $locator$;
create function mip_mentions.review_canonical_mapping(s uuid,i uuid,a uuid,e uuid,v integer,prev uuid,st text,digest text,why text)
returns jsonb language plpgsql security definer set search_path='' as $mapping$
declare old mip_mentions.canonical_mappings;head mip_mentions.canonical_mappings;
begin
 perform mip_mentions.canonical_begin(s,true,true);
 if i is null or a is null or e is null or v is null or v<1 or st is null or st not in('active','revoked')
  or digest is null or digest!~'^[0-9a-f]{64}$' or why is null or why not in('identity_reviewed','identity_replaced','identity_revoked')
 then raise exception 'canonical_mapping_invalid';end if;
 select r.* into head from mip_mentions.canonical_mappings r join mip_mentions.canonical_mapping_heads h
  on h.scope=r.scope and h.revision=r.id where h.scope=s and h.actor_id=a;
 select * into old from mip_mentions.canonical_mappings where scope=s and id=i;
 if found then
  if (old.actor_id,old.entity_id,old.version,old.predecessor_id,old.state,old.identity_digest,old.reason,old.principal)
   is distinct from(a,e,v,prev,st,digest,why,session_user) or head.id is distinct from i
  then raise exception 'canonical_mapping_retry_conflict';end if;
 else
  if v<>coalesce(head.version,0)+1 or prev is distinct from head.id
  then raise exception 'canonical_mapping_predecessor';end if;
  if st='revoked' and (head.id is null or head.state<>'active' or head.entity_id<>e or head.identity_digest<>digest)
  then raise exception 'canonical_mapping_revocation';end if;
 end if;
 if st='active' and mip_mentions.canonical_entity_digest(e) is distinct from digest
 then raise exception 'canonical_identity_mismatch';end if;
 if old.id is null then
  insert into mip_mentions.canonical_mappings values(s,i,a,e,v,prev,st,'qik_entity_identity_v1',digest,why,session_user);
  insert into mip_mentions.canonical_mapping_heads values(s,a,i)
   on conflict(scope,actor_id) do update set revision=excluded.revision;
 end if;
 return mip_mentions.canonical_receipt('canonical_mapping',i,v,st);
end $mapping$;
create function mip_mentions.review_weight_policy(s uuid,i uuid,k uuid,v integer,prev uuid,st text,why text)
returns jsonb language plpgsql security definer set search_path='' as $policy$
declare old mip_mentions.canonical_weight_policies;head mip_mentions.canonical_weight_policies;
begin
 perform mip_mentions.canonical_begin(s,true,true);
 if i is null or k is null or v is null or v<1 or st is null or st not in('active','revoked')
  or why is null or why not in('weight_policy_reviewed','weight_policy_replaced','weight_policy_revoked')
 then raise exception 'canonical_policy_invalid';end if;
 select r.* into head from mip_mentions.canonical_weight_policies r join mip_mentions.canonical_weight_heads h
  on h.scope=r.scope and h.revision=r.id where h.scope=s and h.policy_key=k;
 select * into old from mip_mentions.canonical_weight_policies where scope=s and id=i;
 if found then
  if (old.policy_key,old.version,old.predecessor_id,old.state,old.reason,old.principal)
   is distinct from(k,v,prev,st,why,session_user) or head.id is distinct from i
  then raise exception 'canonical_policy_retry_conflict';end if;
 else
  if v<>coalesce(head.version,0)+1 or prev is distinct from head.id
  then raise exception 'canonical_policy_predecessor';end if;
  if st='revoked' and (head.id is null or head.state<>'active') then raise exception 'canonical_policy_revocation';end if;
  insert into mip_mentions.canonical_weight_policies values(s,i,k,v,prev,st,'reviewed_evidence_weight_v1',why,session_user);
  insert into mip_mentions.canonical_weight_heads values(s,k,i)
   on conflict(scope,policy_key) do update set revision=excluded.revision;
 end if;
 return mip_mentions.canonical_receipt('weight_policy',i,v,st);
end $policy$;
create function mip_mentions.canonical_context(s uuid,m uuid,d uuid,mapping uuid,policy uuid) returns jsonb
language plpgsql set search_path='' as $context$
declare cm mip_mentions.canonical_mappings;wp mip_mentions.canonical_weight_policies;resolved jsonb;r record;
begin
 select x.* into cm from mip_mentions.canonical_mappings x join mip_mentions.canonical_mapping_heads h
  on h.scope=x.scope and h.revision=x.id where x.scope=s and x.id=mapping and h.actor_id=x.actor_id and x.state='active';
 if not found or mip_mentions.canonical_entity_digest(cm.entity_id) is distinct from cm.identity_digest
 then raise exception 'canonical_mapping_unavailable';end if;
 select x.* into wp from mip_mentions.canonical_weight_policies x join mip_mentions.canonical_weight_heads h
  on h.scope=x.scope and h.revision=x.id where x.scope=s and x.id=policy and h.policy_key=x.policy_key and x.state='active';
 if not found then raise exception 'canonical_policy_unavailable';end if;
 resolved:=mip_mentions.resolved_actor(s,m,d);
 if (resolved->>'actor_id')::uuid is distinct from cm.actor_id then raise exception 'canonical_actor_mismatch';end if;
 select f.id field_id,f.native_capture_id capture_id,f.native_job_id job_id,f.native_article_id article_id,
 f.native_content_hash content_hash,f.field_hash,f.source_version,f.field_version,n.start_pos,n.end_pos,n.span_hash
 into r from mip_mentions.mentions n join mip_mentions.fields f on f.scope=n.scope and f.id=n.field_id
 where n.scope=s and n.id=m and f.raw is null and f.native_capture_id is not null;
 if not found then raise exception 'canonical_native_evidence_required';end if;
 return to_jsonb(r)||jsonb_build_object('entity_id',cm.entity_id);
end $context$;
create function mip_mentions.review_canonical_admission(s uuid,i uuid,m uuid,v integer,prev uuid,st text,d uuid,mapping uuid,policy uuid,w numeric,why text)
returns jsonb language plpgsql security definer set search_path='' as $admission$
declare old mip_mentions.canonical_admissions;head mip_mentions.canonical_admissions;ctx jsonb;
begin
 perform mip_mentions.canonical_begin(s,true);
 if i is null or m is null or v is null or v<1 or st is null or st not in('active','revoked')
  or d is null or mapping is null or policy is null or w is null or not(w>=0 and w<=1) or octet_length(trim_scale(w)::text)>64
  or why is null or why not in('evidence_reviewed','evidence_replaced','evidence_revoked')
 then raise exception 'canonical_admission_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||m::text,0));
 select x.* into head from mip_mentions.canonical_admissions x join mip_mentions.canonical_admission_heads h
  on h.scope=x.scope and h.revision=x.id where h.scope=s and h.mention_id=m;
 select * into old from mip_mentions.canonical_admissions where scope=s and id=i;
 if found then
  if (old.mention_id,old.version,old.predecessor_id,old.state,old.decision_id,old.mapping_revision,old.policy_revision,old.evidence_weight,old.reason,old.principal)
   is distinct from(m,v,prev,st,d,mapping,policy,w,why,session_user) or head.id is distinct from i
  then raise exception 'canonical_admission_retry_conflict';end if;
 else
  if v<>coalesce(head.version,0)+1 or prev is distinct from head.id
  then raise exception 'canonical_admission_predecessor';end if;
 end if;
 if st='revoked' then
  if old.id is null and (head.id is null or head.state<>'active'
   or (head.decision_id,head.mapping_revision,head.policy_revision,head.evidence_weight) is distinct from(d,mapping,policy,w))
  then raise exception 'canonical_admission_revocation';end if;
  if old.id is null then ctx:=to_jsonb(head);else ctx:=to_jsonb(old);end if;
 else ctx:=mip_mentions.canonical_context(s,m,d,mapping,policy);end if;
 if old.id is null then
  insert into mip_mentions.canonical_admissions values(s,i,m,v,prev,st,d,mapping,policy,trim_scale(w),
   (ctx->>'article_id')::uuid,(ctx->>'entity_id')::uuid,(ctx->>'field_id')::uuid,(ctx->>'capture_id')::uuid,(ctx->>'job_id')::uuid,
   ctx->>'content_hash',ctx->>'field_hash',ctx->>'source_version',ctx->>'field_version',
   (ctx->>'start_pos')::integer,(ctx->>'end_pos')::integer,ctx->>'span_hash',why,session_user);
  insert into mip_mentions.canonical_admission_heads values(s,m,i)
   on conflict(scope,mention_id) do update set revision=excluded.revision;
 end if;
 return mip_mentions.canonical_receipt('canonical_admission',i,v,st);
end $admission$;
-- Complete current logical group, not caller-supplied subset. All target mention
-- advisory locks precede any shared validator/source access locks.
-- One complete validation precedes per-admission reads, including standalone
-- group/article callers. This orders all context locks and source-access locks.
create function mip_mentions.canonical_prelock_context(s uuid,ids uuid[],extra uuid[] default '{}'::uuid[]) returns void
language plpgsql set search_path='' as $context_lock$
declare p mip_mentions.policy;refs uuid[];mid uuid;n bigint;
begin
 p:=mip_mentions.lock_policy();
 select coalesce(sum(1+cardinality(c.supporting_mentions)+cardinality(c.conflicting_mentions)),0) into n
 from mip_mentions.canonical_admissions a join mip_mentions.decisions d on d.scope=a.scope and d.id=a.decision_id
 join mip_mentions.candidates c on c.scope=d.scope and c.id=d.candidate_id and c.mention_id=a.mention_id
 where a.scope=s and a.id=any(ids);
 if n>p.max_context then raise exception 'canonical_context_budget';end if;
 select coalesce(array_agg(distinct ref order by ref),'{}'::uuid[]) into refs from(
  select a.mention_id ref from mip_mentions.canonical_admissions a where a.scope=s and a.id=any(ids)
  union all
  select unnest(c.supporting_mentions||c.conflicting_mentions)
  from mip_mentions.canonical_admissions a join mip_mentions.decisions d on d.scope=a.scope and d.id=a.decision_id
  join mip_mentions.candidates c on c.scope=d.scope and c.id=d.candidate_id and c.mention_id=a.mention_id
  where a.scope=s and a.id=any(ids)) all_refs;
 foreach mid in array refs loop perform pg_advisory_xact_lock(hashtextextended(s::text||mid::text,0));end loop;
 perform mip_mentions.check_mentions(s,refs,p,extra);
end $context_lock$;
create function mip_mentions.canonical_group(s uuid,article uuid,entity uuid) returns jsonb
language plpgsql security definer set search_path='' as $group$
declare ids uuid[];mentions uuid[];a mip_mentions.canonical_admissions;mid uuid;ctx jsonb;mapping uuid;policy uuid;weight numeric;payload jsonb;
begin
 perform mip_mentions.canonical_begin(s,false);
 if article is null or entity is null then raise exception 'canonical_group_invalid';end if;
 select array_agg(id order by id),array_agg(mention_id order by mention_id) into ids,mentions
 from(select a.id,a.mention_id from mip_mentions.canonical_admissions a join mip_mentions.canonical_admission_heads h
  on h.scope=a.scope and h.revision=a.id and h.mention_id=a.mention_id
  where a.scope=s and a.article_id=article and a.entity_id=entity and a.state='active' order by a.id limit 65) bounded;
 if ids is null or cardinality(ids)>64 then raise exception 'canonical_group_unavailable_or_budget';end if;
 perform mip_mentions.canonical_prelock_context(s,ids);
 for a in select * from mip_mentions.canonical_admissions where scope=s and id=any(ids) order by id loop
  ctx:=mip_mentions.canonical_context(s,a.mention_id,a.decision_id,a.mapping_revision,a.policy_revision);
  if (ctx->>'article_id')::uuid<>article or (ctx->>'entity_id')::uuid<>entity
   or ctx is distinct from (to_jsonb(a)-array['scope','id','mention_id','version','predecessor_id','state','decision_id','mapping_revision','policy_revision','evidence_weight','reason','principal'])
  then raise exception 'canonical_admission_binding_mismatch';end if;
  if mapping is not null and (mapping<>a.mapping_revision or policy<>a.policy_revision)
  then raise exception 'canonical_group_mixed_policy_or_mapping';end if;
  mapping:=a.mapping_revision;policy:=a.policy_revision;
  weight:=greatest(weight,a.evidence_weight);
 end loop;
 payload:=jsonb_build_object('semantic_kind','reviewed_evidence_weight_v1','scope',s,'article_id',article,'entity_id',entity,
  'mapping_revision',mapping,'weight_policy_revision',policy,'admission_ids',ids,'evidence_weight',trim_scale(weight));
 return payload||jsonb_build_object('set_digest',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
end $group$;
-- Budget-only access to original capture size. Existing validator column/RLS
-- privileges suffice; no new native source grant or byte-returning entrypoint.
create function mip_mentions.canonical_capture_octets(s uuid,fid uuid) returns integer
language plpgsql stable security definer set search_path='' as $octets$
declare n integer;
begin
 select octet_length(c.payload::text) into n from mip_mentions.fields f
 join evidence_pipeline.article_captures c on c.id=f.native_capture_id and c.job_id=f.native_job_id
  and c.article_id=f.native_article_id and c.content_hash=f.native_content_hash
 where f.scope=s and f.id=fid and f.native_capture_id is not null;
 if not found or n is null or n>262144 then raise exception 'canonical_capture_size_unavailable';end if;
 return n;
end $octets$;
-- Private bounded cohort prelock for C9. Caller takes collector/publication
-- fences AFTER canonical_begin and BEFORE invoking this helper. No source bytes
-- or tables are exposed to that caller.
create function mip_mentions.canonical_prelock_articles(s uuid,articles uuid[],captures uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $prelock$
declare p mip_mentions.policy;i integer;heads integer;active uuid[];all_active uuid[]:='{}';refs uuid[];fieldrefs uuid[]:='{}';fid uuid;mid uuid;ref_count integer;field_count integer;source_bytes bigint;span_bytes bigint;largest bigint;capture_unique bigint;capture_hash bigint;
begin
 perform mip_mentions.canonical_begin(s,false);p:=mip_mentions.lock_policy();
 if articles is null or captures is null or array_ndims(articles) is distinct from 1 or array_ndims(captures) is distinct from 1
  or array_lower(articles,1)<>1 or array_lower(captures,1)<>1 or cardinality(articles) not between 1 and 32
  or cardinality(articles)<>cardinality(captures) or array_position(articles,null) is not null or array_position(captures,null) is not null
  or cardinality(articles)<>(select count(distinct x) from unnest(articles)x)
 then raise exception 'canonical_cohort_invalid';end if;
 for i in 1..cardinality(articles) loop
  select count(*),array_agg(id order by id) filter(where state='active') into heads,active
  from(select a.* from mip_mentions.canonical_admissions a join mip_mentions.canonical_admission_heads h
   on h.scope=a.scope and h.revision=a.id and h.mention_id=a.mention_id
   where a.scope=s and a.article_id=articles[i] order by a.id limit 129) bounded;
  if heads>128 or coalesce(cardinality(active),0)>64 then raise exception 'canonical_cohort_budget';end if;
  if exists(select 1 from mip_mentions.canonical_admissions where scope=s and id=any(active) and capture_id<>captures[i])
  then raise exception 'canonical_cohort_capture_mismatch';end if;
  all_active:=all_active||coalesce(active,'{}'::uuid[]);
  if cardinality(all_active)>64 then raise exception 'canonical_cohort_budget';end if;
  select id into fid from mip_mentions.fields where scope=s and native_article_id=articles[i] and native_capture_id=captures[i] and raw is null order by id limit 1;
  if not found then raise exception 'canonical_cohort_source_unavailable';end if;
  fieldrefs:=fieldrefs||fid;
 end loop;
 select coalesce(sum(1+cardinality(c.supporting_mentions)+cardinality(c.conflicting_mentions)),0) into ref_count
 from mip_mentions.canonical_admissions a join mip_mentions.decisions d on d.scope=a.scope and d.id=a.decision_id
 join mip_mentions.candidates c on c.scope=d.scope and c.id=d.candidate_id and c.mention_id=a.mention_id
 where a.scope=s and a.id=any(all_active);
 if ref_count>p.max_context then raise exception 'canonical_cohort_context_budget';end if;
 select coalesce(array_agg(distinct ref order by ref),'{}'::uuid[]) into refs
 from mip_mentions.canonical_admissions a join mip_mentions.decisions d on d.scope=a.scope and d.id=a.decision_id
 join mip_mentions.candidates c on c.scope=d.scope and c.id=d.candidate_id and c.mention_id=a.mention_id
 cross join lateral unnest(array[a.mention_id]||c.supporting_mentions||c.conflicting_mentions)ref
 where a.scope=s and a.id=any(all_active);
 -- Always include target locks even if a malformed/missing decision will later
 -- refuse. No caller can change the private rows through this helper.
 select coalesce(array_agg(distinct ref order by ref),'{}'::uuid[]) into refs from(
  select unnest(refs) ref union select mention_id from mip_mentions.canonical_admissions where scope=s and id=any(all_active)) all_refs;
 foreach mid in array refs loop perform pg_advisory_xact_lock(hashtextextended(s::text||mid::text,0));end loop;
 perform mip_mentions.check_mentions(s,refs,p,fieldrefs);
 with ids as(select distinct field_id id from mip_mentions.mentions where scope=s and id=any(refs)
  union select unnest(fieldrefs))
 select count(*),coalesce(sum(coalesce(octet_length(f.raw),f.native_byte_length)),0),
  coalesce(max(coalesce(octet_length(f.raw),f.native_byte_length)),0)
 into field_count,source_bytes,largest from mip_mentions.fields f join ids on ids.id=f.id where f.scope=s;
 select coalesce(sum(octet_length(literal)),0) into span_bytes from mip_mentions.mentions where scope=s and id=any(refs);
 with ids as(select distinct field_id id from mip_mentions.mentions where scope=s and id=any(refs)
  union select unnest(fieldrefs)),
 sizes as materialized(select f.native_capture_id capture,mip_mentions.canonical_capture_octets(s,f.id) n
  from mip_mentions.fields f join ids on ids.id=f.id where f.scope=s and f.native_capture_id is not null),
 unique_sizes as(select capture,max(n) n from sizes group by capture)
 select (select coalesce(sum(n),0) from unique_sizes),(select coalesce(sum(n),0) from sizes)
 into capture_unique,capture_hash;
 return jsonb_build_object('context_count',cardinality(refs),'field_count',field_count,
  'selected_field_bytes',source_bytes,'span_bytes',span_bytes,
  'native_capture_bytes_unique',capture_unique,'native_capture_hash_bytes',capture_hash,
  'source_and_span_bytes',source_bytes+span_bytes,'largest_field_bytes',largest,
  'policy_version',p.version,'max_context',p.max_context,'max_fields',p.max_fields,
  'max_field_bytes',p.max_field_bytes,'max_total_bytes',p.max_total_bytes);
end $prelock$;
-- Bound complete article enumeration. All current heads (including revoked)
-- enter the digest; active heads must share the exact caller-named capture.
create function mip_mentions.canonical_article(s uuid,article uuid,capture uuid) returns jsonb
language plpgsql security definer set search_path='' as $article$
declare heads uuid[];active_ids uuid[];targets uuid[];mid uuid;e uuid;f uuid;p mip_mentions.policy;groups jsonb:='[]';payload jsonb;
begin
 perform mip_mentions.canonical_begin(s,false);
 if article is null or capture is null then raise exception 'canonical_article_invalid';end if;
 select array_agg(id order by id),array_agg(id order by id) filter(where state='active'),
  array_agg(mention_id order by mention_id) filter(where state='active')
 into heads,active_ids,targets
 from(select a.* from mip_mentions.canonical_admissions a join mip_mentions.canonical_admission_heads h
  on h.scope=a.scope and h.revision=a.id and h.mention_id=a.mention_id
  where a.scope=s and a.article_id=article order by a.id limit 129) bounded;
 if coalesce(cardinality(heads),0)>128 or coalesce(cardinality(active_ids),0)>64
 then raise exception 'canonical_article_budget';end if;
 if exists(select 1 from mip_mentions.canonical_admissions where scope=s and id=any(active_ids) and capture_id<>capture)
 then raise exception 'canonical_article_capture_mismatch';end if;
 -- Even an empty admission receipt must bind a currently readable, actually
 -- admitted native field for this exact article/capture; it is not completeness.
 select id into f from mip_mentions.fields where scope=s and native_article_id=article and native_capture_id=capture and raw is null order by id limit 1;
 if not found then raise exception 'canonical_article_source_unavailable';end if;
 p:=mip_mentions.lock_policy();
 perform mip_mentions.canonical_prelock_context(s,coalesce(active_ids,'{}'::uuid[]),array[f]);
 for e in select distinct entity_id from mip_mentions.canonical_admissions where scope=s and id=any(active_ids) order by entity_id loop
  groups:=groups||jsonb_build_array(mip_mentions.canonical_group(s,article,e));
 end loop;
 payload:=jsonb_build_object('semantic_kind','reviewed_evidence_weight_v1','scope',s,'article_id',article,'capture_id',capture,
  'head_revision_ids',coalesce(heads,'{}'::uuid[]),'groups',groups,
  'input_status',case when active_ids is null then 'no_admissions_not_extraction_complete' else 'admitted_groups' end);
 return payload||jsonb_build_object('article_set_digest',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
end $article$;
revoke all on function mip_mentions.canonical_entity_mutation(),mip_mentions.canonical_begin(uuid,boolean,boolean),
 mip_mentions.canonical_entity_digest(uuid),mip_mentions.canonical_capture_octets(uuid,uuid),mip_mentions.canonical_receipt(text,uuid,integer,text),
 mip_mentions.canonical_context(uuid,uuid,uuid,uuid,uuid),mip_mentions.canonical_prelock_context(uuid,uuid[],uuid[]),mip_mentions.canonical_group(uuid,uuid,uuid),
 mip_mentions.canonical_article(uuid,uuid,uuid),mip_mentions.canonical_prelock_articles(uuid,uuid[],uuid[])
 from public,mip_mentions_gateway,mip_mentions_admin;
grant execute on function mip_mentions.admit_actor_locator(uuid,uuid),
 mip_mentions.review_canonical_mapping(uuid,uuid,uuid,uuid,integer,uuid,text,text,text),
 mip_mentions.review_weight_policy(uuid,uuid,uuid,integer,uuid,text,text),
 mip_mentions.review_canonical_admission(uuid,uuid,uuid,integer,uuid,text,uuid,uuid,uuid,numeric,text)
 to mip_mentions_gateway;
reset role;
grant create on schema mip_mentions to mip_mentions_native_validator;
alter function mip_mentions.canonical_capture_octets(uuid,uuid) owner to mip_mentions_native_validator;
revoke create on schema mip_mentions from mip_mentions_native_validator;
grant execute on function mip_mentions.canonical_capture_octets(uuid,uuid) to mip_mentions_owner;
create trigger canonical_entity_identity_fence before insert or delete or truncate on public.entities
 for each statement execute function mip_mentions.canonical_entity_mutation();
create trigger canonical_entity_update_fence before update of id,canonical_name,normalized_name,type,aliases on public.entities
 for each statement execute function mip_mentions.canonical_entity_mutation();
alter table public.entities enable always trigger canonical_entity_identity_fence;
alter table public.entities enable always trigger canonical_entity_update_fence;
do $boundary$
declare r record;f record;
begin
 select * into r from pg_roles where rolname='mip_mentions_owner';
 if not r.rolinherit or r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
  or exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid)
 then raise exception 'canonical_owner_boundary';end if;
 for f in select * from pg_class where relnamespace='mip_mentions'::regnamespace and relname like 'canonical_%' and relkind='r' loop
  if f.relowner<>r.oid or not f.relrowsecurity or not f.relforcerowsecurity
   or has_table_privilege('mip_mentions_gateway',f.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_table_privilege('mip_mentions_admin',f.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  then raise exception 'canonical_table_boundary';end if;
 end loop;
 for f in select p.* from pg_proc p where pronamespace='mip_mentions'::regnamespace
  and (proname like 'canonical_%' or proname in('admit_actor_locator','review_canonical_mapping','review_weight_policy','review_canonical_admission')) loop
  if f.proowner<>(case when f.proname='canonical_capture_octets' then 'mip_mentions_native_validator'::regrole else r.oid end)
   or f.proconfig is distinct from array['search_path=""']
   or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
    where a.grantee not in(r.oid,case when f.proname='canonical_capture_octets' then 'mip_mentions_native_validator'::regrole else r.oid end,case when f.proname in('admit_actor_locator','review_canonical_mapping','review_weight_policy','review_canonical_admission') then 'mip_mentions_gateway'::regrole else r.oid end))
  then raise exception 'canonical_function_boundary';end if;
 end loop;
 if not(select prosecdef and provolatile='s' and proconfig=array['search_path=""']
  from pg_proc where oid='mip_mentions.canonical_capture_octets(uuid,uuid)'::regprocedure)
  or has_schema_privilege('mip_mentions_native_validator','mip_mentions','CREATE')
  or exists(select 1 from pg_auth_members where roleid='mip_mentions_native_validator'::regrole or member='mip_mentions_native_validator'::regrole)
 then raise exception 'canonical_capture_size_boundary';end if;
 if not has_column_privilege(r.oid,'public.entities','aliases','SELECT')
  or has_table_privilege('mip_mentions_gateway','public.entities','SELECT')
 then raise exception 'canonical_entity_privilege_boundary';end if;
end $boundary$;
commit;
