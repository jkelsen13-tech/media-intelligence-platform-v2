-- Disposable-only extension over 007/008. No production installation or public release.
begin;
create schema mip_factual;
create schema mip_factual_transport;
create extension dblink with schema mip_factual_transport;
do $$begin
 if not exists(select 1 from pg_roles where rolname='mip_factual_owner_v3') then create role mip_factual_owner_v3 nologin nosuperuser nobypassrls;end if;
 if not exists(select 1 from pg_roles where rolname='mip_factual_reviewer_v3') then create role mip_factual_reviewer_v3 nologin nosuperuser nobypassrls;end if;
end $$;
create table mip_factual.audit_connection(id boolean primary key check(id),connection_string text not null);
-- Separate connection commits before the rejecting transaction raises; no outer-row FK.
create table mip_factual.rejection_audit(
 id uuid primary key,explanation_id uuid not null,assertion_digest text not null,
 attempted_transition text not null check(attempted_transition='published'),
 rule text not null check(rule in ('provenance','human_review','source_state')),
 recorded_at timestamptz not null default clock_timestamp()
);
create table mip_factual.human_reviews(
 id uuid primary key default gen_random_uuid(),explanation_id uuid not null,
 record_hash text not null,source_hash text not null,approval_ref text not null check(length(btrim(approval_ref))>0),
 reviewer_role text not null,recorded_at timestamptz not null default clock_timestamp()
);
create table mip_factual.explanation_history(
 id uuid primary key default gen_random_uuid(),explanation_id uuid not null,
 row_data jsonb not null,recorded_at timestamptz not null default clock_timestamp()
);
create table mip_factual.source_changes(
 id uuid primary key,source_id uuid not null,change_kind text not null check(change_kind in ('corrected','withdrawn')),
 affected_ids uuid[] not null,skipped_withdrawn_ids uuid[] not null,
 actor_role text not null,recorded_at timestamptz not null default clock_timestamp()
);
create table mip_factual.source_change_links(
 change_id uuid not null references mip_factual.source_changes,
 prior_explanation_id uuid not null,new_explanation_id uuid not null,
 primary key(change_id,prior_explanation_id)
);
create function mip_factual.source_hash(ids uuid[]) returns text
language sql security definer set search_path='' as $$
 select comparison_qualification.argument_digest(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)) from public.articles a where a.id=any(ids);
$$;
create function mip_factual.record_hash(x jsonb) returns text
language sql immutable set search_path='' as $$
 select comparison_qualification.argument_digest(x-'review_status'-'state');
$$;
create function mip_factual.log_rejection(x jsonb,rule text) returns void
language plpgsql security definer set search_path='' as $$
declare conn text;
begin
 if rule not in ('provenance','human_review','source_state') then raise exception 'mip_audit_rule_invalid';end if;
 select connection_string into strict conn from mip_factual.audit_connection where id;
 -- Only UUID/digest/fixed code cross this boundary: never passages, source text, approval refs or SQL errors.
 perform mip_factual_transport.dblink_exec(conn,format(
 'insert into mip_factual.rejection_audit(id,explanation_id,assertion_digest,attempted_transition,rule) values(%L,%L,%L,''published'',%L)',
 gen_random_uuid(),(x->>'id')::uuid,comparison_qualification.argument_digest(jsonb_build_object('assertion_id',x->>'assertion_id')),rule));
exception when others then raise exception 'mip_audit_unavailable';
end $$;
create function mip_factual.guard_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare reason text;
begin
 if new.review_status<>'published' then return new;end if;
 perform 1 from mip_identity.collector_fence where id for share;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 if new.is_current is distinct from true or new.state is distinct from 'ok'
 or nullif(btrim(new.supporting_passage),'') is null
 or nullif(btrim(new.falsification_condition),'') is null or btrim(new.falsification_condition) ilike 'missing:%'
 or jsonb_typeof(new.archived_sources) is distinct from 'array' or jsonb_array_length(new.archived_sources)=0
 or exists(select 1 from jsonb_array_elements(new.archived_sources) s where s->>'status' is distinct from 'retained')
 then reason:='provenance';
 elsif cardinality(new.source_ids)=0 or new.source_ids is null or exists(
 select 1 from unnest(new.source_ids) s(source_id) left join public.articles a on a.id=s.source_id
 where a.id is null or a.source_status is distinct from 'active' or a.reader_state is distinct from 'eligible')
 then reason:='source_state';
 elsif not exists(select 1 from mip_factual.human_reviews r where r.explanation_id=new.id
 and r.record_hash=mip_factual.record_hash(to_jsonb(new)) and r.source_hash=mip_factual.source_hash(new.source_ids))
 then reason:='human_review';end if;
 if reason is not null then
 perform mip_factual.log_rejection(to_jsonb(new),reason);
 raise exception 'mip_factual_rejected_%',reason;
 end if;
 return new;
