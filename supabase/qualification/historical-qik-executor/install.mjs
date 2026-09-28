import { createHash } from 'node:crypto'
import { stableStringify } from '../../../scripts/mipLegacyGraphStaging.mjs'

const PATH='supabase/qualification/historical-qik-executor/candidate.sql'
const BLOB='6fe6035223de1dac94fba6c238e33324bc0ca266'
const ROLES=['mip_history_owner','mip_history_executor']
const TRANSPORT='mip_factual_transport'
const HELPER='mip_history_transport'
const plans=new WeakSet()
const qi=s=>{if(!/^[a-z][a-z0-9_]{0,62}$/.test(s))throw new Error('historical_install_identifier');return '"'+s+'"'}
const fail=code=>{throw Object.assign(new Error(code),{code})}
const sha=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')
const transportSQL=`select n.nspname,n.nspowner::text,n.nspacl::text,p.oid::text,
 p.proowner::text,p.proacl::text,p.prosecdef,p.proconfig
 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
 join pg_proc p on p.pronamespace=n.oid where e.extname='dblink' order by p.oid`
const wrapper=`create function mip_history.acquire(p_operation uuid) returns text
language plpgsql security definer set search_path=pg_catalog,mip_history as $$
begin
 perform mip_history.guard();
 return mip_history_transport.acquire_original(p_operation);
exception when others then
 raise exception using message='acquisition_failed',errcode='P0001';
end $$;`

