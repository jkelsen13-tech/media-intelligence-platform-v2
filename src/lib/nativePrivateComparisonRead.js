import {buildPrivateWorkspace} from '../../supabase/qualification/native-comparison-display/displayContract.mjs';
import {resolveV2SupabaseUrl} from './supabaseOrigin.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,HASH=/^[0-9a-f]{64}$/;
const plain=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
export function privateBindingSelection(value){
 if(!plain(value)||Object.keys(value).length!==3||!['scope','binding_id','manifest_hash'].every(k=>Object.hasOwn(value,k))
 ||typeof value.scope!=='string'||!UUID.test(value.scope)||typeof value.binding_id!=='string'||!UUID.test(value.binding_id)
 ||typeof value.manifest_hash!=='string'||!HASH.test(value.manifest_hash))return null;
 return Object.freeze({...value});
}
function publicKey(key){
 if(typeof key!=='string'||!key.length||key.length>16384||/\s/.test(key)||key.startsWith('sb_secret_'))return false;
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return true;
 try{
  const parts=key.split('.');if(parts.length!==3)return false;
  const encoded=parts[1].replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'='))).role==='anon';
 }catch{return false}
}
function authenticated(s,now){
 return UUID.test(s?.user?.id??'')&&s?.user?.is_anonymous===false
 &&typeof s.access_token==='string'&&s.access_token.length<=16384
 &&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s.access_token)
 &&Number.isSafeInteger(s.expires_at)&&s.expires_at>now;
}
async function readJson(response,signal){
 const reader=response.body?.getReader();if(!reader)throw Error('unavailable');
 const chunks=[];let size=0;
 const cancel=()=>{void reader.cancel().catch(()=>{})};signal.addEventListener('abort',cancel,{once:true});
 try{
  for(;;){
   if(signal.aborted)throw Error('cancelled');
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>524288)throw Error('oversized');chunks.push(value);
  }
  if(signal.aborted)throw Error('cancelled');
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{signal.removeEventListener('abort',cancel);void reader.cancel().catch(()=>{});reader.releaseLock()}
}
// Ephemeral controller: no token/DTO storage, public loader, SQL, or automatic requests.
// Auth events invalidate even refreshes of the same user; a fresh explicit submit is required.
export function createNativePrivateRead({getSession,onAuthChange,url,anonKey,fetchImpl=globalThis.fetch,now=()=>Math.floor(Date.now()/1000)}={}){
 let state=Object.freeze({status:'checking_session',workspace:null}),session=null,ready=false,closed=false,epoch=0,pending=null,expiryTimer=null;
 const listeners=new Set(),target=resolveV2SupabaseUrl(url);
 const configured=target.ok&&publicKey(anonKey)&&typeof fetchImpl==='function'&&typeof getSession==='function'&&typeof onAuthChange==='function';
 const endpoint=target.ok?target.url+'/functions/v1/native-comparison-display':null;
 const emit=status=>{state=Object.freeze({status,workspace:null});for(const fn of listeners)fn(state)};
 const invalidate=(status='selection_required')=>{epoch++;pending?.abort();pending=null;emit(status)};
 const applySession=next=>{
  session=next;ready=true;clearTimeout(expiryTimer);
  invalidate(authenticated(next,now())?'selection_required':'authentication_required');
  if(authenticated(next,now()))expiryTimer=setTimeout(()=>{if(!closed){session=null;invalidate('authentication_required')}},Math.min((next.expires_at-now())*1000,2147483647));
 };
 let seenEvent=false,unsub=()=>{};
 if(configured){
  unsub=onAuthChange(next=>{if(closed)return;seenEvent=true;applySession(next)});
  Promise.resolve().then(()=>getSession()).then(next=>{
   if(closed||seenEvent)return;applySession(next);
  },()=>{if(!closed&&!seenEvent){ready=true;session=null;invalidate('authentication_required')}});
 }else{ready=true;emit('service_unavailable')}
 return Object.freeze({
  getState:()=>state,
  subscribe(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn)},
  invalidate(){if(!closed)invalidate(ready&&authenticated(session,now())?'selection_required':ready?'authentication_required':'checking_session')},
  async load(value){
   if(closed)return;
   const selection=privateBindingSelection(value);
   invalidate('loading');
   if(!selection){emit('invalid_selection');return}
   if(!configured){emit('service_unavailable');return}
   if(!ready||!authenticated(session,now())){emit('authentication_required');return}
   const requestEpoch=epoch,captured=session,controller=new AbortController();pending=controller;
   const current=()=>!closed&&epoch===requestEpoch&&!controller.signal.aborted&&session===captured&&authenticated(captured,now());
   const timer=setTimeout(()=>controller.abort(),12000);
   let abortResolve;
   const aborted=new Promise(resolve=>{abortResolve=()=>resolve(null);controller.signal.addEventListener('abort',abortResolve,{once:true})});
   const execute=async()=>{
    const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:anonKey,Authorization:'Bearer '+captured.access_token},
     body:JSON.stringify(selection),signal:controller.signal,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
    if(!current()){void response.body?.cancel().catch(()=>{});return null}
    if(response.status!==200||response.redirected||response.type==='opaqueredirect'||(response.url&&response.url!==endpoint)
     ||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){
     void response.body?.cancel().catch(()=>{});return {status:response.status===401?'authentication_required':'service_unavailable',workspace:null};
    }
    const dto=await readJson(response,controller.signal);
    if(!current())return null;
    try{return {status:'ready',workspace:buildPrivateWorkspace(dto,selection)}}catch{return {status:'invalid_response',workspace:null}}
   };
   try{
    const result=await Promise.race([execute(),aborted]);
    if(closed||epoch!==requestEpoch)return;
    if(!current()){emit(authenticated(session,now())?'service_unavailable':'authentication_required');return}
    state=Object.freeze(result??{status:'service_unavailable',workspace:null});for(const fn of listeners)fn(state);
   }catch{if(!closed&&epoch===requestEpoch)emit('service_unavailable')}
   finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abortResolve);if(pending===controller)pending=null}
  },
  dispose(){if(closed)return;closed=true;epoch++;pending?.abort();pending=null;session=null;clearTimeout(expiryTimer);unsub?.();listeners.clear();state=Object.freeze({status:'disposed',workspace:null})},
 });
}
