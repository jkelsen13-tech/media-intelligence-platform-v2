-- Disposable PostgreSQL 17 qualification fixture, NOT a deployment migration.
-- No live Supabase/auth/source authority. Session principal is a DB login;
-- no caller-set GUC, JWT metadata, or supplied user UUID authorizes access.
begin;
create role mip_mentions_owner nologin nobypassrls;
create role mip_mentions_gateway nologin nobypassrls;
create role mip_mentions_admin nologin nobypassrls;
create schema mip_mentions authorization mip_mentions_owner;
revoke all on schema mip_mentions from public;
set role mip_mentions_owner;
alter default privileges in schema mip_mentions revoke execute on functions from public;
create table mip_mentions.members(
 scope uuid not null, principal name not null, can_decide boolean not null default false,
 primary key(scope,principal));
create table mip_mentions.policy(
 version integer primary key check(version>0), max_field_bytes integer not null check(max_field_bytes between 1 and 2097152),
 max_page integer not null check(max_page between 1 and 50),
 max_context integer not null check(max_context between 1 and 128),
 max_fields integer not null check(max_fields between 1 and 64),
 max_total_bytes integer not null check(max_total_bytes between 1 and 8388608));
insert into mip_mentions.policy values(1,1048576,20,64,32,2097152);
create table mip_mentions.policy_head(singleton boolean primary key check(singleton),version integer not null references mip_mentions.policy(version));
insert into mip_mentions.policy_head values(true,1);
create table mip_mentions.fields(
 scope uuid not null,id uuid not null,source_version text not null check(length(source_version) between 1 and 256),
 field_version text not null check(length(field_version) between 1 and 256),
 field_hash text not null check(field_hash~'^[0-9a-f]{64}$'),raw bytea not null,
 primary key(scope,id),check(encode(sha256(raw),'hex')=field_hash),
 check(convert_to(convert_from(raw,'UTF8'),'UTF8')=raw));
create table mip_mentions.field_access(
 scope uuid not null,field_id uuid not null,allowed boolean not null,
 primary key(scope,field_id),foreign key(scope,field_id) references mip_mentions.fields(scope,id));
