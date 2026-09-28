-- native-governed-activation-v1. Separate successor, not a change to v6/019.
-- Compile only through prepare.mjs while the original temporary owner leases exist.
-- No LOGIN creation, credentials, source payload, publication, or eligibility writes.
-- The parent owns BEGIN/COMMIT and historical checkpoints. Authored; NOT RUN.
create schema mip_native_activation;
revoke all on schema mip_native_activation from public,anon,authenticated,service_role;
create table mip_native_activation.bootstrap(
 singleton boolean primary key check(singleton),
 operation_id text not null references mip_comparison_install.receipts(operation_id),
 installer name not null,installer_oid oid not null,
 issuer name not null,issuer_oid oid not null,issuer_edges jsonb not null,
 metadata_auditor name not null,metadata_auditor_oid oid not null,
 install_manifest text not null, native_program text not null, successor_program text not null,
 original_edges jsonb not null,role_catalog jsonb not null,
 catalog_hash text not null check(catalog_hash~'^[0-9a-f]{64}$')
);
create table mip_native_activation.revisions(
 revision uuid primary key,predecessor uuid unique references mip_native_activation.revisions,
 operation_id text not null references mip_comparison_install.receipts(operation_id),
 action text not null check(action in('pending','active','disabled_bootstrap')),
 members jsonb not null, authority jsonb not null,
 request_hash text not null check(request_hash~'^[0-9a-f]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
create unique index activation_one_root on mip_native_activation.revisions((true)) where predecessor is null;
create table mip_native_activation.head(
 singleton boolean primary key check(singleton),
 revision uuid unique references mip_native_activation.revisions
);
insert into mip_native_activation.head values(true,null);
alter table mip_native_activation.bootstrap enable row level security;
alter table mip_native_activation.bootstrap force row level security;
alter table mip_native_activation.revisions enable row level security;
alter table mip_native_activation.revisions force row level security;
alter table mip_native_activation.head enable row level security;
alter table mip_native_activation.head force row level security;
create policy installer on mip_native_activation.bootstrap to __INSTALLER__ using(true) with check(true);
create policy installer on mip_native_activation.revisions to __INSTALLER__ using(true) with check(true);
create policy installer on mip_native_activation.head to __INSTALLER__ using(true) with check(true);
revoke all on all tables in schema mip_native_activation from public,anon,authenticated,service_role;
grant usage on schema mip_native_activation to __AUDITOR__;
grant select on mip_native_activation.bootstrap,mip_native_activation.head to __AUDITOR__;
grant select(revision,predecessor,operation_id,action,members,request_hash,recorded_at) on mip_native_activation.revisions to __AUDITOR__;
create policy metadata_auditor on mip_native_activation.bootstrap for select to __AUDITOR__ using(true);
create policy metadata_auditor on mip_native_activation.revisions for select to __AUDITOR__ using(true);
create policy metadata_auditor on mip_native_activation.head for select to __AUDITOR__ using(true);
create function mip_native_activation.reject_change() returns trigger
language plpgsql set search_path='' as $f$
begin raise exception 'native_activation_immutable';end $f$;
create trigger immutable before update or delete or truncate on mip_native_activation.bootstrap
 for each statement execute function mip_native_activation.reject_change();
create trigger immutable before update or delete or truncate on mip_native_activation.revisions
 for each statement execute function mip_native_activation.reject_change();
create trigger no_truncate before truncate on mip_native_activation.head
 for each statement execute function mip_native_activation.reject_change();

-- Only logical catalog metadata enters this hash; neither relation rows nor
-- statistics, token values, password hashes, or connection settings are read.
-- Freeze the whole non-system catalog. Unrelated DDL deliberately invalidates it.
create function mip_native_activation.catalog_hash() returns text
language sql stable set search_path='' as $f$
with ns as (
 select oid,nspname,nspowner,nspacl from pg_catalog.pg_namespace
 where nspname<>'information_schema' and nspname !~ '^pg_'
), objects as (
 select 'namespace' k,n.oid::text id,to_jsonb(n) v from ns n
 union all
 select 'function',p.oid::text,to_jsonb(p) from pg_catalog.pg_proc p join ns n on n.oid=p.pronamespace
 union all
 select 'relation',c.oid::text,jsonb_build_array(c.relname,c.relnamespace,c.reltype,c.relowner,c.relkind,
 c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.reloptions,c.relreplident,c.relpartbound)
 from pg_catalog.pg_class c join ns n on n.oid=c.relnamespace
 union all
 select 'column',a.attrelid::text||':'||a.attnum,to_jsonb(a)-array['attstattarget','attcacheoff']
 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join ns n on n.oid=c.relnamespace
 where a.attnum>0
 union all
 select 'constraint',c.oid::text,to_jsonb(c) from pg_catalog.pg_constraint c join ns n on n.oid=c.connamespace
 union all
 select 'trigger',t.oid::text,to_jsonb(t) from pg_catalog.pg_trigger t
 join pg_catalog.pg_class c on c.oid=t.tgrelid join ns n on n.oid=c.relnamespace
 union all
 select 'policy',p.oid::text,to_jsonb(p) from pg_catalog.pg_policy p
 join pg_catalog.pg_class c on c.oid=p.polrelid join ns n on n.oid=c.relnamespace
 union all
 select 'index',i.indexrelid::text,to_jsonb(i) from pg_catalog.pg_index i
 join pg_catalog.pg_class c on c.oid=i.indrelid join ns n on n.oid=c.relnamespace
 union all
 select 'default',a.oid::text,to_jsonb(a) from pg_catalog.pg_default_acl a
 union all
 select 'type',t.oid::text,to_jsonb(t) from pg_catalog.pg_type t join ns n on n.oid=t.typnamespace
 union all
 select 'rewrite',r.oid::text,to_jsonb(r) from pg_catalog.pg_rewrite r
 join pg_catalog.pg_class c on c.oid=r.ev_class join ns n on n.oid=c.relnamespace
)
select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(k,id,v) order by k,id),'[]'::jsonb)::text,'UTF8')),'hex') from objects;
$f$;

