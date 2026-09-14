-- Isolated authoritative method-head change signals. No method/policy approval or deployment.
set role mip_hypothesis_owner;
alter table mip_hypothesis.reassessment_causes drop constraint reassessment_causes_kind_check;
alter table mip_hypothesis.reassessment_causes add constraint reassessment_causes_kind_check
 check(kind in('retained_source_change','retained_assessment_change','workspace_changed','permission_changed','human_reconsideration','method_changed'));

alter function mip_hypothesis.discover_reassessment_causes(uuid) rename to discover_reassessment_causes_pre_method;
create function mip_hypothesis.discover_reassessment_causes(p_investigation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g mip_hypothesis.generations; rid uuid; observed uuid; enabled boolean; key text;
begin
 -- Existing discovery acquires publication fence then question lock. A method
 -- mutation obtains identity/publication fences before changing the head.
 perform mip_hypothesis.discover_reassessment_causes_pre_method(p_investigation);
 select id into rid from mip_hypothesis.revisions where investigation_id=p_investigation order by revision desc limit 1;
 select gen.* into g from mip_hypothesis.generations gen
  join mip_hypothesis.generation_outputs o on o.generation_id=gen.id where o.assessment_revision_id=rid;
 if not found then return;end if;
 select revision,active into observed,enabled from mip_hypothesis.method_heads where implementation=g.implementation;
 if observed is not distinct from g.method_revision and enabled is true then return;end if;
 key:='method:'||g.method_revision::text||':'||coalesce(observed::text,'missing')||':'||coalesce(enabled::text,'missing');
 insert into mip_hypothesis.reassessment_causes(investigation_id,revision_id,cause_key,kind,related_version_id,detail)
 values(p_investigation,rid,key,'method_changed',observed,jsonb_build_object(
  'implementation',g.implementation,'accepted_method_revision',g.method_revision,
  'observed_method_revision',observed,'observed_active',coalesce(enabled,false),
  'classification','method_change_requires_reassessment_not_approval'))
 on conflict(revision_id,cause_key) do nothing;
end $$;

create function mip_hypothesis.method_change_reassessment() returns trigger
language plpgsql security definer set search_path='' as $$
declare iid uuid;
begin
 -- Latest generated revisions only; manual authoring is not falsely attributed
 -- to an evaluated method. Deterministic question order for multi-row changes.
 for iid in select distinct g.investigation_id from mip_hypothesis.generations g
  join mip_hypothesis.generation_outputs o on o.generation_id=g.id
  where not exists(select 1 from mip_hypothesis.revisions r
   join mip_hypothesis.revisions prior on prior.id=o.assessment_revision_id
   where r.investigation_id=g.investigation_id and r.revision>prior.revision)
  order by g.investigation_id
 loop perform mip_hypothesis.discover_reassessment_causes(iid);end loop;
 return null;
end $$;
revoke all on function mip_hypothesis.discover_reassessment_causes_pre_method(uuid),
 mip_hypothesis.discover_reassessment_causes(uuid),mip_hypothesis.method_change_reassessment() from public;
reset role;
-- Statement trigger covers removal of all heads too. Existing BEFORE fences
-- serialize this cause insertion with completion; rollback rolls both back.
create trigger hypothesis_method_reassessment after insert or update or delete or truncate
 on mip_hypothesis.method_heads for each statement execute function mip_hypothesis.method_change_reassessment();
