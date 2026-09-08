-- All verification writes are inside an exception subtransaction that rolls back.
-- No fixture or evidence mutation is committed. Identity sequence gaps are expected.
do $verify$
declare
  target_event uuid;
  target_article uuid;
  expected_prior_event jsonb;
begin
  begin
    execute 'set local role service_role';
    if current_user <> 'service_role' then raise exception 'worker role not active'; end if;
    select e.id, to_jsonb(e) into target_event, expected_prior_event
      from public.events e
      where e.comparison_validation_state='approved'
        and exists(select 1 from public.event_articles m where m.event_id=e.id)
      order by e.id limit 1 for update;
    if target_event is null then raise exception 'no approved membership available for rollback verification'; end if;
    select article_id into target_article from public.event_articles
      where event_id=target_event order by article_id limit 1;
    insert into public.event_articles
      select * from public.event_articles where event_id=target_event and article_id=target_article
      on conflict do nothing;
    if (select comparison_validation_state from public.events where id=target_event) <> 'approved'
      then raise exception 'duplicate invalidated approval'; end if;
    delete from public.event_articles where event_id=target_event and article_id=target_article;
    if (select comparison_validation_state from public.events where id=target_event) <> 'pending_review'
      then raise exception 'membership deletion did not invalidate approval'; end if;
    if not exists(select 1 from mip_private.comparison_membership_history
      where event_id=target_event and operation='DELETE' and prior_event=expected_prior_event)
      then raise exception 'history missing'; end if;
    if not exists(select 1 from mip_private.comparison_membership_history h
      where h.event_id=target_event and h.membership_before->>'article_id'=target_article::text
        and h.membership_after is null and h.prior_event->>'comparison_validation_state'='approved')
      then raise exception 'prior approval or membership transition not retained'; end if;
    if exists(select 1 from public.comparison_public where event_key=md5(target_event::text))
      then raise exception 'stale approval remains in public comparison'; end if;
    raise exception using errcode='MIP01', message='roll back successful verification';
  exception when sqlstate 'MIP01' then
    null;
  end;
end;
$verify$;
