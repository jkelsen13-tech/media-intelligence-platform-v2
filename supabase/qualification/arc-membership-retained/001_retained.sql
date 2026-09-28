-- Explicit historical-public qualification successor; NOT deployment.
-- Requires the six recovered public scorer input tables, not native 003.
begin;
set local lock_timeout='5s';
create role mip_arc_retained_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role mip_arc_retained_reader nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant mip_arc_retained_owner to current_user with set true;
create schema mip_arc_retained authorization mip_arc_retained_owner;
revoke all on schema mip_arc_retained from public;
grant usage on schema public to mip_arc_retained_owner;
grant select(id,article_id,arc_id,state,updated_at) on public.arc_membership_candidates to mip_arc_retained_owner;
grant select(id,title,summary,started_at,last_update_at) on public.story_arcs to mip_arc_retained_owner;
grant select(id,title,summary,published_at,outlet,arc_id) on public.articles to mip_arc_retained_owner;
grant select(article_id,entity_id,confidence) on public.article_entities to mip_arc_retained_owner;
grant select(key,value) on public.pipeline_config to mip_arc_retained_owner;
grant select(model_version,fixture_passed,auto_approval_enabled,auto_approval_threshold)
 on public.arc_membership_release_policy to mip_arc_retained_owner;
set role mip_arc_retained_owner;
-- Explicit function ACL revocation below is required: a schema-scoped
-- default-privilege REVOKE cannot subtract global default PUBLIC EXECUTE.
create table mip_arc_retained.access(
 scope uuid not null,principal name not null,allowed boolean not null,
 primary key(scope,principal));
create table mip_arc_retained.inputs(
 scope uuid not null,generation uuid not null,input_sha256 text not null check(input_sha256~'^[0-9a-f]{64}$'),
 canonical_input text not null check(octet_length(canonical_input)<=8388608),
 admitted_by name not null default session_user,
 primary key(scope,generation),
 check(encode(sha256(convert_to(canonical_input,'UTF8')),'hex')=input_sha256));
-- ACL is mutable owner-controlled authority, never copied into immutable inputs.
-- Holding the actual ACL row SHARE serializes revocation through UPDATE/DELETE.
create function mip_arc_retained.authorize(s uuid) returns void language plpgsql set search_path='' as $$
declare permitted boolean;
begin
 select allowed into permitted from mip_arc_retained.access
 where scope=s and principal=session_user for share;
 if permitted is distinct from true then raise exception 'arc_retained_access_denied';end if;
end $$;
create function mip_arc_retained.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'arc_retained_immutable';end $$;
create trigger immutable_rows before update or delete on mip_arc_retained.inputs
 for each row execute function mip_arc_retained.immutable();
create trigger immutable_table before truncate on mip_arc_retained.inputs
 for each statement execute function mip_arc_retained.immutable();
alter table mip_arc_retained.access enable row level security;
alter table mip_arc_retained.access force row level security;
create policy owner_access on mip_arc_retained.access to mip_arc_retained_owner using(true) with check(true);
alter table mip_arc_retained.inputs enable row level security;
alter table mip_arc_retained.inputs force row level security;
create policy owner_inputs on mip_arc_retained.inputs to mip_arc_retained_owner
 using(exists(select 1 from mip_arc_retained.access a where a.scope=inputs.scope and a.principal=session_user and a.allowed))
 with check(exists(select 1 from mip_arc_retained.access a where a.scope=inputs.scope and a.principal=session_user and a.allowed));

