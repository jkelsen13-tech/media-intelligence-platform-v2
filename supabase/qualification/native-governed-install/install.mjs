// Source-only joint installer. No connection creation, commit, retry, or CLI.
// Only prepareNativeGovernedInstall's fixed source program is executable.
import {createHash} from 'node:crypto'
export const NATIVE_MODE='native-governed-v2'
export const NATIVE_PROJECTION_MODE='native-governed-v3'
export const NATIVE_BINDING_MODE='native-governed-v4'
export const NATIVE_DISPLAY_MODE='native-governed-v5'
export const NATIVE_CALLER_MODE='native-governed-v6'
export const NATIVE_CALLER_AUTHORIZATION='owner-authorized-disabled-comparison-native-comparison-caller-install'
export const NATIVE_CALLER_SOURCE_BASE='d706609405906c51ddf521acbd5eabb4617b6b41'
export const NATIVE_DISPLAY_AUTHORIZATION='owner-authorized-disabled-comparison-native-comparison-display-install'
export const NATIVE_DISPLAY_SOURCE_BASE='ec4670ade45c7ccff02f1403177f642bd402e019'
export const NATIVE_BINDING_AUTHORIZATION='owner-authorized-disabled-comparison-native-comparison-binding-install'
export const NATIVE_BINDING_SOURCE_BASE='a43893801c5f2c8543e0c08b9bfa7b039899574c'
export const NATIVE_PROJECTION_AUTHORIZATION='owner-authorized-disabled-comparison-native-private-projection-install'
export const NATIVE_AUTHORIZATION='owner-authorized-disabled-comparison-native-install'
export const NATIVE_SOURCE_BASE='79f25d3519d26fd0dbda37fd0728e5783c04834a'
export const NATIVE_ORDER=Object.freeze([
  {
    "path": "supabase/qualification/entity-resolution/001_mentions.sql",
    "blob": "3f86cfdfe0503ca5b4277afcf601c6a716531ca9",
    "assertion_marker": null,
    "assertion_owner": "mip_mentions_owner"
  },
  {
    "path": "supabase/qualification/entity-resolution/native-capture-fields/003_native_fields.sql",
    "blob": "ffc192276276cea2345690bccc7b65d54a0f0ab6",
    "assertion_marker": "do $assert$",
    "assertion_owner": "mip_mentions_native_validator"
  },
  {
    "path": "supabase/qualification/entity-resolution/candidate-review/004_candidate_review.sql",
    "blob": "e25930fb4552b7b0086d7d1c50414845df453dbc",
    "assertion_marker": "do $boundary$",
    "assertion_owner": "mip_mentions_owner"
  },
  {
    "path": "supabase/qualification/arc-membership-qik-source/001_storage.sql",
    "blob": "fc321af39e982e0cb1f06238c81f99d2dcc6fe8a",
    "assertion_marker": "do $assert$",
    "assertion_owner": "mip_arc_qik_source_owner"
  },
  {
    "path": "supabase/qualification/entity-resolution/canonical-admission/005_canonical_admission.sql",
    "blob": "b6487f76f4186a58e7f77d50eecca0a40fd76c27",
    "assertion_marker": "do $boundary$",
    "assertion_owner": "mip_mentions_owner"
  },
  {
    "path": "supabase/qualification/arc-membership-qik-source/002_governed_writer.sql",
    "blob": "7cac6a7cb8ab665886944bf5092edcf01a60cf3f",
    "assertion_marker": "do $boundary$",
    "assertion_owner": "mip_canonical_writer"
  },
  {
    "path": "supabase/qualification/arc-membership-native/001_governed_cohort.sql",
    "blob": "3097d03987aee00df912f913d41c6e0cad342b2d",
    "assertion_marker": "do $final$",
    "assertion_owner": "mip_arc_native_owner"
  },
  {
    "path": "supabase/qualification/arc-membership-native/002_private_score_review.sql",
    "blob": "92c4382b46c83027f4b9b1dd0a615462680083cd",
    "assertion_marker": "do $final$",
    "assertion_owner": "mip_arc_native_owner"
  },
  {
    "path": "supabase/qualification/arc-membership-native/003_governed_attachment.sql",
    "blob": "94dd9c7cbcf117767f5909fd9a6db0312f14ebe2",
    "assertion_marker": "do $boundary$",
    "assertion_owner": "mip_arc_native_owner"
  }
].map(Object.freeze))
export const NATIVE_PROJECTION_ORDER=Object.freeze([...NATIVE_ORDER,Object.freeze({
 path:'supabase/qualification/arc-public-projection/001_native_private_projection.sql',blob:'bc58ef8143fdea209bdf91ad9edfb6e96a089657',
 assertion_marker:'do $private_projection_final$',assertion_owner:'mip_arc_native_owner'
})])
export const NATIVE_BINDING_ORDER=Object.freeze([...NATIVE_PROJECTION_ORDER,Object.freeze({
 path:'supabase/qualification/native-comparison-binding/001_private_binding.sql',blob:'7bd78e703b1a81414e3a24b4049ea407d00435c8',
 assertion_marker:'do $native_comparison_final$',assertion_owner:'mip_arc_native_owner'
})])
export const NATIVE_DISPLAY_ORDER=Object.freeze([...NATIVE_BINDING_ORDER,Object.freeze({
 path:'supabase/qualification/native-comparison-display/001_private_display.sql',blob:'6602515e55fe7cb70bba1e505a2d3e21b94398e5',
 assertion_marker:'do $native_display_final$',assertion_owner:'mip_arc_native_owner'
})])
export const NATIVE_CALLER_ORDER=Object.freeze([...NATIVE_DISPLAY_ORDER,Object.freeze({
 path:'supabase/qualification/native-comparison-caller/001_admission.sql',blob:'a9428d8b2120514a0d6ee13a53d801dba7b6e060',
 assertion_marker:'do $native_caller_final$',assertion_owner:'mip_arc_native_owner'
})])
const outerVerifierMode=mode=>mode===NATIVE_BINDING_MODE||mode===NATIVE_DISPLAY_MODE||mode===NATIVE_CALLER_MODE
const deferredAssertion=(mode,path)=>outerVerifierMode(mode)&&(path===NATIVE_BINDING_ORDER.at(-1).path||((mode===NATIVE_DISPLAY_MODE||mode===NATIVE_CALLER_MODE)&&path===NATIVE_DISPLAY_ORDER.at(-1).path)||(mode===NATIVE_CALLER_MODE&&path===NATIVE_CALLER_ORDER.at(-1).path))
export const isNativeMode=mode=>mode===NATIVE_MODE||mode===NATIVE_PROJECTION_MODE||mode===NATIVE_BINDING_MODE||mode===NATIVE_DISPLAY_MODE||mode===NATIVE_CALLER_MODE
export function nativeAuthorization(mode){if(!isNativeMode(mode))fail('plan');return mode===NATIVE_MODE?NATIVE_AUTHORIZATION:mode===NATIVE_PROJECTION_MODE?NATIVE_PROJECTION_AUTHORIZATION:mode===NATIVE_BINDING_MODE?NATIVE_BINDING_AUTHORIZATION:mode===NATIVE_DISPLAY_MODE?NATIVE_DISPLAY_AUTHORIZATION:NATIVE_CALLER_AUTHORIZATION}
const orderFor=mode=>mode===NATIVE_MODE?NATIVE_ORDER:mode===NATIVE_PROJECTION_MODE?NATIVE_PROJECTION_ORDER:mode===NATIVE_BINDING_MODE?NATIVE_BINDING_ORDER:mode===NATIVE_DISPLAY_MODE?NATIVE_DISPLAY_ORDER:mode===NATIVE_CALLER_MODE?NATIVE_CALLER_ORDER:fail('plan')
const schemasFor=mode=>['mip_mentions','mip_arc_qik_source','mip_arc_native',...(mode!==NATIVE_MODE?['mip_arc_projection_private']:[]),...(outerVerifierMode(mode)?['mip_native_comparison']:[]),...((mode===NATIVE_DISPLAY_MODE||mode===NATIVE_CALLER_MODE)?['mip_native_display']:[]),...(mode===NATIVE_CALLER_MODE?['mip_native_caller']:[])]
const identifier=/^[a-z][a-z0-9_]{0,62}$/
const quote=s=>{if(!identifier.test(s))throw Error('native_install_identifier');return '"'+s+'"'}
const literal=s=>"'"+s.replaceAll("'","''")+"'"
const hash=s=>createHash('sha256').update(s).digest('hex')
const blob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')
const fail=s=>{throw Error('native_install_'+s)}
const preparedPlans=new WeakSet()
const failureDetails=new WeakMap()
const REFUSAL_NAMES=new Set(["native_install_bootstrap_topology","native_install_caller_authority_prerequisite","native_install_assertion_boundary","native_install_assertion_helper_boundary","native_install_collision","native_install_creation_boundary","native_install_creator_owns_objects","native_install_creator_topology","native_install_existing_owner_path","native_install_final_role_attributes","native_install_final_role_edges","native_install_final_scaffolding","native_install_final_schema_owners","native_install_final_storage","native_install_final_private_storage","native_install_membership_statement","native_install_plan","native_install_principal","native_install_role_contract","native_install_role_inventory","native_install_source_digest","native_install_source_encoding","native_install_transaction_boundary"])
// Values originate only from this fixed program; no SQL text, args, detail,
// hint, context, payload, connection target, or arbitrary error message escapes.
export function nativeInstallFailure(error){return error&&typeof error==='object'?failureDetails.get(error)??null:null}
function recordFailure(error,plan,stage,source,object){
 if(!error||typeof error!=='object')return
 const names=new Set(REFUSAL_NAMES)
 if(preparedPlans.has(plan))for(const step of plan.steps)for(const m of (step.body+'\n'+(step.assertion??'')).matchAll(/raise exception '([^']+)'/g))
  if(/^[a-zA-Z0-9_ .:-]{1,120}$/.test(m[1])&&!m[1].includes('%'))names.add(m[1])
 const numeric=x=>/^[0-9]{1,9}$/.test(String(x??''))?Number(x):null
 let internalSource=null
 const query=typeof error.internalQuery==='string'?error.internalQuery:null
 const step=preparedPlans.has(plan)?plan.steps.find(s=>s.path===source):null
 // Hash only a byte-for-byte static fragment of this exact pinned source.
 // Never hash or expose a server-generated query containing runtime values.
 if(step&&query&&query.length>=16&&query.length<=65536){
  for(const area of ['assertion','body']){
   const text=step[area],offset=typeof text==='string'?text.indexOf(query):-1
   if(offset>=0){internalSource=Object.freeze({area,sha256:hash(query),offset:offset+1,line:text.slice(0,offset).split('\n').length,length:query.length});break}
  }
 }
 const frames=[]
 if(internalSource&&typeof error.where==='string'){
  const pattern=/(?:^|\n)PL\/pgSQL function (inline_code_block|mip_nca_[a-f0-9]{32}\.check_boundary\(\)) line ([0-9]{1,6}) at (IF|FOREACH over array|FOR over SELECT rows|SQL statement|EXECUTE|RAISE|assignment)/g
  for(const m of error.where.matchAll(pattern)){
   frames.push(Object.freeze({kind:m[1]==='inline_code_block'?'assertion_block':'assertion_helper',line:Number(m[2]),operation:m[3]}))
   if(frames.length===2)break
  }
 }
 failureDetails.set(error,Object.freeze({stage,source:source??null,object:object??null,
  name:names.has(error.message)?error.message:null,position:numeric(error.position),internal_position:numeric(error.internalPosition),
  internal_source:internalSource,frames:Object.freeze(frames)}))
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
export const NATIVE_ROLES=Object.freeze(['mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin','mip_mentions_native_validator','mip_arc_qik_source_owner','mip_canonical_writer','mip_arc_native_owner','mip_arc_native_worker','mip_arc_attachment_owner'])
const requiredOwnerRelations=['public.articles','public.entities','public.story_arcs','public.arc_membership_candidates','evidence_pipeline.article_captures','evidence_pipeline.import_jobs','mip_identity.source_changes','mip_identity.collector_fence','mip_cutover_authority.publication_fence']
function outer(s){
 if([...s.matchAll(/^begin;[ \t]*$/gm)].length!==1||[...s.matchAll(/^commit;[ \t]*$/gm)].length!==1
  ||!/^commit;\s*$/.test(s.slice(s.lastIndexOf('\ncommit;')+1)))fail('transaction_boundary')
 return s.replace(/^begin;[ \t]*$/m,'').replace(/^commit;[ \t]*$/m,'')
}
export async function prepareNativeGovernedInstall(read,mode=NATIVE_MODE){
 const steps=[],roles=[]
 for(const entry of orderFor(mode)){
  const bytes=Buffer.from(await read(entry.path))
  if(blob(bytes)!==entry.blob)fail('source_digest')
  const text=bytes.toString('utf8')
  if(!Buffer.from(text).equals(bytes))fail('source_encoding')
  let sql=outer(text),assertion=null
  if(entry.assertion_marker){
   if(sql.split(entry.assertion_marker).length!==2)fail('assertion_boundary')
   const at=sql.indexOf(entry.assertion_marker)
   assertion=sql.slice(at);sql=sql.slice(0,at)
  }
  if(mode===NATIVE_CALLER_MODE&&entry.path===NATIVE_CALLER_ORDER.at(-1).path){
   const first='do $prerequisite$',last='end $prerequisite$;';
   const a=sql.indexOf(first),b=sql.indexOf(last,a);
   if(a<0||b<a||sql.split(first).length!==2)fail('assertion_boundary');
   const prerequisite=sql.slice(a,b+last.length);
   sql=sql.slice(0,a)+sql.slice(b+last.length);
   const display=steps.find(s=>s.path===NATIVE_DISPLAY_ORDER.at(-1).path);
   if(!display?.assertion)fail('assertion_boundary');
   // Original complete DO bytes replay only after both creator leases disappear.
   assertion=display.assertion+'\n'+prerequisite+'\n'+assertion;
   const create='create schema mip_native_caller authorization mip_mentions_owner;';
   const transfer='alter function mip_native_caller.assert_session(uuid,uuid,bigint) owner to mip_efta_auth_session_owner_v1;';
   if(sql.split(create).length!==2||sql.split(transfer).length!==2)fail('creation_boundary');
   // The native/outer creators still hold their original grants at this point.
   // No new owner ADMIN/SET grant or separate privileged re-entry is created.
   sql=sql.replace(create,()=>create+'\ngrant usage,create on schema mip_native_caller to current_user;');
   sql=sql.replace(transfer,()=>'grant create on schema mip_native_caller to mip_efta_auth_session_owner_v1;\n'+transfer+'\nrevoke create on schema mip_native_caller from mip_efta_auth_session_owner_v1;');
   sql+='\nrevoke usage,create on schema mip_native_caller from current_user;\n';
  }
  const created=[...sql.matchAll(/^create role ([a-z0-9_]+)([^;]*);$/gm)].map(m=>({name:m[1],sql:m[0]}))
  for(const role of created){
   if(!NATIVE_ROLES.includes(role.name)||roles.includes(role.name)||/\b(login|superuser|createrole|createdb|bypassrls|replication)\b/.test(role.sql.slice(role.sql.indexOf(' ')+1).replace(role.name,'')))fail('role_contract')
   roles.push(role.name)
  }
  // Only lifecycle scaffolding is compiled; original assertion text is retained.
  sql=sql.replace(/^(grant|revoke) ([a-z0-9_]+) (?:to|from) current_user(?: with set true)?;$/gm,(statement,verb,role)=>{
   if(!NATIVE_ROLES.includes(role))fail('membership_statement')
   return '-- Native joint installer manages this temporary membership.'
  })
  if(deferredAssertion(mode,entry.path)&&entry.path!==NATIVE_CALLER_ORDER.at(-1).path){
   // The outer fixed backend installer already owns the publication-owner grant.
   // Native owner lifecycle is managed above. Preserve both exact grantor
   // topologies until their respective real cleanup, rather than self-granting.
   for(const statement of [
    'grant mip_arc_native_owner,mip_publication_owner_v2 to current_user with set true;',
    'revoke mip_arc_native_owner,mip_publication_owner_v2 from current_user;']){
    if(sql.split(statement).length!==2)fail('membership_statement');
    sql=sql.replace(statement,'-- Fixed joint installer manages native/publication owner lifecycle.');
   }
  }
  steps.push({...entry,body:sql,created,assertion,assertion_sha256:assertion===null?null:hash(assertion)})
 }
 if(NATIVE_ROLES.some(r=>!roles.includes(r))||roles.length!==NATIVE_ROLES.length)fail('role_inventory')
 const plan=freeze({mode,source_base:mode===NATIVE_CALLER_MODE?NATIVE_CALLER_SOURCE_BASE:mode===NATIVE_DISPLAY_MODE?NATIVE_DISPLAY_SOURCE_BASE:mode===NATIVE_BINDING_MODE?NATIVE_BINDING_SOURCE_BASE:NATIVE_SOURCE_BASE,steps,roles,program_sha256:hash(JSON.stringify(steps))})
 preparedPlans.add(plan);return plan
}
async function identity(db,login){
 const r=(await db.query("select session_user::text principal,current_user::text effective,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolcanlogin from pg_roles where rolname=current_user")).rows[0]
 if(!r||r.principal!==login||r.effective!==login||r.rolsuper||!r.rolcreaterole||!r.rolcreatedb||!r.rolbypassrls||!r.rolinherit||!r.rolcanlogin)fail('principal')
}
async function cleanupCreator(db,creator,login,roles,mode){
 if(mode===NATIVE_CALLER_MODE)roles=roles.filter(role=>!CALLER_BOOTSTRAP_ROLES.includes(role));
 await db.query('reset role')
 // Validate the complete native-role topology before changing any grant.
 const edges=(await db.query("select p.rolname parent,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where p.rolname=any($1) or m.rolname=any($1)",[roles])).rows
 if(edges.length!==roles.length*2||roles.some(role=>
  edges.filter(e=>e.parent===role&&e.member===creator&&e.admin_option&&!e.inherit_option&&!e.set_option).length!==1||
  edges.filter(e=>e.parent===role&&e.member===login&&e.grantor===creator&&!e.admin_option&&e.inherit_option&&e.set_option).length!==1))fail('creator_topology')
 if((await db.query("select exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=$1::regrole and deptype='o') owns",[creator])).rows[0].owns)fail('creator_owns_objects')
 await db.query('set role '+quote(creator))
 for(const role of roles)await db.query('revoke '+quote(role)+' from '+quote(login)+' cascade')
 await db.query('reset role')
 await db.query('revoke '+quote(creator)+' from '+quote(login))
 await db.query('drop role '+quote(creator))
}
async function assertionHelper(db,schema,owner,login,sql){
 await db.query('create schema '+quote(schema))
 await db.query('revoke all on schema '+quote(schema)+' from public')
 await db.query('grant usage,create on schema '+quote(schema)+' to '+quote(owner))
 await db.query('set role '+quote(owner))
 // Fixed literal body, zero arguments, void result. No arbitrary-SQL interface.
 await db.query('create function '+quote(schema)+'.check_boundary() returns void language plpgsql security definer set search_path=\'\' as '+literal('begin execute '+literal(sql)+'; end'))
 await db.query('revoke all on function '+quote(schema)+'.check_boundary() from public')
 await db.query('grant execute on function '+quote(schema)+'.check_boundary() to '+quote(login))
 await db.query('reset role')
 await db.query('revoke create on schema '+quote(schema)+' from '+quote(owner))
 const checked=(await db.query("select p.proowner=$2::regrole and p.prosecdef and p.pronargs=0 and p.prorettype='void'::regtype and p.proconfig=$4::text[] and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee not in($2::regrole,$3::regrole) or a.privilege_type<>'EXECUTE' or(a.grantee<>p.proowner and a.is_grantable)) and has_function_privilege($3,p.oid,'EXECUTE') ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname='check_boundary'",[schema,owner,login,['search_path=""']])).rows[0]
 if(checked?.ok!==true)fail('assertion_helper_boundary')
}
export async function installNativeGovernedInTransaction(db,plan,{expectedLogin,operationId}){
 let nativeStage='plan',nativeSource=null,nativeObject=null
 try{
 if(!preparedPlans.has(plan)||!/^[0-9a-f]{32}$/.test(operationId)||!isNativeMode(plan?.mode)||plan.program_sha256!==hash(JSON.stringify(plan.steps))
  ||JSON.stringify(plan.steps.map(({path,blob,assertion_marker,assertion_owner})=>({path,blob,assertion_marker,assertion_owner})))!==JSON.stringify(orderFor(plan.mode)))fail('plan')
 // The enclosing atomic installer owns BEGIN/COMMIT/ROLLBACK. SAVEPOINT refuses
 // standalone/autocommit use; failure aborts the whole joint transaction.
 nativeStage='transaction_entry'
 await db.query('savepoint native_entry')
 nativeStage='principal'
 await identity(db,expectedLogin)
 const creator='mip_nci_'+operationId,schema='mip_nca_'+operationId
 nativeStage='collision'
 if((await db.query('select exists(select 1 from pg_roles where rolname=any($1)) or exists(select 1 from pg_namespace where nspname=any($2)) collision',[[...NATIVE_ROLES,creator],[...schemasFor(plan.mode),schema]])).rows[0].collision)fail('collision')
 nativeStage='ownership_preflight'
 for(const relation of [...requiredOwnerRelations,...(plan.mode!==NATIVE_MODE?['public.arc_milestones','public.nodes']:[])]){
  nativeObject=relation
  const r=(await db.query("select c.relrowsecurity,pg_has_role(current_user,c.relowner,'USAGE') owner_rights from pg_class c where c.oid=to_regclass($1)",[relation])).rows[0]
  if(!r?.relrowsecurity||!r.owner_rights)fail('existing_owner_path')
 }
 if(plan.mode===NATIVE_CALLER_MODE){
  nativeStage='caller_authority_preflight';nativeObject='auth.sessions';
  const authority=(await db.query("select has_column_privilege(current_user,'auth.sessions','not_after','SELECT WITH GRANT OPTION') grantable,pg_has_role(current_user,'mip_efta_auth_session_owner_v1','SET') owner_set")).rows[0];
  if(authority?.grantable!==true||authority.owner_set!==true)fail('caller_authority_prerequisite');
 }
 nativeObject=null;nativeStage='creator_setup'
 await db.query('create role '+quote(creator)+' nologin createrole noinherit nosuperuser nocreatedb nobypassrls noreplication')
 await db.query('grant '+quote(creator)+' to '+quote(expectedLogin)+' with inherit false,set true')
 const created=[],bootstrapAtCreation=[]
 for(const step of plan.steps){
  nativeSource=step.path;nativeStage='source_body'
  let sql=step.body
  for(const role of step.created){
   if(sql.split(role.sql).length!==2)fail('creation_boundary')
   if(plan.mode===NATIVE_CALLER_MODE&&CALLER_BOOTSTRAP_ROLES.includes(role.name)){
    // CREATEROLE's actual automatic ADMIN-only grant belongs to the durable
    // trusted installer. These are non-owner API groups, never protected owners.
    await db.query(role.sql);
    const expected=[...bootstrapAtCreation.map(r=>r.role_name),role.name].sort();
    const observed=await callerBootstrapEdges(db,expectedLogin,expected);
    bootstrapAtCreation.splice(0,bootstrapAtCreation.length,...observed);
    sql=sql.replace(role.sql,()=>'-- Exact role created and automatic grantor bound immediately above.');
   }else{
   sql=sql.replace(role.sql,'set role '+quote(creator)+';\n'+role.sql+'\ngrant '+quote(role.name)+' to '+quote(expectedLogin)+' with admin false,inherit true,set true;\nreset role;')
   }
  }
  await db.query(sql);created.push(...step.created.map(r=>r.name))
  await db.query('reset role')
  if(plan.mode===NATIVE_CALLER_MODE&&step.created.some(r=>CALLER_BOOTSTRAP_ROLES.includes(r.name)))await callerBootstrapEdges(db,expectedLogin);
  if(step.assertion&&!deferredAssertion(plan.mode,step.path)){
   nativeStage='assertion_helper'
   await assertionHelper(db,schema,step.assertion_owner,expectedLogin,step.assertion)
   await db.query('savepoint native_boundary')
   nativeStage='checkpoint_cleanup'
   await cleanupCreator(db,creator,expectedLogin,created,plan.mode)
   nativeStage='checkpoint_assertion'
   await db.query('select '+quote(schema)+'.check_boundary()')
   // This restores ONLY temporary role cleanup. Source DDL and the helper
   // precede the savepoint. The original assertion executed against zero edges.
   nativeStage='checkpoint_restore'
   await db.query('rollback to savepoint native_boundary')
   await db.query('release savepoint native_boundary')
   nativeStage='checkpoint_helper_drop'
   await db.query('drop schema '+quote(schema)+' cascade')
  }
 }
 // Selected final combined C6/C9/private assertion is replayed after REAL cleanup, followed by all native
 // role attributes/no-edge checks. The parent then executes its original
 // backend final assertions and audit/C3 closure before the single COMMIT.
 const final=plan.steps.at(-1)
 nativeSource=final.path;nativeStage='final_helper'
 if(plan.mode===NATIVE_CALLER_MODE)await createNativeCallerVerifier(db,final,expectedLogin,bootstrapAtCreation);
 else if(plan.mode===NATIVE_DISPLAY_MODE)await createNativeDisplayVerifier(db,final,expectedLogin);
 else if(plan.mode===NATIVE_BINDING_MODE)await createNativeBindingVerifier(db,final,expectedLogin);
 else await assertionHelper(db,schema,final.assertion_owner,expectedLogin,final.assertion)
 nativeStage='final_cleanup'
 await cleanupCreator(db,creator,expectedLogin,created,plan.mode)
 if(!outerVerifierMode(plan.mode)){
  nativeStage='final_assertion'
  await db.query('select '+quote(schema)+'.check_boundary()')
  nativeStage='final_helper_drop'
  await db.query('drop schema '+quote(schema)+' cascade')
  nativeStage='final_closure'
  await assertNativeGovernedClosure(db,{expectedLogin,operationId,nativeMode:plan.mode})
 }
 // v4/v5 fixed zero-argument verifiers is intentionally durable in the existing
 // private install-receipt schema. It verifies the full current boundary after
 // OUTER creator cleanup and on fresh reconciliation without restoring any
 // owner memberships. It returns no data and accepts no SQL or arguments.
 await db.query('release savepoint native_entry')
 return {mode:plan.mode,program_sha256:plan.program_sha256,stage_assertions:plan.steps.filter(s=>s.assertion).map(s=>({path:s.path,sha256:s.assertion_sha256})),committed:false,production_qualified:false,publication_allowed:false}
 }catch(error){recordFailure(error,plan,nativeStage,nativeSource,nativeObject);throw error}
}
const CALLER_BOOTSTRAP_ROLES=Object.freeze(['mip_mentions_admin','mip_mentions_gateway']);
async function callerBootstrapEdges(db,login,expectedRoles=CALLER_BOOTSTRAP_ROLES){
 const rows=(await db.query("select p.rolname role_name,p.oid::text role_oid,m.rolname member_name,m.oid::text member_oid,g.oid::text grantor_oid,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where p.rolname=any($1) or m.rolname=any($1) order by p.rolname,m.rolname,g.oid",[CALLER_BOOTSTRAP_ROLES])).rows;
 if(rows.length!==expectedRoles.length||rows.some((r,n)=>r.role_name!==expectedRoles[n]||r.member_name!==login||r.admin_option!==true||r.inherit_option!==false||r.set_option!==false||![r.role_oid,r.member_oid,r.grantor_oid].every(v=>/^[1-9][0-9]*$/.test(v))))fail('bootstrap_topology');
 return rows;
}
function callerBootstrapAssertion(login,edges){
 if(!identifier.test(login))fail('identifier');
 return "do $native_caller_bootstrap$ declare observed jsonb;begin "+
 "select coalesce(jsonb_agg(jsonb_build_object('role_name',p.rolname,'role_oid',p.oid::text,'member_name',m.rolname,'member_oid',m.oid::text,'grantor_oid',g.oid::text,'admin_option',a.admin_option,'inherit_option',a.inherit_option,'set_option',a.set_option) order by p.rolname,m.rolname,g.oid),'[]'::jsonb) into observed from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where p.rolname in('mip_mentions_admin','mip_mentions_gateway') or m.rolname in('mip_mentions_admin','mip_mentions_gateway'); "+
 "if observed is distinct from "+literal(JSON.stringify(edges))+"::jsonb "+
 "or not exists(select 1 from pg_roles where rolname="+literal(login)+" and rolcanlogin and not rolsuper and rolcreaterole and rolcreatedb and rolbypassrls and rolinherit and not rolreplication) "+
 "or pg_has_role("+literal(login)+",'mip_mentions_admin','USAGE') or pg_has_role("+literal(login)+",'mip_mentions_admin','SET') "+
 "or pg_has_role("+literal(login)+",'mip_mentions_gateway','USAGE') or pg_has_role("+literal(login)+",'mip_mentions_gateway','SET') "+
 "or has_schema_privilege("+literal(login)+",(select oid from pg_catalog.pg_namespace where nspname='mip_native_caller'),'USAGE,CREATE') "+
 "or has_function_privilege("+literal(login)+",(select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_native_caller' and p.proname='configure_admission'),'EXECUTE') "+
 "or has_function_privilege("+literal(login)+",(select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_native_caller' and p.proname='read_current'),'EXECUTE') "+
 "then raise exception 'native_install_bootstrap_topology';end if;end $native_caller_bootstrap$;";
}
const callerVerifierBody=(final,login,edges)=>bindingVerifierBody({assertion:final.assertion+'\n'+callerBootstrapAssertion(login,edges)});
const bindingVerifierBody=final=>'begin execute '+literal(final.assertion)+'; end'
async function createNativeBindingVerifier(db,final,login){
 const schema='mip_comparison_install',owner=final.assertion_owner
 const prior=(await db.query("select has_schema_privilege($1,$2,'USAGE') u,has_schema_privilege($1,$2,'CREATE') c,to_regprocedure('mip_comparison_install.native_boundary_v4()') is not null collision",[owner,schema])).rows[0]
 if(!prior||prior.u||prior.c||prior.collision)fail('assertion_helper_boundary')
 await db.query('grant usage,create on schema '+schema+' to '+quote(owner))
 await db.query('set role '+quote(owner))
 await db.query('create function '+schema+'.native_boundary_v4() returns void language plpgsql security definer set search_path=\'\' as '+literal(bindingVerifierBody(final)))
 // Remove provider defaults only on this newly created verification function.
 await db.query('revoke all on function '+schema+'.native_boundary_v4() from public')
 const grants=(await db.query("select distinct x.grantee::regrole::text role_name from pg_proc p cross join lateral aclexplode(p.proacl)x where p.oid='mip_comparison_install.native_boundary_v4()'::regprocedure and x.grantee<>0 and x.grantee<>p.proowner")).rows
 for(const grant of grants)await db.query('revoke all on function '+schema+'.native_boundary_v4() from '+quote(grant.role_name))
 await db.query('grant execute on function '+schema+'.native_boundary_v4() to '+quote(login))
 await db.query('reset role')
 await db.query('revoke usage,create on schema '+schema+' from '+quote(owner))
}
export async function verifyNativeBindingCurrentBoundary(db,plan,{expectedLogin,operationId}){
 let stage='binding_verifier_plan';const source=plan?.steps?.at(-1)?.path??null
 try{
  if(!preparedPlans.has(plan)||plan.mode!==NATIVE_BINDING_MODE||!/^[0-9a-f]{32}$/.test(operationId)
   ||plan.program_sha256!==hash(JSON.stringify(plan.steps)))fail('plan')
  await identity(db,expectedLogin)
  const final=plan.steps.at(-1)
  stage='binding_verifier_source'
  const checked=(await db.query("select p.proowner=$1::regrole and p.prosecdef and p.pronargs=0 and p.prorettype='void'::regtype and p.prokind='f' and p.provolatile='v' and p.proconfig=$3::text[] and p.prosrc=$4 and not p.proleakproof and p.proparallel='u' and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee not in($1::regrole,$2::regrole) or a.privilege_type<>'EXECUTE' or(a.grantee<>p.proowner and a.is_grantable)) and has_function_privilege($2,p.oid,'EXECUTE') and not has_schema_privilege($1,n.oid,'USAGE,CREATE') ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_comparison_install' and p.proname='native_boundary_v4'",[final.assertion_owner,expectedLogin,['search_path=""'],bindingVerifierBody(final)])).rows[0]
  if(checked?.ok!==true)fail('assertion_helper_boundary')
  stage='binding_verifier_assertion'
  await db.query('select mip_comparison_install.native_boundary_v4()')
  stage='binding_verifier_closure'
  await assertNativeGovernedClosure(db,{expectedLogin,operationId,nativeMode:plan.mode})
 }catch(error){recordFailure(error,plan,stage,source,null);throw error}
}
async function createNativeDisplayVerifier(db,final,login){
 const schema='mip_comparison_install',owner=final.assertion_owner
 const prior=(await db.query("select has_schema_privilege($1,$2,'USAGE') u,has_schema_privilege($1,$2,'CREATE') c,to_regprocedure('mip_comparison_install.native_boundary_v5()') is not null collision",[owner,schema])).rows[0]
 if(!prior||prior.u||prior.c||prior.collision)fail('assertion_helper_boundary')
 await db.query('grant usage,create on schema '+schema+' to '+quote(owner))
 await db.query('set role '+quote(owner))
 await db.query('create function '+schema+'.native_boundary_v5() returns void language plpgsql security definer set search_path=\'\' as '+literal(bindingVerifierBody(final)))
 // Remove provider defaults only on this newly created verification function.
 await db.query('revoke all on function '+schema+'.native_boundary_v5() from public')
 const grants=(await db.query("select distinct x.grantee::regrole::text role_name from pg_proc p cross join lateral aclexplode(p.proacl)x where p.oid='mip_comparison_install.native_boundary_v5()'::regprocedure and x.grantee<>0 and x.grantee<>p.proowner")).rows
 for(const grant of grants)await db.query('revoke all on function '+schema+'.native_boundary_v5() from '+quote(grant.role_name))
 await db.query('grant execute on function '+schema+'.native_boundary_v5() to '+quote(login))
 await db.query('reset role')
 await db.query('revoke usage,create on schema '+schema+' from '+quote(owner))
}
export async function verifyNativeDisplayCurrentBoundary(db,plan,{expectedLogin,operationId}){
 let stage='display_verifier_plan';const source=plan?.steps?.at(-1)?.path??null
 try{
  if(!preparedPlans.has(plan)||plan.mode!==NATIVE_DISPLAY_MODE||!/^[0-9a-f]{32}$/.test(operationId)
   ||plan.program_sha256!==hash(JSON.stringify(plan.steps)))fail('plan')
  await identity(db,expectedLogin)
  const final=plan.steps.at(-1)
  stage='display_verifier_source'
  const checked=(await db.query("select p.proowner=$1::regrole and p.prosecdef and p.pronargs=0 and p.prorettype='void'::regtype and p.prokind='f' and p.provolatile='v' and p.proconfig=$3::text[] and p.prosrc=$4 and not p.proleakproof and p.proparallel='u' and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee not in($1::regrole,$2::regrole) or a.privilege_type<>'EXECUTE' or(a.grantee<>p.proowner and a.is_grantable)) and has_function_privilege($2,p.oid,'EXECUTE') and not has_schema_privilege($1,n.oid,'USAGE,CREATE') ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_comparison_install' and p.proname='native_boundary_v5'",[final.assertion_owner,expectedLogin,['search_path=""'],bindingVerifierBody(final)])).rows[0]
  if(checked?.ok!==true)fail('assertion_helper_boundary')
  stage='display_verifier_assertion'
  await db.query('select mip_comparison_install.native_boundary_v5()')
  stage='display_verifier_closure'
  await assertNativeGovernedClosure(db,{expectedLogin,operationId,nativeMode:plan.mode})
 }catch(error){recordFailure(error,plan,stage,source,null);throw error}
}
async function createNativeCallerVerifier(db,final,login,atCreation){
 const schema='mip_comparison_install',owner=final.assertion_owner,edges=await callerBootstrapEdges(db,login)
 if(JSON.stringify(edges)!==JSON.stringify(atCreation))fail('bootstrap_topology');
 const prior=(await db.query("select has_schema_privilege($1,$2,'USAGE') u,has_schema_privilege($1,$2,'CREATE') c,to_regprocedure('mip_comparison_install.native_boundary_v6()') is not null collision",[owner,schema])).rows[0]
 if(!prior||prior.u||prior.c||prior.collision)fail('assertion_helper_boundary')
 await db.query('grant usage,create on schema '+schema+' to '+quote(owner))
 await db.query('set role '+quote(owner))
 await db.query('create function '+schema+'.native_boundary_v6() returns void language plpgsql security definer set search_path=\'\' as '+literal(callerVerifierBody(final,login,edges)))
 // Remove provider defaults only on this newly created verification function.
 await db.query('revoke all on function '+schema+'.native_boundary_v6() from public')
 const grants=(await db.query("select distinct x.grantee::regrole::text role_name from pg_proc p cross join lateral aclexplode(p.proacl)x where p.oid='mip_comparison_install.native_boundary_v6()'::regprocedure and x.grantee<>0 and x.grantee<>p.proowner")).rows
 for(const grant of grants)await db.query('revoke all on function '+schema+'.native_boundary_v6() from '+quote(grant.role_name))
 await db.query('grant execute on function '+schema+'.native_boundary_v6() to '+quote(login))
 await db.query('reset role')
 await db.query('revoke usage,create on schema '+schema+' from '+quote(owner))
}
export async function verifyNativeCallerCurrentBoundary(db,plan,{expectedLogin,operationId}){
 let stage='caller_verifier_plan';const source=plan?.steps?.at(-1)?.path??null
 try{
  if(!preparedPlans.has(plan)||plan.mode!==NATIVE_CALLER_MODE||!/^[0-9a-f]{32}$/.test(operationId)
   ||plan.program_sha256!==hash(JSON.stringify(plan.steps)))fail('plan')
  await identity(db,expectedLogin)
  const final=plan.steps.at(-1),edges=await callerBootstrapEdges(db,expectedLogin)
  stage='caller_verifier_source'
  const checked=(await db.query("select p.proowner=$1::regrole and p.prosecdef and p.pronargs=0 and p.prorettype='void'::regtype and p.prokind='f' and p.provolatile='v' and p.proconfig=$3::text[] and p.prosrc=$4 and not p.proleakproof and p.proparallel='u' and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee not in($1::regrole,$2::regrole) or a.privilege_type<>'EXECUTE' or(a.grantee<>p.proowner and a.is_grantable)) and has_function_privilege($2,p.oid,'EXECUTE') and not has_schema_privilege($1,n.oid,'USAGE,CREATE') ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_comparison_install' and p.proname='native_boundary_v6'",[final.assertion_owner,expectedLogin,['search_path=""'],callerVerifierBody(final,expectedLogin,edges)])).rows[0]
  if(checked?.ok!==true)fail('assertion_helper_boundary')
  stage='caller_verifier_assertion'
  await db.query('select mip_comparison_install.native_boundary_v6()')
  stage='caller_verifier_closure'
  await assertNativeGovernedClosure(db,{expectedLogin,operationId,nativeMode:plan.mode})
 }catch(error){recordFailure(error,plan,stage,source,null);throw error}
}
export async function assertNativeGovernedClosure(db,{expectedLogin,operationId,nativeMode=NATIVE_MODE}){
 if(!isNativeMode(nativeMode))fail('plan')
 await identity(db,expectedLogin)
 const roles=(await db.query('select rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolinherit from pg_roles where rolname=any($1)',[NATIVE_ROLES])).rows
 if(roles.length!==NATIVE_ROLES.length||roles.some(r=>r.rolcanlogin||r.rolsuper||r.rolcreaterole||r.rolcreatedb||r.rolreplication||r.rolbypassrls||r.rolinherit!==['mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin'].includes(r.rolname)))fail('final_role_attributes')
 const isolatedRoles=nativeMode===NATIVE_CALLER_MODE?NATIVE_ROLES.filter(role=>!CALLER_BOOTSTRAP_ROLES.includes(role)):NATIVE_ROLES;
 if((await db.query("select exists(select 1 from pg_auth_members where roleid in(select oid from pg_roles where rolname=any($1)) or member in(select oid from pg_roles where rolname=any($1))) edges",[isolatedRoles])).rows[0].edges)fail('final_role_edges');
 if(nativeMode===NATIVE_CALLER_MODE)await callerBootstrapEdges(db,expectedLogin);
 if((await db.query('select exists(select 1 from pg_roles where rolname=$1) or exists(select 1 from pg_namespace where nspname=$2) residue',['mip_nci_'+operationId,'mip_nca_'+operationId])).rows[0].residue)fail('final_scaffolding')
 const schemas=(await db.query("select nspname,pg_get_userbyid(nspowner) owner from pg_namespace where nspname=any($1) order by nspname",[schemasFor(nativeMode)])).rows
 if(JSON.stringify(schemas)!==JSON.stringify([{nspname:'mip_arc_native',owner:'mip_arc_native_owner'},...(nativeMode!==NATIVE_MODE?[{nspname:'mip_arc_projection_private',owner:'mip_arc_native_owner'}]:[]),{nspname:'mip_arc_qik_source',owner:'mip_arc_qik_source_owner'},{nspname:'mip_mentions',owner:'mip_mentions_owner'},...(nativeMode===NATIVE_CALLER_MODE?[{nspname:'mip_native_caller',owner:'mip_mentions_owner'}]:[]),...(outerVerifierMode(nativeMode)?[{nspname:'mip_native_comparison',owner:'mip_arc_native_owner'}]:[]), ...((nativeMode===NATIVE_DISPLAY_MODE||nativeMode===NATIVE_CALLER_MODE)?[{nspname:'mip_native_display',owner:'mip_arc_native_owner'}]:[])]))fail('final_schema_owners')
 const bad=(await db.query("select exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1) and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity or pg_get_userbyid(c.relowner) not in('mip_mentions_owner','mip_arc_qik_source_owner','mip_canonical_writer','mip_arc_native_owner','mip_arc_attachment_owner'))) bad",[schemasFor(nativeMode)])).rows[0].bad
 if(bad)fail('final_storage')
 if(nativeMode!==NATIVE_MODE){
  const privateShape=(await db.query("select count(*)::int n,bool_and(c.relowner=(select oid from pg_roles where rolname='mip_arc_native_owner') and c.relrowsecurity and c.relforcerowsecurity and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee<>c.relowner) and not exists(select 1 from pg_attribute at cross join lateral aclexplode(at.attacl) a where at.attrelid=c.oid and a.grantee<>c.relowner)) ok from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_arc_projection_private' and c.relkind='r'")).rows[0]
  if(privateShape?.n!==6||privateShape.ok!==true)fail('final_private_storage')
 }
 if(outerVerifierMode(nativeMode)){
  const shape=(await db.query("select count(*)::int n,bool_and(c.relowner='mip_arc_native_owner'::regrole and c.relrowsecurity and c.relforcerowsecurity and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee<>c.relowner) and not exists(select 1 from pg_attribute at cross join lateral aclexplode(at.attacl) a where at.attrelid=c.oid and a.grantee<>c.relowner)) ok from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_native_comparison' and c.relkind='r'")).rows[0];
  if(shape?.n!==2||shape.ok!==true)fail('final_private_storage');
 }

 if(nativeMode===NATIVE_DISPLAY_MODE||nativeMode===NATIVE_CALLER_MODE){
  if((await db.query("select exists(select 1 from pg_class where relnamespace='mip_native_display'::regnamespace) storage")).rows[0].storage)fail('final_private_storage');
 }

}
