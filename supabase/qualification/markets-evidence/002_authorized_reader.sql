-- Private, execute-only retained Markets reader. No public publication adapter.
begin;
grant usage on schema mip_markets to mip_hypothesis_owner,mip_hypothesis_gateway;
grant select on evidence_pipeline.evidence_candidates,evidence_pipeline.assessments,evidence_pipeline.record_versions,evidence_pipeline.article_captures,
 public.nodes,public.edges to mip_hypothesis_owner;
create policy market_nodes_reader on public.nodes for select to mip_hypothesis_owner using(true);
create policy market_edges_reader on public.edges for select to mip_hypothesis_owner using(true);
create policy market_candidates_reader on evidence_pipeline.evidence_candidates for select to mip_hypothesis_owner using(true);
create policy market_assessments_reader on evidence_pipeline.assessments for select to mip_hypothesis_owner using(true);
create policy market_versions_reader on evidence_pipeline.record_versions for select to mip_hypothesis_owner using(true);
create policy market_captures_reader on evidence_pipeline.article_captures for select to mip_hypothesis_owner using(true);
grant execute on function evidence_pipeline.read_assessment(uuid,timestamptz),evidence_pipeline.assessment_causes(uuid) to mip_hypothesis_owner;
grant select on evidence_pipeline.change_subjects,evidence_pipeline.evidence_changes to mip_hypothesis_owner;
create policy market_changes_reader on evidence_pipeline.evidence_changes for select to mip_hypothesis_owner using(true);
create function mip_markets.read_private(p_user uuid,p_investigation uuid,p_version uuid,p_source text,p_asset uuid,p_event uuid,p_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare binding jsonb;path record;c evidence_pipeline.evidence_candidates;a jsonb;cap evidence_pipeline.article_captures;
 v evidence_pipeline.record_versions;material uuid;input jsonb;input_position text;op text;domain text;checked jsonb;
 asset jsonb;asset_version uuid;asset_companion jsonb;subject_node jsonb;object_node jsonb;companion evidence_pipeline.record_versions;aliases jsonb:='[]';alias_item jsonb;paths jsonb:='[]';hops jsonb;support jsonb;cid uuid;retained_ids uuid[];candidate_ids uuid[];
begin
 if p_asset is null and p_event is null or p_at is null or not isfinite(p_at) then raise exception 'mip_market_bounded_identity_required';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 binding:=mip_hypothesis.observation_binding(p_user,p_investigation,p_version);
 if p_source is null or btrim(p_source)='' or p_source='cc-definition-batch-v1' then raise exception 'mip_market_source_denied';end if;
 select array_agg(coalesce(value->'capture'->>'id',value->'record_version'->>'id')::uuid) into retained_ids
 from jsonb_array_elements(binding->'observation'->'snapshot'->'inputs');
 if (p_asset is not null and not exists(select 1 from evidence_pipeline.record_versions where id=any(retained_ids) and record_kind='graph_node' and record_key=p_asset::text and payload->>'type' in('equity','cryptoasset')))
 or(p_event is not null and not exists(select 1 from evidence_pipeline.record_versions where id=any(retained_ids) and record_kind='graph_node' and record_key=p_event::text and payload->>'type'='event'))
 then raise exception 'mip_market_identity_not_in_workspace';end if;
 select coalesce(array_agg(id order by id),'{}') into candidate_ids from(
  select cand.id from evidence_pipeline.evidence_candidates cand
  where cand.candidate_kind='typed_graph_relationship' and cand.capture_id=any(retained_ids)
   and cand.subject_version_id=any(retained_ids) and cand.object_version_id=any(retained_ids) and cand.edge_version_id=any(retained_ids)
   and(cand.identity_version_id is null or cand.identity_version_id=any(retained_ids))
   and cand.valid_from<=p_at and(cand.valid_to is null or p_at<cand.valid_to)
  order by cand.id limit 17
 ) bounded;
 if cardinality(candidate_ids)>16 then raise exception 'mip_market_candidate_budget';end if;
 -- Recursion sees at most sixteen explicitly retained candidates, not global private history.
 -- A simple directed path is uniquely ordered by its edge subset: at most 2^16 subsets.
 -- Same shared edge identities in both discovery directions. No alternate graph.
 for path in with recursive eligible as(
  select cand.id,e.source_id,e.target_id,cand.subject_version_id,cand.object_version_id from evidence_pipeline.evidence_candidates cand join public.edges e on e.id=cand.typed_edge_id
  where cand.id=any(candidate_ids)
 ), walk as(
  select n.id asset_id,e.target_id endpoint,e.object_version_id endpoint_version,array[n.id,e.target_id] nodes,array[e.id] candidates
  from public.nodes n join eligible e on e.source_id=n.id
  where n.type in('equity','cryptoasset') and(p_asset is null or n.id=p_asset)
  union all
  select w.asset_id,e.target_id,e.object_version_id,w.nodes||e.target_id,w.candidates||e.id from walk w join eligible e on e.source_id=w.endpoint and e.subject_version_id=w.endpoint_version
  where cardinality(w.candidates)<8 and not e.target_id=any(w.nodes)
 ) select w.* from walk w join public.nodes n on n.id=w.endpoint and n.type='event'
 where(p_event is null or w.endpoint=p_event) order by w.asset_id,w.endpoint,w.candidates limit 33
 loop
  if jsonb_array_length(paths)>=32 then raise exception 'mip_market_path_budget';end if;
  hops:='[]';asset:=null;
  foreach cid in array path.candidates loop
   select * into strict c from evidence_pipeline.evidence_candidates where id=cid;
   select evidence_pipeline.read_assessment(x.id) into a from evidence_pipeline.assessments x
   where x.candidate_id=c.id and not exists(select 1 from evidence_pipeline.assessments y where y.predecessor_id=x.id)
   order by x.ordinal desc limit 1;
   if a is null or a->>'outcome'<>'supported' or a->'stale'<>'false'::jsonb or jsonb_array_length(a->'superseded_by')<>0 then raise exception 'mip_market_assessment_unavailable';end if;
   -- Every retained object must already belong to this exact workspace observation.
   -- Sorted UUID iteration provides deterministic material lock/check order.
   for material in select x from unnest(array[c.subject_version_id,c.object_version_id,c.edge_version_id,c.capture_id,c.identity_version_id])x where x is not null order by x loop
    select value into input from jsonb_array_elements(binding->'observation'->'snapshot'->'inputs')
     where coalesce(value->'capture'->>'id',value->'record_version'->>'id')=material::text;
    if input is null then raise exception 'mip_market_material_not_in_workspace';end if;
    input_position:=input->>'position';
    foreach op in array array['retention','analysis','excerpt_display'] loop foreach domain in array array['rights','privacy'] loop
     checked:=mip_hypothesis.operation_permission(p_user,p_investigation,p_version,input_position,p_source,op,domain);
     if checked->'allowed' is distinct from 'true'::jsonb then raise exception using errcode='42501',message='mip_market_operation_denied';end if;
    end loop;end loop;
   end loop;
   select * into strict v from evidence_pipeline.record_versions where id=c.subject_version_id;
   if v.record_key=path.asset_id::text then
    asset:=v.payload;asset_version:=v.id;
    select * into strict companion from evidence_pipeline.record_versions where id=c.identity_version_id;
    if asset->>'type'='equity' then
     if companion.record_key is distinct from asset#>>'{metadata,issuer_id}' or companion.payload->>'type' not in('actor','institution') then raise exception 'mip_market_issuer_required';end if;
    elsif asset->>'type'='cryptoasset' then
     if companion.record_key is distinct from asset#>>'{metadata,network_id}' or companion.payload->>'type'<>'network'
      or nullif(btrim(asset#>>'{metadata,asset_identifier}'),'') is null then raise exception 'mip_market_network_required';end if;
    else raise exception 'mip_market_asset_type';end if;
    asset_companion:=jsonb_build_object('id',companion.record_key,'version_id',companion.id,'type',companion.payload->>'type','name',companion.payload->>'label');
    if asset#>>'{metadata,valid_from}' is null or not isfinite((asset#>>'{metadata,valid_from}')::timestamptz)
     or p_at<(asset#>>'{metadata,valid_from}')::timestamptz or(asset#>>'{metadata,valid_to}' is not null and
     (not isfinite((asset#>>'{metadata,valid_to}')::timestamptz) or p_at>=(asset#>>'{metadata,valid_to}')::timestamptz))
     then raise exception 'mip_market_identity_not_valid';end if;
    if jsonb_typeof(asset#>'{metadata,aliases}') is distinct from 'array' or jsonb_array_length(asset#>'{metadata,aliases}')>32 then raise exception 'mip_market_aliases_required';end if;
    aliases:='[]';
    for alias_item in select value from jsonb_array_elements(asset#>'{metadata,aliases}') loop
     if nullif(btrim(alias_item->>'symbol'),'') is null or nullif(btrim(alias_item->>'namespace'),'') is null or alias_item->>'valid_from' is null
      or not isfinite((alias_item->>'valid_from')::timestamptz) or(alias_item->>'valid_to' is not null and((alias_item->>'valid_to')::timestamptz<=(alias_item->>'valid_from')::timestamptz or not isfinite((alias_item->>'valid_to')::timestamptz))) then raise exception 'mip_market_alias_invalid';end if;
     if(alias_item->>'valid_from')::timestamptz<=p_at and(alias_item->>'valid_to' is null or p_at<(alias_item->>'valid_to')::timestamptz) then
      aliases:=aliases||jsonb_build_array(jsonb_build_object('symbol',alias_item->>'symbol','namespace',alias_item->>'namespace','valid_from',alias_item->>'valid_from','valid_to',alias_item->>'valid_to'));
     end if;
    end loop;
   end if;
   select * into strict cap from evidence_pipeline.article_captures where id=c.capture_id;
   select value->>'position' into input_position from jsonb_array_elements(binding->'observation'->'snapshot'->'inputs') where value->'capture'->>'id'=cap.id::text;
   support:=mip_hypothesis.retained_excerpt(p_user,p_investigation,p_version,input_position,p_source,c.source_field,c.span_start,c.span_end,encode(sha256(convert_to(c.excerpt,'UTF8')),'hex'));
   select jsonb_build_object('id',record_key,'version_id',id,'type',payload->>'type','name',payload->>'label') into subject_node from evidence_pipeline.record_versions where id=c.subject_version_id;
   select jsonb_build_object('id',record_key,'version_id',id,'type',payload->>'type','name',payload->>'label') into object_node from evidence_pipeline.record_versions where id=c.object_version_id;
   hops:=hops||jsonb_build_array(jsonb_build_object('edge_id',c.typed_edge_id,'edge_version_id',c.edge_version_id,
    'subject',subject_node,'object',object_node,'subject_version_id',c.subject_version_id,'object_version_id',c.object_version_id,'candidate_id',c.id,'assessment_id',a->>'id',
    'relationship',c.relationship_kind,'valid_from',c.valid_from,'valid_to',c.valid_to,'uncertainty',a->>'remaining_uncertainty',
    'capture_id',cap.id,'article_id',cap.article_id,'captured_at',cap.captured_at,'published_at',cap.payload->'published_at','source_url',cap.payload->'url','capture_payload_hash',cap.content_hash,'support',support));
  end loop;
  if asset is null then raise exception 'mip_market_asset_unavailable';end if;
  paths:=paths||jsonb_build_array(jsonb_build_object('asset_id',path.asset_id,'asset_version_id',asset_version,'asset_kind',asset->>'type','name',asset->>'label',
   'identity_companion',asset_companion,'asset_identifier',asset#>>'{metadata,asset_identifier}','valid_from',asset#>>'{metadata,valid_from}','valid_to',asset#>>'{metadata,valid_to}','aliases_version_id',asset_version,'aliases',aliases,'event_id',path.endpoint,'hops',hops,'relation',case when jsonb_array_length(hops)=1 and hops->0->>'relationship'='direct_reporting' then 'direct_reporting' else 'connected_development' end));
 end loop;
 return jsonb_build_object('contract_version','mip_markets_private_qualification_v1','investigation_id',p_investigation,'workspace_version_id',p_version,
 'observation_id',binding->'observation'->>'id','asset_id',p_asset,'event_id',p_event,'at',p_at,'paths',paths,'publication_allowed',false,'historical_time_qualified',false,'broader_context',jsonb_build_array(),
 'coverage','bounded_explicit_typed_paths_only','source_root_lineage_qualified',false);
end $$;
alter function mip_markets.read_private(uuid,uuid,uuid,text,uuid,uuid,timestamptz) owner to mip_hypothesis_owner;
revoke all on function mip_markets.read_private(uuid,uuid,uuid,text,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function mip_markets.read_private(uuid,uuid,uuid,text,uuid,uuid,timestamptz) to mip_hypothesis_gateway;
commit;
