-- Harden existing trigger configuration only; retain bodies, owners and attachments.
begin;
do $guard$
declare expected record; actual record;
begin
  for expected in select * from (values
    ('public.graph_event_article_memberships_require_event_node()', '53f0974ce90d74a39e418cc1ef27961a', false),
    ('public.handle_new_mip_user()', '6356c027204eebb251c95f832a2dd80a', true),
    ('public.mip_intercept_direct_arc_attachment()', '250fb39407d9a3859da06d1bd6df3504', true),
    ('public.mip_invalidate_arc_membership_approvals()', '2c96edefc6740adb72da450926a255f6', true),
    ('public.policy_edge_attributed()', '29db960d94ce3621c86fe0eafa695c31', false)
  ) as checked(signature, body_md5, definer)
  loop
    select p.prorettype = 'pg_catalog.trigger'::regtype as is_trigger,
      pg_catalog.md5(p.prosrc) as body_md5, p.prosecdef,
      pg_catalog.pg_get_userbyid(p.proowner) as owner
      into actual from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure(expected.signature);
    if not found or actual.is_trigger is distinct from true
      or actual.body_md5 is distinct from expected.body_md5
      or actual.prosecdef is distinct from expected.definer
      or actual.owner is distinct from 'postgres' then
      raise exception 'trigger hardening prerequisite drift: %', expected.signature;
    end if;
  end loop;
end;
$guard$;
alter function public.graph_event_article_memberships_require_event_node() set search_path = '';
alter function public.handle_new_mip_user() set search_path = '';
alter function public.mip_intercept_direct_arc_attachment() set search_path = '';
alter function public.mip_invalidate_arc_membership_approvals() set search_path = '';
alter function public.policy_edge_attributed() set search_path = '';
revoke execute on function public.handle_new_mip_user() from public, anon, authenticated;
revoke execute on function public.mip_intercept_direct_arc_attachment() from public, anon, authenticated;
revoke execute on function public.mip_invalidate_arc_membership_approvals() from public, anon, authenticated;
commit;
