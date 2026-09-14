-- Isolated exact-version acknowledgement, not factual approval or publication.
-- Extends existing workspace receipt/CAS semantics; no live route or role is provisioned.
set role mip_hypothesis_owner;
create table mip_hypothesis.review_acknowledgements(
 investigation_id uuid not null,
 request_id uuid not null,
 reviewer_id uuid not null,
 revision_id uuid not null,
 revision bigint not null check(revision>0),
 receipt_sequence bigint not null check(receipt_sequence>0),
 previous_receipt_id uuid,
 receipt jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(investigation_id,request_id),
 unique(investigation_id,reviewer_id,request_id),
 unique(investigation_id,reviewer_id,receipt_sequence),
 unique(investigation_id,reviewer_id,revision_id),
 foreign key(investigation_id,revision_id) references mip_hypothesis.revisions(investigation_id,id),
 foreign key(investigation_id,reviewer_id,previous_receipt_id)
  references mip_hypothesis.review_acknowledgements(investigation_id,reviewer_id,request_id),
 check(receipt->>'is_approval' is not distinct from 'false'),
 check(receipt->>'publication_allowed' is not distinct from 'false'),
 check(receipt->>'resolves_reassessment' is not distinct from 'false')
);
alter table mip_hypothesis.review_acknowledgements enable row level security;
alter table mip_hypothesis.review_acknowledgements force row level security;
create policy owner_only on mip_hypothesis.review_acknowledgements to mip_hypothesis_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_hypothesis.review_acknowledgements
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.review_acknowledgements
 for each statement execute function mip_hypothesis.reject_mutation();

create function mip_hypothesis.acknowledge_review(p_user uuid,p_investigation uuid,p_request uuid,p_revision uuid,p_previous uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare history jsonb; item jsonb; access text; prior mip_hypothesis.review_acknowledgements;
 existing mip_hypothesis.review_acknowledgements; result jsonb; seq bigint; target_revision bigint; recorded timestamptz;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 if p_user is null or p_investigation is null or p_request is null or p_revision is null then
  raise exception using errcode='22023',message='missing review acknowledgement identity';end if;
 -- Current permission reader obtains publication then membership fences, including on retries.
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 select access_role into access from evidence_pipeline.investigation_memberships
  where investigation_id=p_investigation and user_id=p_user;
 if access is distinct from 'reviewer' then raise exception using errcode='42501',message='hypothesis acknowledgement denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 -- A wait may cross a permission expiry even while mutation fences remain held.
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 select value into item from jsonb_array_elements(history->'entries') where value->>'revision_id'=p_revision::text;
 if not found or item->>'status' is distinct from 'available' then
  raise exception using errcode='42501',message='review target unavailable under current permissions';end if;
 target_revision:=(item->>'revision')::bigint;
 select * into existing from mip_hypothesis.review_acknowledgements
  where investigation_id=p_investigation and request_id=p_request;
 if found then
  if existing.reviewer_id<>p_user or existing.revision_id<>p_revision or existing.previous_receipt_id is distinct from p_previous then
   raise exception using errcode='23505',message='review acknowledgement retry conflict';end if;
  return existing.receipt;
 end if;
 select * into prior from mip_hypothesis.review_acknowledgements
  where investigation_id=p_investigation and reviewer_id=p_user order by receipt_sequence desc limit 1;
 if prior.request_id is distinct from p_previous then
  raise exception using errcode='40001',message='review acknowledgement predecessor changed';end if;
 if prior.revision is not null and target_revision<=prior.revision then
  raise exception using errcode='40001',message='review acknowledgement cannot move backward or repeat a version';end if;
 seq:=coalesce(prior.receipt_sequence,0)+1;recorded:=clock_timestamp();
 result:=jsonb_build_object('contract_version','mip_hypothesis_review_receipt_v1','investigation_id',p_investigation,
  'request_id',p_request,'revision_id',p_revision,'revision',target_revision,'previous_receipt_id',p_previous,
  'receipt_sequence',seq::text,'recorded_at',to_char(recorded at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'review_scope','version_acknowledgement_only','is_approval',false,'resolves_reassessment',false,'publication_allowed',false);
 insert into mip_hypothesis.review_acknowledgements(investigation_id,request_id,reviewer_id,revision_id,revision,
  receipt_sequence,previous_receipt_id,receipt,recorded_at)
 values(p_investigation,p_request,p_user,p_revision,target_revision,seq,p_previous,result,recorded);
 return result;
end $$;

create function mip_hypothesis.review_history(p_user uuid,p_investigation uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare history jsonb; entries jsonb; latest uuid;
begin
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 select coalesce(jsonb_agg(jsonb_build_object('receipt',r.receipt,'target_status',
  case when exists(select 1 from jsonb_array_elements(history->'entries') e
   where e->>'revision_id'=r.revision_id::text and e->>'status'='available') then 'available' else 'withheld' end)
  order by r.receipt_sequence),'[]'::jsonb) into entries
 from mip_hypothesis.review_acknowledgements r where r.investigation_id=p_investigation and r.reviewer_id=p_user;
 select request_id into latest from mip_hypothesis.review_acknowledgements
  where investigation_id=p_investigation and reviewer_id=p_user order by receipt_sequence desc limit 1;
 return jsonb_build_object('contract_version','mip_hypothesis_review_history_v1','investigation_id',p_investigation,
  'entries',entries,'latest_receipt_id',latest,'current_user_only',true,'is_approval',false,
  'resolves_reassessment',false,'publication_allowed',false);
end $$;
revoke all on mip_hypothesis.review_acknowledgements from public,mip_hypothesis_gateway;
revoke all on function mip_hypothesis.acknowledge_review(uuid,uuid,uuid,uuid,uuid),mip_hypothesis.review_history(uuid,uuid) from public;
grant execute on function mip_hypothesis.acknowledge_review(uuid,uuid,uuid,uuid,uuid),mip_hypothesis.review_history(uuid,uuid) to mip_hypothesis_gateway;
reset role;
