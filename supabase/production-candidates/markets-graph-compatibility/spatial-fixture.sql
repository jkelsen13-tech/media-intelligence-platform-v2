-- DISPOSABLE ONLY; caller has already checked database identity.
-- Clone one fully released synthetic fixture chain onto the private event.
-- No disabled triggers, FK bypass, or invented principals. The approved synthetic
-- fixture supplies existing audience, policies, place, geometry and evidence.
create function pg_temp.market_clone_spatial(relation_name text,source_id uuid,changes jsonb)
returns uuid language plpgsql security invoker as $$
declare payload jsonb; new_id uuid:=gen_random_uuid(); key text;
begin
 if relation_name not in('assertions','graph_node_authority_snapshots','assertion_revisions','revision_evidence','review_decisions','release_decisions') then raise exception 'Fixture relation denied'; end if;
 execute format('select to_jsonb(t) from spatial.%I t where id=$1',relation_name) into strict payload using source_id;
 if payload is null then raise exception 'Missing source fixture'; end if;
 payload:=payload||changes||jsonb_build_object('id',new_id);
 foreach key in array array['snapshot_hash','assertion_fingerprint','revision_fingerprint','linkage_fingerprint','decision_fingerprint'] loop
  if payload ? key then payload:=payload||jsonb_build_object(key,encode(sha256(convert_to(payload::text,'UTF8')),'hex')); end if;
 end loop;
 execute format('insert into spatial.%I select (jsonb_populate_record(null::spatial.%I,$1)).*',relation_name,relation_name) using payload;
 return new_id;
end $$;
do $$
declare source record; assertion_id uuid; graph_snapshot_id uuid; revision_id uuid; r record; evidence_count integer:=0;
begin
 select p.mip_object_id,p.revision_id into strict source from market_unfiltered_spatial p
 where p.display_geometry is not null and p.place_snapshot_hash is not null and exists(select 1 from spatial.revision_evidence re join spatial.evidence_snapshots es on es.id=re.evidence_snapshot_id
  join spatial.evidence_artifact_registry er on er.id=es.evidence_artifact_registry_id where re.assertion_revision_id=p.revision_id)
 order by p.mip_object_id limit 1;
 assertion_id:=pg_temp.market_clone_spatial('assertions',source.mip_object_id,
  jsonb_build_object('graph_node_id','f0000000-0000-0000-0000-000000000001'));
 select * into strict r from spatial.assertion_revisions where id=source.revision_id;
 graph_snapshot_id:=pg_temp.market_clone_spatial('graph_node_authority_snapshots',r.graph_node_authority_snapshot_id,
  jsonb_build_object('graph_node_id','f0000000-0000-0000-0000-000000000001',
   'node_payload',(select to_jsonb(n) from public.nodes n where n.id='f0000000-0000-0000-0000-000000000001')));
 revision_id:=pg_temp.market_clone_spatial('assertion_revisions',source.revision_id,
  jsonb_build_object('spatial_assertion_id',assertion_id,'graph_node_authority_snapshot_id',graph_snapshot_id));
 for r in select id from spatial.revision_evidence where assertion_revision_id=source.revision_id loop
  perform pg_temp.market_clone_spatial('revision_evidence',r.id,jsonb_build_object('assertion_revision_id',revision_id));
  evidence_count:=evidence_count+1;
 end loop;
 if evidence_count=0 then raise exception 'Complete evidence chain missing'; end if;
 select id into strict r from spatial.review_decisions where assertion_revision_id=source.revision_id and support_disposition='operative' and effective_at<=now() order by effective_at desc,created_at desc limit 1;
 perform pg_temp.market_clone_spatial('review_decisions',r.id,jsonb_build_object('assertion_revision_id',revision_id));
 select rd.id into strict r from spatial.release_decisions rd join spatial.audience_scopes a on a.id=rd.audience_scope_id
 where rd.assertion_revision_id=source.revision_id and rd.decision_disposition='released' and rd.effective_at<=now() and a.audience_code='public'
 and not exists(select 1 from spatial.audience_scopes newer where newer.supersedes_audience_scope_id=a.id and newer.effective_at<=now())
 order by rd.effective_at desc,rd.created_at desc limit 1;
 perform pg_temp.market_clone_spatial('release_decisions',r.id,jsonb_build_object('assertion_revision_id',revision_id,'predecessor_release_decision_id',null));
 -- Counterfactual proves the exact old projection would expose the complete chain.
 if not exists(select 1 from market_unfiltered_spatial where subject_graph_node_id='f0000000-0000-0000-0000-000000000001' and jsonb_array_length(evidence_refs)>0) then
  raise exception 'Spatial fixture does not reach the original public projection';
 end if;
 if exists(select 1 from public.spatial_projection_v1 where subject_graph_node_id='f0000000-0000-0000-0000-000000000001') then
  raise exception 'Definer projection leaked private spatial chain';
 end if;
end $$;
