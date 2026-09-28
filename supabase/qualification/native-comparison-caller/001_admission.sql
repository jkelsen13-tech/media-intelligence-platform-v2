-- Separate authored candidate; install only after the complete selected v5 program.
-- Empty trusted admission metadata. No Auth user, broker, gateway or binding is seeded.
begin;
do $prerequisite$
begin
 if to_regprocedure('mip_native_display.read_current(uuid,uuid,text,uuid,text)') is null
 or to_regprocedure('mip_identity.efta_assert_live_auth_session(uuid,uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,uuid,text)') is null
 or not exists(select 1 from pg_roles where rolname='mip_efta_auth_session_owner_v1'
  and not rolcanlogin and not rolsuper and not rolbypassrls and not rolinherit
  and not rolcreaterole and not rolcreatedb and not rolreplication)
 or exists(select 1 from pg_auth_members where roleid='mip_efta_auth_session_owner_v1'::regrole
  or member='mip_efta_auth_session_owner_v1'::regrole)
 or not has_column_privilege('mip_efta_auth_session_owner_v1','auth.sessions','id','SELECT')
 or not has_column_privilege('mip_efta_auth_session_owner_v1','auth.sessions','user_id','SELECT')
 or not has_column_privilege('mip_efta_auth_session_owner_v1','auth.sessions','id','UPDATE')
 or (select count(*) from pg_attribute where attrelid='auth.sessions'::regclass and attnum>0
  and not attisdropped and ((attname in('id','user_id') and atttypid='uuid'::regtype)
  or(attname='not_after' and atttypid='timestamptz'::regtype)))<>3
 then raise exception 'native_caller_prerequisite';end if;
end $prerequisite$;
create schema mip_native_caller authorization mip_mentions_owner;
revoke all on schema mip_native_caller from public,anon,authenticated,service_role;
grant usage on schema mip_native_caller to mip_mentions_gateway,mip_mentions_admin,mip_efta_auth_session_owner_v1;
create table mip_native_caller.admissions(
 revision uuid primary key,predecessor uuid references mip_native_caller.admissions,
 subject_id uuid not null,scope uuid not null,binding_id uuid not null,
 manifest_hash text not null check(manifest_hash~'^[0-9a-f]{64}$'),
 gateway_login name not null,broker_session uuid not null,
 runtime text not null check(runtime~'^[A-Za-z0-9._:-]{1,128}$'),
 valid_from timestamptz not null,valid_until timestamptz not null,active boolean not null,
 check(isfinite(valid_from) and isfinite(valid_until) and valid_until>valid_from),
 unique(predecessor)
);
create table mip_native_caller.heads(
 subject_id uuid not null,scope uuid not null,binding_id uuid not null,
 revision uuid not null unique references mip_native_caller.admissions,
 primary key(subject_id,scope,binding_id)
);
alter table mip_native_caller.admissions owner to mip_mentions_owner;
alter table mip_native_caller.heads owner to mip_mentions_owner;
alter table mip_native_caller.admissions enable row level security;
alter table mip_native_caller.admissions force row level security;
alter table mip_native_caller.heads enable row level security;
alter table mip_native_caller.heads force row level security;
revoke all on mip_native_caller.admissions,mip_native_caller.heads from public,anon,authenticated,service_role,mip_mentions_gateway,mip_mentions_admin,mip_efta_auth_session_owner_v1;
create policy owner_only on mip_native_caller.admissions to mip_mentions_owner using(true) with check(true);
create policy owner_only on mip_native_caller.heads to mip_mentions_owner using(true) with check(true);
create function mip_native_caller.reject_rewrite() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'native_caller_immutable';end $$;
alter function mip_native_caller.reject_rewrite() owner to mip_mentions_owner;
create trigger immutable before update or delete on mip_native_caller.admissions
 for each row execute function mip_native_caller.reject_rewrite();
create trigger no_truncate before truncate on mip_native_caller.admissions
 for each statement execute function mip_native_caller.reject_rewrite();
create trigger no_truncate before truncate on mip_native_caller.heads
 for each statement execute function mip_native_caller.reject_rewrite();

