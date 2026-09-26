-- Hosted-synthetic runtime + work seed. Isolated qualification only.
-- Load after 016_worker_broker_recovery.sql (and 20_grant_rebind.sql).
-- Setup only: empty POST must not carry work. Enqueue via approved RPCs.
-- Does not mint JWTs, does not insert mip_identity iss/aud/sub, does not
-- write Edge secrets. Not a production migration. qik only.
begin;

do $preflight$
begin
  if to_regclass('mip_cutover_authority.runtime_config') is null then
    raise exception 'hosted_synthetic_seed_requires_002';
  end if;
  if to_regprocedure('mip_cutover_authority.producer_enqueue(uuid,uuid,text,jsonb,timestamptz)') is null then
    raise exception 'hosted_synthetic_seed_requires_producer_enqueue';
  end if;
  if to_regprocedure('comparison_qualification.source_snapshot(jsonb,text)') is null then
    raise exception 'hosted_synthetic_seed_requires_synthetic_snapshot';
  end if;
  if (select count(*) from comparison_qualification.synthetic_events) <> 1
     or (select count(*) from comparison_qualification.synthetic_articles) <> 2
     or (select count(*) from comparison_qualification.synthetic_event_articles) <> 2 then
    raise exception 'hosted_synthetic_seed_requires_synthetic_rows';
  end if;
end
$preflight$;

-- Fixed synthetic labels. Not live source/project names.
-- runtime_id: hosted-synthetic-qik-v1
-- source: hosted-synthetic-qik
-- implementation: hosted-synthetic-event-projection-v1
-- producer_enqueue request: 00000000-0000-4000-8000-00000000a001
insert into mip_cutover_authority.runtime_config(runtime_id,source,implementation,lexicon)
values (
  'hosted-synthetic-qik-v1',
  'hosted-synthetic-qik',
  'hosted-synthetic-event-projection-v1',
  '{"entries":[]}'::jsonb
);

select comparison_qualification.bind_source_scope('hosted-synthetic-qik-v1','hosted-synthetic-qik');
select comparison_qualification.bind_evaluated_implementation(
  'hosted-synthetic-qik-v1','hosted-synthetic-event-projection-v1');

select comparison_qualification.bind_runtime(
  'hosted-synthetic-qik-v1','mip_comparison_producer_v1','producer_enqueue');
select comparison_qualification.bind_runtime(
  'hosted-synthetic-qik-v1','mip_comparison_worker_v1','worker_claim');
select comparison_qualification.bind_runtime(
  'hosted-synthetic-qik-v1','mip_comparison_worker_v1','worker_complete');
select comparison_qualification.bind_runtime(
  'hosted-synthetic-qik-v1','mip_comparison_worker_v1','worker_fail');
select comparison_qualification.bind_runtime(
  'hosted-synthetic-qik-v1','mip_comparison_worker_v1','worker_journal_put');
select comparison_qualification.bind_runtime(
  'hosted-synthetic-qik-v1','mip_comparison_worker_v1','worker_journal_get');
select comparison_qualification.bind_runtime(
  'hosted-synthetic-qik-v1','mip_comparison_worker_v1','worker_journal_pending');
select comparison_qualification.bind_runtime(
  'hosted-synthetic-qik-v1','mip_comparison_worker_v1','worker_resume_claim');

do $enqueue$
declare sid uuid;
        gid uuid;
        producer_until timestamptz;
begin
  producer_until := clock_timestamp() + interval '15 minutes';
  -- Owner/superuser fixture RPC (capability.sql). Not a JWT. Not mip_identity.issue.
  -- Operation-bound short lifetime (not year-2999). Ledger records the session
  -- so cleanup can revoke it explicitly before dropping relations.
  sid:=comparison_qualification.issue_session(
    'mip_comparison_producer_v1','hosted-synthetic-qik-v1',producer_until);
  if to_regclass('hosted_synthetic_operation.operation') is not null then
    update hosted_synthetic_operation.operation
      set producer_session_id=sid, producer_expires_at=producer_until;
  end if;
  -- 002 producer_enqueue refuses caller payload/timestamp and reads source_snapshot.
  gid:=mip_cutover_authority.producer_enqueue(
    '00000000-0000-4000-8000-00000000a001'::uuid,
    sid,
    'hosted-synthetic-qik-v1',
    '{}'::jsonb,
    null);
  if gid is null then
    raise exception 'hosted_synthetic_seed_enqueue_failed';
  end if;
end
$enqueue$;

commit;
