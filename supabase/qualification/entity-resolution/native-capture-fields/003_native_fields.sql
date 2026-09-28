-- Explicit successor qualification installation. NOT a deployment migration.
-- Requires the native capture reliability schema and 001_mentions.sql.
-- Optional 002_agency.sql can precede or follow this successor unchanged.
-- No capture data is copied, no membership/access/actor is seeded, no publication.
begin;
set local lock_timeout='5s';
create role mip_mentions_native_validator nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant mip_mentions_native_validator to current_user with set true;
set role mip_mentions_owner;
alter table mip_mentions.fields alter column raw drop not null;
alter table mip_mentions.fields
 add column native_capture_id uuid,
 add column native_job_id uuid,
 add column native_article_id uuid,
 add column native_content_hash text,
 add column native_source_field text,
 add column native_byte_length integer,
 add constraint field_storage_kind check(
  (raw is not null and native_capture_id is null and native_job_id is null and native_article_id is null
    and native_content_hash is null and native_source_field is null and native_byte_length is null)
  or
  (raw is null and native_capture_id is not null and native_job_id is not null and native_article_id is not null
    and native_content_hash is not null and native_content_hash ~ '^[0-9a-f]{64}$'
    and native_source_field is not null and native_source_field in ('title','summary','body_text')
    and native_byte_length is not null and native_byte_length between 0 and 262144
    and source_version='native-capture:'||native_capture_id::text||':'||native_content_hash
    and field_version='native-field:utf8:v1:'||native_source_field||':'||field_hash));
-- Existing hash/UTF8 constraints remain in force for every historical raw row.
-- Native binding metadata shares the existing immutable row/table triggers.
grant usage on schema mip_mentions to mip_mentions_native_validator;
grant select(scope,id,source_version,field_version,field_hash,native_capture_id,native_job_id,
 native_article_id,native_content_hash,native_source_field,native_byte_length)
 on mip_mentions.fields to mip_mentions_native_validator;
grant select(scope,principal) on mip_mentions.members to mip_mentions_native_validator;
create policy native_validator_members on mip_mentions.members for select to mip_mentions_native_validator
 using(principal=session_user);
create policy native_validator_fields on mip_mentions.fields for select to mip_mentions_native_validator
 using(native_capture_id is not null and exists(
  select 1 from mip_mentions.members m where m.scope=fields.scope and m.principal=session_user));
reset role;
-- Only this NOLOGIN, non-member function owner can read the native substrate.
-- Preserve all existing native, service_role and unrelated privileges/policies.
grant usage on schema evidence_pipeline to mip_mentions_native_validator;
grant select(id,article_id,job_id,content_hash,payload) on evidence_pipeline.article_captures to mip_mentions_native_validator;
grant select(id,article_id,input_hash,state) on evidence_pipeline.import_jobs to mip_mentions_native_validator;
create policy mention_native_validator_capture on evidence_pipeline.article_captures for select
 to mip_mentions_native_validator using(true);
create policy mention_native_validator_job on evidence_pipeline.import_jobs for select
 to mip_mentions_native_validator using(true);
set role mip_mentions_owner;
-- Binding validation is independent of a newly inserted fields row. Admission
-- validates first, then inserts metadata; it never needs same-statement row
-- visibility from a STABLE function. Only the owner can propose a binding.
create function mip_mentions.native_binding_bytes(s uuid,cid uuid,jid uuid,aid uuid,ch text,sf text,fh text,n integer,max_bytes integer)
returns bytea language plpgsql stable security definer set search_path='' as $binding$
declare evidence record; bytes bytea;
begin
 if s is null or cid is null or jid is null or aid is null or ch is null or fh is null
  or ch!~'^[0-9a-f]{64}$' or fh!~'^[0-9a-f]{64}$'
  or sf is null or sf not in ('title','summary','body_text') or n is null or n<0 or n>262144
  or max_bytes is null or max_bytes not between 1 and 2097152 or n>max_bytes
  or not exists(select 1 from mip_mentions.members where scope=s and principal=session_user)
 then raise exception 'native source unavailable';end if;
 -- STABLE: metadata callers and this native join share their statement snapshot.
 select c.payload,c.content_hash,c.article_id,c.job_id,j.input_hash,j.article_id job_article,j.state
 into evidence from evidence_pipeline.article_captures c
 join evidence_pipeline.import_jobs j on j.id=c.job_id
 where c.id=cid and c.job_id=jid and c.article_id=aid;
 if not found or evidence.state is distinct from 'completed'
  or evidence.job_article is distinct from aid
  or evidence.content_hash is distinct from ch
  or evidence.input_hash is distinct from ch
  or jsonb_typeof(evidence.payload) is distinct from 'object'
  or octet_length(evidence.payload::text)>262144
  or jsonb_typeof(evidence.payload->sf) is distinct from 'string'
 then raise exception 'native source unavailable';end if;
 bytes:=convert_to(evidence.payload->>sf,'UTF8');
 if octet_length(bytes)<>n or octet_length(bytes)>max_bytes
  or encode(sha256(convert_to(evidence.payload::text,'UTF8')),'hex')<>ch
  or encode(sha256(bytes),'hex')<>fh
 then raise exception 'native source integrity unavailable';end if;
 return bytes;