// A read callback only supplies the exact pinned SOURCE file; it cannot supply
// SQL to the installer. Prepared plans have unforgeable in-process identity.
export async function prepareClosedHistoricalInstall(read) {
 const bytes=Buffer.from(await read(PATH))
 if(sha(bytes)!==BLOB)fail('historical_install_source')
 const source=bytes.toString('utf8')
 if(!Buffer.from(source).equals(bytes))fail('historical_install_encoding')
 const start=source.indexOf('create function mip_history.acquire(')
 const end=source.indexOf('\n-- These functions are internal',start)
 const final=source.indexOf('-- Expected role posture')
 if(start<0||end<start||final<end||source.indexOf('create function mip_history.acquire(',start+1)!==-1)
   fail('historical_install_boundary')
 if([...source.matchAll(/^begin;$/gm)].length!==1||[...source.matchAll(/^commit;$/gm)].length!==1)
   fail('historical_install_boundary')
 const acquire=source.slice(start,end)
 // All substitutions are on known pinned fragments, never caller SQL.
 let helper=acquire.replace('create function mip_history.acquire(',
   'create function mip_history_transport.acquire_original(')
 helper=helper.replace('search_path=pg_catalog,mip_history,extensions','search_path=pg_catalog,mip_history,mip_factual_transport')
 helper=helper.replaceAll('extensions.dblink','mip_factual_transport.dblink')
 helper=helper.replace(' perform mip_history.guard();',
   " if session_user <> 'mip_history_executor' then raise exception using message='route_unqualified'; end if;")
 helper=helper.replace(' select * into strict route_row from mip_history.route;',
   " select * into strict route_row from mip_history.route;\n if not route_row.qualified then raise exception using message='route_unqualified'; end if;")
 const body=(source.slice(0,start)+wrapper+source.slice(end,final)).replace(/^begin;$/m,'')
 const assertion=source.slice(final).replace(/^commit;$/m,'')
 const plan=Object.freeze({path:PATH,blob:BLOB,body,helper,assertion})
 plans.add(plan);return plan
}
async function principal(db,login) {
 const row=(await db.query(`select session_user::text login,current_user::text effective,
 rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolcanlogin
 from pg_roles where rolname=current_user`)).rows[0]
 if(!row||row.login!==login||row.effective!==login||row.rolsuper||!row.rolcreaterole||
   !row.rolcreatedb||!row.rolbypassrls||!row.rolinherit||!row.rolcanlogin)
   fail('historical_install_principal')
}
async function cleanupCreator(db,creator,login) {
 await db.query('reset role')
 const edges=(await db.query(`select p.rolname parent,m.rolname member,g.rolname grantor,
 a.admin_option,a.inherit_option,a.set_option from pg_auth_members a
 join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member
 join pg_roles g on g.oid=a.grantor where p.rolname=any($1) or m.rolname=any($1)`,[ROLES])).rows
 if(edges.length!==4||ROLES.some(role=>
  edges.filter(e=>e.parent===role&&e.member===creator&&e.admin_option&&!e.inherit_option&&!e.set_option).length!==1||
  edges.filter(e=>e.parent===role&&e.member===login&&e.grantor===creator&&!e.admin_option&&e.inherit_option&&e.set_option).length!==1))
  fail('historical_install_topology')
 if((await db.query(`select exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass
   and refobjid=$1::regrole and deptype='o') owns`,[creator])).rows[0].owns)
   fail('historical_install_creator_owns_objects')
 await db.query('set role '+qi(creator))
 for(const role of ROLES)await db.query('revoke '+qi(role)+' from '+qi(login)+' cascade')
 await db.query('reset role')
 await db.query('revoke '+qi(creator)+' from '+qi(login))
 await db.query('drop role '+qi(creator))
}
// Caller owns BEGIN/COMMIT/ROLLBACK; SAVEPOINT refuses autocommit use.
// No connection, secret entry, deployment, retry or arbitrary SQL callback.
export async function installClosedHistoricalInTransaction(db,plan,{expectedLogin,operationId}) {
 let stage='plan'
 try {
  if(!plans.has(plan)||!/^[a-f0-9]{32}$/.test(operationId??''))fail('historical_install_plan')
  qi(expectedLogin)
  await db.query('savepoint historical_install_entry')
  stage='principal';await principal(db,expectedLogin)
  const creator='mip_hci_'+operationId
  const collision=(await db.query(`select exists(select 1 from pg_roles where rolname=any($1))
    or exists(select 1 from pg_namespace where nspname=any($2)) collision`,
    [[...ROLES,creator],['mip_history',HELPER]])).rows[0]
  if(collision?.collision)fail('historical_install_collision')
  stage='transport'
  const before=(await db.query(transportSQL)).rows
  if(!before.length||before.some(r=>r.nspname!==TRANSPORT))fail('historical_install_transport')
  const access=(await db.query(`select
    has_schema_privilege(current_user,'mip_factual_transport','USAGE') and
    has_function_privilege(current_user,'mip_factual_transport.dblink_connect(text,text)','EXECUTE') and
    has_function_privilege(current_user,'mip_factual_transport.dblink_exec(text,text)','EXECUTE') and
    has_function_privilege(current_user,'mip_factual_transport.dblink(text,text)','EXECUTE') and
    has_function_privilege(current_user,'mip_factual_transport.dblink_disconnect(text)','EXECUTE') and
    has_schema_privilege(current_user,'vault','USAGE') and
    has_table_privilege(current_user,'vault.decrypted_secrets','SELECT') and
    has_schema_privilege(current_user,'extensions','USAGE WITH GRANT OPTION') ok`)).rows[0]
  if(access?.ok!==true)fail('historical_install_existing_authority')
  stage='roles'
  await db.query('create role '+qi(creator)+' nologin createrole noinherit nosuperuser nocreatedb nobypassrls noreplication')
  await db.query('grant '+qi(creator)+' to '+qi(expectedLogin)+' with inherit false,set true')
  await db.query('set role '+qi(creator))
  await db.query('create role mip_history_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication')
  await db.query('create role mip_history_executor login noinherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication')
  for(const role of ROLES)await db.query('grant '+qi(role)+' to '+qi(expectedLogin)+' with admin false,inherit true,set true')
  await db.query('reset role')
  stage='body';await db.query(plan.body);await db.query('reset role')
  // pgcrypto remains in extensions. No privilege on existing factual transport
  // is changed, and the history owner receives no Vault access.
  await db.query('grant usage on schema extensions to mip_history_owner')
  await db.query('set role mip_history_owner')
  await db.query('grant usage on schema mip_history to '+qi(expectedLogin))
  await db.query('grant select on mip_history.route,mip_history.source_contract,mip_history.family_contract to '+qi(expectedLogin))
  await db.query('grant select,insert,update on mip_history.export to '+qi(expectedLogin))
  await db.query('grant insert on mip_history.payload to '+qi(expectedLogin))
  await db.query('reset role')
  stage='helper'
  await db.query('create schema mip_history_transport')
  await db.query('revoke all on schema mip_history_transport from public,anon,authenticated,service_role,mip_history_executor')
  await db.query(plan.helper)
  await db.query('revoke all on function mip_history_transport.acquire_original(uuid) from public,anon,authenticated,service_role,mip_history_executor')
  // Remove provider default grants only from this newly created helper.
  const grants=(await db.query(`select distinct a.grantee::regrole::text grantee
    from pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.oid='mip_history_transport.acquire_original(uuid)'::regprocedure
      and a.grantee<>0 and a.grantee<>p.proowner`)).rows
  for(const grant of grants)await db.query('revoke all on function mip_history_transport.acquire_original(uuid) from '+qi(grant.grantee))
  await db.query('grant usage on schema mip_history_transport to mip_history_owner')
  await db.query('grant execute on function mip_history_transport.acquire_original(uuid) to mip_history_owner')
  stage='cleanup';await cleanupCreator(db,creator,expectedLogin)
  stage='assertion';await db.query(plan.assertion)
  await principal(db,expectedLogin)
  const after=(await db.query(transportSQL)).rows
  if(stableStringify(before)!==stableStringify(after))fail('historical_install_transport_changed')
  const boundary=(await db.query(`select p.proowner=$1::regrole and p.prosecdef and p.pronargs=1
    and p.proargtypes='2950'::oidvector and p.prosrc=$2
    and p.prorettype='text'::regtype and p.prokind='f' and p.provolatile='v'
    and p.proparallel='u' and not p.proleakproof
    and p.proconfig=array['search_path=pg_catalog, mip_history, mip_factual_transport','statement_timeout=110s','lock_timeout=3s']::text[]
    and not has_schema_privilege('mip_history_owner','mip_factual_transport','USAGE')
    and not has_schema_privilege('mip_history_executor','mip_factual_transport','USAGE')
    and not has_table_privilege('mip_history_owner','vault.decrypted_secrets','SELECT')
    and has_function_privilege('mip_history_owner',p.oid,'EXECUTE')
    and not has_function_privilege('mip_history_executor',p.oid,'EXECUTE')
    and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee not in($1::regrole,'mip_history_owner'::regrole)
       or a.privilege_type<>'EXECUTE' or (a.grantee<>p.proowner and a.is_grantable)) ok
    from pg_proc p where p.oid='mip_history_transport.acquire_original(uuid)'::regprocedure`,
    [expectedLogin,plan.helper.slice(plan.helper.indexOf('as $$')+5,plan.helper.lastIndexOf('$$;'))])).rows[0]
  if(boundary?.ok!==true)fail('historical_install_helper_boundary')
  if((await db.query(`select exists(select 1 from pg_roles where rolname=$1) residue`,[creator])).rows[0].residue)
    fail('historical_install_cleanup')
  await db.query('release savepoint historical_install_entry')
  return {state:'installed_in_transaction',committed:false,production_qualified:false}
 } catch(error) {
  const code=typeof error?.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:null
  throw Object.assign(new Error('historical_install_failed'),{code:'historical_install_failed',stage,sqlstate:code})
 }
}
