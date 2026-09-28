import { PROJECT, NAME_MAPPING } from './compileSource.mjs'
// Catalog compatibility only: this file performs no installation or material read.
const definitions = {
  "public.articles": [
    "uuid:id outlet_id author_id arc_id",
    "text:feed outlet title url summary body_text image_url image_alt ingestion_run_id source_status source_status_note candidate_generation_note reader_state reader_exclusion_reason",
    "timestamp with time zone:published_at fetched_at entities_extracted_at arc_assign_attempted_at source_status_changed_at candidate_generation_attempted_at",
    "jsonb:claims arc_assignment_evidence",
    "boolean:unattributed monoculture is_digest",
    "vector(384):embedding"
  ],
  "public.events": [
    "uuid:id arc_id arc_event_id",
    "text:canonical_title location_text status rule_version comparison_validation_state",
    "date:occurred_at_start occurred_at_end",
    "timestamp with time zone:created_at"
  ],
  "public.event_articles": [
    "uuid:event_id article_id",
    "text:membership_method",
    "numeric:membership_confidence",
    "timestamp with time zone:created_at"
  ],
  "public.pipeline_config": [
    "text:key description",
    "jsonb:value",
    "timestamp with time zone:updated_at"
  ],
  "public.ingest_sources": [
    "uuid:id outlet_id",
    "text:feed_url",
    "boolean:enabled collection_enabled",
    "timestamp with time zone:added_at"
  ],
  "public.explanations": [
    "uuid:id",
    "uuid[]:source_ids shared_entities",
    "integer:version",
    "boolean:is_current",
    "text:assertion_id assertion_type supporting_passage relationship_type rule_version provenance_class review_status falsification_condition remaining_uncertainty state",
    "jsonb:archived_sources source_roles contradicting_evidence missing_evidence correction_history",
    "timestamp with time zone:created_at recomputed_at reviewed_at"
  ],
  "evidence_pipeline.article_captures": [
    "uuid:id article_id job_id",
    "text:content_hash review_state",
    "jsonb:payload",
    "timestamp with time zone:captured_at"
  ],
  "evidence_pipeline.evidence_candidates": [
    "uuid:id capture_id event_node_id related_node_id place_id spatial_revision_id predecessor_candidate_id",
    "text:candidate_key candidate_kind statement source_field excerpt extractor_version remaining_uncertainty review_state",
    "integer:span_start span_end",
    "timestamp with time zone:created_at"
  ],
  "auth.sessions": [
    "uuid:id user_id",
    "timestamp with time zone:not_after"
  ],
  "qik_ingest.collection_gate": [
    "boolean:id collection_authorized",
    "text:notes"
  ],
  "qik_ingest.schedule_intent": [
    "boolean:active",
    "text:jobname schedule edge_slug transport env_run_key header_name vault_secret_name notes"
  ],
  "qik_ingest_operation.persistent_install_receipt": [],
  "public.claims": [],
  "public.article_claims": [],
  "public.claim_evidence_links": [],
  "public.claim_corrections": [],
  "public.story_arcs": [],
  "public.nodes": [],
  "public.edges": [],
  "public.arc_events": [],
  "public.arc_milestones": [],
  "public.arc_membership_candidates": []
}
export const REQUIRED_RELATIONS=Object.freeze(Object.entries(definitions).map(([qualified,groups])=>{
 const [schema_name,table_name]=qualified.split('.')
 const requiredColumns=Object.freeze(Object.fromEntries(groups.flatMap(group=>{
  const [type,names]=group.split(':');return names.split(' ').map(name=>[name,type])
 })))
 return Object.freeze({qualified,schema_name,table_name,requiredColumns,requireRls:schema_name==='evidence_pipeline',requireInstallerSelect:['public','evidence_pipeline'].includes(schema_name)})
}))
export const RESERVED_SCHEMAS=Object.freeze(['comparison_qualification','mip_comparison_kernel_v1','mip_cutover_authority','mip_identity','mip_factual','mip_factual_transport'])
export const RESERVED_ROLES=Object.freeze([
 ...'mip_collector_owner_v2 mip_collector_scheduler_v1 mip_collector_worker_v1 mip_comparison_producer_owner_v1 mip_comparison_producer_v1 mip_comparison_worker_owner_v1 mip_comparison_worker_v1 mip_cutover_authority_admin_v1 mip_cutover_recovery_v1 mip_cutover_schema_owner_v1 mip_efta_admitter_v1 mip_efta_auth_session_owner_v1 mip_efta_authenticator_v1 mip_efta_owner_v1 mip_efta_private_reader_v1 mip_efta_reviewer_v1 mip_factual_owner_v3 mip_factual_reviewer_v3 mip_identity_broker_v2 mip_identity_owner_v2 mip_journal_gateway_v2 mip_journal_owner_v2 mip_kernel_owner_v2 mip_projection_builder_v1 mip_projection_publisher_owner_v1 mip_projection_publisher_v1 mip_publication_owner_v2 mip_retention_reader_v1 mip_retention_writer_v1'.split(' '),
 ...Object.entries(NAME_MAPPING).filter(([name])=>name.startsWith('qual_')).map(([,name])=>name)
])
export const REQUIRED_FUNCTIONS=Object.freeze([
 Object.freeze({signature:'public.mip_pipeline_v1(text,jsonb)',owner:'postgres',security_definer:false}),
 Object.freeze({signature:'public.mip_qik_ingest_native(text,text,text,jsonb)',owner:'qik_ingest_fn_owner',security_definer:true})
])
export const UNRESOLVED=Object.freeze([
 'authenticated_exact_project_connection_not_attested_by_catalog','c3_disabled_state_not_read_by_catalog_preflight',
 'autonomous_rejection_audit_transport_not_qualified','authoritative_material_permission_binding_not_qualified',
 'temporary_creator_cleanup_not_qualified_pg17','transactional_install_receipt_and_recovery_not_qualified',
 'source_constraints_indexes_and_trigger_coexistence_not_qualified'
])
export const CATALOG_SQL=`
with wanted as (
 select * from jsonb_to_recordset($1::jsonb) as x(qualified text,schema_name text,table_name text)
), relations as (
 select w.qualified,c.oid is not null as present,c.relkind::text as kind,
 pg_catalog.pg_get_userbyid(c.relowner) as owner,c.relrowsecurity as rls,
 case when c.oid is null then false else pg_catalog.has_table_privilege(current_user,c.oid,'SELECT') end as installer_select,
 coalesce((select jsonb_object_agg(a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod))
 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'{}'::jsonb) as columns
 from wanted w left join pg_catalog.pg_namespace n on n.nspname=w.schema_name
 left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=w.table_name
), functions as (
 select w.signature,p.oid is not null as present,pg_catalog.pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer
 from unnest($4::text[]) w(signature) left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(w.signature)
)
select jsonb_build_object(
 'identity',(select jsonb_build_object('session_user',session_user,'current_user',current_user,'database',current_database(),
 'server_version_num',current_setting('server_version_num')::integer,'superuser',r.rolsuper,'createrole',r.rolcreaterole,'database_owner',d.datdba=r.oid)
 from pg_catalog.pg_roles r join pg_catalog.pg_database d on d.datname=current_database() where r.rolname=current_user),
 'schema_collisions',coalesce((select jsonb_agg(nspname order by nspname) from pg_catalog.pg_namespace where nspname=any($2::text[])),'[]'::jsonb),
 'role_collisions',coalesce((select jsonb_agg(rolname order by rolname) from pg_catalog.pg_roles where rolname=any($3::text[])),'[]'::jsonb),
 'relations',coalesce((select jsonb_agg(to_jsonb(r) order by qualified) from relations r),'[]'::jsonb),
 'functions',coalesce((select jsonb_agg(to_jsonb(f) order by signature) from functions f),'[]'::jsonb),
 'existing_roles',coalesce((select jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassrls',rolbypassrls) order by rolname)
 from pg_catalog.pg_roles where rolname in ('qik_ingest_fn_owner','qik_ingest_runtime')),'[]'::jsonb),
 'extensions',coalesce((select jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname) order by e.extname)
 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname in ('dblink','pgcrypto')),'[]'::jsonb)
) as catalog;
`
function uniqueIndex(rows,key,errors,label){
 if(!Array.isArray(rows)){errors.push('malformed:'+label);return new Map()}
 const result=new Map()
 for(const row of rows){if(!row||typeof row[key]!=='string'||result.has(row[key])){errors.push('malformed:'+label);continue}result.set(row[key],row)}
 return result
}
export function validateCatalog(catalog,expectedLogin='postgres'){
 const errors=[],c=catalog&&typeof catalog==='object'?catalog:{},i=c.identity
 if(!i||i.session_user!==expectedLogin||i.current_user!==expectedLogin||i.database!=='postgres'||!Number.isInteger(i.server_version_num)||i.server_version_num<170006||i.server_version_num>=180000||i.superuser!==false||i.createrole!==true||i.database_owner!==true)errors.push('installer_identity')
 for(const key of ['schema_collisions','role_collisions']){if(!Array.isArray(c[key]))errors.push('malformed:'+key);else if(c[key].length)errors.push(key)}
 const relations=uniqueIndex(c.relations,'qualified',errors,'relations')
 for(const wanted of REQUIRED_RELATIONS){
  const actual=relations.get(wanted.qualified)
  if(!actual||actual.present!==true||!['r','p'].includes(actual.kind)){errors.push('relation:'+wanted.qualified);continue}
  if(wanted.requireRls&&actual.rls!==true)errors.push('rls:'+wanted.qualified)
  if(wanted.requireInstallerSelect&&actual.installer_select!==true)errors.push('select:'+wanted.qualified)
  for(const [name,type] of Object.entries(wanted.requiredColumns)){
   const observed=actual.columns?.[name]
   if(observed!==type&&!(type==='vector(384)'&&observed==='extensions.vector(384)'))errors.push('column:'+wanted.qualified+'.'+name)
  }
 }
 const functions=uniqueIndex(c.functions,'signature',errors,'functions')
 for(const expected of REQUIRED_FUNCTIONS){const actual=functions.get(expected.signature);if(!actual||actual.present!==true||actual.owner!==expected.owner||actual.security_definer!==expected.security_definer)errors.push('function:'+expected.signature)}
 const roles=uniqueIndex(c.existing_roles,'name',errors,'existing_roles')
 for(const name of ['qik_ingest_fn_owner','qik_ingest_runtime']){const role=roles.get(name);if(!role||role.superuser!==false||role.bypassrls!==false||typeof role.login!=='boolean'||(name==='qik_ingest_fn_owner'&&role.login!==false))errors.push('existing_role:'+name)}
 const extensions=uniqueIndex(c.extensions,'name',errors,'extensions')
 if(extensions.get('pgcrypto')?.schema!=='extensions')errors.push('pgcrypto_placement')
 if(extensions.has('dblink'))errors.push('existing_dblink_requires_adapter')
 return {contract:'qik-comparison-catalog-preflight-v1',expected_project:PROJECT,catalog_compatible:errors.length===0,install_ready:false,errors:[...new Set(errors)].sort(),unresolved:[...UNRESOLVED]}
}
export async function collectCatalog(db){
 const parameters=[JSON.stringify(REQUIRED_RELATIONS.map(({qualified,schema_name,table_name})=>({qualified,schema_name,table_name}))),[...RESERVED_SCHEMAS],[...RESERVED_ROLES],REQUIRED_FUNCTIONS.map(f=>f.signature)]
 const result=await db.query(CATALOG_SQL,parameters)
 if(result.rows?.length!==1||!result.rows[0].catalog)throw Error('qik_catalog_result_shape')
 return result.rows[0].catalog
}
