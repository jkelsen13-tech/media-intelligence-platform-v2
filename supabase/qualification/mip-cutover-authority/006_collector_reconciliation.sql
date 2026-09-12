-- Isolated collector/backlog/delta integration. No live collector or schedule changes.
begin;
do $$begin if not exists(select 1 from pg_roles where rolname='mip_collector_owner_v2') then
 create role mip_collector_owner_v2 nologin nosuperuser nobypassrls;end if;end $$;
create table mip_identity.collector_config(id boolean primary key check(id),source text not null);
create table mip_identity.collector_fence(id boolean primary key check(id));
insert into mip_identity.collector_fence values(true);
create table mip_identity.source_changes(
 id uuid primary key default gen_random_uuid(),source text not null,relation_name text not null,
 row_key text not null,before_row jsonb,after_row jsonb,kind text not null check(kind in ('backlog','delta')),
 transaction_id text not null,retained_at timestamptz not null default clock_timestamp()
);
create table mip_identity.generation_changes(
 change_id uuid primary key references mip_identity.source_changes,
 generation_id uuid not null references comparison_qualification.generations
);
create table mip_identity.collector_runs(
 request_id uuid primary key,runtime text not null,generation_id uuid references comparison_qualification.generations
);
create function mip_identity.collector_lock() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from mip_identity.collector_fence where id for update;return null;
end $$;
create function mip_identity.collector_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare src text;b jsonb;a jsonb;k text;
begin
 select source into strict src from mip_identity.collector_config where id;
 b:=case when tg_op='INSERT' then null else to_jsonb(old) end;
 a:=case when tg_op='DELETE' then null else to_jsonb(new) end;
 if a is not distinct from b then return null;end if;
 k:=coalesce(a,b)->>tg_argv[0];
 if tg_nargs>1 then k:=k||':'||(coalesce(a,b)->>tg_argv[1]);end if;
 -- Composite/unknown topology keys retain exact before/after content even without id.
 if k is null then k:=encode(sha256(convert_to(coalesce(a,b)::text,'UTF8')),'hex');end if;
 insert into mip_identity.source_changes(source,relation_name,row_key,before_row,after_row,kind,transaction_id)
 values(src,tg_table_schema||'.'||tg_table_name,k,b,a,'delta',pg_current_xact_id()::text);
 return null;
end $$;
create trigger collector_events_lock before insert or update or delete or truncate on public.events for each statement execute function mip_identity.collector_lock();
create trigger collector_events_change after insert or update or delete on public.events for each row execute function mip_identity.collector_change('id');
create trigger collector_articles_lock before insert or update or delete or truncate on public.articles for each statement execute function mip_identity.collector_lock();
create trigger collector_articles_change after insert or update or delete on public.articles for each row execute function mip_identity.collector_change('id');
create trigger collector_membership_lock before insert or update or delete or truncate on public.event_articles for each statement execute function mip_identity.collector_lock();
create trigger collector_membership_change after insert or update or delete on public.event_articles for each row execute function mip_identity.collector_change('event_id','article_id');
create trigger collector_config_lock before insert or update or delete or truncate on public.pipeline_config for each statement execute function mip_identity.collector_lock();
create trigger collector_config_change after insert or update or delete on public.pipeline_config for each row execute function mip_identity.collector_change('key');
-- TRUNCATE cannot supply per-row retained evidence: reject instead of losing history.
create trigger no_collector_events_truncate before truncate on public.events for each statement execute function comparison_qualification.reject_rewrite();
create trigger no_collector_articles_truncate before truncate on public.articles for each statement execute function comparison_qualification.reject_rewrite();
create trigger no_collector_membership_truncate before truncate on public.event_articles for each statement execute function comparison_qualification.reject_rewrite();
create trigger no_collector_config_truncate before truncate on public.pipeline_config for each statement execute function comparison_qualification.reject_rewrite();
create function mip_identity.capture_backlog() returns integer
language plpgsql security definer set search_path='' as $$
declare src text;n integer;
begin
 perform 1 from mip_identity.collector_fence where id for update;
 select source into strict src from mip_identity.collector_config where id;
 if exists(select 1 from mip_identity.source_changes where source=src) then raise exception 'mip_backlog_already_started';end if;
 insert into mip_identity.source_changes(source,relation_name,row_key,before_row,after_row,kind,transaction_id)
 select src,relation_name,row_key,null,payload,'backlog',pg_current_xact_id()::text from (
 select 'public.events' relation_name,id::text row_key,to_jsonb(e) payload from public.events e
 union all select 'public.articles',id::text,to_jsonb(a) from public.articles a
 union all select 'public.event_articles',event_id::text||':'||article_id::text,to_jsonb(m) from public.event_articles m
 union all select 'public.pipeline_config',key,to_jsonb(c) from public.pipeline_config c
 ) rows;
 get diagnostics n=row_count;return n;
