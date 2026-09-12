-- Isolated opt-in executable broker/session boundary. Load after 001..004.
-- No LOGIN role, credential, schedule, public endpoint or production migration.
begin;
do $$begin if not exists(select 1 from pg_roles where rolname='mip_identity_owner_v2') then create role mip_identity_owner_v2 nologin nosuperuser nobypassrls;end if;end $$;
do $$begin if not exists(select 1 from pg_roles where rolname='mip_identity_broker_v2') then create role mip_identity_broker_v2 nologin nosuperuser nobypassrls;end if;end $$;
do $$begin if not exists(select 1 from pg_roles where rolname='mip_journal_owner_v2') then create role mip_journal_owner_v2 nologin nosuperuser nobypassrls;end if;end $$;
do $$begin if not exists(select 1 from pg_roles where rolname='mip_journal_gateway_v2') then create role mip_journal_gateway_v2 nologin nosuperuser nobypassrls;end if;end $$;
do $$begin if not exists(select 1 from pg_roles where rolname='mip_kernel_owner_v2') then create role mip_kernel_owner_v2 nologin nosuperuser nobypassrls;end if;end $$;
create schema mip_identity;
revoke all on schema mip_identity from public,anon,authenticated,service_role;
grant usage on schema mip_identity to mip_identity_owner_v2,mip_identity_broker_v2,
 mip_journal_owner_v2,mip_journal_gateway_v2,mip_comparison_worker_v1,mip_comparison_producer_v1,
 mip_comparison_worker_owner_v1,mip_comparison_producer_owner_v1;
create table mip_identity.fence(id boolean primary key check(id));
insert into mip_identity.fence values(true);
create table mip_identity.key_versions(
 revision uuid primary key,issuer text not null,kid text not null,jwk jsonb not null,
 valid_from timestamptz not null,valid_until timestamptz not null,
 approval_ref text not null check(length(approval_ref)>0),
 check(isfinite(valid_from) and isfinite(valid_until) and valid_until>valid_from)
);
create table mip_identity.key_heads(
 issuer text not null,kid text not null,revision uuid not null references mip_identity.key_versions,
 active boolean not null,primary key(issuer,kid)
);
create table mip_identity.mapping_versions(
 revision uuid primary key,runtime text not null,principal text not null,
 issuer text not null,audience text not null,subject text not null,
 key_revision uuid not null references mip_identity.key_versions,
 max_lifetime_seconds integer not null check(max_lifetime_seconds>0),
 approval_ref text not null check(length(approval_ref)>0),
 check(principal in ('mip_comparison_worker_v1','mip_comparison_producer_v1'))
);
create table mip_identity.mapping_heads(
 runtime text not null,principal text not null,revision uuid not null references mip_identity.mapping_versions,
 active boolean not null,primary key(runtime,principal)
);
create table mip_identity.retired_authority(kind text not null,revision uuid not null,primary key(kind,revision));
create function mip_identity.guard_revision_reuse() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (tg_op='UPDATE' and (new.revision is distinct from old.revision or (old.active and not new.active))) then
 insert into mip_identity.retired_authority values(tg_table_name,old.revision) on conflict do nothing;
 end if;
 if tg_op<>'DELETE' and new.active and exists(select 1 from mip_identity.retired_authority where kind=tg_table_name and revision=new.revision) then
 raise exception 'mip_identity_fresh_revision_required';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger mapping_revision_reuse before insert or update or delete on mip_identity.mapping_heads for each row execute function mip_identity.guard_revision_reuse();
create trigger key_revision_reuse before insert or update or delete on mip_identity.key_heads for each row execute function mip_identity.guard_revision_reuse();
create table mip_identity.sessions(
 session_id uuid primary key references comparison_qualification.principal_sessions,
 request_id uuid not null unique,token_hash text not null unique,
 mapping_revision uuid not null references mip_identity.mapping_versions,
 key_revision uuid not null references mip_identity.key_versions,
 expires_at timestamptz not null,argument_hash text not null
);
create table mip_identity.journal(
 runtime text not null,entry_key text not null,envelope jsonb not null,
 committed_at timestamptz not null default clock_timestamp(),
 primary key(runtime,entry_key),
 check(jsonb_typeof(envelope)='object' and octet_length(envelope::text)<=4194304)
);
create function mip_identity.serialize_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform 1 from mip_identity.fence where id for update;return null;end $$;
create trigger mapping_fence before insert or update or delete or truncate on mip_identity.mapping_heads
 for each statement execute function mip_identity.serialize_change();
