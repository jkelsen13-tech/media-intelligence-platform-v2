import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {CATALOG_SQL,REQUIRED_RELATIONS,REQUIRED_FUNCTIONS,collectCatalog,validateCatalog} from '../supabase/qualification/qik-comparison-adapter/catalogPreflight.mjs'
function fixture(){return {
 identity:{session_user:'postgres',current_user:'postgres',database:'postgres',server_version_num:170006,superuser:false,createrole:true,database_owner:true},
 schema_collisions:[],role_collisions:[],
 relations:REQUIRED_RELATIONS.map(r=>({qualified:r.qualified,present:true,kind:'r',owner:'postgres',rls:true,installer_select:true,columns:{...r.requiredColumns}})),
 functions:REQUIRED_FUNCTIONS.map(f=>({...f,present:true})),
 existing_roles:[{name:'qik_ingest_fn_owner',login:false,superuser:false,bypassrls:false},{name:'qik_ingest_runtime',login:true,superuser:false,bypassrls:false}],
 extensions:[{name:'pgcrypto',schema:'extensions'}]
}}
test('compatible metadata never establishes installation readiness',()=>{
 const result=validateCatalog(fixture());assert.equal(result.catalog_compatible,true);assert.equal(result.install_ready,false)
 assert.ok(result.unresolved.includes('temporary_creator_cleanup_not_qualified_pg17'))
 assert.ok(result.unresolved.includes('authoritative_material_permission_binding_not_qualified'))
})
test('native span, predecessor, RLS and source privilege drift fail',()=>{
 for(const mutate of [r=>{r.columns.span_start='bigint'},r=>{delete r.columns.predecessor_candidate_id},r=>{r.rls=false},r=>{r.installer_select=false}]){
 const c=fixture();mutate(c.relations.find(r=>r.qualified==='evidence_pipeline.evidence_candidates'));assert.equal(validateCatalog(c).catalog_compatible,false)
 }
})
test('explanation and collection gate typed contracts are checked',()=>{
 const c=fixture();c.relations.find(r=>r.qualified==='public.explanations').columns.source_ids='jsonb'
 delete c.relations.find(r=>r.qualified==='qik_ingest.collection_gate').columns.collection_authorized
 const result=validateCatalog(c);assert.ok(result.errors.includes('column:public.explanations.source_ids'))
 assert.ok(result.errors.includes('column:qik_ingest.collection_gate.collection_authorized'))
})
test('extra columns allowed; embedding dimensions rejected',()=>{
 const c=fixture(),r=c.relations.find(r=>r.qualified==='public.articles');r.columns.future_metadata='text';r.columns.embedding='extensions.vector(384)'
 assert.equal(validateCatalog(c).catalog_compatible,true);r.columns.embedding='vector(768)';assert.equal(validateCatalog(c).catalog_compatible,false)
})
test('collisions, identity, role elevation and facade drift fail',()=>{
 for(const mutate of [c=>{c.schema_collisions=['mip_identity']},c=>{c.role_collisions=['mip_kernel_owner_v2']},c=>{c.identity.current_user='other'},c=>{c.identity.superuser=true},c=>{c.identity.server_version_num=180003},c=>{c.existing_roles[1].bypassrls=true},c=>{c.functions[1].security_definer=false},c=>{c.extensions.push({name:'dblink',schema:'extensions'})}]){
 const c=fixture();mutate(c);assert.equal(validateCatalog(c).catalog_compatible,false)
 }
})
test('malformed and duplicate metadata fail',()=>{
 assert.equal(validateCatalog(null).catalog_compatible,false);const c=fixture();c.relations.push({...c.relations[0]});assert.equal(validateCatalog(c).catalog_compatible,false)
})
test('one fixed parameterized catalog query; no application row or definition reads',async()=>{
 const c=fixture(),calls=[];const db={query:async(sql,parameters)=>{calls.push({sql,parameters});return{rows:[{catalog:c}]}}}
 assert.deepEqual(await collectCatalog(db),c);assert.equal(calls.length,1);assert.equal(calls[0].sql,CATALOG_SQL);assert.equal(calls[0].parameters.length,4)
 assert.doesNotMatch(CATALOG_SQL,/(insert|update|delete|alter|create|drop|truncate|pg_get_functiondef)/i)
 assert.doesNotMatch(CATALOG_SQL,/froms+(public|auth|qik_ingest|evidence_pipeline)./i)
})
test('catalog query executes against empty synthetic database and refuses missing substrate',async()=>{
 const db=new PGlite();try{
 const before=(await db.query('select count(*)::int n from pg_class')).rows[0].n
 const catalog=await collectCatalog(db),result=validateCatalog(catalog)
 assert.equal(result.catalog_compatible,false);assert.equal(result.install_ready,false)
 assert.ok(result.errors.includes('relation:evidence_pipeline.article_captures'))
 assert.equal((await db.query('select count(*)::int n from pg_class')).rows[0].n,before)
 }finally{await db.close()}
})
