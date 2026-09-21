-- Exact yhb native definitions captured read-only on 2026-09-21.
-- Synthetic dependency tables are intentionally minimal and contain no production data.
create table public.arc_membership_projection_runs(
 candidate_id uuid primary key, state text not null, retracted_at timestamptz, updated_at timestamptz);
create table public.edges(arc_membership_candidate_id uuid);
create table public.sources(arc_membership_candidate_id uuid);
create table public.arc_events(arc_membership_candidate_id uuid);
create table public.nodes(arc_membership_candidate_id uuid);
create table public.arc_membership_projection_milestone_evidence(candidate_id uuid,milestone_id uuid);
create table public.arc_membership_candidates(id uuid primary key,state text not null);

create function public.mip_refresh_arc_projection_milestone(uuid) returns void
language sql as $$ select $$;
create function public.mip_project_approved_arc_membership(uuid) returns jsonb
language sql as $$ select '{"status":"synthetic_unreached"}'::jsonb $$;

CREATE OR REPLACE FUNCTION public.mip_retract_arc_membership_projection(p_candidate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_run public.arc_membership_projection_runs%rowtype;
  v_milestone_id uuid;
begin
  select * into v_run
    from public.arc_membership_projection_runs
   where candidate_id = p_candidate_id
   for update;
  if not found then
    return jsonb_build_object('candidate_id', p_candidate_id, 'status', 'not_projected');
  end if;
  if v_run.state = 'retracted' then
    return jsonb_build_object('candidate_id', p_candidate_id, 'status', 'already_retracted');
  end if;

  update public.arc_membership_projection_runs
     set state = 'retracted',
         retracted_at = now(),
         updated_at = now()
   where candidate_id = p_candidate_id;

  delete from public.edges where arc_membership_candidate_id = p_candidate_id;
  delete from public.sources where arc_membership_candidate_id = p_candidate_id;
  delete from public.arc_events where arc_membership_candidate_id = p_candidate_id;
  delete from public.nodes where arc_membership_candidate_id = p_candidate_id;

  for v_milestone_id in
    select milestone_id
      from public.arc_membership_projection_milestone_evidence
     where candidate_id = p_candidate_id
  loop
    perform public.mip_refresh_arc_projection_milestone(v_milestone_id);
  end loop;

  return jsonb_build_object('candidate_id', p_candidate_id, 'status', 'retracted');
end;
$function$;

CREATE OR REPLACE FUNCTION public.mip_arc_membership_projection_state_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_guarded_candidate_id uuid := nullif(current_setting('app.arc_membership_approval_candidate_id', true), '')::uuid;
begin
  if new.state is distinct from old.state then
    if new.state = 'approved' then
      if v_guarded_candidate_id is distinct from new.id then
        raise exception 'Arc membership projection requires guarded approval signal';
      end if;
      perform public.mip_project_approved_arc_membership(new.id);
    elsif old.state = 'approved' then
      perform public.mip_retract_arc_membership_projection(new.id);
    end if;
  end if;
  return new;
end;
$function$;

create trigger arc_membership_projection_state_change
after update of state on public.arc_membership_candidates
for each row execute function public.mip_arc_membership_projection_state_change();

revoke all on function public.mip_retract_arc_membership_projection(uuid) from public;
grant execute on function public.mip_retract_arc_membership_projection(uuid)
 to postgres,anon,authenticated,service_role;
grant execute on function public.mip_arc_membership_projection_state_change()
 to anon,authenticated,service_role;
grant select,update on public.arc_membership_candidates to trigger_driver;
