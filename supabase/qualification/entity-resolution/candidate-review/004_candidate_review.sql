-- Additive source-only PostgreSQL 17 qualification, NOT a deployment migration.
-- Requires native capture reliability, unchanged 001 and native-fields 003.
-- Optional unchanged 002 may precede/follow. No tables, actors or access seeded.
begin;
set local lock_timeout='5s';
-- Refuse an incomplete native dependency closure before adding the entrypoint.
do $dependency$
begin
 if to_regprocedure('mip_mentions.resolve_native_field(uuid,uuid,integer)') is null
  or not exists(select 1 from pg_attribute where attrelid='mip_mentions.fields'::regclass
    and attname='native_capture_id' and not attisdropped)
 then raise exception 'candidate review native dependency unavailable';end if;
end $dependency$;
set role mip_mentions_owner;
create function mip_mentions.read_candidate_proposal(s uuid,i uuid,expected_version integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $proposal$
declare p mip_mentions.policy;c mip_mentions.candidates;head_id uuid;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 if i is null or expected_version is null or expected_version<1
 then raise exception 'exact candidate proposal unavailable';end if;
 -- Immutable locator read obtains the existing mention lock key; it returns
 -- nothing. Writers and this reader then serialize on the SAME mention lock.
 select * into c from mip_mentions.candidates where scope=s and id=i;
 if not found or c.version<>expected_version
 then raise exception 'exact candidate proposal unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||c.mention_id::text,0));
 select id into head_id from mip_mentions.candidates
 where scope=s and mention_id=c.mention_id and actor_id=c.actor_id order by version desc limit 1;
 if head_id is distinct from i
  or not exists(select 1 from mip_mentions.actors where scope=s and id=c.actor_id)
 then raise exception 'current candidate proposal unavailable';end if;
 -- Existing writes bound btrim(method), not its raw size. Never truncate an
 -- oversized historical value into a different exact-retry payload.
 if char_length(c.method)>256 or octet_length(c.method)>1024
 then raise exception 'candidate proposal metadata budget exceeded';end if;
 -- Reuse 003's original native-field binding, statement snapshot, budgets,
 -- exact mention spans, and ordered field-access locks. No raw value escapes.
 perform mip_mentions.check_mentions(s,array[c.mention_id]||c.supporting_mentions||c.conflicting_mentions,p);
 return jsonb_build_object(
  'scope',s,'candidate_id',c.id,'mention_id',c.mention_id,'actor_id',c.actor_id,
  'version',c.version,'predecessor_id',c.predecessor_id,'rank',c.rank,'method',c.method,
  'supporting_mentions',c.supporting_mentions,'conflicting_mentions',c.conflicting_mentions,
  'policy_version',p.version,'proposal_only',true,'identity_accepted',false,
  'production_qualified',false,'source_authority_qualified',false,
  'transport_qualified',false,'publication_allowed',false);
end $proposal$;
revoke all on function mip_mentions.read_candidate_proposal(uuid,uuid,integer)
 from public,mip_mentions_gateway,mip_mentions_admin;
grant execute on function mip_mentions.read_candidate_proposal(uuid,uuid,integer) to mip_mentions_gateway;
reset role;
-- Final effective boundary, after grant and role reset. Existing privileges and
-- policies are not rewritten; only the named entrypoint is added.
do $boundary$
declare r record;v record;role_name text;private_fn regprocedure;fn regprocedure:='mip_mentions.read_candidate_proposal(uuid,uuid,integer)'::regprocedure;
begin
 select * into r from pg_roles where rolname='mip_mentions_owner';
 if not r.rolinherit or r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
 then raise exception 'candidate review owner boundary failed';end if;
 if exists(select 1 from pg_roles where rolname in ('mip_mentions_gateway','mip_mentions_admin')
  and (not rolinherit or rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls))
  or pg_has_role('mip_mentions_gateway','mip_mentions_owner','MEMBER')
  or pg_has_role('mip_mentions_admin','mip_mentions_owner','MEMBER')
  or pg_has_role('mip_mentions_gateway','mip_mentions_native_validator','MEMBER')
  or pg_has_role('mip_mentions_admin','mip_mentions_native_validator','MEMBER')
 then raise exception 'candidate review membership boundary failed';end if;
 -- These protected roles have no outgoing memberships in the exact source.
 -- Incoming authorized logins may retain gateway/admin memberships.
 if exists(select 1 from pg_auth_members where member in
  ('mip_mentions_owner'::regrole,'mip_mentions_gateway'::regrole,
   'mip_mentions_admin'::regrole,'mip_mentions_native_validator'::regrole))
 then raise exception 'candidate review outgoing membership boundary failed';end if;
 if exists(select 1 from pg_auth_members where roleid='mip_mentions_owner'::regrole)
 then raise exception 'candidate review incoming owner membership boundary failed';end if;
 select * into v from pg_roles where rolname='mip_mentions_native_validator';
 if v.rolinherit or v.rolcanlogin or v.rolsuper or v.rolcreatedb or v.rolcreaterole or v.rolreplication or v.rolbypassrls
  or exists(select 1 from pg_auth_members where roleid=v.oid)
 then raise exception 'candidate review native validator boundary failed';end if;
 if (select nspowner from pg_namespace where nspname='mip_mentions')<>r.oid
 then raise exception 'candidate review schema owner boundary failed';end if;
 foreach role_name in array array['mip_mentions_gateway','mip_mentions_admin'] loop
  if not has_schema_privilege(role_name,'mip_mentions','USAGE')
   or has_schema_privilege(role_name,'mip_mentions','CREATE')
  then raise exception 'candidate review schema privilege boundary failed';end if;
  foreach private_fn in array array[
   'mip_mentions.resolve_native_field(uuid,uuid,integer)'::regprocedure,
   'mip_mentions.native_binding_bytes(uuid,uuid,uuid,uuid,text,text,text,integer,integer)'::regprocedure] loop
   if has_function_privilege(role_name,private_fn,'EXECUTE')
    or not has_function_privilege('mip_mentions_owner',private_fn,'EXECUTE')
    or (select proowner from pg_proc where oid=private_fn)<>v.oid
   then raise exception 'candidate review private resolver boundary failed';end if;
  end loop;
 end loop;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,fn,'EXECUTE')
  then raise exception 'candidate review ambient execute boundary failed';end if;
 end loop;
 if (select proowner from pg_proc where oid=fn)<>r.oid
  or not(select prosecdef and provolatile='v' and proconfig=array['search_path=""'] from pg_proc where oid=fn)
  or not has_function_privilege('mip_mentions_gateway',fn,'EXECUTE')
  or has_function_privilege('mip_mentions_admin',fn,'EXECUTE')
  or exists(select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
    where f.oid=fn and (a.grantee not in (r.oid,'mip_mentions_gateway'::regrole)
     or a.privilege_type<>'EXECUTE' or (a.grantee<>r.oid and a.is_grantable)))
 then raise exception 'candidate review function boundary failed';end if;
 if exists(select 1 from pg_class c where c.relnamespace='mip_mentions'::regnamespace and c.relkind='r'
  and (c.relowner<>r.oid or not c.relrowsecurity or not c.relforcerowsecurity
   or has_table_privilege('mip_mentions_gateway',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege('mip_mentions_gateway',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 then raise exception 'candidate review table boundary failed';end if;
end $boundary$;
commit;