end $$;
create unique index factual_current_version on public.explanations(assertion_id) where is_current;
create unique index factual_version_identity on public.explanations(assertion_id,version);
create trigger factual_publication_guard before insert or update on public.explanations
 for each row execute function mip_factual.guard_publication();
create function mip_factual.retain_explanation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'mip_factual_history_preserved';end if;
 if tg_op='UPDATE' then insert into mip_factual.explanation_history(explanation_id,row_data) values(old.id,to_jsonb(old));end if;
 return new;
end $$;
create trigger factual_history before update or delete on public.explanations for each row execute function mip_factual.retain_explanation();

create function mip_factual.review_publish(p_id uuid,p_approval text) returns void
language plpgsql security definer set search_path='' as $$
declare x public.explanations;
begin
 perform 1 from mip_identity.collector_fence where id for update;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 select * into strict x from public.explanations where id=p_id for update;
 if not x.is_current or x.review_status='withdrawn' then raise exception 'mip_factual_fresh_version_required';end if;
 insert into mip_factual.human_reviews(explanation_id,record_hash,source_hash,approval_ref,reviewer_role)
 values(x.id,mip_factual.record_hash(to_jsonb(x)),mip_factual.source_hash(x.source_ids),p_approval,session_user);
 update public.explanations set review_status='published',state='ok' where id=p_id;
end $$;

create function mip_factual.source_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare x public.explanations;fresh public.explanations;event uuid:=gen_random_uuid();
 affected uuid[]:='{}';skipped uuid[]:='{}';
begin
 if new.source_status is not distinct from old.source_status or new.source_status not in ('corrected','withdrawn') then return new;end if;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 for x in select * from public.explanations where is_current and new.id=any(source_ids) order by id for update loop
 if x.review_status='withdrawn' then skipped:=array_append(skipped,x.id);continue;end if;
 affected:=array_append(affected,x.id);
 end loop;
 insert into mip_factual.source_changes values(event,new.id,new.source_status,affected,skipped,session_user,clock_timestamp());
 for x in select * from public.explanations where id=any(affected) order by id loop
 -- Archive the exact old row; old record remains available as a prior version.
 update public.explanations set is_current=false,review_status=case when review_status='published' then 'awaiting_review' else review_status end where id=x.id;
 fresh:=x;fresh.id:=gen_random_uuid();fresh.version:=x.version+1;fresh.is_current:=true;
 fresh.review_status:='awaiting_review';fresh.state:='source_'||new.source_status;
 insert into public.explanations select (fresh).*;
 insert into mip_factual.source_change_links values(event,x.id,fresh.id);
 end loop;
 return new;
end $$;
create trigger zz_factual_source_change before update on public.articles for each row execute function mip_factual.source_change();

-- Independent reader: does not rely on the publication trigger having run.
create view mip_factual.reader_explanations with (security_barrier=true) as
 select e.* from public.explanations e
 where e.is_current and e.review_status='published' and e.state='ok'
 and nullif(btrim(e.supporting_passage),'') is not null
 and nullif(btrim(e.falsification_condition),'') is not null
 and btrim(e.falsification_condition) not ilike 'missing:%'
 and jsonb_typeof(e.archived_sources)='array' and jsonb_array_length(e.archived_sources)>0
 and not exists(select 1 from jsonb_array_elements(e.archived_sources) s where s->>'status' is distinct from 'retained')
 and cardinality(e.source_ids)>0
 and not exists(select 1 from unnest(e.source_ids) s(source_id) left join public.articles a on a.id=s.source_id
 where a.id is null or a.source_status is distinct from 'active' or a.reader_state is distinct from 'eligible')
 and exists(select 1 from mip_factual.human_reviews r where r.explanation_id=e.id
 and r.record_hash=mip_factual.record_hash(to_jsonb(e)) and r.source_hash=mip_factual.source_hash(e.source_ids));

