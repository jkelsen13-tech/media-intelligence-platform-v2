-- Survivor membership admission guard. No existing rows are rewritten.
-- History records each approval invalidation, not a complete membership version stream.
create table mip_private.comparison_membership_history (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  prior_event jsonb not null,
  membership_before jsonb,
  membership_after jsonb
);
create index comparison_membership_history_event_idx
  on mip_private.comparison_membership_history (event_id, id);
alter table mip_private.comparison_membership_history enable row level security;
revoke all on mip_private.comparison_membership_history from public, anon, authenticated, service_role;
grant select on mip_private.comparison_membership_history to service_role;
revoke all on sequence mip_private.comparison_membership_history_id_seq from public, anon, authenticated, service_role;

create function mip_private.reject_comparison_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'comparison history is append-only; membership truncation is not supported';
end;
$$;
revoke all on function mip_private.reject_comparison_history_mutation() from public, anon, authenticated, service_role;
create trigger comparison_membership_history_immutable
before update or delete on mip_private.comparison_membership_history
for each row execute function mip_private.reject_comparison_history_mutation();
create trigger comparison_membership_history_no_truncate
before truncate on mip_private.comparison_membership_history
for each statement execute function mip_private.reject_comparison_history_mutation();

create function mip_private.guard_comparison_membership_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  touched uuid[] := array[]::uuid[];
  target uuid;
  prior public.events%rowtype;
  previous_membership jsonb;
  next_membership jsonb;
begin
  if tg_op = 'UPDATE' and new.event_id is not distinct from old.event_id
     and new.article_id is not distinct from old.article_id then
    return new;
  end if;
  if tg_op <> 'INSERT' then
    touched := array_append(touched, old.event_id);
    previous_membership := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    touched := array_append(touched, new.event_id);
    next_membership := to_jsonb(new);
  end if;
  -- Lock both ends in a stable order. Any deadlock/serialization failure must
  -- roll back the caller's transaction; it must never be treated as completion.
  for target in select distinct value from unnest(touched) value order by value loop
    select * into prior from public.events where id = target for update;
    if found and prior.comparison_validation_state = 'approved' then
      insert into mip_private.comparison_membership_history
        (event_id, operation, prior_event, membership_before, membership_after)
      values (target, tg_op, to_jsonb(prior), previous_membership, next_membership);
      update public.events set comparison_validation_state = 'pending_review'
        where id = target;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function mip_private.guard_comparison_membership_change() from public, anon, authenticated, service_role;

drop trigger if exists event_articles_invalidate_comparison_approval on public.event_articles;
create trigger event_articles_invalidate_comparison_approval
after insert or delete or update of event_id, article_id on public.event_articles
for each row execute function mip_private.guard_comparison_membership_change();
create trigger event_articles_no_unreviewed_truncate
before truncate on public.event_articles
for each statement execute function mip_private.reject_comparison_history_mutation();

comment on table mip_private.comparison_membership_history is
  'Private append-only prior event approval and triggering membership row transition. No cascading foreign keys; this is not a full membership-version or reviewer-identity ledger.';