create function mip_arc_retained.exact_keys(j jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(j)='object' and (j-k)='{}'::jsonb and j ?& k
$$;

-- No silent RLS-filtered "complete" contexts: this qualification supports only
-- source relations with RLS disabled and all required projected SELECT grants.
-- A hosted RLS-enabled source needs a separately reviewed authoritative reader.
create function mip_arc_retained.assert_source_authority() returns void language plpgsql set search_path='' as $authority$
declare item record;col text;
begin
 if current_user<>'mip_arc_retained_owner' then raise exception 'arc_retained_source_authority';end if;
 -- Projection-only zero-row reads acquire ACCESS SHARE without requiring
 -- broad table SELECT beyond the explicitly granted columns.
 perform id from public.arc_membership_candidates where false;
 perform id from public.story_arcs where false;
 perform id from public.articles where false;
 perform article_id from public.article_entities where false;
 perform key from public.pipeline_config where false;
 perform model_version from public.arc_membership_release_policy where false;
 for item in select * from (values
 ('public.arc_membership_candidates','id,article_id,arc_id,state,updated_at'),
 ('public.story_arcs','id,title,summary,started_at,last_update_at'),
 ('public.articles','id,title,summary,published_at,outlet,arc_id'),
 ('public.article_entities','article_id,entity_id,confidence'),
 ('public.pipeline_config','key,value'),
 ('public.arc_membership_release_policy','model_version,fixture_passed,auto_approval_enabled,auto_approval_threshold')
 ) v(relation_name,columns) loop
  if (select relrowsecurity or relkind<>'r' from pg_class where oid=item.relation_name::regclass)
   then raise exception 'arc_retained_source_authority';end if;
  foreach col in array string_to_array(item.columns,',') loop
   if not has_column_privilege(current_user,item.relation_name,col,'SELECT')
    then raise exception 'arc_retained_source_authority';end if;
  end loop;
 end loop;
exception when others then raise exception 'arc_retained_source_authority' using errcode='P0001';
end $authority$;

create function mip_arc_retained.admit_input(s uuid,g uuid,h text,encoded text)
returns void language plpgsql set search_path='' as $$
declare j jsonb;bound_row jsonb;old record;n integer;admission_stage text:='identity';
begin
 if current_user<>'mip_arc_retained_owner' or current_setting('transaction_isolation')<>'repeatable read'
  or s is null or g is null or h is null or h!~'^[0-9a-f]{64}$' or encoded is null
  or octet_length(encoded)>8388608
 then raise exception 'arc_retained_admission_denied';end if;
 admission_stage:='authorization';
 perform mip_arc_retained.authorize(s);
 perform mip_arc_retained.assert_source_authority();
 admission_stage:='hash';
 if encode(sha256(convert_to(encoded,'UTF8')),'hex')<>h then raise exception 'arc_retained_integrity';end if;
 admission_stage:='shape';
 j:=encoded::jsonb;
 if not mip_arc_retained.exact_keys(j,array['version','source_kind','scorer','scorer_blob','candidates','arcs','articles','members','entities','floor','release','audit'])
  or j->>'version' is distinct from 'arc-membership-consumed-input-v1' or j->>'source_kind' is distinct from 'historical_public'
  or j->>'scorer' is distinct from 'arc-v1-membership-2026-08-23.2'
  or j->>'scorer_blob' is distinct from '08ce23092cfbbe8dcb7eb7c26cf6e3943e177531'
  then raise exception 'arc_retained_shape';end if;
 if jsonb_typeof(j->'candidates')<>'array' or jsonb_array_length(j->'candidates') not between 1 and 64
  or jsonb_typeof(j->'arcs')<>'array' or jsonb_array_length(j->'arcs') not between 1 and 64
  or jsonb_typeof(j->'articles')<>'array' or jsonb_array_length(j->'articles') not between 1 and 8256
  or jsonb_typeof(j->'members')<>'array' or jsonb_array_length(j->'members')>8192
  or jsonb_typeof(j->'entities')<>'array' or jsonb_array_length(j->'entities')>65536
  or not mip_arc_retained.exact_keys(j->'floor',array['present','value'])
  or not mip_arc_retained.exact_keys(j->'release',array['present','fixture_passed','auto_approval_enabled','auto_approval_threshold'])
  or not mip_arc_retained.exact_keys(j->'audit',array['lowConfidence','highSampleSize','seed'])
 then raise exception 'arc_retained_shape';end if;
 -- Projection equality binds every supplied historical-public value to this
 -- owned repeatable-read snapshot. Whole member/entity sets are compared below.
 admission_stage:='candidate_projection';
 for bound_row in select value from jsonb_array_elements(j->'candidates') loop
  if not mip_arc_retained.exact_keys(bound_row,array['id','article_id','arc_id','state','updated_at'])
   or bound_row->>'state' not in ('pending','rejected','invalidated')
   or not exists(select 1 from public.arc_membership_candidates c where c.id=(bound_row->>'id')::uuid
    and jsonb_build_object('id',c.id,'article_id',c.article_id,'arc_id',c.arc_id,'state',c.state,'updated_at',c.updated_at::text)=bound_row)
  then raise exception 'arc_retained_stale_source';end if;
 end loop;
 admission_stage:='arc_projection';
 for bound_row in select value from jsonb_array_elements(j->'arcs') loop
  if not mip_arc_retained.exact_keys(bound_row,array['id','title','summary','started_at','last_update_at'])
   or not exists(select 1 from public.story_arcs a where a.id=(bound_row->>'id')::uuid
    and jsonb_build_object('id',a.id,'title',a.title,'summary',a.summary,'started_at',a.started_at::text,'last_update_at',a.last_update_at::text)=bound_row)
  then raise exception 'arc_retained_stale_source';end if;
 end loop;
 admission_stage:='article_projection';
 for bound_row in select value from jsonb_array_elements(j->'articles') loop
  if not mip_arc_retained.exact_keys(bound_row,array['id','title','summary','published_at','outlet','arc_id'])
   or not exists(select 1 from public.articles a where a.id=(bound_row->>'id')::uuid
    and jsonb_build_object('id',a.id,'title',a.title,'summary',a.summary,'published_at',a.published_at::text,'outlet',a.outlet,'arc_id',a.arc_id)=bound_row)
  then raise exception 'arc_retained_stale_source';end if;
 end loop;
 admission_stage:='relation_shape';
 if exists(select 1 from jsonb_array_elements(j->'members') r
   where not mip_arc_retained.exact_keys(r,array['article_id','arc_id']))
  or exists(select 1 from jsonb_array_elements(j->'entities') r
   where not mip_arc_retained.exact_keys(r,array['article_id','entity_id','confidence']))
 then raise exception 'arc_retained_shape';end if;
 admission_stage:='cardinality';
 -- Fail closed on cardinality before building full SQL aggregate projections.
 if (select count(*) from (select 1 from public.articles a where a.arc_id in
   (select (r->>'id')::uuid from jsonb_array_elements(j->'arcs') r) limit 8193) q)>8192
  or (select count(*) from (select 1 from public.article_entities e where e.article_id in
   (select (r->>'id')::uuid from jsonb_array_elements(j->'articles') r) limit 65537) q)>65536
 then raise exception 'arc_retained_overflow';end if;
 admission_stage:='candidate_context';
 -- Exact sets reject omissions, duplicates and foreign context, not only invalid rows.
 if (select count(distinct r->>'id') from jsonb_array_elements(j->'candidates') r)<>jsonb_array_length(j->'candidates')
  or (select coalesce(jsonb_agg(x order by x->>'id'),'[]') from
   (select distinct jsonb_build_object('id',r->>'arc_id') x from jsonb_array_elements(j->'candidates') r) q)
   <> (select coalesce(jsonb_agg(jsonb_build_object('id',r->>'id') order by r->>'id'),'[]') from jsonb_array_elements(j->'arcs') r)
 then raise exception 'arc_retained_context';end if;
 admission_stage:='member_context';
 if (select coalesce(jsonb_agg(jsonb_build_object('article_id',a.id,'arc_id',a.arc_id) order by a.arc_id,a.id),'[]')
   from public.articles a where a.arc_id in(select (r->>'id')::uuid from jsonb_array_elements(j->'arcs') r))
   <>j->'members'
 then raise exception 'arc_retained_context';end if;
 admission_stage:='article_context';
 if (select coalesce(jsonb_agg(x order by x->>'id'),'[]') from (
   select distinct jsonb_build_object('id',r->>'article_id') x from jsonb_array_elements(j->'candidates') r
   union select distinct jsonb_build_object('id',r->>'article_id') x from jsonb_array_elements(j->'members') r) q)
   <> (select coalesce(jsonb_agg(jsonb_build_object('id',r->>'id') order by r->>'id'),'[]') from jsonb_array_elements(j->'articles') r)
 then raise exception 'arc_retained_context';end if;
 admission_stage:='entity_context';
 if (select coalesce(jsonb_agg(jsonb_build_object('article_id',e.article_id,'entity_id',e.entity_id,'confidence',e.confidence::text)
   order by e.article_id,e.entity_id),'[]') from public.article_entities e where e.article_id in
    (select (r->>'id')::uuid from jsonb_array_elements(j->'articles') r))<>j->'entities'
 then raise exception 'arc_retained_context';end if;
 admission_stage:='floor';
 select count(*) into n from public.pipeline_config where key='entity_resolve_min_confidence';
 if n>1 or j->'floor'<>jsonb_build_object('present',n=1,'value',
  coalesce((select (value #>> '{}')::numeric from public.pipeline_config where key='entity_resolve_min_confidence'),0.70))
 then raise exception 'arc_retained_configuration';end if;
 admission_stage:='release';
 select count(*) into n from public.arc_membership_release_policy where model_version='arc-v1-membership-2026-08-23.2';
 if n>1 or j->'release'<>coalesce((select jsonb_build_object('present',true,'fixture_passed',fixture_passed,
   'auto_approval_enabled',auto_approval_enabled,'auto_approval_threshold',auto_approval_threshold)
  from public.arc_membership_release_policy where model_version='arc-v1-membership-2026-08-23.2'),
  jsonb_build_object('present',false,'fixture_passed',false,'auto_approval_enabled',false,'auto_approval_threshold',null))
 then raise exception 'arc_retained_configuration';end if;
 admission_stage:='retry';
 perform pg_advisory_xact_lock(hashtextextended(s::text||g::text,0));
 select * into old from mip_arc_retained.inputs where scope=s and generation=g;
 if found then
  if old.input_sha256<>h or old.canonical_input<>encoded then raise exception 'arc_retained_retry_conflict';end if;
  return;
 end if;
 admission_stage:='insert';
 insert into mip_arc_retained.inputs(scope,generation,input_sha256,canonical_input) values(s,g,h,encoded);
exception when others then
 -- Fixed internal stage + SQLSTATE only. Never copy SQLERRM, DETAIL, values,
 -- query text or context. The runtime adapter still strips this detail entirely.
 raise exception 'arc_retained_admission_failed' using errcode='P0001',
  detail='stage='||admission_stage||';sqlstate='||SQLSTATE;
end $$;
create function mip_arc_retained.read_input(s uuid,g uuid,h text,allow_missing boolean default false)
returns table(canonical_input text,input_sha256 text)
language plpgsql security definer set search_path='' as $$
begin
 perform mip_arc_retained.authorize(s);
 if allow_missing and not pg_has_role(session_user,'mip_arc_retained_owner','MEMBER')
 then raise exception 'arc_retained_access_denied';end if;
 if h is null or h!~'^[0-9a-f]{64}$' then raise exception 'arc_retained_identity';end if;
 if exists(select 1 from mip_arc_retained.inputs i where i.scope=s and i.generation=g and i.input_sha256<>h)
 then raise exception 'arc_retained_retry_conflict';end if;
 return query select i.canonical_input,i.input_sha256 from mip_arc_retained.inputs i
 where i.scope=s and i.generation=g and i.input_sha256=h;
 if not found and not allow_missing then raise exception 'arc_retained_missing';end if;
end $$;
-- All these functions were created in this transaction in this new schema.
-- Revoke the actual default PUBLIC EXECUTE, then grant only the read wrapper.
revoke all on all functions in schema mip_arc_retained from public;
grant usage on schema mip_arc_retained to mip_arc_retained_reader;
grant execute on function mip_arc_retained.read_input(uuid,uuid,text,boolean) to mip_arc_retained_reader;
reset role;
revoke mip_arc_retained_owner from current_user;
do $assert$
declare r record;f record;src record;col record;owner_id oid;reader_id oid;schema_id oid;
begin
 owner_id:='mip_arc_retained_owner'::regrole;reader_id:='mip_arc_retained_reader'::regrole;
 schema_id:='mip_arc_retained'::regnamespace;
 for r in select * from pg_roles where oid in(owner_id,reader_id) loop
  if r.rolcanlogin or r.rolinherit or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
   or exists(select 1 from pg_auth_members where member=r.oid or roleid=r.oid)
   then raise exception 'arc_retained_role_boundary';end if;
  if has_schema_privilege(r.oid,'public','CREATE')
   then raise exception 'arc_retained_source_schema_boundary';end if;
 end loop;
 if (select nspowner from pg_namespace where oid=schema_id)<>owner_id
  or not has_schema_privilege(owner_id,schema_id,'CREATE')
  or has_schema_privilege(reader_id,schema_id,'CREATE')
  or not has_schema_privilege(reader_id,schema_id,'USAGE')
  or exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
   where n.oid=schema_id and (a.grantee not in(owner_id,reader_id)
    or a.grantee=reader_id and a.privilege_type<>'USAGE'))
 then raise exception 'arc_retained_schema_boundary';end if;
 if (select count(*) from pg_proc where pronamespace=schema_id)<>6
 then raise exception 'arc_retained_function_boundary';end if;
 for f in select * from pg_proc where pronamespace=schema_id loop
  if f.proowner<>owner_id or f.prosecdef is distinct from (f.proname='read_input')
   or not coalesce(f.proconfig @> array['search_path=""'],false)
   or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
     where a.grantee<>owner_id and not(a.grantee=reader_id and f.proname='read_input' and a.privilege_type='EXECUTE'))
   or has_function_privilege(reader_id,f.oid,'EXECUTE') is distinct from (f.proname='read_input')
  then raise exception 'arc_retained_function_boundary';end if;
 end loop;
 for r in select * from pg_class where oid in('mip_arc_retained.inputs'::regclass,'mip_arc_retained.access'::regclass) loop
  if r.relowner<>owner_id or not r.relrowsecurity or not r.relforcerowsecurity
   or has_table_privilege(reader_id,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(reader_id,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')
   or exists(select 1 from aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a where a.grantee<>owner_id)
  then raise exception 'arc_retained_table_boundary';end if;
 end loop;
 -- Exact source column grants, including effective PUBLIC rights; never repair
 -- someone else's privileges here. Unsupported inherited rights fail installation.
 for src in select * from(values
 ('public.arc_membership_candidates','id,article_id,arc_id,state,updated_at'),
 ('public.story_arcs','id,title,summary,started_at,last_update_at'),
 ('public.articles','id,title,summary,published_at,outlet,arc_id'),
 ('public.article_entities','article_id,entity_id,confidence'),
 ('public.pipeline_config','key,value'),
 ('public.arc_membership_release_policy','model_version,fixture_passed,auto_approval_enabled,auto_approval_threshold')
 )v(relation_name,columns) loop
  if (select relowner from pg_class where oid=src.relation_name::regclass) in(owner_id,reader_id)
   or has_table_privilege(owner_id,src.relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(owner_id,src.relation_name,'INSERT,UPDATE,REFERENCES')
   or has_table_privilege(reader_id,src.relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(reader_id,src.relation_name,'SELECT,INSERT,UPDATE,REFERENCES')
  then raise exception 'arc_retained_source_acl_boundary';end if;
  for col in select attname from pg_attribute where attrelid=src.relation_name::regclass and attnum>0 and not attisdropped loop
   if has_column_privilege(owner_id,src.relation_name,col.attname,'SELECT')
      is distinct from(col.attname=any(string_to_array(src.columns,',')))
    then raise exception 'arc_retained_source_column_boundary';end if;
  end loop;
 end loop;
 -- These ambient roles, when installed, must gain no path into the private
 -- contract. PUBLIC ACLs were checked above even when none of these roles exist.
 for r in select oid from pg_roles where rolname in('anon','authenticated','service_role') loop
  if pg_has_role(r.oid,owner_id,'MEMBER') or pg_has_role(r.oid,reader_id,'MEMBER')
   or has_schema_privilege(r.oid,schema_id,'USAGE,CREATE')
  then raise exception 'arc_retained_ambient_role_boundary';end if;
  for f in select oid from pg_proc where pronamespace=schema_id loop
   if has_function_privilege(r.oid,f.oid,'EXECUTE')
    then raise exception 'arc_retained_ambient_function_boundary';end if;
  end loop;
  if has_table_privilege(r.oid,'mip_arc_retained.inputs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(r.oid,'mip_arc_retained.inputs','SELECT,INSERT,UPDATE,REFERENCES')
   or has_table_privilege(r.oid,'mip_arc_retained.access','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(r.oid,'mip_arc_retained.access','SELECT,INSERT,UPDATE,REFERENCES')
  then raise exception 'arc_retained_ambient_table_boundary';end if;
 end loop;
end $assert$;
commit;
