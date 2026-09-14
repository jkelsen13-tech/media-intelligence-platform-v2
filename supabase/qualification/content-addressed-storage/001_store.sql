-- Isolated synthetic qualification; no deployment or production role admission.
begin;
create extension if not exists pgcrypto;
create role mip_cas_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_cas_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_cas_codec_verifier nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema mip_cas authorization mip_cas_owner;
revoke all on schema mip_cas from public;
set role mip_cas_owner;
create table mip_cas.policies(version bigint primary key,max_raw integer not null check(max_raw>0),max_encoded integer not null check(max_encoded>0),max_objects bigint not null check(max_objects>0),max_total bigint not null check(max_total>0),max_refs bigint not null check(max_refs>0),max_jobs integer not null check(max_jobs>0),max_page integer not null check(max_page between 1 and 1000),locations text[] not null,codecs text[] not null,tiers text[] not null,qualification jsonb not null,initial_location text not null,initial_tier text not null,check(initial_location=any(locations)),check(initial_tier=any(tiers)));
create table mip_cas.active_policy(id boolean primary key check(id),version bigint not null references mip_cas.policies);
insert into mip_cas.policies values(1,1048576,1048576,256,16777216,128,16,50,array['disposable_postgres'],array['identity-v1','gzip-v1'],array['hot','warm','cold','deep_archive'],'{"production":false,"deployment":false,"rights":false,"codec":false,"publication":false}','disposable_postgres','hot');
insert into mip_cas.active_policy values(true,1);
create table mip_cas.object_usage(id boolean primary key check(id),objects bigint not null,raw_bytes bigint not null);
insert into mip_cas.object_usage values(true,0,0);
create table mip_cas.scope_usage(investigation uuid primary key,refs bigint not null default 0,index_epoch bigint not null default 0);
create function mip_cas.policy() returns mip_cas.policies language plpgsql security definer set search_path='' as $$
declare p mip_cas.policies;
begin
 select v.* into p from mip_cas.active_policy a join mip_cas.policies v on v.version=a.version where a.id for share of a;
 if not found or p.qualification is distinct from '{"production":false,"deployment":false,"rights":false,"codec":false,"publication":false}'::jsonb then raise exception 'mip_cas_policy_unavailable';end if;
 if cardinality(p.locations) not between 1 and 32 or cardinality(p.codecs) not between 1 and 32 or cardinality(p.tiers) not between 1 and 4 or array_position(p.locations,null) is not null or array_position(p.codecs,null) is not null or array_position(p.tiers,null) is not null or cardinality(p.locations)<>(select count(distinct v) from unnest(p.locations) v) or cardinality(p.codecs)<>(select count(distinct v) from unnest(p.codecs) v) or cardinality(p.tiers)<>(select count(distinct v) from unnest(p.tiers) v) or exists(select 1 from unnest(p.locations||p.codecs) v where v !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$') or exists(select 1 from unnest(p.tiers) v where v not in('hot','warm','cold','deep_archive')) then raise exception 'mip_cas_policy_unavailable';end if;
 return p;
end$$;
create table mip_cas.principals(login name primary key,user_id uuid not null);
create table mip_cas.access(user_id uuid not null,investigation uuid not null,expires_at timestamptz not null,primary key(user_id,investigation));
create table mip_cas.source_permissions(investigation uuid not null,source_version text not null,rights_ref text not null,privacy_ref text not null,expires_at timestamptz not null,primary key(investigation,source_version));
create table mip_cas.objects(hash text primary key check(hash~'^[0-9a-f]{64}$'),raw_size integer not null check(raw_size>0),created_at timestamptz not null default clock_timestamp());
create table mip_cas.representations(hash text primary key references mip_cas.objects,codec text not null check(codec ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),encoded bytea not null check(octet_length(encoded)>0),location text not null check(location ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),encoded_hash text not null check(encoded_hash~'^[0-9a-f]{64}$'),tier text not null check(tier in('hot','warm','cold','deep_archive')),version bigint not null default 1,changed_at timestamptz not null default clock_timestamp());
create table mip_cas.refs(id uuid primary key,investigation uuid not null,logical_key text not null,hash text not null references mip_cas.objects,provenance jsonb not null,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),unique(investigation,logical_key));
create table mip_cas.indexes(ref_id uuid primary key references mip_cas.refs,investigation uuid not null,canonical_hash text not null,version bigint not null default 1,metadata jsonb not null);
create table mip_cas.jobs(id uuid primary key,ref_id uuid not null references mip_cas.refs,user_id uuid not null,request_id uuid not null,expires_at timestamptz not null,expected_version bigint not null,state text not null check(state in('pending','completed')),unique(user_id,request_id));
create table mip_cas.events(id bigint generated always as identity primary key,hash text not null,prior_version bigint not null,next_version bigint not null,old_tier text not null,new_tier text not null,actor uuid not null,recorded_at timestamptz not null default clock_timestamp());
create index refs_scope_page on mip_cas.refs(investigation,id);
create index indexes_scope_page on mip_cas.indexes(investigation,ref_id);
create index indexes_locator_gin on mip_cas.indexes using gin(metadata jsonb_path_ops);
create index indexes_summary_gin on mip_cas.indexes using gin(to_tsvector('simple',coalesce(metadata->>'summary','')));
create function mip_cas.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'mip_cas_immutable';end$$;
create trigger immutable_rows before update or delete on mip_cas.policies for each row execute function mip_cas.immutable();
create trigger immutable_rows before update or delete on mip_cas.objects for each row execute function mip_cas.immutable();
create trigger immutable_rows before update or delete on mip_cas.refs for each row execute function mip_cas.immutable();
create trigger immutable_rows before update or delete on mip_cas.events for each row execute function mip_cas.immutable();
create function mip_cas.authorize(i uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 select user_id into u from mip_cas.principals where login=session_user;
 perform 1 from mip_cas.access where user_id=u and investigation=i and expires_at>clock_timestamp() for share;
 if not found then raise exception using errcode='42501',message='mip_cas_denied';end if;
 return u;
end$$;
create function mip_cas.check_source(i uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from mip_cas.source_permissions where investigation=i and source_version=p->>'source_version' and rights_ref=p->>'rights_ref' and privacy_ref=p->>'privacy_ref' and expires_at>clock_timestamp() for share;
 if not found then raise exception 'mip_cas_source_rights_unverified';end if;
end$$;
-- Only the separately configured trusted codec service can admit gzip representations.
create function mip_cas.admit(raw bytea,codec_name text,encoded_bytes bytea) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h text;fingerprint text;o mip_cas.objects;r mip_cas.representations;p mip_cas.policies;usage mip_cas.object_usage;
begin
 p:=mip_cas.policy();
 if not(p.initial_location=any(p.locations)) or not(p.initial_tier=any(p.tiers)) then raise exception 'mip_cas_representation_unverified';end if;
 if raw is null or encoded_bytes is null or codec_name is null or octet_length(raw) not between 1 and p.max_raw or octet_length(encoded_bytes) not between 1 and p.max_encoded or not(codec_name=any(p.codecs)) then raise exception 'mip_cas_invalid';end if;
 if codec_name='identity-v1' and raw is distinct from encoded_bytes then raise exception 'mip_cas_codec_mismatch';end if;
 h:=encode(public.digest(raw,'sha256'),'hex');fingerprint:=encode(public.digest(encoded_bytes,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('mip-cas-quota',0));
 select * into o from mip_cas.objects where hash=h;
 if found then
  select * into strict r from mip_cas.representations where hash=h;
  if o.raw_size<>octet_length(raw) or r.codec<>codec_name or r.encoded_hash<>fingerprint or r.encoded is distinct from encoded_bytes then raise exception 'mip_cas_representation_conflict';end if;
 else
  select * into strict usage from mip_cas.object_usage where id for update;
  if usage.objects>=p.max_objects or usage.raw_bytes+octet_length(raw)>p.max_total then raise exception 'mip_cas_object_quota';end if;
  update mip_cas.object_usage set objects=objects+1,raw_bytes=raw_bytes+octet_length(raw) where id;
  insert into mip_cas.objects values(h,octet_length(raw),clock_timestamp());
  insert into mip_cas.representations(hash,codec,encoded,encoded_hash,tier,location) values(h,codec_name,encoded_bytes,fingerprint,p.initial_tier,p.initial_location) returning * into r;
 end if;
 return jsonb_build_object('hash',h,'raw_size',octet_length(raw),'encoded_hash',fingerprint,'codec',codec_name,'policy_version',p.version,'location',r.location,'tier',r.tier,'codec_qualified',false);
end$$;
create function mip_cas.bind(i uuid,k text,raw bytea,provenance_value jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;h text;r mip_cas.refs;rid uuid;t timestamptz;p mip_cas.policies;
begin
 u:=mip_cas.authorize(i);p:=mip_cas.policy();
 if k is null or length(k) not between 1 and 256 or raw is null or octet_length(raw) not between 1 and p.max_raw or jsonb_typeof(provenance_value) is distinct from 'object' or not(provenance_value ?& array['source_version','acquired_at','rights_ref','privacy_ref']) or (select count(*) from jsonb_object_keys(provenance_value))<>4 or exists(select 1 from jsonb_each(provenance_value) e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}') not between 1 and 512) or provenance_value->>'acquired_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$' then raise exception 'mip_cas_provenance_invalid';end if;
 t:=(provenance_value->>'acquired_at')::timestamptz;
 if not isfinite(t) then raise exception 'mip_cas_provenance_invalid';end if;
 perform mip_cas.check_source(i,provenance_value);
 h:=encode(public.digest(raw,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('mip-cas-quota',0));
 if not exists(select 1 from mip_cas.objects where hash=h and raw_size=octet_length(raw)) then raise exception 'mip_cas_unadmitted';end if;
 select * into r from mip_cas.refs where investigation=i and logical_key=k;
 if found then
  if r.hash<>h or r.provenance is distinct from provenance_value then raise exception 'mip_cas_retry_conflict';end if;
  return jsonb_build_object('ref_id',r.id,'hash',h,'committed',true,'production_qualified',false);
 end if;
 insert into mip_cas.scope_usage(investigation) values(i) on conflict do nothing;
 if (select refs from mip_cas.scope_usage where investigation=i)>=p.max_refs then raise exception 'mip_cas_ref_quota';end if;
 update mip_cas.scope_usage set refs=refs+1 where investigation=i;
 rid:=gen_random_uuid();
 insert into mip_cas.refs values(rid,i,k,h,provenance_value,u,clock_timestamp());
 return jsonb_build_object('ref_id',rid,'hash',h,'committed',true,'production_qualified',false);
end$$;
create function mip_cas.put(i uuid,k text,raw bytea,codec_name text,encoded_bytes bytea,provenance_value jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform mip_cas.authorize(i);
 if codec_name is distinct from 'identity-v1' or raw is distinct from encoded_bytes then raise exception 'mip_cas_codec_gateway_denied';end if;
 perform mip_cas.admit(raw,codec_name,encoded_bytes);
 return mip_cas.bind(i,k,raw,provenance_value);
end$$;
create function mip_cas.read(i uuid,k text,level_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r mip_cas.refs;s mip_cas.representations;o mip_cas.objects;x mip_cas.indexes;result jsonb;p mip_cas.policies;
begin
 perform mip_cas.authorize(i);p:=mip_cas.policy();
 if level_name is null or level_name not in('metadata','index','canonical') then raise exception 'mip_cas_level';end if;
 select * into r from mip_cas.refs where investigation=i and logical_key=k;
 if not found then raise exception 'mip_cas_missing';end if;
 perform mip_cas.check_source(i,r.provenance);
 select * into s from mip_cas.representations where hash=r.hash;
 if not found then raise exception 'mip_cas_representation_unavailable';end if;
 if not(s.location=any(p.locations)) or not(s.codec=any(p.codecs)) or not(s.tier=any(p.tiers)) then raise exception 'mip_cas_representation_unverified';end if;
 select * into o from mip_cas.objects where hash=r.hash;
 if not found then raise exception 'mip_cas_object_unavailable';end if;
 result:=jsonb_build_object('ref_id',r.id,'hash',r.hash,'raw_size',o.raw_size,'provenance',r.provenance,'tier',s.tier,'version',s.version,'policy_version',p.version,'location',s.location,'max_raw',p.max_raw,'max_encoded',p.max_encoded,'max_page',p.max_page,'allowed_locations',p.locations,'allowed_codecs',p.codecs,'allowed_tiers',p.tiers,'production_qualified',false,'publication_allowed',false,'rights_qualified',false,'codec_qualified',false);
 if level_name='metadata' then return result;end if;
 if level_name='index' then
  select * into x from mip_cas.indexes where ref_id=r.id;
  if found and x.canonical_hash<>r.hash then raise exception 'mip_cas_stale_index';end if;
  return result||jsonb_build_object('index',x.metadata,'index_is_evidence',false);
 end if;
 if s.tier in('cold','deep_archive') then return result||jsonb_build_object('state','rehydration_required');end if;
 return result||jsonb_build_object('state','canonical_encoded','codec',s.codec,'encoded_hash',s.encoded_hash,'encoded',replace(encode(s.encoded,'base64'),chr(10),''));
end$$;
create function mip_cas.index_put(i uuid,k text,h text,expected bigint,m jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r mip_cas.refs;x mip_cas.indexes;
begin
 perform mip_cas.authorize(i);
 select * into strict r from mip_cas.refs where investigation=i and logical_key=k;
 perform mip_cas.check_source(i,r.provenance);
 if h is distinct from r.hash or jsonb_typeof(m)<>'object' or octet_length(m::text)>16384 or exists(select 1 from jsonb_object_keys(m) key where key not in('summary','entities','claims','timeline','vector_refs')) then raise exception 'mip_cas_index_invalid';end if;
 if exists(select 1 from jsonb_each(m) e where
  (e.key='summary' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>4096)) or
  (e.key<>'summary' and (jsonb_typeof(e.value)<>'array' or jsonb_array_length(case when jsonb_typeof(e.value)='array' then e.value else '[]'::jsonb end)>256 or
   exists(select 1 from jsonb_array_elements(case when jsonb_typeof(e.value)='array' then e.value else '[]'::jsonb end) v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>512)))
 ) then raise exception 'mip_cas_index_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(r.id::text,0));
 select * into x from mip_cas.indexes where ref_id=r.id;
 if coalesce(x.version,0) is distinct from expected then raise exception 'mip_cas_index_version';end if;
 insert into mip_cas.indexes values(r.id,i,h,1,m) on conflict(ref_id) do update set version=mip_cas.indexes.version+1,metadata=excluded.metadata,canonical_hash=excluded.canonical_hash;
 update mip_cas.scope_usage set index_epoch=index_epoch+1 where investigation=i;
end$$;
create function mip_cas.transition(i uuid,k text,expected bigint,target text) returns bigint language plpgsql security definer set search_path='' as $$
declare u uuid;r mip_cas.refs;s mip_cas.representations;p mip_cas.policies;
begin
 u:=mip_cas.authorize(i);p:=mip_cas.policy();
 if target is null or not(target=any(p.tiers)) then raise exception 'mip_cas_tier';end if;
 select * into strict r from mip_cas.refs where investigation=i and logical_key=k;
 perform mip_cas.check_source(i,r.provenance);
 select * into s from mip_cas.representations where hash=r.hash for update;
 if expected is null or s.version<>expected or s.tier=target then raise exception 'mip_cas_transition_conflict';end if;
 -- Physical representation is global, but a user may not change availability for another scope.
 if exists(select 1 from mip_cas.refs where hash=r.hash and investigation<>i) then raise exception 'mip_cas_shared_tier_custodian_required';end if;
 update mip_cas.representations set tier=target,version=version+1,changed_at=clock_timestamp() where hash=r.hash;
 insert into mip_cas.events(hash,prior_version,next_version,old_tier,new_tier,actor) values(r.hash,s.version,s.version+1,s.tier,target,u);
 return s.version+1;
end$$;
create function mip_cas.rehydrate(i uuid,k text,request uuid,expected bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;r mip_cas.refs;s mip_cas.representations;j mip_cas.jobs;p mip_cas.policies;
begin
 u:=mip_cas.authorize(i);p:=mip_cas.policy();
 if request is null then raise exception 'mip_cas_request';end if;
 select * into strict r from mip_cas.refs where investigation=i and logical_key=k;
 perform mip_cas.check_source(i,r.provenance);
 perform pg_advisory_xact_lock(hashtextextended('mip-cas-job:'||u::text,0));
 select * into j from mip_cas.jobs where user_id=u and request_id=request;
 if found then
  if j.ref_id<>r.id or j.expected_version<>expected or j.expires_at<=clock_timestamp() then raise exception 'mip_cas_replay';end if;
  return jsonb_build_object('job_id',j.id,'state',j.state);
 end if;
 if (select count(*) from mip_cas.jobs where user_id=u)>=p.max_jobs then raise exception 'mip_cas_job_quota';end if;
 select * into s from mip_cas.representations where hash=r.hash for update;
 if expected is null or s.version<>expected or s.tier not in('cold','deep_archive') then raise exception 'mip_cas_transition_conflict';end if;
 insert into mip_cas.jobs values(gen_random_uuid(),r.id,u,request,clock_timestamp()+interval '30 seconds',expected,'pending') returning * into j;
 return jsonb_build_object('job_id',j.id,'state',j.state);
end$$;
create function mip_cas.complete(i uuid,k text,job uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid;r mip_cas.refs;j mip_cas.jobs;
begin
 u:=mip_cas.authorize(i);
 select * into strict r from mip_cas.refs where investigation=i and logical_key=k;
 perform mip_cas.check_source(i,r.provenance);
 select * into j from mip_cas.jobs where id=job for update;
 if not found or j.ref_id<>r.id or j.user_id<>u or j.expires_at<=clock_timestamp() then raise exception 'mip_cas_job_denied';end if;
 if j.state='completed' then
  if not exists(select 1 from mip_cas.representations where hash=r.hash and version=j.expected_version+1 and tier='warm') then raise exception 'mip_cas_completed_job_stale';end if;
  return;
 end if;
 perform mip_cas.transition(i,k,j.expected_version,'warm');
 update mip_cas.jobs set state='completed' where id=j.id;
end$$;
create function mip_cas.cleanup(i uuid) returns integer language plpgsql security definer set search_path='' as $$
declare u uuid;n integer;
begin
 u:=mip_cas.authorize(i);
 delete from mip_cas.jobs j using mip_cas.refs r where j.ref_id=r.id and r.investigation=i and j.user_id=u and j.expires_at<=clock_timestamp();
 get diagnostics n=row_count;
 return n;
end$$;
create function mip_cas.guard_representation() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op<>'UPDATE' or (to_jsonb(old)-array['tier','version','changed_at']) is distinct from (to_jsonb(new)-array['tier','version','changed_at']) or new.version<>old.version+1 or new.tier=old.tier or new.changed_at<old.changed_at then raise exception 'mip_cas_representation_immutable';end if;
 return new;
end$$;
create trigger immutable_representation before update or delete on mip_cas.representations for each row execute function mip_cas.guard_representation();
create function mip_cas.locate(i uuid,field_name text,needle text,after_cursor jsonb,page_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare found_rows jsonb;cursor_value jsonb;last_ref uuid;p mip_cas.policies;epoch bigint;query_hash text;
begin
 perform mip_cas.authorize(i);p:=mip_cas.policy();
 if field_name is null or field_name not in('summary','entities','claims','timeline','vector_refs') or needle is null or length(needle) not between 1 and 128 or page_size is null or page_size not between 1 and p.max_page then raise exception 'mip_cas_locator_invalid';end if;
 select index_epoch into epoch from mip_cas.scope_usage where investigation=i for share;
 epoch:=coalesce(epoch,0);
 query_hash:=encode(public.digest(convert_to(jsonb_build_array(i,field_name,needle,page_size)::text,'UTF8'),'sha256'),'hex');
 if after_cursor is not null then
  if jsonb_typeof(after_cursor)<>'object' or (select count(*) from jsonb_object_keys(after_cursor))<>4 or not(after_cursor ?& array['last_ref','query_hash','policy_version','index_epoch']) or after_cursor->>'query_hash' is distinct from query_hash or (after_cursor->>'policy_version')::bigint is distinct from p.version or (after_cursor->>'index_epoch')::bigint is distinct from epoch then raise exception 'mip_cas_cursor_stale_or_ambiguous';end if;
  last_ref:=(after_cursor->>'last_ref')::uuid;
  if last_ref is null or not exists(select 1 from mip_cas.refs where investigation=i and id=last_ref) then raise exception 'mip_cas_cursor_stale_or_ambiguous';end if;
 end if;
 select coalesce(jsonb_agg(row_value order by id),'[]'::jsonb) into found_rows from(
  select r.id,jsonb_build_object('ref_id',r.id,'canonical_hash',r.hash,'source_version',r.provenance->>'source_version','index_hash',x.canonical_hash) row_value
  from mip_cas.indexes x join mip_cas.refs r on r.id=x.ref_id
  where x.investigation=i and r.investigation=i and exists(select 1 from mip_cas.source_permissions sp where sp.investigation=i and sp.source_version=r.provenance->>'source_version' and sp.rights_ref=r.provenance->>'rights_ref' and sp.privacy_ref=r.provenance->>'privacy_ref' and sp.expires_at>clock_timestamp()) and (last_ref is null or x.ref_id>last_ref) and
   (case when field_name='summary' then to_tsvector('simple',coalesce(x.metadata->>'summary','')) @@ plainto_tsquery('simple',needle)
    else x.metadata @> jsonb_build_object(field_name,jsonb_build_array(needle)) end)
  order by r.id limit page_size
 ) bounded;
 if exists(select 1 from jsonb_array_elements(found_rows) e where e->>'index_hash' is distinct from e->>'canonical_hash') then raise exception 'mip_cas_stale_index';end if;
 select coalesce(jsonb_agg(e-'index_hash' order by e->>'ref_id'),'[]'::jsonb) into found_rows from jsonb_array_elements(found_rows) e;
 if jsonb_array_length(found_rows)=page_size then cursor_value:=jsonb_build_object('last_ref',found_rows->(page_size-1)->>'ref_id','query_hash',query_hash,'policy_version',p.version,'index_epoch',epoch);end if;
 return jsonb_build_object('candidates',found_rows,'next_cursor',cursor_value,'policy_version',p.version,'query_hash',query_hash,'index_epoch',epoch,'locator_only',true,'factual_support_qualified',false,'publication_allowed',false);
end$$;
-- Defense-in-depth: every table is owner-only under forced RLS; no client table grants.
do $policies$ declare t record;begin
 for t in select tablename from pg_tables where schemaname='mip_cas' loop
 execute format('alter table mip_cas.%I enable row level security',t.tablename);
 execute format('alter table mip_cas.%I force row level security',t.tablename);
 execute format('create policy owner_only on mip_cas.%I to mip_cas_owner using(true) with check(true)',t.tablename);
 execute format('create trigger immutable_table before truncate on mip_cas.%I for each statement execute function mip_cas.immutable()',t.tablename);
 end loop;
end $policies$;
revoke all on all tables in schema mip_cas from public;
revoke all on all functions in schema mip_cas from public;
grant usage on schema mip_cas to mip_cas_gateway,mip_cas_codec_verifier;
grant execute on function mip_cas.admit(bytea,text,bytea) to mip_cas_codec_verifier;
grant execute on function mip_cas.bind(uuid,text,bytea,jsonb),mip_cas.locate(uuid,text,text,jsonb,integer) to mip_cas_gateway;
grant execute on function mip_cas.put(uuid,text,bytea,text,bytea,jsonb),mip_cas.read(uuid,text,text),mip_cas.index_put(uuid,text,text,bigint,jsonb),mip_cas.transition(uuid,text,bigint,text),mip_cas.rehydrate(uuid,text,uuid,bigint),mip_cas.complete(uuid,text,uuid),mip_cas.cleanup(uuid) to mip_cas_gateway;
reset role;
commit;