-- Isolated observation delivery; no activation or historical timestamp claim.
set role mip_hypothesis_owner;
create or replace function mip_hypothesis.read_history_observation(p_user uuid,p_investigation uuid,p_request uuid)
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
 return jsonb_build_object('contract_version','mip_hypothesis_observed_history_v2','receipt',saved.receipt,'entries',entries,'reference_text',saved.reference_text,
  'committed_readback',true,'observation_membership_qualified',true,'arbitrary_time_qualified',false,
  'current_user_only',true,'publication_allowed',false);
end $$;

create function mip_hypothesis.list_history_observations(p_user uuid,p_investigation uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare origin uuid; receipts jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 select epoch into origin from mip_hypothesis.observation_epoch where id and enabled for share;
 if origin is null then raise exception using errcode='55000',message='hypothesis observations disabled';end if;
 perform mip_hypothesis.read_bound_history(p_user,p_investigation);
 if exists(select 1 from mip_hypothesis.history_observations where investigation_id=p_investigation and observer_id=p_user
  and epoch=origin and creator_xid=pg_current_xact_id_if_assigned()) then
  raise exception using errcode='55000',message='observation list requires committed readback';
 end if;
 select coalesce(jsonb_agg(receipt order by receipt->>'observation_started_at' desc,request_id),'[]'::jsonb)
  into receipts from mip_hypothesis.history_observations
  where investigation_id=p_investigation and observer_id=p_user and epoch=origin;
 return jsonb_build_object('contract_version','mip_hypothesis_observation_list_v1','investigation_id',p_investigation,
  'epoch',origin,'receipts',receipts,'current_user_only',true,'arbitrary_time_qualified',false,'publication_allowed',false);
end $$;
revoke all on function mip_hypothesis.list_history_observations(uuid,uuid) from public;
grant execute on function mip_hypothesis.list_history_observations(uuid,uuid) to mip_hypothesis_gateway;
reset role;
