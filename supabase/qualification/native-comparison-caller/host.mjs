// Server-only Node module candidate. No listener, deployment, secret loader or browser import.
import {createPrivateUserAuthenticator,PAGES_ORIGIN} from '../../functions/_shared/privateGateway.mjs';
import {connectAuthenticatedPg,connectionTarget} from '../collector-native-capture/authenticatedPgDriver.mjs';
import {validateDisplay} from '../native-comparison-display/displayContract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,HASH=/^[0-9a-f]{64}$/;
const AUTH='https://qikvmopbtijoebdqosyq.supabase.co';
const SQL='select mip_native_caller.read_current($1,$2,$3,$4,$5,$6) result';
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const denied=()=>{throw Error('native_caller_configuration_refused')};
function connectionSnapshot(c){
 if(!exact(c,['connectionString','expectedLogin','sessionPoolerHost','disposable'])
 ||typeof c.connectionString!=='string'||typeof c.expectedLogin!=='string'||c.expectedLogin.endsWith('_collector')
 ||typeof c.disposable!=='boolean'||!(c.sessionPoolerHost===null||c.sessionPoolerHost==='aws-0-us-west-1.pooler.supabase.com')
 ||(c.disposable&&process.env.MIP_DISPOSABLE_POSTGRES!=='qik-native-caller')
 ||connectionTarget(c.connectionString,c.expectedLogin,c.disposable,c.sessionPoolerHost).pathname!=='/postgres')denied();
 return Object.freeze({...c});
}
function identity(v,now){
 const u=v?.user,c=v?.claims;
 if(!UUID.test(u?.id??'')||u.is_anonymous!==false||!UUID.test(c?.session_id??'')||c.sub!==u.id
 ||c.iss!==AUTH+'/auth/v1'||c.aud!=='authenticated'||c.role!=='authenticated'||c.is_anonymous!==false
 ||!Number.isSafeInteger(c.exp)||c.exp<=now||c.exp>253402300799
 ||!Number.isSafeInteger(c.iat)||c.iat>now||c.iat>=c.exp
 ||(c.nbf!==undefined&&(!Number.isSafeInteger(c.nbf)||c.nbf>now)))return null;
 return Object.freeze({user:u.id,session:c.session_id,exp:c.exp});
}
async function input(request,signal){
 const reader=request.body?.getReader();if(!reader)throw Error('request');
 const chunks=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{})};signal.addEventListener('abort',abort,{once:true});
 try{
  for(;;){
   if(signal.aborted)throw Error('request');
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>4096)throw Error('request');chunks.push(value);
  }
  if(signal.aborted)throw Error('request');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!exact(v,['scope','binding_id','manifest_hash'])||!UUID.test(v.scope)||!UUID.test(v.binding_id)||!HASH.test(v.manifest_hash))throw Error('request');
  return Object.freeze({...v});
 }finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
// Auth service verifies the bearer; the composed SQL then locks/checks its exact
// current auth.sessions row. getUser alone never admits display data.
export function createNativeComparisonCaller({connection,anonKey,fetchImpl=globalThis.fetch}={}){
 const configured=connectionSnapshot(connection);
 if(typeof anonKey!=='string'||!anonKey||anonKey.length>16384||anonKey.startsWith('sb_secret_')||typeof fetchImpl!=='function')denied();
 if(!anonKey.startsWith('sb_publishable_')){
  let keyClaims;try{keyClaims=JSON.parse(Buffer.from(anonKey.split('.')[1],'base64url').toString('utf8'))}catch{denied()}
  if(keyClaims?.role!=='anon')denied();
 }
 const authenticate=createPrivateUserAuthenticator({url:AUTH,anonKey,fetchImpl});
 return async request=>{
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin',
   'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
   'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'};
  if(request.headers.get('origin')===PAGES_ORIGIN)headers['Access-Control-Allow-Origin']=PAGES_ORIGIN;
  const fail=(status,code)=>new Response(JSON.stringify({error:{code}}),{status,headers});
  if(request.headers.get('origin')!==PAGES_ORIGIN)return fail(403,'origin_denied');
  let url;try{url=new URL(request.url)}catch{return fail(404,'invalid_request')}
  if(/[?#\\]/.test(request.url)||!['/native-comparison-display','/functions/v1/native-comparison-display'].includes(url.pathname)
   ||request.url!==url.origin+url.pathname)return fail(404,'invalid_request');
  if(request.method==='OPTIONS'){
   if(request.headers.get('access-control-request-method')!=='POST'
    ||(request.headers.get('access-control-request-headers')??'').split(',').filter(Boolean).some(h=>!['authorization','apikey','content-type','x-client-info'].includes(h.trim().toLowerCase())))
    return fail(403,'origin_denied');
   return new Response(null,{status:204,headers});
  }
  if(request.method!=='POST')return fail(405,'invalid_request');
  const bearer=request.headers.get('authorization')??'';
  if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)||bearer.length>16391)return fail(401,'authentication_required');
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')
   ||request.headers.has('cookie')||request.headers.has('content-encoding'))return fail(400,'invalid_request');
  const controller=new AbortController(),signal=controller.signal,abort=()=>controller.abort();
  request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
  const timer=setTimeout(abort,10000);
  let db,begun=false,committed=false,closed=false,display=null,target=null,auth=null,status=503,code='service_unavailable';
  try{
   try{target=await input(request,signal)}catch{status=400;code='invalid_request';throw Error('request')}
   auth=identity(await authenticate(bearer,{signal}),Math.floor(Date.now()/1000));
   if(!auth){status=401;code='authentication_required';throw Error('auth')}
   if(signal.aborted)throw Error('aborted');
   db=await connectAuthenticatedPg(configured);
   const principal=(await db.query(`select pg_has_role(session_user,'mip_mentions_gateway','USAGE') gateway,
    exists(select 1 from pg_roles r where r.rolname not in(session_user,'mip_mentions_gateway')
      and pg_has_role(session_user,r.oid,'MEMBER')) extra_membership`)).rows;
   if(principal.length!==1||principal[0].gateway!==true||principal[0].extra_membership!==false)throw Error('principal');
   await db.query('begin isolation level read committed');begun=true;
   await db.query("set local statement_timeout='1000ms'");
   const rows=(await db.query(SQL,[auth.user,auth.session,auth.exp,target.scope,target.binding_id,target.manifest_hash])).rows;
   if(rows.length!==1)throw Error('shape');
   display=validateDisplay(rows[0].result,target);
   if(signal.aborted||auth.exp<=Math.floor(Date.now()/1000))throw Error('expired');
   await db.query('commit');begun=false;committed=true;
  }catch{display=null}
  finally{
   if(db&&begun)try{await db.query('rollback')}catch{display=null}
   if(db)try{await db.end();closed=true}catch{display=null}
   clearTimeout(timer);request.signal.removeEventListener('abort',abort);
  }
  if(!display||!committed||!closed||signal.aborted||auth.exp<=Math.floor(Date.now()/1000))return fail(status,code);
  // No broker, subject, admission, connection or diagnostic is added to the DTO.
  return new Response(JSON.stringify(display),{status:200,headers});
 };
}