-- Scoped synthetic actor stubs, not the later canonical actor-revision service.
-- Labels are deliberately NOT unique and never establish identity.
create table mip_mentions.actors(scope uuid not null,id uuid not null,label text not null check(length(label) between 1 and 256),primary key(scope,id));
create table mip_mentions.mentions(
 scope uuid not null,id uuid not null,field_id uuid not null,source_version text not null,field_version text not null,
 field_hash text not null,offset_unit text not null check(offset_unit='unicode_code_point'),
 start_pos integer not null check(start_pos>=0),end_pos integer not null check(end_pos>start_pos),
 literal text not null,span_hash text not null check(span_hash~'^[0-9a-f]{64}$'),
 speaker jsonb,addressee jsonb,
 check (speaker is null or speaker='null'::jsonb or (jsonb_typeof(speaker)='object' and (speaker-array['kind','id'])='{}'::jsonb and speaker ?& array['kind','id'] and ((speaker->>'kind'='unresolved' and speaker->'id'='null'::jsonb) or (speaker->>'kind'='mention' and jsonb_typeof(speaker->'id')='string' and speaker->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')))),
 check (addressee is null or addressee='null'::jsonb or (jsonb_typeof(addressee)='object' and (addressee-array['kind','id'])='{}'::jsonb and addressee ?& array['kind','id'] and ((addressee->>'kind'='unresolved' and addressee->'id'='null'::jsonb) or (addressee->>'kind'='mention' and jsonb_typeof(addressee->'id')='string' and addressee->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')))),
 created_at timestamptz not null default clock_timestamp(),
 primary key(scope,id),foreign key(scope,field_id) references mip_mentions.fields(scope,id));
create unique index mention_physical_occurrence on mip_mentions.mentions(scope,field_id,offset_unit,start_pos,end_pos);
create index mentions_field_page on mip_mentions.mentions(scope,field_id,id);
create table mip_mentions.participant_annotations(
 scope uuid not null,mention_id uuid not null,id uuid not null,version integer not null check(version>0),predecessor_id uuid,
 speaker jsonb,addressee jsonb,
 check (speaker is null or speaker='null'::jsonb or (jsonb_typeof(speaker)='object' and (speaker-array['kind','id'])='{}'::jsonb and speaker ?& array['kind','id'] and ((speaker->>'kind'='unresolved' and speaker->'id'='null'::jsonb) or (speaker->>'kind'='mention' and jsonb_typeof(speaker->'id')='string' and speaker->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')))),
 check (addressee is null or addressee='null'::jsonb or (jsonb_typeof(addressee)='object' and (addressee-array['kind','id'])='{}'::jsonb and addressee ?& array['kind','id'] and ((addressee->>'kind'='unresolved' and addressee->'id'='null'::jsonb) or (addressee->>'kind'='mention' and jsonb_typeof(addressee->'id')='string' and addressee->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')))),
 reason text not null check(length(btrim(reason)) between 1 and 4096),
 principal name not null,created_at timestamptz not null default clock_timestamp(),
 primary key(scope,id),unique(scope,mention_id,version),
 foreign key(scope,mention_id) references mip_mentions.mentions(scope,id),
 foreign key(scope,predecessor_id) references mip_mentions.participant_annotations(scope,id));
create index participant_annotation_head on mip_mentions.participant_annotations(scope,mention_id,version desc);
create table mip_mentions.candidates(
 scope uuid not null,mention_id uuid not null,id uuid not null,actor_id uuid not null,
 version integer not null check(version>0),predecessor_id uuid,
 rank integer not null check(rank between 1 and 1000000),
 supporting_mentions uuid[] not null,conflicting_mentions uuid[] not null,
 method text not null check(length(btrim(method)) between 1 and 256),
 position bigint not null check(position>0),
 unique(scope,mention_id,position),
 primary key(scope,id),unique(scope,mention_id,actor_id,version),
 foreign key(scope,mention_id) references mip_mentions.mentions(scope,id),
 foreign key(scope,actor_id) references mip_mentions.actors(scope,id),
 foreign key(scope,predecessor_id) references mip_mentions.candidates(scope,id),
 check(cardinality(supporting_mentions)<=64 and cardinality(conflicting_mentions)<=64));
create index candidate_actor_head on mip_mentions.candidates(scope,mention_id,actor_id,version desc);
create index candidate_page on mip_mentions.candidates(scope,mention_id,position);
create table mip_mentions.decisions(
 scope uuid not null,mention_id uuid not null,id uuid not null,version integer not null check(version>0),
 predecessor_id uuid,status text not null check(status in('unresolved','rejected','accepted')),
 candidate_id uuid,candidate_ceiling bigint not null check(candidate_ceiling>=0),reason text not null check(length(btrim(reason)) between 1 and 4096),
 principal name not null,created_at timestamptz not null default clock_timestamp(),
 primary key(scope,id),unique(scope,mention_id,version),
 foreign key(scope,mention_id) references mip_mentions.mentions(scope,id),
 foreign key(scope,predecessor_id) references mip_mentions.decisions(scope,id),
 foreign key(scope,candidate_id) references mip_mentions.candidates(scope,id),
 check((status='accepted' and candidate_id is not null) or(status<>'accepted' and candidate_id is null)));
create index decision_head on mip_mentions.decisions(scope,mention_id,version desc);
create function mip_mentions.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable evidence or decision'; end $$;
do $ddl$
declare t text;
begin
 foreach t in array array['members','policy','policy_head','fields','field_access','actors','mentions','participant_annotations','candidates','decisions'] loop
  execute format('alter table mip_mentions.%I enable row level security',t);
  execute format('alter table mip_mentions.%I force row level security',t);
  if t in ('members','policy','policy_head') then
   execute format('create policy owner_internal on mip_mentions.%I to mip_mentions_owner using(true) with check(true)',t);
  else
   execute format('create policy owner_scoped on mip_mentions.%I to mip_mentions_owner using(exists(select 1 from mip_mentions.members g where g.scope=%I.scope and g.principal=session_user)) with check(exists(select 1 from mip_mentions.members g where g.scope=%I.scope and g.principal=session_user))',t,t,t);
  end if;
 end loop;
 foreach t in array array['policy','fields','actors','mentions','participant_annotations','candidates','decisions'] loop
  execute format('create trigger immutable_rows before update or delete on mip_mentions.%I for each row execute function mip_mentions.immutable()',t);
  execute format('create trigger immutable_table before truncate on mip_mentions.%I for each statement execute function mip_mentions.immutable()',t);
 end loop;
end $ddl$;
-- Only the narrow admin functions below may use this access-row policy.
create policy owner_admin_access on mip_mentions.field_access to mip_mentions_owner
 using(pg_has_role(session_user,'mip_mentions_admin','member'))
 with check(pg_has_role(session_user,'mip_mentions_admin','member'));
-- Global lock order: policy_head SHARE -> membership SHARE -> mention advisory
-- -> all relevant field_access rows SHARE in field UUID order. Policy activation
-- takes policy_head UPDATE. Every operation reuses the returned immutable row.
create function mip_mentions.lock_policy() returns mip_mentions.policy language plpgsql set search_path='' as $$
declare v integer;p mip_mentions.policy;
begin
 select version into v from mip_mentions.policy_head where singleton for share;
 select * into p from mip_mentions.policy where version=v;
 if not found then raise exception 'policy unavailable';end if;return p;
end $$;
create function mip_mentions.activate_policy(v integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not pg_has_role(session_user,'mip_mentions_admin','member') then raise exception 'admin contract denied';end if;
 perform 1 from mip_mentions.policy_head where singleton for update;
 if not exists(select 1 from mip_mentions.policy where version=v) then raise exception 'policy unavailable';end if;
 update mip_mentions.policy_head set version=v where singleton;
end $$;
-- The ONLY qualified operational admin contract. All admin changes take the
-- policy-head EXCLUSIVE row lock before touching membership/source access.
-- Raw superuser/owner DML is outside this concurrency/security qualification.
create function mip_mentions.set_membership(s uuid,who name,review boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not pg_has_role(session_user,'mip_mentions_admin','member') then raise exception 'admin contract denied';end if;
 perform 1 from mip_mentions.policy_head where singleton for update;
 if s is null or who is null then raise exception 'invalid membership';end if;
 if review is null then delete from mip_mentions.members where scope=s and principal=who;
 else insert into mip_mentions.members(scope,principal,can_decide) values(s,who,review)
 on conflict(scope,principal) do update set can_decide=excluded.can_decide;end if;
end $$;
create function mip_mentions.set_field_access(s uuid,f uuid,allow_read boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not pg_has_role(session_user,'mip_mentions_admin','member') then raise exception 'admin contract denied';end if;
 perform 1 from mip_mentions.policy_head where singleton for update;
 if s is null or f is null then raise exception 'invalid field access';end if;
 if allow_read is null then delete from mip_mentions.field_access where scope=s and field_id=f;
 else insert into mip_mentions.field_access(scope,field_id,allowed) values(s,f,allow_read)
 on conflict(scope,field_id) do update set allowed=excluded.allowed;end if;
end $$;
create function mip_mentions.authorize(s uuid,review boolean default false) returns void language plpgsql set search_path='' as $$
declare r mip_mentions.members;
begin
 if s is null then raise exception 'missing scope';end if;
 select * into r from mip_mentions.members where scope=s and principal=session_user for share;
 if not found or(review and not r.can_decide) then raise exception 'scope access denied';end if;
end $$;
-- One grouped validator for every operation. Extra fields are only for admitting
-- a new physical mention; existing mention rows always lock BEFORE any fields.
create function mip_mentions.check_mentions(s uuid,ids uuid[],p mip_mentions.policy,extra_fields uuid[] default '{}'::uuid[],new_literal text default null) returns jsonb language plpgsql set search_path='' as $$
declare fields uuid[];requested_count integer;actual_count integer;field_count integer;largest bigint;total_bytes bigint;span_bytes bigint;locked_count integer;allowed_count integer;invalid boolean;validated jsonb;
begin
 if ids is null or extra_fields is null or array_position(ids,null) is not null or array_position(extra_fields,null) is not null or
 cardinality(ids)>p.max_context or cardinality(extra_fields)>p.max_fields then raise exception 'operation context budget exceeded';end if;
 select count(distinct q) into requested_count from unnest(ids)q;
 select count(*) into actual_count from mip_mentions.mentions where scope=s and id=any(ids);
 if requested_count<>actual_count then raise exception 'mention unavailable';end if;
 perform 1 from mip_mentions.mentions where scope=s and id=any(ids) order by id for share;
 select coalesce(array_agg(distinct field_id order by field_id),'{}'::uuid[]) into fields
 from(select field_id from mip_mentions.mentions where scope=s and id=any(ids)
      union select unnest(extra_fields))all_fields;
 if cardinality(fields)>p.max_fields then raise exception 'operation field budget exceeded';end if;
 -- The authorization count is from the EXACT locked row set and statement
 -- snapshot, never a subsequent query that could include an unlocked new grant.
 with locked as materialized(
  select field_id,allowed from mip_mentions.field_access
  where scope=s and field_id=any(fields) order by field_id for share)
 select count(*),count(*) filter(where allowed) into locked_count,allowed_count from locked;
 if locked_count<>cardinality(fields) or allowed_count<>cardinality(fields)
 then raise exception 'source unavailable';end if;
 -- Admission sizes are checked as one aggregate BEFORE hashing/UTF8 decoding.
 select count(*),coalesce(max(octet_length(raw)),0),coalesce(sum(octet_length(raw)),0)
 into field_count,largest,total_bytes from mip_mentions.fields where scope=s and id=any(fields);
 if field_count<>cardinality(fields) or largest>p.max_field_bytes then raise exception 'source integrity unavailable';end if;
 select coalesce(sum(octet_length(literal)),0) into span_bytes from mip_mentions.mentions where scope=s and id=any(ids);
 if total_bytes+span_bytes+coalesce(octet_length(new_literal),0)>p.max_total_bytes then raise exception 'operation byte budget exceeded';end if;
 -- MATERIALIZED decodes and hashes each distinct source field once, not one
 -- roundtrip/query/hash per mention. Both fields and spans are checked in bulk.
 with checked as materialized(
  select id,source_version,field_version,field_hash,convert_from(raw,'UTF8') txt,
   encode(sha256(raw),'hex') actual_hash from mip_mentions.fields where scope=s and id=any(fields))
 select exists(
  select 1 from checked where field_hash<>actual_hash
  union all
  select 1 from mip_mentions.mentions r join checked f on f.id=r.field_id
   where r.scope=s and r.id=any(ids) and (r.source_version<>f.source_version or r.field_version<>f.field_version or r.field_hash<>f.field_hash or
    r.end_pos>char_length(f.txt) or substring(f.txt from r.start_pos+1 for r.end_pos-r.start_pos)<>r.literal or
    encode(sha256(convert_to(r.literal,'UTF8')),'hex')<>r.span_hash)),
  (select coalesce(jsonb_object_agg(id,jsonb_build_object('source_version',source_version,'field_version',field_version,'field_hash',field_hash,'text',txt)),'{}'::jsonb)
   from checked where id=any(extra_fields))
 into invalid,validated;
 if invalid then raise exception 'mention integrity unavailable';end if;
 return validated;
end $$;
-- References are source/coreference locators only. No direct actor attachment.
create function mip_mentions.participant_locator(s uuid,r jsonb) returns uuid language plpgsql set search_path='' as $$
declare i uuid;
begin
 if r is null or r='null'::jsonb then return null;end if;
 if jsonb_typeof(r)<>'object' or (select count(*) from jsonb_object_keys(r))<>2 or not(r?'kind' and r?'id') then raise exception 'invalid participant locator';end if;
 if r->>'kind'='unresolved' and r->'id'='null'::jsonb then return null;end if;
 if r->>'kind' is distinct from 'mention' then raise exception 'direct actor attribution denied';end if;
 i:=(r->>'id')::uuid;
 if i is null or not exists(select 1 from mip_mentions.mentions where scope=s and id=i) then raise exception 'participant locator unavailable';end if;
 return i;
end $$;
create function mip_mentions.put_mention(s uuid,i uuid,fid uuid,sv text,fv text,fh text,u text,a integer,b integer,l text,sp jsonb,ad jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;validated jsonb;f jsonb;old mip_mentions.mentions;txt text;sh text;refs uuid[];
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 if i is null then raise exception 'invalid mention identity';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||i::text,0));
 refs:=array_remove(array[mip_mentions.participant_locator(s,sp),mip_mentions.participant_locator(s,ad)],null);
 validated:=mip_mentions.check_mentions(s,refs,p,array[fid],l);f:=validated->(fid::text);txt:=f->>'text';
 if sv is distinct from (f->>'source_version') or fv is distinct from (f->>'field_version') or fh is distinct from (f->>'field_hash') or
 u is distinct from 'unicode_code_point' or a is null or b is null or a<0 or b<=a or b>char_length(txt) or
 l is distinct from substring(txt from a+1 for b-a) then raise exception 'exact mention denied';end if;
 sh:=encode(sha256(convert_to(l,'UTF8')),'hex');
 select * into old from mip_mentions.mentions where scope=s and id=i;
 if found then
  if (old.field_id,old.source_version,old.field_version,old.field_hash,old.offset_unit,old.start_pos,old.end_pos,old.literal,old.speaker,old.addressee)
   is distinct from(fid,sv,fv,fh,u,a,b,l,sp,ad) then raise exception 'mention retry conflict';end if;
 else
  insert into mip_mentions.mentions(scope,id,field_id,source_version,field_version,field_hash,offset_unit,start_pos,end_pos,literal,span_hash,speaker,addressee)
  values(s,i,fid,sv,fv,fh,u,a,b,l,sh,sp,ad);
 end if;
 return jsonb_build_object('scope',s,'mention_id',i,'span_hash',sh,'policy_version',p.version,
 'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $$;
create function mip_mentions.put_candidate(s uuid,i uuid,m uuid,actor uuid,v integer,prev uuid,r integer,support uuid[],conflict uuid[],method_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;h mip_mentions.candidates;old mip_mentions.candidates;ordinal bigint;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 if i is null or m is null or actor is null or v is null or r is null or support is null or conflict is null or
 cardinality(support)>64 or cardinality(conflict)>64 or array_position(support,null) is not null or array_position(conflict,null) is not null or
 cardinality(support)<>(select count(distinct q) from unnest(support)q) or
 cardinality(conflict)<>(select count(distinct q) from unnest(conflict)q) or support&&conflict then raise exception 'invalid candidate evidence';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||m::text,0));
 perform mip_mentions.check_mentions(s,array[m]||support||conflict,p);
 select * into old from mip_mentions.candidates where scope=s and id=i;
 if found then
  if (old.mention_id,old.actor_id,old.version,old.predecessor_id,old.rank,old.supporting_mentions,old.conflicting_mentions,old.method)
   is distinct from(m,actor,v,prev,r,support,conflict,method_name) then raise exception 'candidate retry conflict';end if;
  ordinal:=old.position;
 else
  select * into h from mip_mentions.candidates where scope=s and mention_id=m and actor_id=actor order by version desc limit 1;
  if v<>coalesce(h.version,0)+1 or prev is distinct from h.id then raise exception 'candidate predecessor conflict';end if;
  select coalesce(max(position),0)+1 into ordinal from mip_mentions.candidates where scope=s and mention_id=m;
  insert into mip_mentions.candidates(scope,id,mention_id,actor_id,version,predecessor_id,rank,supporting_mentions,conflicting_mentions,method,position)
  values(s,i,m,actor,v,prev,r,support,conflict,method_name,ordinal);
 end if;
 return jsonb_build_object('scope',s,'candidate_id',i,'policy_version',p.version,'identity_accepted',false,
 'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $$;
create function mip_mentions.decide(s uuid,i uuid,m uuid,v integer,prev uuid,st text,cid uuid,why text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;h mip_mentions.decisions;old mip_mentions.decisions;c mip_mentions.candidates;current_candidate uuid;ceiling_value bigint;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s,true);
 if i is null or m is null or v is null or st is null or why is null then raise exception 'invalid decision';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||m::text,0));
 if st='accepted' then
  select * into c from mip_mentions.candidates where scope=s and id=cid and mention_id=m;
  if not found or cardinality(c.supporting_mentions)=0 then raise exception 'exact supporting context required';end if;
  select id into current_candidate from mip_mentions.candidates where scope=s and mention_id=m and actor_id=c.actor_id order by version desc limit 1;
  if current_candidate is distinct from cid then raise exception 'stale candidate denied';end if;
  perform mip_mentions.check_mentions(s,array[m]||c.supporting_mentions||c.conflicting_mentions,p);
 else perform mip_mentions.check_mentions(s,array[m],p);
 end if;
 select coalesce(max(position),0) into ceiling_value from mip_mentions.candidates where scope=s and mention_id=m;
 select * into old from mip_mentions.decisions where scope=s and id=i;
 if found then
  if (old.mention_id,old.version,old.predecessor_id,old.status,old.candidate_id,old.reason,old.principal)
   is distinct from(m,v,prev,st,cid,why,session_user) then raise exception 'decision retry conflict';end if;
 else
  select * into h from mip_mentions.decisions where scope=s and mention_id=m order by version desc limit 1;
  if v<>coalesce(h.version,0)+1 or prev is distinct from h.id then raise exception 'decision predecessor conflict';end if;
  insert into mip_mentions.decisions(scope,id,mention_id,version,predecessor_id,status,candidate_id,candidate_ceiling,reason,principal)
  values(s,i,m,v,prev,st,cid,ceiling_value,why,session_user);
 end if;
 return jsonb_build_object('scope',s,'decision_id',i,'version',v,'status',st,'policy_version',p.version,
 'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $$;
-- An actor projection is a separate reviewed attribution, never source text.
-- Require the exact current accepted decision AND unchanged candidate set.
create function mip_mentions.resolved_actor(s uuid,m uuid,expected_decision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;d mip_mentions.decisions;c mip_mentions.candidates;head_id uuid;ceiling_value bigint;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 if m is null or expected_decision is null then raise exception 'exact decision required';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||m::text,0));
 select * into d from mip_mentions.decisions where scope=s and mention_id=m order by version desc limit 1;
 if not found or d.id<>expected_decision or d.status<>'accepted' then raise exception 'current accepted decision unavailable';end if;
 select * into c from mip_mentions.candidates where scope=s and id=d.candidate_id and mention_id=m;
 select id into head_id from mip_mentions.candidates where scope=s and mention_id=m and actor_id=c.actor_id order by version desc limit 1;
 select coalesce(max(position),0) into ceiling_value from mip_mentions.candidates where scope=s and mention_id=m;
 if head_id is distinct from c.id or ceiling_value<>d.candidate_ceiling then raise exception 'stale attribution unavailable';end if;
 perform mip_mentions.check_mentions(s,array[m]||c.supporting_mentions||c.conflicting_mentions,p);
 return jsonb_build_object('scope',s,'mention_id',m,'actor_id',c.actor_id,'decision_id',d.id,'decision_version',d.version,'candidate_id',c.id,'policy_version',p.version,
 'attribution_kind','reviewed_interpretation','production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $$;
create function mip_mentions.candidate_page(s uuid,m uuid,n integer,cursor_value jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;rows jsonb;after_pos bigint:=0;page_ids uuid[];context_ids uuid[];context_count integer;next_cursor jsonb;last_id uuid;last_pos bigint;cursor_id uuid;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 if m is null or n is null or n<1 or n>p.max_page then raise exception 'invalid page';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||m::text,0));
 if cursor_value is not null then
  if jsonb_typeof(cursor_value)<>'object' or (select count(*) from jsonb_object_keys(cursor_value))<>4 or
   not(cursor_value ?& array['scope','mention_id','policy_version','after_candidate']) or
   cursor_value->>'scope' is distinct from s::text or cursor_value->>'mention_id' is distinct from m::text or
   (cursor_value->>'policy_version')::integer is distinct from p.version then raise exception 'cursor binding denied';end if;
  cursor_id:=(cursor_value->>'after_candidate')::uuid;
  select position into after_pos from mip_mentions.candidates where scope=s and mention_id=m and id=cursor_id;
  if not found then raise exception 'cursor binding denied';end if;
 end if;
 -- Index keyset, <=n+1 rows only. No max/count/high-water query over candidates.
 select coalesce(array_agg(id order by position),'{}'::uuid[]) into page_ids
 from(select id,position from mip_mentions.candidates where scope=s and mention_id=m and position>after_pos order by position limit n+1)page_rows;
 -- Cursor row context must remain currently authorized too; it cannot be used
 -- as a capability to step around revoked evidence. No skipped-row scanning.
 select coalesce(sum(cardinality(supporting_mentions)+cardinality(conflicting_mentions)),0)+1 into context_count
 from mip_mentions.candidates where scope=s and id=any(page_ids||array_remove(array[cursor_id],null));
 if context_count>p.max_context then raise exception 'operation context budget exceeded';end if;
 select coalesce(array_agg(distinct context_id order by context_id),'{}'::uuid[]) into context_ids
 from mip_mentions.candidates c cross join lateral unnest(c.supporting_mentions||c.conflicting_mentions)refs(context_id)
 where c.scope=s and c.id=any(page_ids||array_remove(array[cursor_id],null));
 perform mip_mentions.check_mentions(s,array[m]||context_ids,p);
 select coalesce(jsonb_agg(jsonb_build_object('candidate_id',id,'actor_id',actor_id,'version',version,'rank',rank) order by position),'[]'::jsonb)
 into rows from(select * from mip_mentions.candidates where scope=s and id=any(page_ids) order by position limit n)visible_rows;
 if cardinality(page_ids)>n then
  select id,position into last_id,last_pos from mip_mentions.candidates where scope=s and id=any(page_ids) order by position offset n-1 limit 1;
  next_cursor:=jsonb_build_object('scope',s,'mention_id',m,'policy_version',p.version,'after_candidate',last_id);
 end if;
 return jsonb_build_object('scope',s,'mention_id',m,'policy_version',p.version,'items',rows,'cursor',next_cursor,
 'locator_only',true,'identity_accepted',false,'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $$;
create function mip_mentions.annotate_participants(s uuid,i uuid,m uuid,v integer,prev uuid,sp jsonb,ad jsonb,why text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;h mip_mentions.participant_annotations;old mip_mentions.participant_annotations;refs uuid[];
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s,true);
 if i is null or m is null or v is null or why is null then raise exception 'invalid annotation';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||m::text,0));
 refs:=array_remove(array[mip_mentions.participant_locator(s,sp),mip_mentions.participant_locator(s,ad)],null);
 perform mip_mentions.check_mentions(s,array[m]||refs,p);
 select * into old from mip_mentions.participant_annotations where scope=s and id=i;
 if found then
  if (old.mention_id,old.version,old.predecessor_id,old.speaker,old.addressee,old.reason,old.principal)
   is distinct from(m,v,prev,sp,ad,why,session_user) then raise exception 'annotation retry conflict';end if;
 else
  select * into h from mip_mentions.participant_annotations where scope=s and mention_id=m order by version desc limit 1;
  if v<>coalesce(h.version,0)+1 or prev is distinct from h.id then raise exception 'annotation predecessor conflict';end if;
  insert into mip_mentions.participant_annotations(scope,id,mention_id,version,predecessor_id,speaker,addressee,reason,principal,created_at)
  values(s,i,m,v,prev,sp,ad,why,session_user,clock_timestamp()) returning * into old;
 end if;
 return jsonb_build_object('scope',s,'annotation_id',i,'version',v,'principal',old.principal,'created_at',old.created_at,'policy_version',p.version,'attribution_kind','locator_annotation',
 'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $$;
create function mip_mentions.read_mention(s uuid,i uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;m mip_mentions.mentions;refs uuid[];annotation mip_mentions.participant_annotations;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 if i is null then raise exception 'invalid mention identity';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||i::text,0));
 select * into m from mip_mentions.mentions where scope=s and id=i;
 if not found then raise exception 'mention unavailable';end if;
 refs:=array_remove(array[mip_mentions.participant_locator(s,m.speaker),mip_mentions.participant_locator(s,m.addressee)],null);
 select * into annotation from mip_mentions.participant_annotations where scope=s and mention_id=i order by version desc limit 1;
 if found then refs:=refs||array_remove(array[mip_mentions.participant_locator(s,annotation.speaker),mip_mentions.participant_locator(s,annotation.addressee)],null);end if;
 perform mip_mentions.check_mentions(s,array[i]||refs,p);
 return jsonb_build_object('mention',to_jsonb(m),'participant_annotation',case when annotation.id is null then null else to_jsonb(annotation) end,'policy_version',p.version,
 'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $$;
revoke all on all tables in schema mip_mentions from public,mip_mentions_gateway,mip_mentions_admin;
revoke all on all sequences in schema mip_mentions from public,mip_mentions_gateway,mip_mentions_admin;
revoke all on all functions in schema mip_mentions from public,mip_mentions_gateway,mip_mentions_admin;
grant usage on schema mip_mentions to mip_mentions_gateway,mip_mentions_admin;
grant execute on function mip_mentions.activate_policy(integer),mip_mentions.set_membership(uuid,name,boolean),
 mip_mentions.set_field_access(uuid,uuid,boolean) to mip_mentions_admin;
grant execute on function mip_mentions.put_mention(uuid,uuid,uuid,text,text,text,text,integer,integer,text,jsonb,jsonb),
 mip_mentions.put_candidate(uuid,uuid,uuid,uuid,integer,uuid,integer,uuid[],uuid[],text),
 mip_mentions.decide(uuid,uuid,uuid,integer,uuid,text,uuid,text),mip_mentions.resolved_actor(uuid,uuid,uuid),
 mip_mentions.annotate_participants(uuid,uuid,uuid,integer,uuid,jsonb,jsonb,text),
 mip_mentions.candidate_page(uuid,uuid,integer,jsonb),mip_mentions.read_mention(uuid,uuid) to mip_mentions_gateway;
reset role;
commit;
