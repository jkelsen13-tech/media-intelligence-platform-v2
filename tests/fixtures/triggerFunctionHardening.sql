-- Exact pg_get_functiondef/trigger definitions captured read-only from mip-v2
-- on 2026-09-08 UTC. Minimal synthetic tables only, never a production bootstrap.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table public.nodes(id uuid primary key, type text);
create table public.graph_event_article_memberships(event_node_id uuid);
create table public.edges(source_id uuid, target_id uuid, claimed_by text,
 doc_strength text, signal_source text, reliability text, counterfactual_test text,
 alternative_causes jsonb);
create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
create table public.mip_profiles(id uuid primary key);
create table public.articles(id uuid primary key, arc_id uuid, arc_assignment_evidence jsonb);
create table public.arc_membership_candidates(id uuid primary key default gen_random_uuid(),
 article_id uuid, arc_id uuid, generation_method text, generation_evidence jsonb,
 state text, invalidated_at timestamptz, unique(article_id, arc_id));
CREATE OR REPLACE FUNCTION public.graph_event_article_memberships_require_event_node()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (
    select 1 from public.nodes n
    where n.id = new.event_node_id and n.type = 'event'
  ) then
    raise exception 'graph_event_article_memberships.event_node_id must reference a node of type event';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_mip_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.raw_user_meta_data->>'app' = 'mip' then
    insert into public.mip_profiles (id)
    values (new.id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.mip_intercept_direct_arc_attachment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.mip_invalidate_arc_membership_approvals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_exempt uuid := nullif(current_setting('app.arc_membership_approval_candidate_id', true), '')::uuid;
  v_old_arc uuid := case when tg_op = 'INSERT' then null else old.arc_id end;
  v_new_arc uuid := case when tg_op = 'DELETE' then null else new.arc_id end;
begin
  update public.arc_membership_candidates c set state = 'invalidated', invalidated_at = now()
  where c.state = 'approved' and c.id is distinct from v_exempt and c.arc_id in (v_old_arc, v_new_arc);
  return coalesce(new, old);
end; $function$
;
CREATE OR REPLACE FUNCTION public.policy_edge_attributed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
end $function$
;
CREATE TRIGGER graph_event_article_memberships_require_event_node BEFORE INSERT OR UPDATE ON public.graph_event_article_memberships FOR EACH ROW EXECUTE FUNCTION graph_event_article_memberships_require_event_node();
CREATE TRIGGER on_auth_user_created_mip AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_mip_user();
CREATE TRIGGER articles_intercept_direct_arc_attachment BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION mip_intercept_direct_arc_attachment();
CREATE TRIGGER articles_invalidate_arc_membership_approvals AFTER INSERT OR DELETE OR UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION mip_invalidate_arc_membership_approvals();
CREATE TRIGGER policy_edge_attributed BEFORE INSERT OR UPDATE ON public.edges FOR EACH ROW EXECUTE FUNCTION policy_edge_attributed();
grant execute on function public.graph_event_article_memberships_require_event_node() to public, anon, authenticated, service_role;
grant execute on function public.handle_new_mip_user() to public, anon, authenticated, service_role;
grant execute on function public.mip_intercept_direct_arc_attachment() to public, anon, authenticated, service_role;
grant execute on function public.mip_invalidate_arc_membership_approvals() to public, anon, authenticated, service_role;
grant execute on function public.policy_edge_attributed() to public, anon, authenticated, service_role;
-- Only the disposable fixture grants DML, to prove existing triggers still fire.
grant usage on schema auth, public to authenticated;
grant select, insert, update, delete on all tables in schema public, auth to authenticated;