end $binding$;
create function mip_mentions.resolve_native_field(s uuid,f uuid,max_bytes integer)
returns bytea language plpgsql stable security definer set search_path='' as $resolve$
declare meta record;
begin
 -- Runtime callers never propose a binding: resolve the originally admitted row.
 select source_version,field_version,field_hash,native_capture_id,native_job_id,
  native_article_id,native_content_hash,native_source_field,native_byte_length
 into meta from mip_mentions.fields where scope=s and id=f;
 if not found or meta.native_capture_id is null
  or meta.source_version is distinct from 'native-capture:'||meta.native_capture_id::text||':'||meta.native_content_hash
  or meta.field_version is distinct from 'native-field:utf8:v1:'||meta.native_source_field||':'||meta.field_hash
 then raise exception 'native source unavailable';end if;
 return mip_mentions.native_binding_bytes(s,meta.native_capture_id,meta.native_job_id,
  meta.native_article_id,meta.native_content_hash,meta.native_source_field,meta.field_hash,
  meta.native_byte_length,max_bytes);
end $resolve$;
revoke all on function mip_mentions.resolve_native_field(uuid,uuid,integer),
 mip_mentions.native_binding_bytes(uuid,uuid,uuid,uuid,text,text,text,integer,integer)
 from public,mip_mentions_gateway,mip_mentions_admin;
reset role;
grant create on schema mip_mentions to mip_mentions_native_validator;
alter function mip_mentions.native_binding_bytes(uuid,uuid,uuid,uuid,text,text,text,integer,integer) owner to mip_mentions_native_validator;
alter function mip_mentions.resolve_native_field(uuid,uuid,integer) owner to mip_mentions_native_validator;
revoke create on schema mip_mentions from mip_mentions_native_validator;
grant execute on function mip_mentions.resolve_native_field(uuid,uuid,integer),
 mip_mentions.native_binding_bytes(uuid,uuid,uuid,uuid,text,text,text,integer,integer) to mip_mentions_owner;
set role mip_mentions_owner;

