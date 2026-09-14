-- Isolated human reconsideration requests. A request approves no method, finding or publication.
set role mip_hypothesis_owner;
alter table mip_hypothesis.reassessment_causes drop constraint reassessment_causes_kind_check;
alter table mip_hypothesis.reassessment_causes add constraint reassessment_causes_kind_check
 check(kind in('retained_source_change','retained_assessment_change','workspace_changed','permission_changed','human_reconsideration'));
create table mip_hypothesis.reassessment_requests(
 investigation_id uuid not null,
 request_id uuid not null,
 revision_id uuid not null,
 cause_id uuid not null unique references mip_hypothesis.reassessment_causes(id),
 requested_by uuid not null,
 trigger_kind text not null check(trigger_kind in('contradiction','shared_origin','methodology')),
 reason text not null check(length(btrim(reason)) between 1 and 2000 and reason ~ '[^[:space:]]'),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(investigation_id,request_id),
 foreign key(investigation_id,revision_id) references mip_hypothesis.revisions(investigation_id,id)
);
create index reassessment_requests_revision on mip_hypothesis.reassessment_requests(investigation_id,revision_id);
alter table mip_hypothesis.reassessment_requests enable row level security;
alter table mip_hypothesis.reassessment_requests force row level security;
create policy owner_only on mip_hypothesis.reassessment_requests to mip_hypothesis_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_hypothesis.reassessment_requests
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.reassessment_requests
 for each statement execute function mip_hypothesis.reject_mutation();

create function mip_hypothesis.request_reassessment(p_user uuid,p_investigation uuid,p_request uuid,p_revision uuid,p_trigger text,p_reason text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare access text; head uuid; cause uuid; receipt mip_hypothesis.reassessment_requests;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 if p_request is null or p_revision is null or p_trigger is null or p_trigger not in('contradiction','shared_origin','methodology')
  or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 or p_reason !~ '[^[:space:]]' then
  raise exception using errcode='22023',message='invalid reassessment request';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||p_investigation::text||':'||p_user::text,0));
 select access_role into access from evidence_pipeline.investigation_memberships where investigation_id=p_investigation and user_id=p_user;
 if access is distinct from 'reviewer' then raise exception using errcode='42501',message='hypothesis request denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 select * into receipt from mip_hypothesis.reassessment_requests where investigation_id=p_investigation and request_id=p_request;
 if found then
  if receipt.requested_by<>p_user or receipt.revision_id<>p_revision or receipt.trigger_kind<>p_trigger or receipt.reason<>p_reason then
   raise exception using errcode='23505',message='reassessment request retry conflict';end if;
 else
  select id into head from mip_hypothesis.revisions where investigation_id=p_investigation order by revision desc limit 1;
  if head is null or head<>p_revision then raise exception using errcode='40001',message='reassessment target changed';end if;
  insert into mip_hypothesis.reassessment_causes(investigation_id,revision_id,cause_key,kind,detail)
   values(p_investigation,p_revision,'human:'||p_request::text,'human_reconsideration',
    jsonb_build_object('request_id',p_request,'trigger',p_trigger,'classification','human_request_not_method_or_publication_approval'))
   returning id into cause;
  insert into mip_hypothesis.reassessment_requests(investigation_id,request_id,revision_id,cause_id,requested_by,trigger_kind,reason)
   values(p_investigation,p_request,p_revision,cause,p_user,p_trigger,p_reason) returning * into receipt;
 end if;
 return jsonb_build_object('contract_version','mip_hypothesis_request_receipt_v1','investigation_id',p_investigation,
  'request_id',receipt.request_id,'revision_id',receipt.revision_id,'cause_id',receipt.cause_id,'trigger',receipt.trigger_kind,
  'completed_reassessment',false,'publication_allowed',false);
end $$;
create function mip_hypothesis.read_reassessment_request(p_user uuid,p_investigation uuid,p_request uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare history jsonb; receipt mip_hypothesis.reassessment_requests; result jsonb;
begin
 -- Permission-checked history supplies current membership/rights fences before any free-text reason is returned.
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 select * into receipt from mip_hypothesis.reassessment_requests where investigation_id=p_investigation and request_id=p_request;
 if not found then raise exception using errcode='42501',message='hypothesis request unavailable';end if;
 result:=jsonb_build_object('contract_version','mip_hypothesis_request_detail_v1','investigation_id',p_investigation,
  'request_id',p_request,'revision_id',receipt.revision_id,'cause_id',receipt.cause_id,'trigger',receipt.trigger_kind,
  'publication_allowed',false,'is_approval',false);
 if exists(select 1 from jsonb_array_elements(history->'entries') e where e->>'revision_id'=receipt.revision_id::text and e->>'status'='available') then
  return result||jsonb_build_object('status','available','reason',receipt.reason,'recorded_at',receipt.recorded_at);
 end if;
 return result||jsonb_build_object('status','withheld','withheld_reason','current_evidence_permission_required');
end $$;
revoke all on all functions in schema mip_hypothesis from public;
revoke all on mip_hypothesis.reassessment_requests from public;
grant execute on function mip_hypothesis.request_reassessment(uuid,uuid,uuid,uuid,text,text),
 mip_hypothesis.read_reassessment_request(uuid,uuid,uuid) to mip_hypothesis_gateway;
reset role;