-- This list is fixed by prepare.mjs, not supplied by an activation caller.
create function mip_native_activation.roles() returns text[]
language sql immutable set search_path='' as $f$ select __PROTECTED_ROLES__::text[] $f$;
create function mip_native_activation.groups() returns text[]
language sql immutable set search_path='' as $f$
 select array['mip_arc_native_worker','mip_comparison_worker_v1','mip_identity_broker_v2','mip_mentions_admin','mip_mentions_gateway']::text[]
$f$;
create function mip_native_activation.role_catalog() returns jsonb
language sql stable set search_path='' as $f$
select coalesce(jsonb_agg(jsonb_build_object('oid',oid::text,'name',rolname,'login',rolcanlogin,
 'super',rolsuper,'create_role',rolcreaterole,'create_db',rolcreatedb,'replication',rolreplication,
 'bypass',rolbypassrls,'inherit',rolinherit) order by rolname),'[]'::jsonb)
from pg_catalog.pg_roles where rolname=any(mip_native_activation.roles());
$f$;
create function mip_native_activation.edges() returns jsonb
language sql stable set search_path='' as $f$
select coalesce(jsonb_agg(jsonb_build_object('role_name',p.rolname,'role_oid',p.oid::text,
 'member_name',m.rolname,'member_oid',m.oid::text,'grantor_oid',a.grantor::text,
 'admin_option',a.admin_option,'inherit_option',a.inherit_option,'set_option',a.set_option)
 order by p.rolname,m.rolname,a.grantor),'[]'::jsonb)
from pg_catalog.pg_auth_members a join pg_catalog.pg_roles p on p.oid=a.roleid
join pg_catalog.pg_roles m on m.oid=a.member
where p.rolname=any(mip_native_activation.roles()) or m.rolname=any(mip_native_activation.roles())
 or p.rolname='__ISSUER__' or m.rolname='__ISSUER__';
$f$;

-- Source-defined metadata-only helpers. Owners retain no schema CREATE/USAGE
-- path after installation. No helper returns protected material or a session.
grant usage,create on schema mip_native_activation to mip_mentions_owner;
set role mip_mentions_owner;
create function mip_native_activation.provisioning_current(a jsonb,m jsonb) returns void
language plpgsql security definer set search_path='' as $f$
declare r record;
begin
 perform mip_mentions.lock_policy();
 for r in select value->>'name' login,value->>'group' group_name from jsonb_array_elements(m)
 where value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_arc_native_worker')
 order by value->>'name' loop
  perform 1 from mip_mentions.members where scope=(a->>'scope')::uuid and principal=r.login::name
   and (r.group_name<>'mip_mentions_admin' or can_decide) for share;
  if not found then raise exception 'native_activation_scope';end if;
 end loop;