-- Trusted configuration operation, owner-only. Login alone never creates admission.
-- A successor with active=false revokes; a later explicit successor may re-admit.
create function mip_native_caller.configure(
 r uuid,previous uuid,u uuid,s uuid,b uuid,h text,g name,bs uuid,rt text,
 vf timestamptz,vu timestamptz,enabled boolean
) returns void language plpgsql set search_path='' as $$
declare old mip_native_caller.admissions;current_revision uuid;
begin
 if current_user<>'mip_mentions_owner' then raise exception 'native_caller_configuration_denied';end if;
 perform 1 from mip_mentions.policy_head where singleton for update;
 if r is null or u is null or s is null or b is null or h is null or g is null or bs is null
 or rt is null or vf is null or vu is null or enabled is null
 then raise exception 'native_caller_configuration_denied';end if;
 if not exists(select 1 from pg_roles where rolname=g and rolcanlogin and not rolsuper
  and not rolcreaterole and not rolcreatedb and not rolbypassrls and not rolreplication)
 or not pg_has_role(g,'mip_mentions_gateway','USAGE')
 or exists(select 1 from pg_roles x where x.rolname not in(g,'mip_mentions_gateway')
  and pg_has_role(g,x.oid,'MEMBER'))
 then raise exception 'native_caller_configuration_denied';end if;
 select * into old from mip_native_caller.admissions where revision=r;
 if found then
  if row(old.predecessor,old.subject_id,old.scope,old.binding_id,old.manifest_hash,old.gateway_login,
   old.broker_session,old.runtime,old.valid_from,old.valid_until,old.active)
   is distinct from row(previous,u,s,b,h,g,bs,rt,vf,vu,enabled)
  then raise exception 'native_caller_configuration_conflict';end if;
  return;
 end if;
 select revision into current_revision from mip_native_caller.heads
 where subject_id=u and scope=s and binding_id=b for update;
 if current_revision is distinct from previous then raise exception 'native_caller_configuration_conflict';end if;
 insert into mip_native_caller.admissions values(r,previous,u,s,b,h,g,bs,rt,vf,vu,enabled);
 insert into mip_native_caller.heads values(u,s,b,r)
 on conflict(subject_id,scope,binding_id) do update set revision=excluded.revision;
end $$;
alter function mip_native_caller.configure(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean) owner to mip_mentions_owner;

