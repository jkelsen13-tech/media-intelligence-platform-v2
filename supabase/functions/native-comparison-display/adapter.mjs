// Packaging seam only. No request parsing, Auth substitution, database calls or payload logging.
const ORIGIN='https://qikvmopbtijoebdqosyq.supabase.co';
const PAGES='https://jkelsen13-tech.github.io';
const POOLER='aws-0-us-west-1.pooler.supabase.com';
const REQUIRED=Object.freeze(['SUPABASE_URL','MIP_NATIVE_COMPARISON_DATABASE_URL','MIP_NATIVE_COMPARISON_DATABASE_LOGIN','MIP_NATIVE_COMPARISON_AUTH_PUBLIC_KEY']);
export const nativeComparisonEdgeConfigurationNames=REQUIRED;
function unavailable(request){
 const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 if(request?.headers?.get('origin')===PAGES)headers['Access-Control-Allow-Origin']=PAGES;
 return new Response(JSON.stringify({error:{code:'service_unavailable'}}),{status:503,headers});
}
function configuration(readSecret){
 const values=Object.fromEntries(REQUIRED.map(name=>[name,readSecret(name)]));
 if(values.SUPABASE_URL!==ORIGIN)throw Error('configuration');
 const connectionString=values.MIP_NATIVE_COMPARISON_DATABASE_URL,expectedLogin=values.MIP_NATIVE_COMPARISON_DATABASE_LOGIN,anonKey=values.MIP_NATIVE_COMPARISON_AUTH_PUBLIC_KEY;
 if(typeof expectedLogin!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(expectedLogin)
 ||['postgres','service_role','authenticator','supabase_admin'].includes(expectedLogin)||expectedLogin.endsWith('_collector')
 ||typeof connectionString!=='string'||connectionString.length>4096
 ||typeof anonKey!=='string'||!anonKey.length||anonKey.length>16384||anonKey.startsWith('sb_secret_'))throw Error('configuration');
 const url=new URL(connectionString);
 // Edge package is deliberately session-pooler-only. The canonical host and
 // driver still independently check the full connection and gateway-only identity.
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==POOLER||url.port!=='5432'
 ||url.pathname!=='/postgres'||url.search||url.hash||!url.password
 ||decodeURIComponent(url.username)!==expectedLogin+'.qikvmopbtijoebdqosyq')throw Error('configuration');
 return Object.freeze({anonKey,connection:Object.freeze({connectionString,expectedLogin,sessionPoolerHost:POOLER,disposable:false})});
}
// loadCaller is a static dynamic import in index.ts, not caller-controlled.
// Configuration is snapped once per worker. Missing/invalid config never loads
// the caller and always returns a bounded, sanitized unavailable response.
export async function createNativeComparisonEdge({readSecret,loadCaller}={}){
 let handler;
 try{
  if(typeof readSecret!=='function'||typeof loadCaller!=='function')throw Error('configuration');
  const options=configuration(readSecret),module=await loadCaller();
  if(typeof module?.createNativeComparisonCaller!=='function')throw Error('configuration');
  handler=module.createNativeComparisonCaller(options);
  if(typeof handler!=='function')throw Error('configuration');
 }catch{return unavailable}
 return async request=>{
  try{return await handler(request)}catch{return unavailable(request)}
 };
}