create trigger key_fence before insert or update or delete or truncate on mip_identity.key_heads
 for each statement execute function mip_identity.serialize_change();
do $immutable$
declare t text;
begin
 foreach t in array array['key_versions','mapping_versions','sessions','journal','retired_authority'] loop
 execute format('create trigger immutable before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
 execute format('create trigger no_truncate before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 end loop;
end $immutable$;
create function mip_identity.current_mapping(p_runtime text,p_principal text)
returns mip_identity.mapping_versions language plpgsql security definer set search_path='' as $$
declare m mip_identity.mapping_versions;k mip_identity.key_versions;
begin
 perform 1 from mip_identity.fence where id for share;
 select v.* into m from mip_identity.mapping_heads h join mip_identity.mapping_versions v on v.revision=h.revision
 where h.runtime=p_runtime and h.principal=p_principal and h.active
 and v.runtime=h.runtime and v.principal=h.principal;
 if not found then raise exception 'mip_identity_mapping_revoked';end if;
 select v.* into k from mip_identity.key_versions v join mip_identity.key_heads h on h.revision=v.revision
 and h.issuer=v.issuer and h.kid=v.kid
 where v.revision=m.key_revision and h.active and v.issuer=m.issuer;
 if not found or k.valid_from>clock_timestamp() or k.valid_until<=clock_timestamp() then
 raise exception 'mip_identity_key_revoked';end if;
 return m;
end $$;
create function mip_identity.configuration(p_runtime text,p_principal text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m mip_identity.mapping_versions;k mip_identity.key_versions;
begin
 m:=mip_identity.current_mapping(p_runtime,p_principal);
 select * into strict k from mip_identity.key_versions where revision=m.key_revision;
 return jsonb_build_object('mappingRevision',m.revision,'keyRevision',k.revision,
 'issuer',m.issuer,'audience',m.audience,'maxLifetimeSeconds',m.max_lifetime_seconds,
 'keys',jsonb_build_array(jsonb_build_object('kid',k.kid,'jwk',k.jwk,
 'validFrom',extract(epoch from k.valid_from)::bigint,'validUntil',extract(epoch from k.valid_until)::bigint)),
 'mappings',jsonb_build_array(jsonb_build_object('subject',m.subject,'runtime',m.runtime,
 'principal',m.principal,'authorizationRevision',m.revision::text)));
end $$;
create function mip_identity.issue(
 p_request uuid,p_runtime text,p_principal text,p_mapping uuid,p_key uuid,
 p_issuer text,p_audience text,p_subject text,p_iat bigint,p_exp bigint,p_token_hash text
) returns uuid language plpgsql security definer set search_path='' as $$
declare m mip_identity.mapping_versions;s mip_identity.sessions;sid uuid;digest text;
begin
 m:=mip_identity.current_mapping(p_runtime,p_principal);
 if m.revision is distinct from p_mapping or m.key_revision is distinct from p_key then
 raise exception 'mip_identity_stale_revision';end if;
 if m.issuer is distinct from p_issuer or m.audience is distinct from p_audience or m.subject is distinct from p_subject
 then raise exception 'mip_identity_claim_mismatch';end if;
 if p_iat is null or p_exp is null or p_iat>extract(epoch from clock_timestamp()) or
 p_exp<=extract(epoch from clock_timestamp()) or p_exp<=p_iat or p_exp-p_iat>m.max_lifetime_seconds
 then raise exception 'mip_identity_expired';end if;
 if p_request is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
 raise exception 'mip_identity_bad_request';end if;
 digest:=comparison_qualification.argument_digest(jsonb_build_object('runtime',p_runtime,'principal',p_principal,
 'mapping',p_mapping,'key',p_key,'issuer',p_issuer,'audience',p_audience,'subject',p_subject,
 'iat',p_iat,'exp',p_exp,'token',p_token_hash));
 perform pg_advisory_xact_lock(hashtextextended(p_token_hash,505));
 select * into s from mip_identity.sessions where request_id=p_request or token_hash=p_token_hash;
 if found then
 if s.request_id is distinct from p_request or s.argument_hash is distinct from digest then
 raise exception 'mip_identity_token_replay';end if;
 if s.expires_at<=clock_timestamp() then raise exception 'mip_identity_expired';end if;
 perform 1 from comparison_qualification.principal_sessions where session_id=s.session_id and revoked_at is null for share;
 if not found then raise exception 'mip_identity_session_revoked';end if;
 return s.session_id;end if;
 sid:=comparison_qualification.issue_session(p_principal,p_runtime,to_timestamp(p_exp));
 insert into mip_identity.sessions values(sid,p_request,p_token_hash,p_mapping,p_key,to_timestamp(p_exp),digest);
 perform mip_identity.current_mapping(p_runtime,p_principal);
 return sid;
end $$;
create function mip_identity.authorize(p_session uuid,p_runtime text,p_principal text)
returns text language plpgsql security definer set search_path='' as $$
declare m mip_identity.mapping_versions;s mip_identity.sessions;
begin
 m:=mip_identity.current_mapping(p_runtime,p_principal);
 select * into s from mip_identity.sessions where session_id=p_session;
 if not found or s.expires_at<=clock_timestamp() then raise exception 'mip_identity_expired';end if;
 if s.mapping_revision is distinct from m.revision or s.key_revision is distinct from m.key_revision then
 raise exception 'mip_identity_stale_revision';end if;
 perform 1 from comparison_qualification.principal_sessions where session_id=p_session
 and runtime_id=p_runtime and principal=p_principal and revoked_at is null and expires_at>clock_timestamp() for share;
 if not found then raise exception 'mip_identity_session_revoked';end if;
 return p_runtime;
end $$;
create function mip_identity.journal_runtime(p_session uuid) returns text
language plpgsql security definer set search_path='' as $$
declare m mip_identity.mapping_versions;
begin
 select v.* into m from mip_identity.sessions s join mip_identity.mapping_versions v on v.revision=s.mapping_revision
 where s.session_id=p_session;
 if not found then raise exception 'mip_identity_expired';end if;
 return mip_identity.authorize(p_session,m.runtime,m.principal);
end $$;
create function mip_identity.journal_put(p_session uuid,p_key text,p_envelope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text;v jsonb;
begin
 r:=mip_identity.journal_runtime(p_session);
 if p_key is null or length(p_key) not between 1 and 300 or p_envelope is null then raise exception 'mip_journal_bad_key';end if;
 insert into mip_identity.journal(runtime,entry_key,envelope) values(r,p_key,p_envelope) on conflict do nothing;
 select envelope into strict v from mip_identity.journal where runtime=r and entry_key=p_key;
 return v;
end $$;
create function mip_identity.journal_get(p_session uuid,p_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text;v jsonb;
begin
 r:=mip_identity.journal_runtime(p_session);
 select envelope into v from mip_identity.journal where runtime=r and entry_key=p_key;
 return v;
end $$;
-- Wrappers require external authority before all sensitive reads or writes.
create function mip_identity.worker_claim(p_request uuid,p_session uuid,p_runtime text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 result:=mip_cutover_authority.worker_claim(p_request,p_session,p_runtime);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 return result;
end $$;
create function mip_identity.worker_complete(p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,p_input_hash text,p_implementation text,p_output jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 result:=mip_cutover_authority.worker_complete(p_request,p_session,p_runtime,p_generation,p_token,p_input_hash,p_implementation,p_output);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 return result;
end $$;
create function mip_identity.worker_fail(p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,p_input_hash text,p_implementation text)
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 result:=mip_cutover_authority.worker_fail(p_request,p_session,p_runtime,p_generation,p_token,p_input_hash,p_implementation);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 return result;
end $$;
create function mip_identity.producer_enqueue(p_request uuid,p_session uuid,p_runtime text,p_payload jsonb,p_observed timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_producer_v1');
 result:=mip_cutover_authority.producer_enqueue(p_request,p_session,p_runtime,p_payload,p_observed);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_producer_v1');
 return result;
end $$;

-- All storage is held by a separate NOLOGIN owner and FORCE RLS applies.
do $ownership$
declare rec record;t text;
begin
 for rec in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='comparison_qualification' loop
 execute 'alter function '||rec.sig||' owner to mip_kernel_owner_v2';
 end loop;
 for rec in select tablename from pg_tables where schemaname='comparison_qualification' loop
 execute format('alter table comparison_qualification.%I owner to mip_cutover_schema_owner_v1',rec.tablename);
 execute format('alter table comparison_qualification.%I force row level security',rec.tablename);
 execute format('grant select,insert,update on comparison_qualification.%I to mip_kernel_owner_v2',rec.tablename);
 execute format('create policy kernel_only_v2 on comparison_qualification.%I to mip_kernel_owner_v2 using(true) with check(true)',rec.tablename);
 end loop;
 for rec in select tablename from pg_tables where schemaname='mip_identity' loop
 execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',rec.tablename);
 execute format('alter table mip_identity.%I enable row level security',rec.tablename);
 execute format('alter table mip_identity.%I force row level security',rec.tablename);
 execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role',rec.tablename);
 end loop;
 foreach t in array array['fence','key_versions','key_heads','mapping_versions','mapping_heads','sessions','retired_authority'] loop
 execute format('grant select on mip_identity.%I to mip_identity_owner_v2',t);
 execute format('create policy identity_read on mip_identity.%I for select to mip_identity_owner_v2 using(true)',t);
 end loop;
end $ownership$;
grant usage on schema comparison_qualification,mip_cutover_authority,public to mip_kernel_owner_v2;
grant select on public.events,public.event_articles,public.articles,public.pipeline_config to mip_kernel_owner_v2;
grant select,insert,update on mip_cutover_authority.source_turns to mip_kernel_owner_v2;
create policy scoped_queue_kernel on mip_cutover_authority.source_turns to mip_kernel_owner_v2 using(true) with check(true);
-- SELECT FOR SHARE/UPDATE requires UPDATE privilege even if no update is performed.
grant update on mip_identity.fence to mip_identity_owner_v2;
create policy fence_lock on mip_identity.fence for update to mip_identity_owner_v2 using(true) with check(true);
grant insert on mip_identity.retired_authority to mip_identity_owner_v2;
create policy retired_append on mip_identity.retired_authority for insert to mip_identity_owner_v2 with check(true);
grant insert on mip_identity.sessions to mip_identity_owner_v2;
create policy identity_issue on mip_identity.sessions for insert to mip_identity_owner_v2 with check(true);
grant usage on schema comparison_qualification to mip_identity_owner_v2;
grant execute on function comparison_qualification.issue_session(text,text,timestamptz),
 comparison_qualification.argument_digest(jsonb) to mip_identity_owner_v2;
grant select,update on comparison_qualification.principal_sessions to mip_identity_owner_v2;
create policy identity_session on comparison_qualification.principal_sessions to mip_identity_owner_v2 using(true) with check(true);
grant select,insert on mip_identity.journal to mip_journal_owner_v2;
create policy encrypted_journal on mip_identity.journal to mip_journal_owner_v2 using(true) with check(true);
do $functions$
declare r record;
begin
 for r in select p.oid::regprocedure::text sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_identity' loop
 execute 'alter function '||r.sig||' owner to '||
 case when r.proname in ('journal_put','journal_get') then 'mip_journal_owner_v2'
 when r.proname in ('worker_claim','worker_complete','worker_fail') then 'mip_comparison_worker_owner_v1'
 when r.proname='producer_enqueue' then 'mip_comparison_producer_owner_v1'
 else 'mip_identity_owner_v2' end;
 end loop;
end $functions$;
revoke all on all functions in schema mip_identity from public,anon,authenticated,service_role;
grant execute on function mip_identity.current_mapping(text,text) to mip_identity_owner_v2;
grant execute on function mip_identity.authorize(uuid,text,text) to mip_identity_owner_v2,mip_comparison_worker_owner_v1,mip_comparison_producer_owner_v1;
grant execute on function mip_identity.journal_runtime(uuid) to mip_journal_owner_v2,mip_journal_gateway_v2;
grant execute on function mip_identity.configuration(text,text),
 mip_identity.issue(uuid,text,text,uuid,uuid,text,text,text,bigint,bigint,text) to mip_identity_broker_v2;
grant execute on function mip_identity.journal_put(uuid,text,jsonb),mip_identity.journal_get(uuid,text) to mip_journal_gateway_v2;
grant execute on function mip_identity.worker_claim(uuid,uuid,text),
 mip_identity.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb),
 mip_identity.worker_fail(uuid,uuid,text,uuid,uuid,text,text) to mip_comparison_worker_v1;
grant execute on function mip_identity.producer_enqueue(uuid,uuid,text,jsonb,timestamptz) to mip_comparison_producer_v1;
alter schema mip_identity owner to mip_cutover_schema_owner_v1;
alter schema comparison_qualification owner to mip_cutover_schema_owner_v1;
alter schema mip_cutover_authority owner to mip_cutover_schema_owner_v1;
-- Remove the old direct entrypoints from the intended external worker boundary.
revoke execute on function mip_cutover_authority.worker_claim(uuid,uuid,text),
 mip_cutover_authority.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb),
 mip_cutover_authority.worker_fail(uuid,uuid,text,uuid,uuid,text,text) from mip_comparison_worker_v1;
revoke execute on function mip_cutover_authority.producer_enqueue(uuid,uuid,text,jsonb,timestamptz) from mip_comparison_producer_v1;
commit;
