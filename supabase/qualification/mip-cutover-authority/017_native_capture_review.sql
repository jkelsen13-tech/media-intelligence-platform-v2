-- Source-only native lineage extension. Install after 009 (and later existing
-- authority layers). No public projection, permission decision, or review is made.
begin;
do $prerequisites$
begin
 if to_regprocedure('mip_identity.validate_review_operations_v2(uuid)') is null
 or to_regprocedure('mip_identity.validate_review(uuid)') is null
 or to_regprocedure('mip_identity.collector_lock()') is null
 or to_regclass('evidence_pipeline.article_captures') is null
 or to_regclass('evidence_pipeline.evidence_candidates') is null then
  raise exception 'mip_native_review_prerequisites_missing';
 end if;
end $prerequisites$;


-- 005 assigns source helpers to this existing NOLOGIN/NOBYPASSRLS owner.
-- Read only these private lineage owners; grant no native write authority.
do $native_read$
begin
 if exists(select 1 from pg_policy where polrelid in
   ('evidence_pipeline.article_captures'::regclass,'evidence_pipeline.evidence_candidates'::regclass)
   and polname='mip_native_review_kernel_select') then
  raise exception 'mip_native_review_policy_collision';
 end if;
 if exists(select 1 from pg_roles where rolname='mip_kernel_owner_v2'
   and (rolsuper or rolbypassrls or rolcanlogin)) then
  raise exception 'mip_native_review_kernel_privilege_drift';
 end if;
end $native_read$;
grant usage on schema evidence_pipeline to mip_kernel_owner_v2;
grant select on evidence_pipeline.article_captures,evidence_pipeline.evidence_candidates to mip_kernel_owner_v2;
create policy mip_native_review_kernel_select on evidence_pipeline.article_captures
 for select to mip_kernel_owner_v2 using(true);
create policy mip_native_review_kernel_select on evidence_pipeline.evidence_candidates
 for select to mip_kernel_owner_v2 using(true);

-- Serialize new captures/candidates with the existing review fence and retain
-- deltas through the existing invalidation path. Reuse already installed EFTA
-- triggers when they call these exact owners; never create duplicate deltas.
do $fences$
declare relation regclass;prefix text;existing record;n integer;
begin
 if to_regprocedure('mip_identity.collector_native_change()') is null then
  raise exception 'mip_native_collector_prerequisite_missing';
 end if;
 foreach relation in array array['evidence_pipeline.article_captures'::regclass,
   'evidence_pipeline.evidence_candidates'::regclass] loop
  prefix:=case when relation='evidence_pipeline.article_captures'::regclass then 'native_comparison_capture' else 'native_comparison_candidate' end;
  select count(*) into n from pg_trigger where tgrelid=relation and not tgisinternal
   and tgfoid='mip_identity.collector_lock()'::regprocedure;
  if n>1 or exists(select 1 from pg_trigger where tgrelid=relation
    and tgfoid='mip_identity.collector_lock()'::regprocedure
    and (tgenabled<>'O' or tgtype<>62 or tgnargs<>0)) then
   raise exception 'mip_native_collector_fence_topology';
  end if;
  if n=0 then
   execute format('create trigger %I before insert or update or delete or truncate on %s for each statement execute function mip_identity.collector_lock()',prefix||'_fence',relation);
  end if;
  select count(*) into n from pg_trigger where tgrelid=relation and not tgisinternal
   and tgfoid in ('mip_identity.collector_change()'::regprocedure,'mip_identity.collector_native_change()'::regprocedure);
  if n>1 then raise exception 'mip_native_collector_duplicate_recorder';end if;
  if n=1 then
   select * into strict existing from pg_trigger where tgrelid=relation and not tgisinternal
    and tgfoid in ('mip_identity.collector_change()'::regprocedure,'mip_identity.collector_native_change()'::regprocedure);
   if existing.tgenabled<>'O' or existing.tgtype<>29
    or (existing.tgfoid='mip_identity.collector_change()'::regprocedure
     and (existing.tgnargs<>1 or encode(existing.tgargs,'escape')<>'id\000'))
    or (existing.tgfoid='mip_identity.collector_native_change()'::regprocedure and existing.tgnargs<>0) then
    raise exception 'mip_native_collector_recorder_topology';
   end if;
   if existing.tgfoid='mip_identity.collector_change()'::regprocedure then
    -- Rebind the existing EFTA trigger, keeping its name and historical records.
    execute format('drop trigger %I on %s',existing.tgname,relation);
    execute format('create trigger %I after insert or update or delete on %s for each row execute function mip_identity.collector_native_change()',existing.tgname,relation);
   end if;
  else
   execute format('create trigger %I after insert or update or delete on %s for each row execute function mip_identity.collector_native_change()',prefix||'_change',relation);
  end if;
  -- TRUNCATE has no OLD image. Reject rather than silently omit invalidation.
  if not exists(select 1 from pg_trigger where tgrelid=relation
    and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure
    and tgenabled='O' and tgtype=34) then
   execute format('create trigger %I before truncate on %s for each statement execute function comparison_qualification.reject_rewrite()',prefix||'_no_truncate',relation);
  end if;
 end loop;
end $fences$;

alter function mip_identity.validate_review(uuid) rename to validate_review_before_native_v4;
create function mip_identity.validate_review(p_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb;rev mip_identity.publication_reviews;
 input_payload jsonb;output_payload jsonb;
begin
 -- Includes prior current-policy, exact generation/output hash, eligibility,
 -- factual human review and rights/privacy operation checks. Never bypass it.
 payload:=mip_identity.validate_review_before_native_v4(p_revision);
 select * into strict rev from mip_identity.publication_reviews where revision=p_revision;
 select g.input_payload,o.output_payload into strict input_payload,output_payload
 from comparison_qualification.generations g
 join comparison_qualification.outputs o on o.generation_id=g.id
 where g.id=rev.generation_id;
 perform comparison_qualification.check_native_review_lineage(input_payload,output_payload,rev.evidence);
 return payload;
end $$;
alter function mip_identity.validate_review(uuid) owner to mip_publication_owner_v2;
revoke all on function mip_identity.validate_review(uuid),mip_identity.validate_review_before_native_v4(uuid)
 from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1;
grant execute on function comparison_qualification.check_native_review_lineage(jsonb,jsonb,jsonb)
 to mip_publication_owner_v2;
-- stage_review/release_isolated keep calling the same validate_review name.
-- release_public remains disabled; comparison_public remains unchanged.
commit;
