-- Add reference-bound private snapshots of spatial fixture parents.
-- No live spatial/public tables or existing archived payloads are modified.
create function mip_private.require_spatial_parent_reference() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists (
    select 1 from mip_private.spatial_row_versions child
    join (values
      ('spatial.assertion_revisions','canonical_place_id','public.geographic_places'),
      ('spatial.assertions','graph_node_id','public.nodes'),
      ('spatial.evidence_artifact_registry','article_id','public.articles'),
      ('spatial.evidence_artifact_registry','policy_document_id','public.policy_documents'),
      ('spatial.evidence_condition_events','source_change_event_id','public.source_change_events'),
      ('spatial.geometry_snapshots','canonical_place_id','public.geographic_places'),
      ('spatial.graph_node_authority_snapshots','graph_node_id','public.nodes'),
      ('spatial.place_authority_snapshots','canonical_place_id','public.geographic_places')
    ) as link(child_relation,child_field,parent_relation)
      on child.source_relation=link.child_relation
    where child.source_project=new.source_project
      and link.parent_relation=new.source_relation
      and child.payload->>link.child_field=new.source_key
  ) then
    raise exception 'spatial_parent_reference_required' using errcode='23503';
  end if;
  return new;
end $$;
revoke all on function mip_private.require_spatial_parent_reference() from public, anon, authenticated, service_role;
create trigger spatial_parent_reference_required before insert on mip_private.spatial_row_versions
for each row when (new.source_relation like 'public.%')
execute function mip_private.require_spatial_parent_reference();

-- Install the expanded constraint before removing its narrower predecessor.
alter table mip_private.spatial_row_versions add constraint spatial_row_versions_source_relation_v2_check
check (source_relation in ('spatial.assertion_revisions','spatial.assertions','spatial.audience_scopes','spatial.break_glass_audit','spatial.evidence_artifact_registry','spatial.evidence_condition_events','spatial.evidence_snapshots','spatial.geometry_snapshots','spatial.graph_node_authority_snapshots','spatial.place_authority_snapshots','spatial.policy_artifacts','spatial.release_decisions','spatial.review_decisions','spatial.revision_evidence','spatial.revision_lineage','public.articles','public.geographic_places','public.nodes','public.policy_documents','public.source_change_events'));
alter table mip_private.spatial_row_versions drop constraint spatial_row_versions_source_relation_check;

create or replace function mip_private.retain_spatial_rows(
  p_source_project text, p_source_relation text, p_observed_at timestamptz, p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row jsonb; v_key text; v_hash text; v_existing jsonb; v_added integer:=0; v_count integer;
begin
  if p_source_project is null or p_source_project not in ('jfnzyvzthzqtczlxhjll')
    or p_source_relation is null or p_source_relation not in ('spatial.assertion_revisions','spatial.assertions','spatial.audience_scopes','spatial.break_glass_audit','spatial.evidence_artifact_registry','spatial.evidence_condition_events','spatial.evidence_snapshots','spatial.geometry_snapshots','spatial.graph_node_authority_snapshots','spatial.place_authority_snapshots','spatial.policy_artifacts','spatial.release_decisions','spatial.review_decisions','spatial.revision_evidence','spatial.revision_lineage','public.articles','public.geographic_places','public.nodes','public.policy_documents','public.source_change_events')
    or p_observed_at is null or not isfinite(p_observed_at) or p_observed_at > clock_timestamp()
    or p_rows is null or jsonb_typeof(p_rows) <> 'array'
    or octet_length(p_rows::text) > 2097152 then
    raise exception 'invalid_spatial_batch' using errcode='22023';
  end if;
  v_count:=jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 250 then raise exception 'invalid_spatial_batch' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) <> 'object' or jsonb_typeof(r->'id') is distinct from 'string')
    or (select count(distinct r->>'id') from jsonb_array_elements(p_rows) r) <> v_count then
    raise exception 'ambiguous_spatial_identity' using errcode='22023';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_key:=v_row->>'id';
    v_hash:=encode(sha256(convert_to(v_row::text,'UTF8')),'hex');
    insert into mip_private.spatial_row_versions(source_project,source_relation,source_key,payload_hash,payload,source_observed_at)
      values(p_source_project,p_source_relation,v_key,v_hash,v_row,p_observed_at) on conflict do nothing;
    if found then v_added:=v_added+1; end if;
    select payload into strict v_existing from mip_private.spatial_row_versions
      where source_project=p_source_project and source_relation=p_source_relation and source_key=v_key and payload_hash=v_hash;
    if v_existing is distinct from v_row then raise exception 'spatial_hash_conflict' using errcode='22000'; end if;
  end loop;
  return jsonb_build_object('source_project',p_source_project,'source_relation',p_source_relation,
    'received',v_count,'inserted',v_added,'already_retained',v_count-v_added);
end $$;
revoke all on function mip_private.retain_spatial_rows(text,text,timestamptz,jsonb) from public, anon, authenticated;
grant usage on schema mip_private to service_role;
grant execute on function mip_private.retain_spatial_rows(text,text,timestamptz,jsonb) to service_role;

comment on table mip_private.spatial_row_versions is
  'Exact sandbox spatial snapshots and structurally referenced parent versions. Private append-only retention; not live evidence admission, semantic parent-version binding, publication approval, source authenticity or proof of unobserved history.';