end $f$;
create function mip_native_activation.native_current(a jsonb,m jsonb,broker_session uuid) returns void
language plpgsql security definer set search_path='' as $f$
declare r record;ad mip_native_caller.admissions;head_id uuid;
begin
 perform mip_mentions.lock_policy();
 for r in select value->>'name' login,value->>'group' group_name from jsonb_array_elements(m)
 where value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_arc_native_worker')
 order by value->>'name' loop
  perform 1 from mip_mentions.members where scope=(a->>'scope')::uuid and principal=r.login::name
   and (r.group_name<>'mip_mentions_admin' or can_decide) for share;
  if not found then raise exception 'native_activation_scope';end if;
 end loop;
 select revision into head_id from mip_native_caller.heads
 where subject_id=(a->>'subject')::uuid and scope=(a->>'scope')::uuid
 and binding_id=(a->>'binding')::uuid for share;
 select * into ad from mip_native_caller.admissions where revision=head_id;
 if not found or head_id is distinct from (a->>'admission')::uuid or not ad.active
 or ad.gateway_login::text is distinct from (select value->>'name' from jsonb_array_elements(m) where value->>'group'='mip_mentions_gateway')
 or ad.manifest_hash is distinct from a->>'manifest' or ad.broker_session is distinct from broker_session
 or ad.runtime is distinct from a->>'caller_runtime'
 or ad.valid_from>clock_timestamp() or ad.valid_until<=clock_timestamp()
 then raise exception 'native_activation_admission';end if;
end $f$;
reset role;
revoke usage,create on schema mip_native_activation from mip_mentions_owner;

grant usage,create on schema mip_native_activation to mip_identity_owner_v2;
set role mip_identity_owner_v2;
create function mip_native_activation.identity_current(a jsonb,broker_session uuid,worker_session uuid) returns void
language plpgsql security definer set search_path='' as $f$
declare mapping mip_identity.mapping_versions;
begin
 mapping:=mip_identity.current_mapping(a->>'caller_runtime','mip_projection_publisher_v1');
 if mapping.revision is distinct from (a->>'mapping')::uuid
 or mapping.key_revision is distinct from (a->>'key')::uuid then raise exception 'native_activation_identity';end if;
 perform mip_identity.authorize(broker_session,a->>'caller_runtime','mip_projection_publisher_v1');
 mapping:=mip_identity.current_mapping(a->>'worker_runtime','mip_comparison_worker_v1');
 if mapping.revision is distinct from (a->>'worker_mapping')::uuid
 or mapping.key_revision is distinct from (a->>'worker_key')::uuid then raise exception 'native_activation_identity';end if;
 perform mip_identity.authorize(worker_session,a->>'worker_runtime','mip_comparison_worker_v1');
end $f$;
reset role;
revoke usage,create on schema mip_native_activation from mip_identity_owner_v2;

grant usage,create on schema mip_native_activation to mip_kernel_owner_v2;
set role mip_kernel_owner_v2;
create function mip_native_activation.worker_current(a jsonb,worker_session uuid) returns void
language plpgsql security definer set search_path='' as $f$
declare rpc text;
begin
 perform mip_comparison_kernel_v1.require_source_scope(a->>'worker_runtime',a->>'source');
 perform mip_comparison_kernel_v1.require_evaluated_implementation(a->>'worker_runtime',a->>'implementation');
 foreach rpc in array array['worker_claim','worker_complete','worker_fail','worker_journal_put','worker_journal_get','worker_journal_pending','worker_resume_claim'] loop
  perform mip_comparison_kernel_v1.require_bound_final('mip_comparison_worker_v1',rpc,worker_session,a->>'worker_runtime');
 end loop;
end $f$;
reset role;
revoke usage,create on schema mip_native_activation from mip_kernel_owner_v2;

