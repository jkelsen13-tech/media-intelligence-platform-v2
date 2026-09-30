-- Isolated committed observation evidence. Not a migration or arbitrary wall-clock history.
set role mip_hypothesis_owner;
create table mip_hypothesis.observation_epoch(
 id boolean primary key check(id),epoch uuid not null,enabled boolean not null default false
);
insert into mip_hypothesis.observation_epoch values(true,gen_random_uuid(),false);
create table mip_hypothesis.revision_transactions(
 revision_id uuid primary key references mip_hypothesis.revisions(id),
 epoch uuid not null,creator_xid xid8 not null
);
create table mip_hypothesis.history_observations(
 investigation_id uuid not null,request_id uuid not null,observer_id uuid not null,
 epoch uuid not null,creator_xid xid8 not null,visibility_snapshot pg_snapshot not null,
 references_json jsonb not null,reference_text text not null,reference_hash text not null,
 receipt jsonb not null,primary key(investigation_id,request_id),
 check(reference_text::jsonb=references_json),
 check(reference_hash=encode(sha256(convert_to(reference_text,'UTF8')),'hex'))
);
alter table mip_hypothesis.observation_epoch enable row level security;
alter table mip_hypothesis.observation_epoch force row level security;
alter table mip_hypothesis.revision_transactions enable row level security;
alter table mip_hypothesis.revision_transactions force row level security;
alter table mip_hypothesis.history_observations enable row level security;
alter table mip_hypothesis.history_observations force row level security;
create policy owner_only on mip_hypothesis.observation_epoch to mip_hypothesis_owner using(true) with check(true);
create policy owner_only on mip_hypothesis.revision_transactions to mip_hypothesis_owner using(true) with check(true);
create policy owner_only on mip_hypothesis.history_observations to mip_hypothesis_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_hypothesis.revision_transactions
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.revision_transactions
 for each statement execute function mip_hypothesis.reject_mutation();
create trigger immutable_rows before update or delete on mip_hypothesis.history_observations
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.history_observations
 for each statement execute function mip_hypothesis.reject_mutation();

create function mip_hypothesis.record_revision_transaction() returns trigger
 language plpgsql security definer set search_path='' as $$
declare origin uuid;
begin
 select epoch into origin from mip_hypothesis.observation_epoch where id for share;
 if origin is null then raise exception using errcode='55000',message='hypothesis observation epoch unavailable';end if;
 insert into mip_hypothesis.revision_transactions values(new.id,origin,pg_current_xact_id());
 return new;
end $$;
create trigger revision_transaction after insert on mip_hypothesis.revisions
 for each row execute function mip_hypothesis.record_revision_transaction();

