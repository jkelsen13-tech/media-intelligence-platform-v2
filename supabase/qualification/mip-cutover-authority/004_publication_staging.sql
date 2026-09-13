-- Isolated publication staging only; no public reader or release grant.
-- Adapter must populate dependencies from the survivor's authoritative predicates.
-- No adapter is provisioned here; absence fails closed. Test fixtures are not approval.
begin;
create table mip_cutover_authority.publication_fence(id boolean primary key check(id));
insert into mip_cutover_authority.publication_fence values(true);
create table mip_cutover_authority.dependency_versions(
 id uuid primary key default gen_random_uuid(),dependency_key text not null,source text not null,
 children text[] not null,record_hash text not null check(record_hash ~ '^[0-9a-f]{64}$'),
 privacy_eligible boolean not null,rights_eligible boolean not null,
 retained_evidence boolean not null,correction_current boolean not null,
 explanation_eligible boolean not null,publication_eligible boolean not null,
 state text not null check(state in ('current','withdrawn','revoked')),
 valid_until timestamptz not null check(isfinite(valid_until)),
 predicate_version text not null check(length(predicate_version)>0),
 recorded_at timestamptz not null default clock_timestamp()
);
create table mip_cutover_authority.dependency_heads(
 dependency_key text primary key,version_id uuid not null references mip_cutover_authority.dependency_versions(id)
);
create table mip_cutover_authority.approved_payloads(
 id uuid primary key default gen_random_uuid(),source text not null,
 generation_id uuid not null references comparison_qualification.outputs(generation_id),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 payload_hash text not null check(payload_hash=encode(sha256(convert_to(payload::text,'UTF8')),'hex')),
 -- Exact dependency versions approved for this payload, not a caller-picked subset.
 dependency_versions uuid[] not null check(cardinality(dependency_versions)>0),
 owner_approval_ref text not null check(length(owner_approval_ref)>0)
);
create table mip_cutover_authority.publication_selections(
 id uuid primary key default gen_random_uuid(),
 approved_payload_id uuid not null unique references mip_cutover_authority.approved_payloads(id),
 selected_at timestamptz not null default clock_timestamp()
);
-- All writers and selectors share a transaction fence. Includes direct fixture writes,
-- so insert/delete/topology changes cannot evade row locks on previously known nodes.
create function mip_cutover_authority.fence_publication_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 return null;
end $$;
revoke all on function mip_cutover_authority.fence_publication_write() from public,anon,authenticated,service_role;
create trigger dependency_versions_fence before insert or update or delete or truncate
 on mip_cutover_authority.dependency_versions for each statement execute function mip_cutover_authority.fence_publication_write();
create trigger dependency_heads_fence before insert or update or delete or truncate
 on mip_cutover_authority.dependency_heads for each statement execute function mip_cutover_authority.fence_publication_write();
create trigger approved_payloads_fence before insert or update or delete or truncate
 on mip_cutover_authority.approved_payloads for each statement execute function mip_cutover_authority.fence_publication_write();

do $immutable$
declare name text;
begin
 foreach name in array array['dependency_versions','approved_payloads','publication_selections'] loop
  execute format('create trigger immutable_history before update or delete on mip_cutover_authority.%I for each row execute function comparison_qualification.reject_rewrite()',name);
  execute format('create trigger immutable_truncate before truncate on mip_cutover_authority.%I for each statement execute function comparison_qualification.reject_rewrite()',name);
 end loop;
 foreach name in array array['publication_fence','dependency_versions','dependency_heads','approved_payloads','publication_selections'] loop
  execute format('alter table mip_cutover_authority.%I enable row level security',name);
  execute format('revoke all on mip_cutover_authority.%I from public,anon,authenticated,service_role',name);
 end loop;
end $immutable$;

create function mip_cutover_authority.check_publication_payload(p_approved uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare approved mip_cutover_authority.approved_payloads; dep record; found_count int:=0;
begin
 -- Stronger serialization than per-dependency locking: one isolated global fence.
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 select * into strict approved from mip_cutover_authority.approved_payloads where id=p_approved;
 if not exists(select 1 from comparison_qualification.generations g
   where g.id=approved.generation_id and g.source_project=approved.source) then
  raise exception 'mip_publication_source_mismatch';
 end if;
 for dep in
  with recursive closure(key) as (
   select v.dependency_key from mip_cutover_authority.dependency_versions v
    where v.id=any(approved.dependency_versions)
   union
   select unnest(v.children) from closure c
    join mip_cutover_authority.dependency_heads h on h.dependency_key=c.key
    join mip_cutover_authority.dependency_versions v on v.id=h.version_id
  )
  select c.key,v.* from closure c
   left join mip_cutover_authority.dependency_heads h on h.dependency_key=c.key
   left join mip_cutover_authority.dependency_versions v on v.id=h.version_id
 loop
  found_count:=found_count+1;
  if dep.id is null or dep.dependency_key is distinct from dep.key or
   dep.source is distinct from approved.source or
   not(dep.id=any(approved.dependency_versions)) or dep.state<>'current' or
   dep.valid_until<=clock_timestamp() or not dep.privacy_eligible or not dep.rights_eligible or
   not dep.retained_evidence or not dep.correction_current or not dep.explanation_eligible or
   not dep.publication_eligible then raise exception 'mip_publication_dependency_ineligible'; end if;
 end loop;
 if found_count=0 or found_count<>(select count(distinct x) from unnest(approved.dependency_versions) x) then
  raise exception 'mip_publication_dependency_missing';
 end if;
 return approved.payload;
end $$;
create function mip_cutover_authority.select_approved_payload(p_approved uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected uuid;
begin
 -- Identical retries still recheck current transitive eligibility.
 perform mip_cutover_authority.check_publication_payload(p_approved);
 insert into mip_cutover_authority.publication_selections(approved_payload_id)
 values(p_approved) on conflict(approved_payload_id) do nothing returning id into selected;
 if selected is null then select id into strict selected from mip_cutover_authority.publication_selections where approved_payload_id=p_approved; end if;
 return selected;
end $$;
revoke all on function mip_cutover_authority.check_publication_payload(uuid),
 mip_cutover_authority.select_approved_payload(uuid) from public,anon,authenticated,service_role;
-- No grants: only isolated owner fixtures can stage approvals or call selection.
-- Existing publisher_release remains a refusing stub. No automatic approval.
commit;