end $$;
create function mip_identity.capture_delta(p_request uuid,p_session uuid,p_runtime text) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior mip_identity.collector_runs;g uuid;src text;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_producer_v1');
 perform 1 from mip_identity.collector_fence where id for update;
 select source into strict src from mip_identity.collector_config where id;
 perform comparison_qualification.require_source_scope(p_runtime,src);
 select * into prior from mip_identity.collector_runs where request_id=p_request;
 if found then
 if prior.runtime is distinct from p_runtime then raise exception 'mip_collector_replay_owner';end if;
 return prior.generation_id;end if;
 select source into strict src from mip_identity.collector_config where id;
 perform comparison_qualification.require_source_scope(p_runtime,src);
 if exists(select 1 from mip_identity.source_changes c where c.source=src and not exists(select 1 from mip_identity.generation_changes g where g.change_id=c.id)) then
 g:=mip_identity.producer_enqueue(p_request,p_session,p_runtime,'{}',null);
 if not exists(select 1 from comparison_qualification.generations where id=g and source_project=src) then raise exception 'mip_collector_source_mismatch';end if;
 insert into mip_identity.generation_changes
 select c.id,g from mip_identity.source_changes c where c.source=src
 and not exists(select 1 from mip_identity.generation_changes x where x.change_id=c.id);
 end if;
 insert into mip_identity.collector_runs values(p_request,p_runtime,g);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_producer_v1');
 return g;
end $;
create function mip_identity.reconciliation(p_session uuid,p_runtime text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare src text;result jsonb;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_producer_v1');
 select source into strict src from mip_identity.collector_config where id;
 perform comparison_qualification.require_source_scope(p_runtime,src);
 select coalesce(jsonb_agg(jsonb_build_object('change_id',c.id,'relation',c.relation_name,'row_key',c.row_key,
 'kind',c.kind,'before_hash',case when c.before_row is null then null else comparison_qualification.argument_digest(c.before_row) end,
 'after_hash',case when c.after_row is null then null else comparison_qualification.argument_digest(c.after_row) end,
 'generation_id',g.id,'input_hash',g.input_hash,'output_hash',o.output_hash,
 'job_state',j.state,'acknowledged',coalesce(j.state='completed' and o.generation_id=g.id,false))
 order by c.retained_at,c.id),'[]') into result
 from mip_identity.source_changes c left join mip_identity.generation_changes x on x.change_id=c.id
 left join comparison_qualification.generations g on g.id=x.generation_id
 left join comparison_qualification.jobs j on j.generation_id=g.id
 left join comparison_qualification.outputs o on o.generation_id=g.id where c.source=src;
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_producer_v1');
 return result;
end $;
do $permissions$
declare t text;r record;
begin
 foreach t in array array['collector_config','collector_fence','source_changes','generation_changes','collector_runs'] loop
 execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
 execute format('alter table mip_identity.%I enable row level security',t);
 execute format('alter table mip_identity.%I force row level security',t);
 execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on mip_identity.%I to mip_collector_owner_v2',t);
 execute format('create policy collector_read on mip_identity.%I for select to mip_collector_owner_v2 using(true)',t);
 end loop;
 foreach t in array array['source_changes','generation_changes','collector_runs'] loop
 execute format('grant insert on mip_identity.%I to mip_collector_owner_v2',t);
 execute format('create policy collector_append on mip_identity.%I for insert to mip_collector_owner_v2 with check(true)',t);
 execute format('create trigger immutable before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
 execute format('create trigger no_truncate before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 end loop;
 for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_identity' and p.proname in ('collector_lock','collector_change','capture_backlog','capture_delta','reconciliation') loop
 execute 'alter function '||r.sig||' owner to mip_collector_owner_v2';
 execute 'revoke all on function '||r.sig||' from public,anon,authenticated,service_role';
 end loop;
end $permissions$;
grant usage on schema mip_identity,comparison_qualification,public to mip_collector_owner_v2;
grant select on public.events,public.articles,public.event_articles,public.pipeline_config to mip_collector_owner_v2;
grant select on comparison_qualification.generations,comparison_qualification.jobs,comparison_qualification.outputs to mip_collector_owner_v2;
create policy collector_generation_read on comparison_qualification.generations for select to mip_collector_owner_v2 using(true);
create policy collector_job_read on comparison_qualification.jobs for select to mip_collector_owner_v2 using(true);
create policy collector_output_read on comparison_qualification.outputs for select to mip_collector_owner_v2 using(true);
grant update on mip_identity.collector_fence to mip_collector_owner_v2;
create policy collector_fence_lock on mip_identity.collector_fence for update to mip_collector_owner_v2 using(true) with check(true);
grant execute on function mip_identity.authorize(uuid,text,text),mip_identity.producer_enqueue(uuid,uuid,text,jsonb,timestamptz),
 comparison_qualification.require_source_scope(text,text),comparison_qualification.argument_digest(jsonb) to mip_collector_owner_v2;
grant execute on function mip_identity.capture_delta(uuid,uuid,text),mip_identity.reconciliation(uuid,text) to mip_comparison_producer_v1;
-- capture_backlog is an explicit trusted bootstrap operation; no worker grant.
commit;