create function mip_hypothesis.capture_history_observation(p_user uuid,p_investigation uuid,p_request uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare history jsonb; origin uuid; item jsonb; provenance mip_hypothesis.revision_transactions;
 existing mip_hypothesis.history_observations; refs jsonb:='[]'; snapshot pg_snapshot;
 own_xid xid8; started timestamptz; finished timestamptz; result jsonb; serialized text; digest text;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 if p_user is null or p_investigation is null or p_request is null then raise exception using errcode='22023',message='observation identity required';end if;
 select epoch into origin from mip_hypothesis.observation_epoch where id and enabled for share;
 if origin is null then raise exception using errcode='55000',message='hypothesis observations disabled';end if;
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 select * into existing from mip_hypothesis.history_observations where investigation_id=p_investigation and request_id=p_request;
 if found then
  if existing.observer_id<>p_user or existing.epoch<>origin then raise exception using errcode='23505',message='observation retry conflict';end if;
  return existing.receipt;
 end if;
 own_xid:=pg_current_xact_id();started:=clock_timestamp();
 -- The question fence fixes the revision set while this fresh snapshot is obtained.
 select pg_current_snapshot() into snapshot;
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 for item in select value from jsonb_array_elements(history->'entries') loop
  select * into provenance from mip_hypothesis.revision_transactions where revision_id=(item->>'revision_id')::uuid;
  if not found or provenance.epoch<>origin or provenance.creator_xid=own_xid or
   not pg_visible_in_snapshot(provenance.creator_xid,snapshot) then
   raise exception using errcode='55000',message='committed revision provenance unavailable';
  end if;
  refs:=refs||jsonb_build_array(jsonb_build_object('revision_id',item->'revision_id','revision',item->'revision','observed_status',item->'status'));
 end loop;
 finished:=clock_timestamp();
 if finished<started then raise exception using errcode='55000',message='observation clock moved backward';end if;
 serialized:=refs::text;digest:=encode(sha256(convert_to(serialized,'UTF8')),'hex');
 result:=jsonb_build_object('contract_version','mip_hypothesis_observation_receipt_v1','investigation_id',p_investigation,
  'observation_id',p_request,'epoch',origin,'reference_hash',digest,'revision_count',jsonb_array_length(refs),
  'observation_started_at',to_char(started at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'observation_finished_at',to_char(finished at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'temporal_scope','committed_revisions_observed','arbitrary_time_qualified',false,
  'requires_committed_readback',true,'publication_allowed',false);
 insert into mip_hypothesis.history_observations values(p_investigation,p_request,p_user,origin,own_xid,snapshot,refs,serialized,digest,result);
 return result;
end $$;

create function mip_hypothesis.read_history_observation(p_user uuid,p_investigation uuid,p_request uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare history jsonb; origin uuid; saved mip_hypothesis.history_observations; reference jsonb; item jsonb; entries jsonb:='[]';
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 select epoch into origin from mip_hypothesis.observation_epoch where id and enabled for share;
 if origin is null then raise exception using errcode='55000',message='hypothesis observations disabled';end if;
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 select * into saved from mip_hypothesis.history_observations
  where investigation_id=p_investigation and request_id=p_request and observer_id=p_user and epoch=origin;
 if not found then raise exception using errcode='42501',message='history observation unavailable';end if;
 if saved.creator_xid is not distinct from pg_current_xact_id_if_assigned() then
  raise exception using errcode='55000',message='observation requires committed readback';
 end if;
 if saved.reference_hash<>encode(sha256(convert_to(saved.reference_text,'UTF8')),'hex') or saved.reference_text::jsonb<>saved.references_json then
  raise exception using errcode='55000',message='history observation binding invalid';end if;
 for reference in select value from jsonb_array_elements(saved.references_json) loop
  select value into item from jsonb_array_elements(history->'entries') where value->'revision_id'=reference->'revision_id' and value->'revision'=reference->'revision';
  if not found then raise exception using errcode='55000',message='history observation record missing';end if;
  if reference->>'observed_status'<>'available' then
   item:=jsonb_build_object('revision_id',reference->'revision_id','revision',reference->'revision','status','withheld','reason','withheld_at_observation');
  end if;
  entries:=entries||jsonb_build_array(item||jsonb_build_object('observed_status',reference->'observed_status'));
 end loop;
 return jsonb_build_object('contract_version','mip_hypothesis_observed_history_v1','receipt',saved.receipt,'entries',entries,
  'committed_readback',true,'observation_membership_qualified',true,'arbitrary_time_qualified',false,
  'current_user_only',true,'publication_allowed',false);
end $$;
revoke all on mip_hypothesis.observation_epoch,mip_hypothesis.revision_transactions,mip_hypothesis.history_observations from public,mip_hypothesis_gateway;
revoke all on function mip_hypothesis.record_revision_transaction(),mip_hypothesis.capture_history_observation(uuid,uuid,uuid),mip_hypothesis.read_history_observation(uuid,uuid,uuid) from public;
grant execute on function mip_hypothesis.capture_history_observation(uuid,uuid,uuid),mip_hypothesis.read_history_observation(uuid,uuid,uuid) to mip_hypothesis_gateway;
reset role;
