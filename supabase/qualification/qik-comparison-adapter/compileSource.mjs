// SOURCE COMPONENT ONLY. Not an installer, activation authority, or hosted qualification receipt.
import {createHash} from 'node:crypto'
export const SOURCE_COMMIT='d40e42fdc1b9b92ec6c6117597cbfd24d17906c1'
export const PROJECT='qikvmopbtijoebdqosyq'
export const ADAPTER='qik-comparison-adapter-v1'
export const SOURCE_PINS=Object.freeze([
  [
    "supabase/qualification/comparison-generations/contract.sql",
    "2cd760316e01b8ff6f06bf44cfa91aed37e606a8"
  ],
  [
    "supabase/qualification/comparison-generations/selection.sql",
    "e5b2fdbe236db31e273ef3939f3d3ed36be3b0c6"
  ],
  [
    "supabase/qualification/comparison-generations/capability.sql",
    "07777c1463dba6b20de37ed08d4fe4aefd70da1d"
  ],
  [
    "supabase/qualification/comparison-generations/source-snapshot.sql",
    "f7f091987f024388d2cfc46385086c0dd08e5467"
  ],
  [
    "supabase/qualification/mip-cutover-authority/001_execute_only_identities.sql",
    "136204c77c0e18bce2592493db4765cdeb4c9d1b"
  ],
  [
    "supabase/qualification/mip-cutover-authority/002_candidate_interfaces.sql",
    "f5a9fba65d3b5bac782afd511f94c46e7e9e6315"
  ],
  [
    "supabase/qualification/mip-cutover-authority/003_scoped_queue.sql",
    "209bf4bd6ec405d8d9e8bc751f989631c47a137b"
  ],
  [
    "supabase/qualification/mip-cutover-authority/004_publication_staging.sql",
    "38379113e73d5fea1f3a3dba8647f374ed2733fe"
  ],
  [
    "supabase/qualification/mip-cutover-authority/005_broker_sessions.sql",
    "f78288fbabba40407cd206521b43faa0278f674a"
  ],
  [
    "supabase/qualification/mip-cutover-authority/006_collector_reconciliation.sql",
    "21383a9d581bdf2da8f9eb58cd2f329a7ccd213b"
  ],
  [
    "supabase/qualification/mip-cutover-authority/007_survivor_release.sql",
    "9f7038d8e921ef7839a35375f2f05294058e3383"
  ],
  [
    "supabase/qualification/mip-cutover-authority/008_operation_evidence.sql",
    "a1c9f2fb236e7069e80c5a1cfe6b58274c537ee6"
  ],
  [
    "supabase/qualification/mip-cutover-authority/009_factual_enforcement.sql",
    "60e6198c3ad389c335dfe56024153a187f30f0a4"
  ],
  [
    "supabase/qualification/mip-cutover-authority/010_real_permission_reader.sql",
    "80f869c417706b5bf6a714e15da5809e599c2811"
  ],
  [
    "supabase/qualification/mip-cutover-authority/011_efta_governed_review.sql",
    "d08b8dc06d8e73d3d84fcf216e3df5321465d482"
  ],
  [
    "supabase/qualification/mip-cutover-authority/012_efta_live_authentication.sql",
    "2df5b168d35bdfc0ee0ce2f5a6b82301f7e6d100"
  ],
  [
    "supabase/qualification/mip-cutover-authority/013_worker_journal.sql",
    "842ca0e21b92aa3c528dfe92c342848fdd2410d5"
  ],
  [
    "supabase/qualification/mip-cutover-authority/014_worker_journal_discovery.sql",
    "e1235566b79d5746eac614bd0d1437bd95939b61"
  ],
  [
    "supabase/qualification/mip-cutover-authority/015_worker_claim_resumption.sql",
    "a4a5fff4bd2629f52936806a036ca4b7329d3336"
  ],
  [
    "supabase/qualification/mip-cutover-authority/016_worker_broker_recovery.sql",
    "ef79d5babc235a78bfd313782d7c988166381dc7"
  ],
  [
    "supabase/qualification/mip-cutover-authority/017_native_capture_review.sql",
    "a48a4dc4eabf95371ecc47bfc7051fb657715172"
  ],
  [
    "supabase/qualification/mip-cutover-authority/018_accepted_comparison_reader.sql",
    "f55f7da3b22e992c20f6c968a37ae0af75dd2a47"
  ],
  [
    "supabase/qualification/mip-cutover-authority/019_native_retention_permissions.sql",
    "df829634068d4b113862da3f4ba877ccc6cc72b7"
  ]
].map(row=>Object.freeze(row)))
export const NAME_MAPPING=Object.freeze({
  "comparison_qualification": "mip_comparison_kernel_v1",
  "qual_public_reader": "mip_kernel_reader_compat_v1",
  "qual_comparison_producer": "mip_kernel_producer_compat_v1",
  "qual_comparison_worker": "mip_kernel_worker_compat_v1",
  "qual_comparison_scheduler": "mip_kernel_scheduler_compat_v1",
  "qual_selector": "mip_kernel_selector_compat_v1",
  "qual_publisher": "mip_kernel_publisher_compat_v1",
  "qual_membership_scorer": "mip_kernel_scorer_compat_v1"
})
const compatRoles=Object.entries(NAME_MAPPING).filter(([name])=>name.startsWith('qual_')).map(([,name])=>name)
const schemas=['mip_comparison_kernel_v1','mip_cutover_authority','mip_identity','mip_factual','mip_factual_transport']
const digest=s=>createHash('sha256').update(s).digest('hex')
function replaceOnce(source,before,after,name){
 if(source.split(before).length!==2)throw Error('adapter_transform_boundary:'+name)
 return source.replace(before,after)
}
function blobHash(bytes){return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')}
function removeOuterTransaction(source,path){
 const begin=[...source.matchAll(/^begin;[ \t]*$/gm)],commit=[...source.matchAll(/^commit;[ \t]*$/gm)]
 if(begin.length!==1||commit.length!==1||begin[0].index>=commit[0].index||source.slice(commit[0].index+commit[0][0].length).trim())throw Error('adapter_transaction_boundary:'+path)
 return source.slice(0,begin[0].index)+source.slice(begin[0].index+begin[0][0].length,commit[0].index)
}
function transform(source,path){
 const changes=[]
 if(path.endsWith('/011_efta_governed_review.sql')){
  const seed=/^insert into mip_identity\.efta_scope select .*?\$scope\$::jsonb\) x;$/gm
  if([...source.matchAll(seed)].length!==1)throw Error('adapter_efta_seed_boundary')
  source=source.replace(seed,'-- Hosted adapter: empty EFTA scope; no historical evidence seed.')
  changes.push('empty-efta-scope-v1')
 }
 if(path.endsWith('/008_operation_evidence.sql')){
  source=replaceOnce(source,"else reason:='synthetic_mechanism_only';end if;","else reason:='authoritative_adapter_unbound';end if;",'deny-synthetic-permission-fallback')
  changes.push('deny-synthetic-permission-fallback-v1')
 }
 if(path.endsWith('/source-snapshot.sql')){
  source=replaceOnce(source,"return comparison_qualification.enqueue('qualification-source',payload,p_implementation,clock_timestamp());","raise exception 'mip_hosted_capture_requires_bound_producer';",'disable-synthetic-source-producer')
  changes.push('disable-synthetic-source-producer-v1')
 }
 source=source.replace(/\b(comparison_qualification|qual_public_reader|qual_comparison_producer|qual_comparison_worker|qual_comparison_scheduler|qual_selector|qual_publisher|qual_membership_scorer)\b/g,name=>NAME_MAPPING[name])
 if(/\bcomparison_qualification\b|\bqual_[a-z_]+\b/.test(source))throw Error('adapter_unmapped_identifier:'+path)
 return {sql:removeOuterTransaction(source,path),transformations:[...changes,'explicit-hosted-name-mapping-v1']}
}
function compatibilityClosure(){
 return compatRoles.map(role=>[
  'alter role '+role+' nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;',
  ...schemas.flatMap(schema=>[
   'revoke all on schema '+schema+' from '+role+';',
   'revoke all on all tables in schema '+schema+' from '+role+';',
   'revoke all on all sequences in schema '+schema+' from '+role+';',
   'revoke all on all functions in schema '+schema+' from '+role+';'])
 ].join('\n')).join('\n')
}
function compatibilityAssertions(){
 const names=compatRoles.map(r=>"'"+r+"'").join(',')
 return `do $hosted_compat_assertions$
declare role_name text; role_id oid; ns record; obj record;
 schemas text[]:=array['mip_comparison_kernel_v1','mip_cutover_authority','mip_identity','mip_factual','mip_factual_transport'];
begin
 foreach role_name in array array[${names}] loop
  select oid into strict role_id from pg_catalog.pg_roles where rolname=role_name
   and not(rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolreplication or rolbypassrls);
  if exists(select 1 from pg_catalog.pg_auth_members where roleid=role_id or member=role_id) then
   raise exception 'mip_hosted_compat_membership: %',role_name;end if;
  if exists(select 1 from pg_catalog.pg_shdepend where refclassid='pg_catalog.pg_authid'::regclass and refobjid=role_id and deptype='o') then
   raise exception 'mip_hosted_compat_ownership: %',role_name;end if;
  for ns in select oid,nspname from pg_catalog.pg_namespace where nspname=any(schemas) loop
   if has_schema_privilege(role_id,ns.oid,'USAGE') or has_schema_privilege(role_id,ns.oid,'CREATE') then
    raise exception 'mip_hosted_compat_schema: %, %',role_name,ns.nspname;end if;
   for obj in select oid from pg_catalog.pg_proc where pronamespace=ns.oid loop
    if has_function_privilege(role_id,obj.oid,'EXECUTE') then raise exception 'mip_hosted_compat_execute: %, %',role_name,obj.oid;end if;
   end loop;
   for obj in select oid,relkind from pg_catalog.pg_class where relnamespace=ns.oid and relkind in('r','p','v','m','f','S') loop
    if obj.relkind='S' then
     if has_sequence_privilege(role_id,obj.oid,'USAGE,SELECT,UPDATE') then raise exception 'mip_hosted_compat_sequence: %, %',role_name,obj.oid;end if;
    else
     if has_table_privilege(role_id,obj.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(role_id,obj.oid,'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'mip_hosted_compat_relation: %, %',role_name,obj.oid;end if;
    end if;
   end loop;
  end loop;
 end loop;
end $hosted_compat_assertions$;`
}
// Only reads bytes through the caller-supplied reader. Never executes SQL or provisions a connection.
export async function compileSource(readPinnedSource){
 const steps=[]
 for(const [path,expectedBlob] of SOURCE_PINS){
  const bytes=Buffer.from(await readPinnedSource(path,SOURCE_COMMIT))
  if(blobHash(bytes)!==expectedBlob)throw Error('adapter_source_digest:'+path)
  const source=bytes.toString('utf8')
  if(!Buffer.from(source,'utf8').equals(bytes))throw Error('adapter_source_encoding:'+path)
  steps.push({path,source_blob:expectedBlob,...transform(source,path)})
 }
 const finalPermissions=steps.pop()
 if(finalPermissions?.path!=='supabase/qualification/mip-cutover-authority/019_native_retention_permissions.sql')throw Error('adapter_final_permission_order')
 steps.push({path:'adapter:compatibility-closure-v1',sql:compatibilityClosure()},finalPermissions,{path:'adapter:compatibility-assertions-v1',sql:compatibilityAssertions()})
 for(const step of steps)step.compiled_sha256=digest(step.sql)
 return {adapter:ADAPTER,source_commit:SOURCE_COMMIT,target_project:PROJECT,mapping:NAME_MAPPING,fixture_source_excluded:true,executable:false,steps,
  unresolved_install_prerequisites:['qualified-production-preflight-and-atomic-installer','same-qik-autonomous-rejection-audit-transport','genuine-runtime-and-authoritative-material-permission-bindings']}
}
