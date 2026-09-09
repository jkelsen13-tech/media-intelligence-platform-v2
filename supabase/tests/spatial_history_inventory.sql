-- Read-only exact whole-table source/survivor spatial inventory (run separately on each project).
select clock_timestamp()::text as observed_at, jsonb_agg(x order by relation_name) as relations from (select 'assertion_revisions' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."assertion_revisions" t
union all
select 'assertions' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."assertions" t
union all
select 'audience_scopes' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."audience_scopes" t
union all
select 'break_glass_audit' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."break_glass_audit" t
union all
select 'evidence_artifact_registry' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."evidence_artifact_registry" t
union all
select 'evidence_condition_events' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."evidence_condition_events" t
union all
select 'evidence_snapshots' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."evidence_snapshots" t
union all
select 'geometry_snapshots' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."geometry_snapshots" t
union all
select 'graph_node_authority_snapshots' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."graph_node_authority_snapshots" t
union all
select 'place_authority_snapshots' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."place_authority_snapshots" t
union all
select 'policy_artifacts' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."policy_artifacts" t
union all
select 'release_decisions' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."release_decisions" t
union all
select 'review_decisions' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."review_decisions" t
union all
select 'revision_evidence' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."revision_evidence" t
union all
select 'revision_lineage' as relation_name, count(*)::text as row_count, encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'sha256'),'hex') as ordered_payload_sha256 from spatial."revision_lineage" t) x;

-- Survivor private archive parity.
select clock_timestamp()::text as observed_at, jsonb_agg(x order by relation_name) as relations from (select 'assertion_revisions' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.assertion_revisions'
union all
select 'assertions' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.assertions'
union all
select 'audience_scopes' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.audience_scopes'
union all
select 'break_glass_audit' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.break_glass_audit'
union all
select 'evidence_artifact_registry' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.evidence_artifact_registry'
union all
select 'evidence_condition_events' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.evidence_condition_events'
union all
select 'evidence_snapshots' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.evidence_snapshots'
union all
select 'geometry_snapshots' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.geometry_snapshots'
union all
select 'graph_node_authority_snapshots' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.graph_node_authority_snapshots'
union all
select 'place_authority_snapshots' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.place_authority_snapshots'
union all
select 'policy_artifacts' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.policy_artifacts'
union all
select 'release_decisions' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.release_decisions'
union all
select 'review_decisions' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.review_decisions'
union all
select 'revision_evidence' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.revision_evidence'
union all
select 'revision_lineage' as relation_name,count(*)::text as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(payload order by source_key),'[]'::jsonb)::text,'UTF8')),'hex') as ordered_payload_sha256 from mip_private.spatial_row_versions where source_project='jfnzyvzthzqtczlxhjll' and source_relation='spatial.revision_lineage') x;

-- Survivor private archive security and integrity contract.
select clock_timestamp()::text as observed_at,
(select count(*) from mip_private.spatial_row_versions) as archived_versions,
(select relrowsecurity from pg_class where oid='mip_private.spatial_row_versions'::regclass) as rls,
has_table_privilege('anon','mip_private.spatial_row_versions','select') as anon_read,
has_table_privilege('authenticated','mip_private.spatial_row_versions','select') as authenticated_read,
has_function_privilege('anon','mip_private.retain_spatial_rows(text,text,timestamptz,jsonb)','execute') as anon_import,
has_function_privilege('authenticated','mip_private.retain_spatial_rows(text,text,timestamptz,jsonb)','execute') as authenticated_import,
has_table_privilege('service_role','mip_private.spatial_row_versions','select') as worker_read,
has_table_privilege('service_role','mip_private.spatial_row_versions','insert') as worker_insert,
has_table_privilege('service_role','mip_private.spatial_row_versions','update') as worker_update,
has_table_privilege('service_role','mip_private.spatial_row_versions','delete') as worker_delete,
has_table_privilege('service_role','mip_private.spatial_row_versions','truncate') as worker_truncate,
(select jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname) from pg_trigger where tgrelid='mip_private.spatial_row_versions'::regclass and not tgisinternal) as triggers,
(select jsonb_build_object('security_definer',prosecdef,'config',proconfig,'body',prosrc) from pg_proc where oid='mip_private.retain_spatial_rows(text,text,timestamptz,jsonb)'::regprocedure) as importer;

