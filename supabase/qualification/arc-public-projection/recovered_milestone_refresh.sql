CREATE OR REPLACE FUNCTION public.mip_refresh_arc_projection_milestone(p_milestone_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_outcome text;
  v_baseline public.arc_membership_projection_milestone_baselines%rowtype;
  v_notes text;
begin
  select e.outcome,
         format('Arc membership projection evidence: candidate %s; article "%s"%s',
           e.candidate_id,
           e.article_title,
           case when e.article_url is null then '' else ' (' || e.article_url || ')' end)
    into v_outcome, v_notes
  from public.arc_membership_projection_milestone_evidence e
  join public.arc_membership_projection_runs r
    on r.candidate_id = e.candidate_id
   and r.state = 'active'
  where e.milestone_id = p_milestone_id
  order by case e.outcome when 'failed' then 0 else 1 end, e.recorded_at desc
  limit 1;

  if v_outcome is not null then
    update public.arc_milestones
       set status = v_outcome,
           notes = v_notes,
           updated_at = now()
     where id = p_milestone_id;
    return;
  end if;

  select * into v_baseline
    from public.arc_membership_projection_milestone_baselines
   where milestone_id = p_milestone_id;
  if found then
    update public.arc_milestones m
       set status = v_baseline.baseline_status,
           notes = v_baseline.baseline_notes,
           updated_at = now()
     where m.id = p_milestone_id
       and m.notes like 'Arc membership projection evidence:%';
  end if;
end;
$function$
