-- V2 Source Comparison membership-mutation guard.
--
-- An approved comparison boundary is valid only for the exact reviewed member
-- set. Any insert, delete, or event reassignment in event_articles therefore
-- returns the touched event(s) to pending_review. This preserves source rows
-- and creates no semantic classification; it only prevents stale approval from
-- surviving a membership change.

create or replace function public.invalidate_comparison_approval_on_membership_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.events
    set comparison_validation_state = 'pending_review'
    where id = new.event_id
      and comparison_validation_state = 'approved';
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.events
    set comparison_validation_state = 'pending_review'
    where id = old.event_id
      and comparison_validation_state = 'approved';
    return old;
  end if;

  -- UPDATE may move an article between events. Invalidate both the source and
  -- destination boundaries when they differ; unchanged non-membership fields do
  -- not need to alter review state.
  if new.event_id is distinct from old.event_id then
    update public.events
    set comparison_validation_state = 'pending_review'
    where id in (old.event_id, new.event_id)
      and comparison_validation_state = 'approved';
  end if;
  return new;
end;
$$;

comment on function public.invalidate_comparison_approval_on_membership_change() is
  'Revokes Source Comparison approval when event_articles membership changes. It preserves events/articles and requires fresh article-level same-event review before comparison projection can resume.';

drop trigger if exists event_articles_invalidate_comparison_approval on public.event_articles;

create trigger event_articles_invalidate_comparison_approval
after insert or delete or update of event_id on public.event_articles
for each row
execute function public.invalidate_comparison_approval_on_membership_change();
