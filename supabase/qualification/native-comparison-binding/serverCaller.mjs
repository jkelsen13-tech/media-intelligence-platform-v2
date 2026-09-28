// Server-only closed dispatch. Credentials/session arguments are never persisted.
import {connectAuthenticatedPg,connectionTarget} from '../collector-native-capture/authenticatedPgDriver.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const RECEIPT=['contract','scope','binding_id','manifest_hash','native_generation_id','comparison_generation_id','state','publication_allowed','attachment_allowed'];
const SQL=Object.freeze({
 admit:'select mip_native_comparison.admit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',
 read:'select mip_native_comparison.read_current($1,$2,$3,$4,$5) result',
 revoke:'select mip_native_comparison.revoke_binding($1,$2) result',
});
const PRINCIPAL_SQL=`select pg_has_role(session_user,'mip_mentions_gateway','USAGE') gateway,
 exists(select 1 from pg_roles r where r.rolname not in(session_user,'mip_mentions_gateway')
 and pg_has_role(session_user,r.oid,'MEMBER')) extra_membership`;
const refuse=()=>{throw Error('native_comparison_caller_configuration_refused')};
function exact(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype
 ||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))refuse();
}
function broker(value){
 exact(value,['session','runtime']);
 if(!UUID.test(value.session??'')||typeof value.runtime!=='string'||Buffer.byteLength(value.runtime)<1||Buffer.byteLength(value.runtime)>128)refuse();
 return {session:value.session,runtime:value.runtime};
}
function identity(value){
 if(!UUID.test(value.scope??'')||!UUID.test(value.binding_id??''))refuse();
}
function expected(value){
 if(!UUID.test(value.native_generation_id??'')||!UUID.test(value.comparison_generation_id??''))refuse();
}
function validate(connection,request){
 exact(connection,['connectionString','expectedLogin','sessionPoolerHost','disposable']);
 if(typeof connection.connectionString!=='string'||typeof connection.expectedLogin!=='string'
 ||typeof connection.disposable!=='boolean'
 ||!(connection.sessionPoolerHost===null||connection.sessionPoolerHost==='aws-0-us-west-1.pooler.supabase.com')
 ||connection.expectedLogin.endsWith('_collector')
 ||(connection.disposable&&process.env.MIP_DISPOSABLE_POSTGRES!=='qik-native-caller'))refuse();
 const url=connectionTarget(connection.connectionString,connection.expectedLogin,connection.disposable,connection.sessionPoolerHost);
 if(url.pathname!=='/postgres')refuse();
 const cfg={...connection};
 if(!request||!['admit','read','revoke'].includes(request.action))refuse();
 if(request.action==='revoke'){
  exact(request,['action','scope','binding_id']);identity(request);
  return {cfg,request:{...request}};
 }
 const keys=request.action==='read'
 ?['action','scope','binding_id','manifest_hash','native_generation_id','comparison_generation_id','broker']
 :['action','scope','binding_id','projection_id','dependency_hash','display_hash','private_review_id','release_request','event_id','native_generation_id','comparison_generation_id','broker'];
 exact(request,keys);identity(request);expected(request);
 if(request.action==='read'){if(!HASH.test(request.manifest_hash??''))refuse()}
 else{
  for(const k of ['projection_id','private_review_id','release_request','event_id'])if(!UUID.test(request[k]??''))refuse();
  for(const k of ['dependency_hash','display_hash'])if(!HASH.test(request[k]??''))refuse();
 }
 return {cfg,request:{...request,broker:broker(request.broker)}};
}
function receipt(value,request,hash=null){
 exact(value,RECEIPT);
 if(value.contract!=='native-comparison-binding-receipt-v1'||value.state!=='bound_private'
 ||value.scope!==request.scope||value.binding_id!==request.binding_id
 ||value.native_generation_id!==request.native_generation_id
 ||value.comparison_generation_id!==request.comparison_generation_id
 ||!HASH.test(value.manifest_hash??'')||(hash!==null&&value.manifest_hash!==hash)
 ||value.publication_allowed!==false||value.attachment_allowed!==false)throw Error('native_comparison_caller_receipt_refused');
 return Object.freeze(Object.fromEntries(RECEIPT.map(key=>[key,value[key]])));
}
function args(r){
 if(r.action==='revoke')return [r.scope,r.binding_id];
 if(r.action==='read')return [r.scope,r.binding_id,r.manifest_hash,r.broker.session,r.broker.runtime];
 return [r.scope,r.binding_id,r.projection_id,r.dependency_hash,r.display_hash,r.private_review_id,
 r.broker.session,r.broker.runtime,r.release_request,r.event_id];
}
function reconciliationIdentity(wire){
 return wire===null?null:Object.freeze(Object.fromEntries(['scope','binding_id','manifest_hash','native_generation_id','comparison_generation_id'].map(k=>[k,wire[k]])));
}
function result(state,wire,needs,closed,codes,reconciliation=null){
 return Object.freeze({state,receipt:wire,needs_reconciliation:needs,connection_closed:closed,
 diagnostics:Object.freeze([...codes]),reconciliation_identity:reconciliationIdentity(reconciliation),publication_allowed:false,attachment_allowed:false});
}
async function attempt(cfg,r){
 let db,begun=false,commitAttempted=false,committed=false,closed=true,wire=null,stage='connect';
 const diagnostics=[];
 try{
  db=await connectAuthenticatedPg(cfg);closed=false;
  stage='principal';const authority=(await db.query(PRINCIPAL_SQL)).rows;
  if(authority.length!==1||authority[0].gateway!==true||authority[0].extra_membership!==false)
   throw Error('native_comparison_principal_refused');
  stage='begin';await db.query('begin isolation level read committed');begun=true;
  stage='operation';const rows=(await db.query(SQL[r.action],args(r))).rows;
  if(rows.length!==1)throw Error('native_comparison_result_refused');
  stage='receipt';
  if(r.action==='revoke'){
   if(rows[0].result!==null&&rows[0].result!=='')throw Error('native_comparison_result_refused');
  }else wire=receipt(rows[0].result,r,r.action==='read'?r.manifest_hash:null);
  stage='commit';commitAttempted=true;await db.query('commit');committed=true;begun=false;
 }catch{
  diagnostics.push(commitAttempted?'commit_acknowledgement_unknown':stage+'_failed');
  // The shared driver sanitizes its connection failures and may have attempted
  // cleanup internally; this caller cannot certify that hidden close succeeded.
  if(!db){closed=false;diagnostics.push('connection_cleanup_unverified')}
 }
 finally{
  // Never claim rollback after COMMIT could have reached the server.
  if(db&&begun&&!commitAttempted)try{await db.query('rollback');begun=false}catch{diagnostics.push('rollback_failed')}
  if(db)try{await db.end();closed=true}catch{closed=false;diagnostics.push('close_failed')}
 }
 return {wire,diagnostics,committed,commitAttempted,closed};
}
export async function callNativeComparisonBinding(options){
 let input;try{exact(options,['connection','request']);input=validate(options.connection,options.request)}catch{refuse()}
 const {cfg,request:r}=input;
 const first=await attempt(cfg,r);
 if(first.committed)return result(first.closed?(r.action==='revoke'?'revoked_private':'current_binding_confirmed'):'committed_cleanup_unresolved',
  first.wire,!first.closed,first.closed,first.diagnostics);
 if(first.commitAttempted&&first.closed&&first.wire&&r.action!=='revoke'){
  // A fresh authenticated CURRENT read confirms this exact original binding.
  // It does not replay admission or assert which transaction first created it.
  const readRequest={action:'read',scope:r.scope,binding_id:r.binding_id,manifest_hash:first.wire.manifest_hash,
   native_generation_id:r.native_generation_id,comparison_generation_id:r.comparison_generation_id,broker:r.broker};
  const fresh=await attempt(cfg,readRequest);
  const codes=[...first.diagnostics,...fresh.diagnostics.map(c=>'reconciliation_'+c)];
  if(fresh.committed&&fresh.closed)return result('current_binding_confirmed',fresh.wire,false,true,codes);
  return result('outcome_unknown',null,true,first.closed&&fresh.closed,codes,first.wire);
 }
 const uncertain=first.commitAttempted||!first.closed||first.diagnostics.includes('rollback_failed');
 return result(uncertain?'outcome_unknown':'operation_refused',null,uncertain,first.closed,first.diagnostics,uncertain?first.wire:null);
}