grant usage,create on schema mip_native_activation to mip_efta_auth_session_owner_v1;
set role mip_efta_auth_session_owner_v1;
create function mip_native_activation.auth_current(a jsonb,auth_session uuid,token_exp bigint) returns void
language plpgsql security definer set search_path='' as $f$
declare deadline timestamptz;u uuid:=(a->>'subject')::uuid;session_id uuid:=auth_session;
begin
 -- Match the existing publication-before-Auth lock order.
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 -- Original caller revokes its Auth owner's own EXECUTE on assert_session.
 -- Preserve that ACL; perform the identical live-session check with existing column rights.
 if u is null or session_id is null or token_exp is null or token_exp<1 or token_exp>253402300799
 or to_timestamp(token_exp)<=clock_timestamp() then raise exception 'native_caller_denied';end if;
 select x.not_after into deadline from auth.sessions x
 where x.id=session_id and x.user_id=u for share;
 if not found or(deadline is not null and deadline<=clock_timestamp())
 or to_timestamp(token_exp)<=clock_timestamp() then raise exception 'native_caller_denied';end if;
end $f$;
reset role;
revoke usage,create on schema mip_native_activation from mip_efta_auth_session_owner_v1;

create function mip_native_activation.validate_authority(action text,a jsonb) returns void
language plpgsql set search_path='' as $f$
declare allowed text[];k text;deadline timestamptz;
begin
 if action is null or action not in('pending','active','disabled_bootstrap') or jsonb_typeof(a) is distinct from 'object'
 then raise exception 'native_activation_authority';end if;
 if action='disabled_bootstrap' then
  if a<>'{}'::jsonb then raise exception 'native_activation_authority';end if;return;
 end if;
 allowed:=array['scope','subject','valid_until','auth_session_hash','token_exp'];
 if action='active' then allowed:=allowed||array['binding','manifest','admission','caller_runtime','worker_runtime',
  'source','implementation','mapping','key','worker_mapping','worker_key','broker_session_hash','worker_session_hash'];end if;
 if not(a?&allowed) or(a-allowed)<>'{}'::jsonb
 or exists(select 1 from unnest(allowed) x where jsonb_typeof(a->x) is distinct from 'string')
 then raise exception 'native_activation_authority';end if;
 foreach k in array array['scope','subject','binding','admission','mapping','key','worker_mapping','worker_key'] loop
  if k=any(allowed) then
   if a->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   then raise exception 'native_activation_authority';end if;
   perform (a->>k)::uuid;
  end if;
 end loop;
 foreach k in array array['manifest','broker_session_hash','worker_session_hash','auth_session_hash'] loop
  if k=any(allowed) and a->>k !~ '^[0-9a-f]{64}$' then raise exception 'native_activation_authority';end if;
 end loop;
 if a->>'token_exp' !~ '^[1-9][0-9]{0,11}$' or(a->>'token_exp')::bigint>253402300799
 or a->>'valid_until' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
 then raise exception 'native_activation_authority';end if;
 deadline:=(a->>'valid_until')::timestamptz;
 if deadline is null or not isfinite(deadline) then raise exception 'native_activation_authority';end if;
 if action='active' and (
  a->>'caller_runtime' !~ '^[A-Za-z0-9._:-]{1,100}$' or a->>'worker_runtime' !~ '^[A-Za-z0-9._:-]{1,100}$'
  or length(a->>'source') not between 1 and 100 or length(a->>'implementation') not between 1 and 300)
 then raise exception 'native_activation_authority';end if;
end $f$;

create function mip_native_activation.assert_current(expected_state text,expected_revision uuid,
 broker_session uuid default null,worker_session uuid default null,auth_session uuid default null,token_exp bigint default null)
returns void language plpgsql set search_path='' as $f$
declare b mip_native_activation.bootstrap;v mip_native_activation.revisions;
 actual jsonb;want jsonb;r record;x record;role_oid oid;member_oid oid;deadline timestamptz;
