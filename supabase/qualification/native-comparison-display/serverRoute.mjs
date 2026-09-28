// Server-only operation, supplied execution-host credentials and transient broker.
import {connectAuthenticatedPg,connectionTarget} from '../collector-native-capture/authenticatedPgDriver.mjs';
import {validateDisplay} from './displayContract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const SQL='select mip_native_display.read_current($1,$2,$3,$4,$5) result';
const PRINCIPAL=`select pg_has_role(session_user,'mip_mentions_gateway','USAGE') gateway,
 exists(select 1 from pg_roles r where r.rolname not in(session_user,'mip_mentions_gateway')
 and pg_has_role(session_user,r.oid,'MEMBER')) extra_membership`;
const fail=()=>{throw Error('native_comparison_display_configuration_refused')};
function exact(v,keys){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))fail();
}
function validate(options){
 exact(options,['connection','request']);
 const c=options.connection,r=options.request;
 exact(c,['connectionString','expectedLogin','sessionPoolerHost','disposable']);
 if(typeof c.connectionString!=='string'||typeof c.expectedLogin!=='string'||c.expectedLogin.endsWith('_collector')
 ||typeof c.disposable!=='boolean'||!(c.sessionPoolerHost===null||c.sessionPoolerHost==='aws-0-us-west-1.pooler.supabase.com')
 ||(c.disposable&&process.env.MIP_DISPOSABLE_POSTGRES!=='qik-native-caller'))fail();
 if(connectionTarget(c.connectionString,c.expectedLogin,c.disposable,c.sessionPoolerHost).pathname!=='/postgres')fail();
 exact(r,['scope','binding_id','manifest_hash','broker']);exact(r.broker,['session','runtime']);
 if(!UUID.test(r.scope??'')||!UUID.test(r.binding_id??'')||!HASH.test(r.manifest_hash??'')
 ||!UUID.test(r.broker.session??'')||typeof r.broker.runtime!=='string'
 ||Buffer.byteLength(r.broker.runtime)<1||Buffer.byteLength(r.broker.runtime)>128)fail();
 return {connection:{...c},request:{...r,broker:{...r.broker}}};
}
export async function readNativeComparisonDisplay(options){
 let input;try{input=validate(options)}catch{fail()}
 let db,begun=false,closed=false,validated=null,committed=false,stage='connect';
 const diagnostics=[];
 try{
  db=await connectAuthenticatedPg(input.connection);
  stage='principal';const rows=(await db.query(PRINCIPAL)).rows;
  if(rows.length!==1||rows[0].gateway!==true||rows[0].extra_membership!==false)throw Error('refused');
  stage='begin';await db.query('begin isolation level read committed');begun=true;
  // Fixed session-local bound; no caller-selected timeout or SQL is accepted.
  await db.query("set local statement_timeout='1000ms'");
  stage='read';const r=input.request;
  const answer=(await db.query(SQL,[r.scope,r.binding_id,r.manifest_hash,r.broker.session,r.broker.runtime])).rows;
  if(answer.length!==1)throw Error('refused');
  stage='shape';validated=validateDisplay(answer[0].result,r);
  stage='commit';await db.query('commit');begun=false;committed=true;
 }catch{diagnostics.push(stage+'_failed');validated=null}
 finally{
  if(db&&begun)try{await db.query('rollback')}catch{diagnostics.push('rollback_failed')}
  if(db)try{await db.end();closed=true}catch{diagnostics.push('close_failed')}
  else diagnostics.push('connection_cleanup_unverified');
 }
 // A failed/lost read acknowledgement returns no private data and never falls
 // back to public tables. A caller may explicitly retry the same exact identity.
 return Object.freeze({state:committed&&closed?'current_private_display':'display_unavailable',
  display:committed&&closed?validated:null,connection_closed:closed,diagnostics:Object.freeze(diagnostics),
  publication_allowed:false,attachment_allowed:false});
}