-- Operational trusted-admin entry point. Existing scoped can_decide authority
-- is required in addition to the actual login's admin-role membership. Take the
-- established policy UPDATE fence before membership locks; configure reuses it.
create function mip_native_caller.configure_admission(
 r uuid,previous uuid,u uuid,s uuid,b uuid,h text,g name,bs uuid,rt text,
 vf timestamptz,vu timestamptz,enabled boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
 if not pg_has_role(session_user,'mip_mentions_admin','MEMBER')
 then raise exception 'native_caller_configuration_denied';end if;
 perform 1 from mip_mentions.policy_head where singleton for update;
 perform mip_mentions.authorize(s,true);
 perform mip_native_caller.configure(r,previous,u,s,b,h,g,bs,rt,vf,vu,enabled);
end $$;
alter function mip_native_caller.configure_admission(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean) owner to mip_mentions_owner;

create function mip_native_caller.resolve(u uuid,s uuid,b uuid,h text)
returns mip_native_caller.admissions language plpgsql security definer set search_path='' as $$
declare a mip_native_caller.admissions;v uuid;
begin
 perform mip_mentions.lock_policy();
 perform mip_mentions.authorize(s,false);
 if not pg_has_role(session_user,'mip_mentions_gateway','USAGE')
 or exists(select 1 from pg_roles x where x.rolname not in(session_user,'mip_mentions_gateway')
  and pg_has_role(session_user,x.oid,'MEMBER'))
 then raise exception 'native_caller_denied';end if;
 select revision into v from mip_native_caller.heads where subject_id=u and scope=s and binding_id=b for share;
 select * into a from mip_native_caller.admissions where revision=v;
 if not found or a.subject_id is distinct from u or a.scope is distinct from s
 or a.binding_id is distinct from b or a.manifest_hash is distinct from h
 or a.gateway_login is distinct from session_user or not a.active
 or a.valid_from>clock_timestamp() or a.valid_until<=clock_timestamp()
 then raise exception 'native_caller_denied';end if;
 return a;
end $$;
alter function mip_native_caller.resolve(uuid,uuid,uuid,text) owner to mip_mentions_owner;

-- Reuse the actual protected session-owner substrate from selected 012.
-- UPDATE(id) was already required there for row locks; no new write grant.
grant select(not_after) on auth.sessions to mip_efta_auth_session_owner_v1;
create function mip_native_caller.assert_session(u uuid,session_id uuid,token_exp bigint)
returns void language plpgsql security definer set search_path='' as $$
declare deadline timestamptz;
begin
 if u is null or session_id is null or token_exp is null or token_exp<1 or token_exp>253402300799
 or to_timestamp(token_exp)<=clock_timestamp() then raise exception 'native_caller_denied';end if;
 select x.not_after into deadline from auth.sessions x
 where x.id=session_id and x.user_id=u for share;
 if not found or(deadline is not null and deadline<=clock_timestamp())
 or to_timestamp(token_exp)<=clock_timestamp() then raise exception 'native_caller_denied';end if;
end $$;
alter function mip_native_caller.assert_session(uuid,uuid,bigint) owner to mip_efta_auth_session_owner_v1;

-- INVOKER preserves the real gateway login for every existing native wrapper.
-- Existing display locks (policy/member/scope/publication/source) precede the
-- Auth row lock, consistent with 012 publication -> auth.sessions ordering.
create function mip_native_caller.read_current(u uuid,session_id uuid,token_exp bigint,s uuid,b uuid,h text)
returns jsonb language plpgsql set search_path='' as $$
declare a mip_native_caller.admissions;again mip_native_caller.admissions;v jsonb;
begin
 a:=mip_native_caller.resolve(u,s,b,h);
 v:=mip_native_display.read_current(s,b,h,a.broker_session,a.runtime);
 perform mip_native_caller.assert_session(u,session_id,token_exp);
 again:=mip_native_caller.resolve(u,s,b,h);
 if again.revision is distinct from a.revision then raise exception 'native_caller_denied';end if;
 return v;
end $$;
alter function mip_native_caller.read_current(uuid,uuid,bigint,uuid,uuid,text) owner to mip_mentions_owner;
revoke all on all functions in schema mip_native_caller from public,anon,authenticated,service_role,mip_mentions_gateway,mip_mentions_admin,mip_efta_auth_session_owner_v1;
grant execute on function mip_native_caller.resolve(uuid,uuid,uuid,text),
 mip_native_caller.assert_session(uuid,uuid,bigint),
 mip_native_caller.read_current(uuid,uuid,bigint,uuid,uuid,text) to mip_mentions_gateway;

grant execute on function mip_native_caller.configure_admission(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean) to mip_mentions_admin;

do $native_caller_final$
declare r record;allowed oid[];actual text[];
begin
 if to_regprocedure('mip_native_caller.reject_rewrite()') is null
 or to_regprocedure('mip_native_caller.configure(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean)') is null
 or to_regprocedure('mip_native_caller.configure_admission(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean)') is null
 or to_regprocedure('mip_native_caller.resolve(uuid,uuid,uuid,text)') is null
 or to_regprocedure('mip_native_caller.assert_session(uuid,uuid,bigint)') is null
 or to_regprocedure('mip_native_caller.read_current(uuid,uuid,bigint,uuid,uuid,text)') is null
 then raise exception 'native_caller_boundary';end if;
 if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  where n.nspname='mip_native_caller' and (a.grantee not in('mip_mentions_owner'::regrole,'mip_mentions_gateway'::regrole,'mip_mentions_admin'::regrole,'mip_efta_auth_session_owner_v1'::regrole)
   or(a.grantee<>n.nspowner and(a.privilege_type<>'USAGE' or a.is_grantable))))
 then raise exception 'native_caller_boundary';end if;
 select array_agg(a.attname::text||':'||p.privilege_type order by a.attname::text||':'||p.privilege_type) into actual
 from pg_attribute a cross join lateral aclexplode(a.attacl) p
 where a.attrelid='auth.sessions'::regclass and a.attnum>0 and not a.attisdropped
  and p.grantee='mip_efta_auth_session_owner_v1'::regrole;
 if actual is distinct from array['id:SELECT','id:UPDATE','not_after:SELECT','user_id:SELECT']
 or has_table_privilege('mip_efta_auth_session_owner_v1','auth.sessions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 or exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) p
  where a.attrelid='auth.sessions'::regclass and p.grantee='mip_efta_auth_session_owner_v1'::regrole and p.is_grantable)
 or exists(select 1 from pg_roles where rolname='mip_efta_auth_session_owner_v1'
  and(rolcanlogin or rolsuper or rolbypassrls or rolinherit or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'native_caller_boundary';end if;
 if (select count(*) from pg_trigger where tgrelid in('mip_native_caller.admissions'::regclass,'mip_native_caller.heads'::regclass)
  and not tgisinternal)<>3
 or not exists(select 1 from pg_trigger where tgrelid='mip_native_caller.admissions'::regclass and tgname='immutable'
  and tgtype=27 and tgenabled='O' and tgfoid='mip_native_caller.reject_rewrite()'::regprocedure and tgqual is null)
 or (select count(*) from pg_trigger where tgrelid in('mip_native_caller.admissions'::regclass,'mip_native_caller.heads'::regclass)
  and tgname='no_truncate' and tgtype=34 and tgenabled='O' and tgfoid='mip_native_caller.reject_rewrite()'::regprocedure and tgqual is null)<>2
 then raise exception 'native_caller_boundary';end if;
 if (select count(*) from pg_class where relnamespace='mip_native_caller'::regnamespace and relkind='r')<>2
 or (select count(*) from pg_proc where pronamespace='mip_native_caller'::regnamespace)<>6
 or (select nspowner from pg_namespace where nspname='mip_native_caller')<>'mip_mentions_owner'::regrole
 then raise exception 'native_caller_boundary';end if;
 for r in select c.* from pg_class c where c.relnamespace='mip_native_caller'::regnamespace and c.relkind='r' loop
  if r.relowner<>'mip_mentions_owner'::regrole or not r.relrowsecurity or not r.relforcerowsecurity
  or exists(select 1 from aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a where a.grantee<>r.relowner)
  or exists(select 1 from pg_attribute a where a.attrelid=r.oid and a.attacl is not null)
  or (select count(*) from pg_policy where polrelid=r.oid)<>1
  or not exists(select 1 from pg_policy where polrelid=r.oid and polroles=array['mip_mentions_owner'::regrole::oid]
   and polcmd='*' and polpermissive and pg_get_expr(polqual,polrelid)='true' and pg_get_expr(polwithcheck,polrelid)='true')
  then raise exception 'native_caller_boundary';end if;
 end loop;
 for r in select p.* from pg_proc p where p.pronamespace='mip_native_caller'::regnamespace loop
  allowed:=array[r.proowner];
  if r.proname in('resolve','assert_session','read_current') then allowed:=allowed||'mip_mentions_gateway'::regrole::oid;end if;
  if r.proname='configure_admission' then allowed:=allowed||'mip_mentions_admin'::regrole::oid;end if;
  if r.proowner<>(case when r.proname='assert_session' then 'mip_efta_auth_session_owner_v1'::regrole else 'mip_mentions_owner'::regrole end)
  or r.prokind<>'f' or r.provolatile<>'v' or r.proparallel<>'u' or r.proleakproof
  or r.prosecdef<>(r.proname in('resolve','assert_session','configure_admission')) or r.proconfig is distinct from array['search_path=""']
  or exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) a
    where not(a.grantee=any(allowed)) or a.privilege_type<>'EXECUTE' or(a.grantee<>r.proowner and a.is_grantable))
  or has_function_privilege('mip_mentions_gateway',r.oid,'EXECUTE') is distinct from (r.proname in('resolve','assert_session','read_current'))
  or has_function_privilege('mip_mentions_admin',r.oid,'EXECUTE') is distinct from (r.proname='configure_admission')
  or exists(select 1 from unnest(array['anon','authenticated','service_role','mip_arc_native_worker','mip_projection_publisher_v1']) x
    where has_function_privilege(x,r.oid,'EXECUTE'))
  then raise exception 'native_caller_boundary';end if;
 end loop;
 if has_schema_privilege('mip_mentions_admin','mip_native_caller','CREATE')
 or not has_schema_privilege('mip_mentions_admin','mip_native_caller','USAGE')
 or has_schema_privilege('mip_mentions_gateway','mip_native_caller','CREATE')
 or has_schema_privilege('mip_efta_auth_session_owner_v1','mip_native_caller','CREATE')
 or not has_schema_privilege('mip_mentions_gateway','mip_native_caller','USAGE')
 or not has_schema_privilege('mip_efta_auth_session_owner_v1','mip_native_caller','USAGE')
 or exists(select 1 from pg_auth_members where roleid='mip_efta_auth_session_owner_v1'::regrole or member='mip_efta_auth_session_owner_v1'::regrole)
 or not has_column_privilege('mip_efta_auth_session_owner_v1','auth.sessions','not_after','SELECT')
 then raise exception 'native_caller_boundary';end if;
end $native_caller_final$;
commit;
