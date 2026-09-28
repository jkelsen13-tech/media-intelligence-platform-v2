// Source-only joint installer. No connection creation, commit, retry, or CLI.
// Only prepareNativeGovernedInstall's fixed source program is executable.
import {createHash} from 'node:crypto'
export const NATIVE_MODE='native-governed-v2'
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
const identifier=/^[a-z][a-z0-9_]{0,62}$/
const quote=s=>{if(!identifier.test(s))throw Error('native_install_identifier');return '"'+s+'"'}
const literal=s=>"'"+s.replaceAll("'","''")+"'"
const hash=s=>createHash('sha256').update(s).digest('hex')
const blob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')
const fail=s=>{throw Error('native_install_'+s)}
const preparedPlans=new WeakSet()
const failureDetails=new WeakMap()
const REFUSAL_NAMES=new Set(["native_install_assertion_boundary","native_install_assertion_helper_boundary","native_install_collision","native_install_creation_boundary","native_install_creator_owns_objects","native_install_creator_topology","native_install_existing_owner_path","native_install_final_role_attributes","native_install_final_role_edges","native_install_final_scaffolding","native_install_final_schema_owners","native_install_final_storage","native_install_membership_statement","native_install_plan","native_install_principal","native_install_role_contract","native_install_role_inventory","native_install_source_digest","native_install_source_encoding","native_install_transaction_boundary"])
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
export async function prepareNativeGovernedInstall(read){
 const steps=[],roles=[]
 for(const entry of NATIVE_ORDER){
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
  steps.push({...entry,body:sql,created,assertion,assertion_sha256:assertion===null?null:hash(assertion)})
 }
 if(NATIVE_ROLES.some(r=>!roles.includes(r))||roles.length!==NATIVE_ROLES.length)fail('role_inventory')
 const plan=freeze({mode:NATIVE_MODE,source_base:NATIVE_SOURCE_BASE,steps,roles,program_sha256:hash(JSON.stringify(steps))})
 preparedPlans.add(plan);return plan
}
async function identity(db,login){
 const r=(await db.query("select session_user::text principal,current_user::text effective,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolcanlogin from pg_roles where rolname=current_user")).rows[0]
 if(!r||r.principal!==login||r.effective!==login||r.rolsuper||!r.rolcreaterole||!r.rolcreatedb||!r.rolbypassrls||!r.rolinherit||!r.rolcanlogin)fail('principal')
}
async function cleanupCreator(db,creator,login,roles){
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
 if(!preparedPlans.has(plan)||!/^[0-9a-f]{32}$/.test(operationId)||plan?.mode!==NATIVE_MODE||plan.program_sha256!==hash(JSON.stringify(plan.steps))
  ||JSON.stringify(plan.steps.map(({path,blob,assertion_marker,assertion_owner})=>({path,blob,assertion_marker,assertion_owner})))!==JSON.stringify(NATIVE_ORDER))fail('plan')
 // The enclosing atomic installer owns BEGIN/COMMIT/ROLLBACK. SAVEPOINT refuses
 // standalone/autocommit use; failure aborts the whole joint transaction.
 nativeStage='transaction_entry'
 await db.query('savepoint native_entry')
 nativeStage='principal'
 await identity(db,expectedLogin)
 const creator='mip_nci_'+operationId,schema='mip_nca_'+operationId
 nativeStage='collision'
 if((await db.query('select exists(select 1 from pg_roles where rolname=any($1)) or exists(select 1 from pg_namespace where nspname=any($2)) collision',[[...NATIVE_ROLES,creator],['mip_mentions','mip_arc_qik_source','mip_arc_native',schema]])).rows[0].collision)fail('collision')
 nativeStage='ownership_preflight'
 for(const relation of requiredOwnerRelations){
  nativeObject=relation
  const r=(await db.query("select c.relrowsecurity,pg_has_role(current_user,c.relowner,'USAGE') owner_rights from pg_class c where c.oid=to_regclass($1)",[relation])).rows[0]
  if(!r?.relrowsecurity||!r.owner_rights)fail('existing_owner_path')
 }
 nativeObject=null;nativeStage='creator_setup'
 await db.query('create role '+quote(creator)+' nologin createrole noinherit nosuperuser nocreatedb nobypassrls noreplication')
 await db.query('grant '+quote(creator)+' to '+quote(expectedLogin)+' with inherit false,set true')
 const created=[]
 for(const step of plan.steps){
  nativeSource=step.path;nativeStage='source_body'
  let sql=step.body
  for(const role of step.created){
   if(sql.split(role.sql).length!==2)fail('creation_boundary')
   sql=sql.replace(role.sql,'set role '+quote(creator)+';\n'+role.sql+'\ngrant '+quote(role.name)+' to '+quote(expectedLogin)+' with admin false,inherit true,set true;\nreset role;')
  }
  await db.query(sql);created.push(...step.created.map(r=>r.name))
  await db.query('reset role')
  if(step.assertion){
   nativeStage='assertion_helper'
   await assertionHelper(db,schema,step.assertion_owner,expectedLogin,step.assertion)
   await db.query('savepoint native_boundary')
   nativeStage='checkpoint_cleanup'
   await cleanupCreator(db,creator,expectedLogin,created)
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
 // Combined final v2 C6/C9/private-attachment assertion is replayed after REAL cleanup, followed by all native
 // role attributes/no-edge checks. The parent then executes its original
 // backend final assertions and audit/C3 closure before the single COMMIT.
 const final=plan.steps.at(-1)
 nativeSource=final.path;nativeStage='final_helper'
 await assertionHelper(db,schema,final.assertion_owner,expectedLogin,final.assertion)
 nativeStage='final_cleanup'
 await cleanupCreator(db,creator,expectedLogin,created)
 nativeStage='final_assertion'
 await db.query('select '+quote(schema)+'.check_boundary()')
 nativeStage='final_helper_drop'
 await db.query('drop schema '+quote(schema)+' cascade')
 nativeStage='final_closure'
 await assertNativeGovernedClosure(db,{expectedLogin,operationId})
 await db.query('release savepoint native_entry')
 return {mode:NATIVE_MODE,program_sha256:plan.program_sha256,stage_assertions:plan.steps.filter(s=>s.assertion).map(s=>({path:s.path,sha256:s.assertion_sha256})),committed:false,production_qualified:false,publication_allowed:false}
 }catch(error){recordFailure(error,plan,nativeStage,nativeSource,nativeObject);throw error}
}
export async function assertNativeGovernedClosure(db,{expectedLogin,operationId}){
 await identity(db,expectedLogin)
 const roles=(await db.query('select rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolinherit from pg_roles where rolname=any($1)',[NATIVE_ROLES])).rows
 if(roles.length!==NATIVE_ROLES.length||roles.some(r=>r.rolcanlogin||r.rolsuper||r.rolcreaterole||r.rolcreatedb||r.rolreplication||r.rolbypassrls||r.rolinherit!==['mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin'].includes(r.rolname)))fail('final_role_attributes')
 if((await db.query("select exists(select 1 from pg_auth_members where roleid in(select oid from pg_roles where rolname=any($1)) or member in(select oid from pg_roles where rolname=any($1))) edges",[NATIVE_ROLES])).rows[0].edges)fail('final_role_edges')
 if((await db.query('select exists(select 1 from pg_roles where rolname=$1) or exists(select 1 from pg_namespace where nspname=$2) residue',['mip_nci_'+operationId,'mip_nca_'+operationId])).rows[0].residue)fail('final_scaffolding')
 const schemas=(await db.query("select nspname,pg_get_userbyid(nspowner) owner from pg_namespace where nspname=any($1) order by nspname",[['mip_mentions','mip_arc_qik_source','mip_arc_native']])).rows
 if(JSON.stringify(schemas)!==JSON.stringify([{nspname:'mip_arc_native',owner:'mip_arc_native_owner'},{nspname:'mip_arc_qik_source',owner:'mip_arc_qik_source_owner'},{nspname:'mip_mentions',owner:'mip_mentions_owner'}]))fail('final_schema_owners')
 const bad=(await db.query("select exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1) and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity or pg_get_userbyid(c.relowner) not in('mip_mentions_owner','mip_arc_qik_source_owner','mip_canonical_writer','mip_arc_native_owner','mip_arc_attachment_owner'))) bad",[['mip_mentions','mip_arc_qik_source','mip_arc_native']])).rows[0].bad
 if(bad)fail('final_storage')
}
