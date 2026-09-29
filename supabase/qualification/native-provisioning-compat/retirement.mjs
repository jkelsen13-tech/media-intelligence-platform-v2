// Explicit terminal auditor retirement. Source only; caller needs separate retirement authorization.
// Removes only login ACL/policy dependencies. Never deletes retained history or runtime content.
import {connectPersistentInstaller} from '../qik-ingest/persistentInstall.mjs'
import {managedOptions} from './managedPolicy.mjs'
const fail=()=>{throw Error('managed_auditor_retirement_refused')}
const lit=x=>"'"+x.replaceAll("'","''")+"'"
export function managedRetirementDDL(c){
 if(!managedOptions(c)||!/^[a-f0-9]{32}$/.test(c.operationId??''))fail()
 return `create schema mip_managed_retirement;
 revoke all on schema mip_managed_retirement from public,anon,authenticated,service_role;
 create table mip_managed_retirement.receipt(
 singleton boolean primary key check(singleton),operation_id text not null,provisioning_operation_id text not null,
 state text not null check(state='auditors_retired'),recorded_at timestamptz not null default clock_timestamp());
 revoke all on mip_managed_retirement.receipt from public,anon,authenticated,service_role;
 create function mip_managed_retirement.reject_change() returns trigger language plpgsql set search_path='' as $immutable$
 begin raise exception 'managed_retirement_immutable';end $immutable$;
 revoke all on function mip_managed_retirement.reject_change() from public,anon,authenticated,service_role;
 create trigger immutable before update or delete or truncate on mip_managed_retirement.receipt for each statement execute function mip_managed_retirement.reject_change();
 create function mip_managed_retirement.guard() returns void language plpgsql security definer set search_path='' as $guard$
 declare b record;h uuid;
 begin
 if session_user<>'postgres' or current_user<>'postgres' then raise exception 'managed_retirement_identity';end if;
 perform pg_advisory_xact_lock(hashtextextended('qik-comparison-atomic-v1',0));
 perform pg_advisory_xact_lock(171903,7001);
 select * into strict b from mip_native_activation.bootstrap where singleton;
 if b.operation_id<>${lit(c.operationId)} or b.managed_metadata->>'provisioning_operation_id'<>${lit(c.provisioningOperationId)}
 then raise exception 'managed_retirement_operation';end if;
 select revision into strict h from mip_native_activation.head where singleton;
 perform mip_native_activation.assert_current('disabled_bootstrap',h);
 if exists(select 1 from pg_stat_activity where usename in('mip_native_audit_v1','mip_native_metadata_audit_v1'))
 then raise exception 'managed_retirement_sessions';end if;
 if exists(select 1 from mip_managed_retirement.receipt) then raise exception 'managed_retirement_already_recorded';end if;
 end $guard$;
 revoke all on function mip_managed_retirement.guard() from public,anon,authenticated,service_role;
 grant usage,create on schema mip_managed_retirement to mip_cutover_schema_owner_v1;
 grant execute on function mip_managed_retirement.guard() to mip_cutover_schema_owner_v1;
 create function mip_managed_retirement.remove_audit_dependency() returns void language plpgsql security definer set search_path='' as $cleanup$
 begin
 if session_user<>'postgres' then raise exception 'managed_retirement_identity';end if;
 perform mip_managed_retirement.guard();
 drop policy atomic_audit_insert on mip_factual.rejection_audit;
 revoke insert on mip_factual.rejection_audit from mip_native_audit_v1;
 end $cleanup$;
 alter function mip_managed_retirement.remove_audit_dependency() owner to mip_cutover_schema_owner_v1;
 revoke create on schema mip_managed_retirement from mip_cutover_schema_owner_v1;
 revoke all on function mip_managed_retirement.remove_audit_dependency() from public,anon,authenticated,service_role;
 grant execute on function mip_managed_retirement.remove_audit_dependency() to postgres;`
}
export async function retireManagedAuditors(config){
 if(!managedOptions(config)||config.authorization!=='owner-authorized-terminal-managed-auditor-retirement'
 ||!/^[a-f0-9]{32}$/.test(config.operationId??''))fail()
 let db,begun=false,commitAttempted=false,result
 try{
  db=await connectPersistentInstaller({connectionString:config.connectionString,expectedLogin:'postgres',sessionPoolerHost:config.sessionPoolerHost,disposable:config.disposable===true})
  if(!config.disposable&&(db.connection?.stream?.encrypted!==true||db.connection?.stream?.authorized!==true))fail()
  await db.query('begin');begun=true
  await db.query("set local lock_timeout='5000ms'")
  await db.query("select pg_advisory_xact_lock(hashtextextended('qik-comparison-atomic-v1',0)),pg_advisory_xact_lock(171903,7001)")
  const receipt=(await db.query('select * from mip_managed_retirement.receipt where singleton')).rows[0]
  if(receipt){
   const absent=(await db.query("select not exists(select 1 from pg_roles where rolname in('mip_native_audit_v1','mip_native_metadata_audit_v1')) ok")).rows[0]
   if(receipt.operation_id!==config.operationId||receipt.provisioning_operation_id!==config.provisioningOperationId||receipt.state!=='auditors_retired'||absent?.ok!==true)fail()
  }else{
   await db.query('select mip_managed_retirement.remove_audit_dependency()')
   await db.query("revoke usage on schema mip_factual from mip_native_audit_v1")
   await db.query("drop policy metadata_auditor on mip_native_activation.bootstrap;drop policy metadata_auditor on mip_native_activation.head;drop policy metadata_auditor on mip_native_activation.revisions")
   await db.query("revoke all on mip_native_activation.bootstrap,mip_native_activation.head from mip_native_metadata_audit_v1;revoke select(revision,predecessor,operation_id,action,members,request_hash,recorded_at) on mip_native_activation.revisions from mip_native_metadata_audit_v1;revoke usage on schema mip_native_activation from mip_native_metadata_audit_v1")
   // DROP refuses any unexpected dependency. No DROP OWNED, CASCADE, privilege reset or row deletion.
   await db.query('drop role mip_native_audit_v1;drop role mip_native_metadata_audit_v1')
   await db.query("insert into mip_managed_retirement.receipt(singleton,operation_id,provisioning_operation_id,state) values(true,$1,$2,'auditors_retired')",[config.operationId,config.provisioningOperationId])
  }
  commitAttempted=true;await db.query('commit');begun=false
  result={state:'auditors_retired',operation_id:config.operationId,provisioning_operation_id:config.provisioningOperationId,needs_reconciliation:false,activation_allowed:false,publication_allowed:false}
 }catch(error){
  result={state:commitAttempted?'outcome_unknown':'refused',needs_reconciliation:commitAttempted,sqlstate:/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null,activation_allowed:false,publication_allowed:false}
 }finally{
  let clean=true
  if(db&&begun)try{await db.query('rollback')}catch{clean=false}
  if(db)try{await db.end()}catch{clean=false}
  if(result){result.connection_cleanup_verified=Boolean(db)&&clean;if(!clean)result.needs_reconciliation=true}
 }
 return Object.freeze(result)
}