-- Survivor archive internal references; external public parents require separate reconciliation.
select clock_timestamp()::text as observed_at,jsonb_agg(x order by constraint_name) as internal_reference_checks from (select 'assertion_revisions_graph_node_authority_snapshot_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.assertion_revisions' and c.payload->>'graph_node_authority_snapshot_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.graph_node_authority_snapshots' and p.source_key=c.payload->>'graph_node_authority_snapshot_id')
union all
select 'assertion_revisions_internal_geometry_snapshot_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.assertion_revisions' and c.payload->>'internal_geometry_snapshot_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.geometry_snapshots' and p.source_key=c.payload->>'internal_geometry_snapshot_id')
union all
select 'assertion_revisions_place_authority_snapshot_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.assertion_revisions' and c.payload->>'place_authority_snapshot_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.place_authority_snapshots' and p.source_key=c.payload->>'place_authority_snapshot_id')
union all
select 'assertion_revisions_spatial_assertion_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.assertion_revisions' and c.payload->>'spatial_assertion_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.assertions' and p.source_key=c.payload->>'spatial_assertion_id')
union all
select 'assertion_revisions_temporal_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.assertion_revisions' and c.payload->>'temporal_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'temporal_policy_artifact_id')
union all
select 'assertions_scope_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.assertions' and c.payload->>'scope_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'scope_policy_artifact_id')
union all
select 'audience_scopes_supersedes_audience_scope_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.audience_scopes' and c.payload->>'supersedes_audience_scope_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.audience_scopes' and p.source_key=c.payload->>'supersedes_audience_scope_id')
union all
select 'break_glass_audit_related_intent_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.break_glass_audit' and c.payload->>'related_intent_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.break_glass_audit' and p.source_key=c.payload->>'related_intent_id')
union all
select 'evidence_artifact_registry_source_node_authority_snapshot__fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.evidence_artifact_registry' and c.payload->>'source_node_authority_snapshot_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.graph_node_authority_snapshots' and p.source_key=c.payload->>'source_node_authority_snapshot_id')
union all
select 'evidence_artifact_registry_validation_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.evidence_artifact_registry' and c.payload->>'validation_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'validation_policy_artifact_id')
union all
select 'evidence_condition_events_condition_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.evidence_condition_events' and c.payload->>'condition_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'condition_policy_artifact_id')
union all
select 'evidence_condition_events_evidence_snapshot_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.evidence_condition_events' and c.payload->>'evidence_snapshot_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.evidence_snapshots' and p.source_key=c.payload->>'evidence_snapshot_id')
union all
select 'evidence_snapshots_capture_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.evidence_snapshots' and c.payload->>'capture_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'capture_policy_artifact_id')
union all
select 'evidence_snapshots_evidence_artifact_registry_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.evidence_snapshots' and c.payload->>'evidence_artifact_registry_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.evidence_artifact_registry' and p.source_key=c.payload->>'evidence_artifact_registry_id')
union all
select 'evidence_snapshots_retention_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.evidence_snapshots' and c.payload->>'retention_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'retention_policy_artifact_id')
union all
select 'geometry_snapshots_compatibility_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.geometry_snapshots' and c.payload->>'compatibility_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'compatibility_policy_artifact_id')
union all
select 'geometry_snapshots_place_authority_snapshot_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.geometry_snapshots' and c.payload->>'place_authority_snapshot_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.place_authority_snapshots' and p.source_key=c.payload->>'place_authority_snapshot_id')
union all
select 'policy_artifacts_supersedes_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.policy_artifacts' and c.payload->>'supersedes_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'supersedes_policy_artifact_id')
union all
select 'release_decisions_assertion_revision_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.release_decisions' and c.payload->>'assertion_revision_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.assertion_revisions' and p.source_key=c.payload->>'assertion_revision_id')
union all
select 'release_decisions_audience_scope_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.release_decisions' and c.payload->>'audience_scope_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.audience_scopes' and p.source_key=c.payload->>'audience_scope_id')
union all
select 'release_decisions_predecessor_release_decision_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.release_decisions' and c.payload->>'predecessor_release_decision_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.release_decisions' and p.source_key=c.payload->>'predecessor_release_decision_id')
union all
select 'release_decisions_release_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.release_decisions' and c.payload->>'release_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'release_policy_artifact_id')
union all
select 'review_decisions_assertion_revision_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.review_decisions' and c.payload->>'assertion_revision_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.assertion_revisions' and p.source_key=c.payload->>'assertion_revision_id')
union all
select 'review_decisions_review_policy_artifact_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.review_decisions' and c.payload->>'review_policy_artifact_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.policy_artifacts' and p.source_key=c.payload->>'review_policy_artifact_id')
union all
select 'revision_evidence_assertion_revision_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.revision_evidence' and c.payload->>'assertion_revision_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.assertion_revisions' and p.source_key=c.payload->>'assertion_revision_id')
union all
select 'revision_evidence_evidence_snapshot_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.revision_evidence' and c.payload->>'evidence_snapshot_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.evidence_snapshots' and p.source_key=c.payload->>'evidence_snapshot_id')
union all
select 'revision_lineage_from_revision_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.revision_lineage' and c.payload->>'from_revision_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.assertion_revisions' and p.source_key=c.payload->>'from_revision_id')
union all
select 'revision_lineage_to_revision_id_fkey' as constraint_name,count(*)::text as missing_references from mip_private.spatial_row_versions c where c.source_project='jfnzyvzthzqtczlxhjll' and c.source_relation='spatial.revision_lineage' and c.payload->>'to_revision_id' is not null and not exists(select 1 from mip_private.spatial_row_versions p where p.source_project=c.source_project and p.source_relation='spatial.assertion_revisions' and p.source_key=c.payload->>'to_revision_id')) x;