-- Owner-only source admission replaces direct owner INSERT for new native fields.
-- The session principal must already have scope membership. No field access is
-- created. The gateway, collection worker, browser and admin cannot call this.
create function mip_mentions.admit_native_field(s uuid,f uuid,c uuid,j uuid,a uuid,ch text,sf text,fh text,n integer)
returns jsonb language plpgsql set search_path='' as $admit$
declare p mip_mentions.policy; old mip_mentions.fields; sv text; fv text;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 if f is null or c is null or j is null or a is null or ch is null or fh is null
  or ch!~'^[0-9a-f]{64}$' or fh!~'^[0-9a-f]{64}$' or sf is null or sf not in ('title','summary','body_text')
  or n is null or n<0 or n>least(262144,p.max_field_bytes,p.max_total_bytes)
 then raise exception 'native field admission denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('native-field:'||s::text||f::text,0));
 sv:='native-capture:'||c::text||':'||ch;fv:='native-field:utf8:v1:'||sf||':'||fh;
 select * into old from mip_mentions.fields where scope=s and id=f;
 if found then
  if (old.source_version,old.field_version,old.field_hash,old.raw,old.native_capture_id,old.native_job_id,
   old.native_article_id,old.native_content_hash,old.native_source_field,old.native_byte_length)
   is distinct from(sv,fv,fh,null::bytea,c,j,a,ch,sf,n)
  then raise exception 'native field retry conflict';end if;
 end if;
 -- Validate before any INSERT, including exact retries. This helper never
 -- reads fields, avoiding STABLE same-statement INSERT visibility assumptions.
 perform mip_mentions.native_binding_bytes(s,c,j,a,ch,sf,fh,n,p.max_field_bytes);
 if old.id is null then
  insert into mip_mentions.fields(scope,id,source_version,field_version,field_hash,raw,native_capture_id,
   native_job_id,native_article_id,native_content_hash,native_source_field,native_byte_length)
  values(s,f,sv,fv,fh,null,c,j,a,ch,sf,n);
 end if;
 return jsonb_build_object('scope',s,'field_id',f,'source_version',sv,'field_version',fv,'field_hash',fh,
  'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false);
end $admit$;
revoke all on function mip_mentions.admit_native_field(uuid,uuid,uuid,uuid,uuid,text,text,text,integer)
 from public,mip_mentions_gateway,mip_mentions_admin;
create or replace function mip_mentions.check_mentions(s uuid,ids uuid[],p mip_mentions.policy,extra_fields uuid[] default '{}'::uuid[],new_literal text default null) returns jsonb language plpgsql set search_path='' as $$
<<mention_check>>
declare fields uuid[];requested_count integer;actual_count integer;field_count integer;largest bigint;total_bytes bigint;span_bytes bigint;locked_count integer;allowed_count integer;invalid boolean;validated jsonb;
begin
 if ids is null or extra_fields is null or array_position(ids,null) is not null or array_position(extra_fields,null) is not null or
 cardinality(ids)>p.max_context or cardinality(extra_fields)>p.max_fields then raise exception 'operation context budget exceeded';end if;
 select count(distinct q) into requested_count from unnest(ids)q;
 select count(*) into actual_count from mip_mentions.mentions where scope=s and id=any(ids);
 if requested_count<>actual_count then raise exception 'mention unavailable';end if;
 perform 1 from mip_mentions.mentions where scope=s and id=any(ids) order by id for share;
 select coalesce(array_agg(distinct field_id order by field_id),'{}'::uuid[]) into mention_check.fields
 from(select field_id from mip_mentions.mentions where scope=s and id=any(ids)
      union select unnest(extra_fields))all_fields;
 if cardinality(mention_check.fields)>p.max_fields then raise exception 'operation field budget exceeded';end if;
 -- The authorization count is from the EXACT locked row set and statement
 -- snapshot, never a subsequent query that could include an unlocked new grant.
 with locked as materialized(
  select field_id,allowed from mip_mentions.field_access
  where scope=s and field_id=any(mention_check.fields) order by field_id for share)
 select count(*),count(*) filter(where allowed) into locked_count,allowed_count from locked;
 if locked_count<>cardinality(mention_check.fields) or allowed_count<>cardinality(mention_check.fields)
 then raise exception 'source unavailable';end if;
 -- Admission sizes are checked as one aggregate BEFORE hashing/UTF8 decoding.
 select count(*),coalesce(max(coalesce(octet_length(raw),native_byte_length)),0),coalesce(sum(coalesce(octet_length(raw),native_byte_length)),0)
 into field_count,largest,total_bytes from mip_mentions.fields source_fields where source_fields.scope=check_mentions.s and source_fields.id=any(mention_check.fields);
 if field_count<>cardinality(mention_check.fields) or largest>p.max_field_bytes then raise exception 'source integrity unavailable';end if;
 select coalesce(sum(octet_length(literal)),0) into span_bytes from mip_mentions.mentions where scope=s and id=any(ids);
 if total_bytes+span_bytes+coalesce(octet_length(new_literal),0)>p.max_total_bytes then raise exception 'operation byte budget exceeded';end if;
 -- MATERIALIZED resolves each distinct source field once. Decoding and span
 -- validation share that transient result; no source is looked up per mention.
 with resolved as materialized(
  select id,source_version,field_version,field_hash,
   case when raw is not null then raw else mip_mentions.resolve_native_field(scope,id,p.max_field_bytes) end raw
  from mip_mentions.fields source_fields where source_fields.scope=check_mentions.s and source_fields.id=any(mention_check.fields)),
 checked as materialized(
  select id,source_version,field_version,field_hash,convert_from(raw,'UTF8') txt,
   encode(sha256(raw),'hex') actual_hash from resolved)
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
reset role;
revoke mip_mentions_native_validator from current_user;
-- Assert the final effective boundary, after ownership transfer and cleanup.
do $assert$
declare r record; fn regprocedure;
begin
 select * into r from pg_roles where rolname='mip_mentions_native_validator';
 if r.rolcanlogin or r.rolinherit or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
  or exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid)
 then raise exception 'native validator role boundary failed';end if;
 foreach fn in array array[
  'mip_mentions.resolve_native_field(uuid,uuid,integer)'::regprocedure,
  'mip_mentions.native_binding_bytes(uuid,uuid,uuid,uuid,text,text,text,integer,integer)'::regprocedure] loop
 if (select proowner from pg_proc where oid=fn)<>r.oid
  or not (select prosecdef and provolatile='s' and proconfig @> array['search_path=""'] from pg_proc where oid=fn)
  or has_schema_privilege(r.oid,'mip_mentions','CREATE')
  or has_column_privilege(r.oid,'mip_mentions.fields','raw','SELECT')
  or not has_function_privilege('mip_mentions_owner',fn,'EXECUTE')
  or has_function_privilege('mip_mentions_gateway',fn,'EXECUTE')
  or has_function_privilege('mip_mentions_admin',fn,'EXECUTE')
  or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid=fn and a.grantee not in (r.oid,'mip_mentions_owner'::regrole) and a.privilege_type='EXECUTE')
 then raise exception 'native validator function boundary failed';end if;
 end loop;
 if exists(select 1 from pg_class c where c.oid in
   ('evidence_pipeline.article_captures'::regclass,'evidence_pipeline.import_jobs'::regclass)
   and (c.relowner=r.oid or has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    or has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES')))
 then raise exception 'native validator substrate privilege boundary failed';end if;
 if exists(select 1 from pg_class c where c.oid in
   ('mip_mentions.fields'::regclass,'mip_mentions.members'::regclass)
   and (not c.relrowsecurity or not c.relforcerowsecurity))
  or exists(select 1 from pg_class c where c.oid in
   ('evidence_pipeline.article_captures'::regclass,'evidence_pipeline.import_jobs'::regclass)
   and not c.relrowsecurity)
 then raise exception 'native validator RLS boundary failed';end if;
end $assert$;
commit;