begin
 if current_setting('transaction_isolation')<>'read committed' or current_user<>session_user
 then raise exception 'native_activation_identity';end if;
 perform pg_advisory_xact_lock(171903,7001);
 select * into strict b from mip_native_activation.bootstrap where singleton;
 if session_user<>b.installer or session_user::regrole::oid<>b.installer_oid
 or not exists(select 1 from pg_roles where oid=b.installer_oid and rolcanlogin and not rolsuper
   and rolcreaterole and rolcreatedb and rolbypassrls and rolinherit and not rolreplication)
 then raise exception 'native_activation_installer';end if;
 if b.metadata_auditor<>'__AUDITOR_NAME__' or not exists(select 1 from pg_roles where oid=b.metadata_auditor_oid and rolname=b.metadata_auditor
  and rolcanlogin and not(rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls or rolinherit))
 or exists(select 1 from pg_auth_members where roleid=b.metadata_auditor_oid or member=b.metadata_auditor_oid)
 or exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=b.metadata_auditor_oid and deptype='o')
 then raise exception 'native_activation_metadata_auditor';end if;
 perform 1 from mip_native_activation.head where singleton and revision is not distinct from expected_revision for share;
 if not found then raise exception 'native_activation_head';end if;
 if expected_revision is not null then
  select * into strict v from mip_native_activation.revisions where revision=expected_revision;
  if v.action<>expected_state then raise exception 'native_activation_state';end if;
  perform mip_native_activation.validate_authority(v.action,v.authority);
 elsif expected_state<>'disabled_bootstrap' then raise exception 'native_activation_state';end if;
 if not exists(select 1 from mip_comparison_install.receipts where operation_id=b.operation_id
   and installer=b.installer and manifest_sha256=b.install_manifest)
 or not exists(select 1 from mip_comparison_install.native_programs where operation_id=b.operation_id
   and mode='native-governed-v6' and program_sha256=b.native_program)
 or mip_native_activation.role_catalog() is distinct from b.role_catalog
 or mip_native_activation.catalog_hash() is distinct from b.catalog_hash
 then raise exception 'native_activation_source_drift';end if;
 if expected_state in('pending','active') and not exists(
  select 1 from mip_comparison_install.audit_qualifications where operation_id=b.operation_id and manifest_sha256=b.install_manifest)
 then raise exception 'native_activation_audit_unqualified';end if;
 want:=b.original_edges||b.issuer_edges;
 if expected_state in('pending','active') then
  select want||coalesce(jsonb_agg(jsonb_build_object('role_name',value->>'group','role_oid',value->>'group_oid',
    'member_name',value->>'name','member_oid',value->>'oid','grantor_oid',case when value->>'group' in('mip_mentions_admin','mip_mentions_gateway') then b.installer_oid::text else b.issuer_oid::text end,
    'admin_option',false,'inherit_option',true,'set_option',false)),'[]'::jsonb)
  into want from jsonb_array_elements(v.members)
  where expected_state='active' or value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2');
 end if;
 select jsonb_agg(value order by value->>'role_name',value->>'member_name',(value->>'grantor_oid')::oid)
 into want from jsonb_array_elements(want);
 if mip_native_activation.edges() is distinct from want then raise exception 'native_activation_edges';end if;
 if b.issuer<>'__ISSUER__' or not exists(select 1 from pg_roles where oid=b.issuer_oid and rolname=b.issuer
  and not(rolcanlogin or rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls or rolinherit))
 or exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=b.issuer_oid and (deptype='o' or(deptype in('a','i','r') and classid<>'pg_auth_members'::regclass)))
 or pg_has_role(b.installer_oid,b.issuer_oid,'USAGE') or not pg_has_role(b.installer_oid,b.issuer_oid,'SET')
 then raise exception 'native_activation_issuer';end if;
 foreach role_oid in array array(select oid from pg_roles where rolname=any(mip_native_activation.groups())) loop
  if pg_has_role(b.installer_oid,role_oid,'USAGE') or pg_has_role(b.installer_oid,role_oid,'SET')
  or pg_has_role(b.issuer_oid,role_oid,'USAGE') or pg_has_role(b.issuer_oid,role_oid,'SET')
  or exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=role_oid and deptype='o')
  then raise exception 'native_activation_group_owner_or_installer_path';end if;
 end loop;
 -- Scoped issuer cannot execute any source-granted operational function,
 -- read private storage, or create objects via PUBLIC or transitive privileges.
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where a.grantee in(select oid from pg_roles where rolname=any(mip_native_activation.groups()))
   and has_function_privilege(b.issuer_oid,p.oid,'EXECUTE'))
 or exists(select 1 from pg_namespace where nspname<>'information_schema' and nspname !~ '^pg_' and has_schema_privilege(b.issuer_oid,oid,'CREATE'))
 then raise exception 'native_activation_issuer_rights';end if;
 for x in select c.oid,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in('mip_mentions','mip_arc_native','mip_arc_qik_source','mip_arc_projection_private',
    'mip_native_comparison','mip_native_caller','mip_comparison_kernel_v1','mip_cutover_authority',
    'mip_identity','mip_factual','evidence_pipeline','auth') and c.relkind in('r','p','v','m','f','S') loop
   if (case when x.relkind='S' then has_sequence_privilege(b.issuer_oid,x.oid,'USAGE,SELECT,UPDATE')
    else has_table_privilege(b.issuer_oid,x.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      or has_any_column_privilege(b.issuer_oid,x.oid,'SELECT,INSERT,UPDATE,REFERENCES') end)
   then raise exception 'native_activation_issuer_storage';end if;
  end loop;
 -- Bound runtime identities are separate leaf LOGINs, including in disabled state.
 for r in select value from jsonb_array_elements(coalesce(v.members,'[]'::jsonb)) loop
  member_oid:=(r.value->>'oid')::oid;role_oid:=(r.value->>'group_oid')::oid;
  if not exists(select 1 from pg_roles where oid=member_oid and rolname=r.value->>'name'
    and rolcanlogin and not(rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls or rolinherit))
  or exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=member_oid and deptype='o')
  or exists(select 1 from pg_auth_members where (roleid=member_oid or member=member_oid)
   and not((expected_state='active' or(expected_state='pending' and r.value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2'))) and roleid=role_oid and member=member_oid and grantor=case when r.value->>'group' in('mip_mentions_admin','mip_mentions_gateway') then b.installer_oid else b.issuer_oid end
    and not admin_option and inherit_option and not set_option))
  then raise exception 'native_activation_runtime_identity';end if;
  -- Effective privileges must equal its one source-defined group in active mode.
  -- In disabled mode they must equal PUBLIC-only privileges: no direct ACL remains.
  if exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=member_oid and deptype in('a','i','r') and classid<>'pg_auth_members'::regclass)
  then raise exception 'native_activation_runtime_direct_rights';end if;
  for x in select n.oid from pg_namespace n where n.nspname<>'information_schema' and n.nspname !~ '^pg_' loop
   if has_schema_privilege(member_oid,x.oid,'CREATE') or
    ((expected_state='active' or(expected_state='pending' and r.value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2'))) and has_schema_privilege(member_oid,x.oid,'USAGE') is distinct from has_schema_privilege(role_oid,x.oid,'USAGE'))
   then raise exception 'native_activation_schema_rights';end if;
  end loop;
  if expected_state='active' or(expected_state='pending' and r.value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2')) then
   for x in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname<>'information_schema' and n.nspname !~ '^pg_' loop
    if has_function_privilege(member_oid,x.oid,'EXECUTE') is distinct from has_function_privilege(role_oid,x.oid,'EXECUTE')
    then raise exception 'native_activation_execute_rights';end if;
   end loop;
  end if;
  for x in select c.oid,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in('mip_mentions','mip_arc_native','mip_arc_qik_source','mip_arc_projection_private',
    'mip_native_comparison','mip_native_caller','mip_comparison_kernel_v1','mip_cutover_authority',
    'mip_identity','mip_factual','evidence_pipeline','auth') and c.relkind in('r','p','v','m','f','S') loop
   if (case when x.relkind='S' then has_sequence_privilege(member_oid,x.oid,'USAGE,SELECT,UPDATE')
    else has_table_privilege(member_oid,x.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      or has_any_column_privilege(member_oid,x.oid,'SELECT,INSERT,UPDATE,REFERENCES') end)
   then raise exception 'native_activation_runtime_storage';end if;
  end loop;
 end loop;
 if expected_state='pending' then
  if broker_session is not null or worker_session is not null or auth_session is null or token_exp is null
   or encode(sha256(convert_to(auth_session::text,'UTF8')),'hex') is distinct from v.authority->>'auth_session_hash'
   or token_exp::text is distinct from v.authority->>'token_exp'
  then raise exception 'native_activation_ephemeral_context';end if;
  deadline:=(v.authority->>'valid_until')::timestamptz;
  if deadline is null or not isfinite(deadline) or deadline<=clock_timestamp() then raise exception 'native_activation_expired';end if;
  perform mip_native_activation.provisioning_current(v.authority,v.members);
  perform mip_native_activation.auth_current(v.authority,auth_session,token_exp);
  if deadline<=clock_timestamp() then raise exception 'native_activation_expired';end if;
 end if;
 if expected_state='active' then
  if broker_session is null or worker_session is null or auth_session is null or token_exp is null
   or encode(sha256(convert_to(broker_session::text,'UTF8')),'hex') is distinct from v.authority->>'broker_session_hash'
   or encode(sha256(convert_to(worker_session::text,'UTF8')),'hex') is distinct from v.authority->>'worker_session_hash'
   or encode(sha256(convert_to(auth_session::text,'UTF8')),'hex') is distinct from v.authority->>'auth_session_hash'
   or token_exp::text is distinct from v.authority->>'token_exp'
  then raise exception 'native_activation_ephemeral_context';end if;
  deadline:=(v.authority->>'valid_until')::timestamptz;
  if deadline is null or not isfinite(deadline) or deadline<=clock_timestamp() then raise exception 'native_activation_expired';end if;
  perform mip_native_activation.native_current(v.authority,v.members,broker_session);
  perform mip_native_activation.identity_current(v.authority,broker_session,worker_session);
  perform mip_native_activation.worker_current(v.authority,worker_session);
  perform mip_native_activation.auth_current(v.authority,auth_session,token_exp);
  if deadline<=clock_timestamp() then raise exception 'native_activation_expired';end if;
 end if;
end $f$;

-- A fixed five-group transition, not an arbitrary role issuer or SQL callback.
-- Exact retries rerun current validation; old/superseded revisions never succeed.
create function mip_native_activation.transition(r uuid,previous uuid,action text,members jsonb,authority jsonb,
 broker_session uuid default null,worker_session uuid default null,auth_session uuid default null,token_exp bigint default null)
returns text language plpgsql set search_path='' as $f$
declare b mip_native_activation.bootstrap;old mip_native_activation.revisions;head_id uuid;
 request_hash text;x record;prior_members jsonb;prior_action text;
begin
 perform pg_advisory_xact_lock(171903,7001);
 select * into strict b from mip_native_activation.bootstrap where singleton;
 if current_user<>session_user or session_user<>b.installer or session_user::regrole::oid<>b.installer_oid
 or current_setting('transaction_isolation')<>'read committed'
 then raise exception 'native_activation_installer';end if;
 select revision into head_id from mip_native_activation.head where singleton for update;
 if r is null or action not in('pending','active','disabled_bootstrap') or action is null
 or jsonb_typeof(members) is distinct from 'array' or jsonb_array_length(members)<>5
 or jsonb_typeof(authority) is distinct from 'object'
 then raise exception 'native_activation_request';end if;
 if (select array_agg(value->>'group' order by value->>'group') from jsonb_array_elements(members))
  is distinct from mip_native_activation.groups()
 or (select count(distinct value->>'name') from jsonb_array_elements(members))<>5
 or (select count(distinct value->>'oid') from jsonb_array_elements(members))<>5
 or exists(select 1 from jsonb_array_elements(members) m where jsonb_typeof(value)<>'object'
  or not(value?&array['group','group_oid','name','oid'])
  or (value-array['group','group_oid','name','oid'])<>'{}'::jsonb
  or exists(select 1 from unnest(array['group','group_oid','name','oid']) k where jsonb_typeof(value->k) is distinct from 'string')
  or value->>'name' !~ '^[a-z][a-z0-9_]{0,62}$'
  or value->>'oid' !~ '^[1-9][0-9]*$' or value->>'group_oid' !~ '^[1-9][0-9]*$'
  or not exists(select 1 from pg_roles where rolname=value->>'group' and oid=(value->>'group_oid')::oid))
 then raise exception 'native_activation_members';end if;
 select jsonb_agg(value order by value->>'group') into members from jsonb_array_elements(members);
 perform mip_native_activation.validate_authority(action,authority);
 if action='disabled_bootstrap' and(broker_session is not null or worker_session is not null or auth_session is not null or token_exp is not null)
 then raise exception 'native_activation_disabled_authority';end if;
 if action='pending' then
  if not(authority?&array['scope','subject','valid_until','auth_session_hash','token_exp'])
  or(authority-array['scope','subject','valid_until','auth_session_hash','token_exp'])<>'{}'::jsonb
  then raise exception 'native_activation_authority';end if;
 elsif action='active' then
  if not(authority?&array['scope','subject','binding','manifest','admission','caller_runtime','worker_runtime','source','implementation',
   'mapping','key','worker_mapping','worker_key','valid_until','broker_session_hash','worker_session_hash','auth_session_hash','token_exp'])
  or(authority-array['scope','subject','binding','manifest','admission','caller_runtime','worker_runtime','source','implementation',
   'mapping','key','worker_mapping','worker_key','valid_until','broker_session_hash','worker_session_hash','auth_session_hash','token_exp'])<>'{}'::jsonb
  or authority->>'manifest' !~ '^[0-9a-f]{64}$'
  or authority->>'caller_runtime' !~ '^[A-Za-z0-9._:-]{1,100}$'
  or authority->>'worker_runtime' !~ '^[A-Za-z0-9._:-]{1,100}$'
  or length(authority->>'source') not between 1 and 100
  or length(authority->>'implementation') not between 1 and 300
  then raise exception 'native_activation_authority';end if;
 elsif authority<>'{}'::jsonb then raise exception 'native_activation_disabled_authority';end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(r,previous,action,members,authority,b.operation_id,
  b.install_manifest,b.native_program,b.successor_program)::text,'UTF8')),'hex');
 select * into old from mip_native_activation.revisions where revision=r;
 if found then
  if old.request_hash<>request_hash or head_id is distinct from r then raise exception 'native_activation_retry_conflict';end if;
  perform mip_native_activation.assert_current(action,r,broker_session,worker_session,auth_session,token_exp);
  return action;
 end if;
 if head_id is distinct from previous then raise exception 'native_activation_predecessor';end if;
 select v.action,v.members into prior_action,prior_members from mip_native_activation.revisions v where v.revision=head_id;
 -- Deactivation must remain possible after broker/Auth/admission revocation.
 -- Structural verification uses the current active topology but omits currentness
 -- by using a dedicated structure-only helper, never a caller-controlled waiver.
 if action='disabled_bootstrap' then perform mip_native_activation.assert_deactivation_input();
 else perform mip_native_activation.assert_structure();end if;
 if action='active' and coalesce(prior_action,'disabled_bootstrap') not in('pending','active')
 then raise exception 'native_activation_pending_required';end if;
 if action='pending' and prior_action='active' then raise exception 'native_activation_deactivation_required';end if;
 if action in('pending','active') and prior_action in('pending','active') and
  (authority->>'scope' is distinct from (select v.authority->>'scope' from mip_native_activation.revisions v where v.revision=head_id)
   or authority->>'subject' is distinct from (select v.authority->>'subject' from mip_native_activation.revisions v where v.revision=head_id))
 then raise exception 'native_activation_rebind_requires_deactivation';end if;
 if head_id is not null and prior_action in('pending','active') then
  if members is distinct from prior_members then raise exception 'native_activation_rebind_requires_deactivation';end if;
  for x in select value from jsonb_array_elements(prior_members)
   where prior_action='active' or value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2') loop
   if x.value->>'group' in('mip_mentions_admin','mip_mentions_gateway') then
    execute format('revoke %I from %I granted by %I restrict',x.value->>'group',x.value->>'name',b.installer);
   else
    execute format('set local role %I',b.issuer);
    execute format('revoke %I from %I granted by %I restrict',x.value->>'group',x.value->>'name',b.issuer);
    execute format('set local role %I',b.installer);
   end if;
  end loop;
 end if;
 if action in('pending','active') then
  for x in select value from jsonb_array_elements(members)
   where action='active' or value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2') loop
   if x.value->>'group' in('mip_mentions_admin','mip_mentions_gateway') then
    execute format('grant %I to %I with admin false,inherit true,set false granted by %I',
     x.value->>'group',x.value->>'name',b.installer);
   else
    execute format('set local role %I',b.issuer);
    execute format('grant %I to %I with admin false,inherit true,set false granted by %I',
     x.value->>'group',x.value->>'name',b.issuer);
    execute format('set local role %I',b.installer);
   end if;
  end loop;
 end if;
 insert into mip_native_activation.revisions values(r,previous,b.operation_id,action,members,authority,request_hash,clock_timestamp());
 update mip_native_activation.head set revision=r where singleton;
 perform mip_native_activation.assert_current(action,r,broker_session,worker_session,auth_session,token_exp);
 return action;
end $f$;

-- The structural checker is derived from the exact assertion body by the compiler:
-- same catalog/topology/runtime checks, no broker/Auth/admission access.
-- It is installer-only and not an alternate active-success endpoint.
__STRUCTURAL_CHECKER__
__DEACTIVATION_CHECKER__

revoke all on all functions in schema mip_native_activation from public,anon,authenticated,service_role;
grant execute on all functions in schema mip_native_activation to __INSTALLER__;