-- End-to-end staging retains all 007/008 predicates and additionally requires the factual reader.
alter function mip_identity.validate_review(uuid) rename to validate_review_operations_v2;
create function mip_identity.validate_review(p_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;x jsonb;
begin
 result:=mip_identity.validate_review_operations_v2(p_revision);
 for x in select value from jsonb_array_elements(result#>'{projection,explanations}') loop
 if not exists(select 1 from mip_factual.reader_explanations e where e.assertion_id=x->>'assertion_id'
 and e.supporting_passage=x->>'supporting_passage' and e.rule_version=x->>'rule_version'
 and e.falsification_condition=x->>'falsification_condition' and e.archived_sources=x->'archived_sources')
 then raise exception 'mip_factual_release_ineligible';end if;
 end loop;return result;
end $$;
do $permissions$
declare t text;r record;
begin
 foreach t in array array['audit_connection','rejection_audit','human_reviews','explanation_history','source_changes','source_change_links'] loop
 execute format('alter table mip_factual.%I owner to mip_cutover_schema_owner_v1',t);
 execute format('alter table mip_factual.%I enable row level security',t);
 execute format('alter table mip_factual.%I force row level security',t);
 execute format('revoke all on mip_factual.%I from public,anon,authenticated,service_role',t);
 execute format('grant select,insert on mip_factual.%I to mip_factual_owner_v3',t);
 execute format('create policy factual_kernel on mip_factual.%I to mip_factual_owner_v3 using(true) with check(true)',t);
 if t<>'audit_connection' then
 execute format('create trigger immutable before update or delete on mip_factual.%I for each row execute function comparison_qualification.reject_rewrite()',t);
 execute format('create trigger no_truncate before truncate on mip_factual.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 end if;
 end loop;
 for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_factual' loop
 execute 'alter function '||r.sig||' owner to mip_factual_owner_v3';
 execute 'revoke all on function '||r.sig||' from public,anon,authenticated,service_role';
 end loop;
end $permissions$;
revoke all on schema mip_factual,mip_factual_transport from public;
revoke all on all functions in schema mip_factual_transport from public;
grant usage on schema mip_factual,public,comparison_qualification,mip_identity,mip_cutover_authority,mip_factual_transport to mip_factual_owner_v3;
grant execute on function mip_factual_transport.dblink_exec(text,text) to mip_factual_owner_v3;
grant select,update on mip_identity.collector_fence,mip_cutover_authority.publication_fence to mip_factual_owner_v3;
create policy factual_collector_lock on mip_identity.collector_fence to mip_factual_owner_v3 using(true) with check(true);
create policy factual_release_lock on mip_cutover_authority.publication_fence to mip_factual_owner_v3 using(true) with check(true);
grant select on public.articles to mip_factual_owner_v3;
create policy factual_sources on public.articles for select to mip_factual_owner_v3 using(true);
grant select,insert,update on public.explanations to mip_factual_owner_v3;
alter table public.explanations enable row level security;
alter table public.explanations force row level security;
create policy factual_rows on public.explanations to mip_factual_owner_v3 using(true) with check(true);
create policy publication_rows on public.explanations for select to mip_publication_owner_v2 using(true);
grant execute on function comparison_qualification.argument_digest(jsonb) to mip_factual_owner_v3;
alter view mip_factual.reader_explanations owner to mip_factual_owner_v3;
grant usage on schema mip_factual to mip_factual_reviewer_v3,mip_publication_owner_v2;
grant execute on function mip_factual.review_publish(uuid,text) to mip_factual_reviewer_v3;
grant select on mip_factual.reader_explanations to mip_publication_owner_v2;
grant execute on function mip_factual.source_hash(uuid[]),mip_factual.record_hash(jsonb) to mip_publication_owner_v2;
alter function mip_identity.validate_review(uuid) owner to mip_publication_owner_v2;
revoke all on function mip_identity.validate_review(uuid) from public,anon,authenticated,service_role;
commit;
