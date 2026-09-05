-- Production-recorded public-surface transfer chunk.
-- Applied on qikvmopbtijoebdqosyq as 20260905172527 / mip_public_surface_predicates.
-- Restored verbatim from supabase_migrations.schema_migrations.statements.
-- Do not replay this file on production; it is already recorded there.

create or replace function mip_private.arc_has_approved_membership(p_arc_id uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_catalog'
as $$ select exists (select 1 from public.arc_membership_candidates c where c.arc_id = p_arc_id and c.state = 'approved'); $$;
create or replace function mip_private.arc_event_candidate_is_approved(p_candidate_id uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_catalog'
as $$ select p_candidate_id is not null and exists (select 1 from public.arc_membership_candidates c where c.id = p_candidate_id and c.state = 'approved'); $$;
revoke all on function mip_private.arc_has_approved_membership(uuid) from public;
revoke all on function mip_private.arc_event_candidate_is_approved(uuid) from public;
grant execute on function mip_private.arc_has_approved_membership(uuid) to anon, authenticated, service_role;
grant execute on function mip_private.arc_event_candidate_is_approved(uuid) to anon, authenticated, service_role;
create or replace function public.mip_intercept_direct_arc_attachment()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
declare v_approved_candidate uuid := nullif(current_setting('app.arc_membership_approval_candidate_id', true), '')::uuid;
begin
  if new.arc_id is distinct from old.arc_id and new.arc_id is not null then
    if v_approved_candidate is not null and exists (select 1 from public.arc_membership_candidates c where c.id = v_approved_candidate and c.article_id = new.id and c.arc_id = new.arc_id and c.state = 'approved') then
      return new;
    end if;
    insert into public.arc_membership_candidates(article_id, arc_id, generation_method, generation_evidence, state)
    values (new.id, new.arc_id, 'direct_attachment_intercept_v1', jsonb_build_object('prior_arc_id', old.arc_id, 'intercepted_at', now()), 'pending')
    on conflict (article_id, arc_id) do update set state = 'pending', invalidated_at = null, generation_evidence = public.arc_membership_candidates.generation_evidence || excluded.generation_evidence;
    new.arc_id := old.arc_id;
    new.arc_assignment_evidence := coalesce(new.arc_assignment_evidence, '{}'::jsonb) || jsonb_build_object('membership_gate', 'staged_pending_score');
  end if;
  return new;
end; $$;
create or replace function public.mip_invalidate_arc_membership_approvals()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
declare v_exempt uuid := nullif(current_setting('app.arc_membership_approval_candidate_id', true), '')::uuid;
  v_old_arc uuid := case when tg_op = 'INSERT' then null else old.arc_id end;
  v_new_arc uuid := case when tg_op = 'DELETE' then null else new.arc_id end;
begin
  update public.arc_membership_candidates c set state = 'invalidated', invalidated_at = now()
  where c.state = 'approved' and c.id is distinct from v_exempt and c.arc_id in (v_old_arc, v_new_arc);
  return coalesce(new, old);
end; $$;
drop trigger if exists articles_intercept_direct_arc_attachment on public.articles;
create trigger articles_intercept_direct_arc_attachment before update on public.articles for each row execute function public.mip_intercept_direct_arc_attachment();
drop trigger if exists articles_invalidate_arc_membership_approvals on public.articles;
create trigger articles_invalidate_arc_membership_approvals after insert or update or delete on public.articles for each row execute function public.mip_invalidate_arc_membership_approvals();
create or replace function public.policy_edge_attributed() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.nodes n where n.type = 'policy' and (n.id = new.source_id or n.id = new.target_id)) then
    if new.claimed_by is null or new.doc_strength is null or new.signal_source is null or new.reliability is null then
      raise exception 'policy edge missing attribution (claimed_by/doc_strength/signal_source/reliability required)';
    end if;
    if new.claimed_by = 'MIP_inferred' and (new.counterfactual_test is null or jsonb_array_length(new.alternative_causes) = 0) then
      raise exception 'MIP_inferred policy edge requires counterfactual_test and >=1 alternative_causes';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists policy_edge_attributed on public.edges;
create trigger policy_edge_attributed before insert or update on public.edges for each row execute function public.policy_edge_attributed();
