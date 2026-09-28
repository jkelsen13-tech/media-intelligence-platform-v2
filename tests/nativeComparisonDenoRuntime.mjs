// Deno-only synthetic runtime probe. Called only by the armed FULL PG fixture.
// It does not alter the production Edge adapter or substitute admission SQL.
const fail=()=>{throw Error('native_comparison_deno_failed')};
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function input(){
 const reader=Deno.stdin.readable.getReader(),chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192)fail();chunks.push(value)}
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
try{
 if(Deno.version.deno!=='2.5.2'||Deno.env.get('MIP_DISPOSABLE_POSTGRES')!=='qik-native-caller')fail();
 const context=await input(),now=Math.floor(Date.now()/1000);
 if(!exact(context,['syntheticFixture','connectionString','expectedLogin','selection','user','session','exp'])
 ||context.syntheticFixture!==true||typeof context.connectionString!=='string'||context.connectionString.length>4096
 ||typeof context.expectedLogin!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(context.expectedLogin)
 ||['postgres','service_role','authenticator','supabase_admin'].includes(context.expectedLogin)||context.expectedLogin.endsWith('_collector')
 ||!exact(context.selection,['scope','binding_id','manifest_hash'])
 ||!UUID.test(context.selection.scope)||!UUID.test(context.selection.binding_id)||!/^[0-9a-f]{64}$/.test(context.selection.manifest_hash)
 ||!UUID.test(context.user)||!UUID.test(context.session)||!Number.isSafeInteger(context.exp)||context.exp<=now||context.exp>now+3601)fail();
 const target=new URL(context.connectionString);
 if(target.protocol!=='postgresql:'||target.hostname!=='127.0.0.1'||target.port!=='5432'||target.pathname!=='/postgres'
 ||target.search||target.hash||!target.password||decodeURIComponent(target.username)!==context.expectedLogin)fail();
 // The real Edge entrypoint must initialize Node globals yet remain unavailable
 // with all deployment configuration absent. No production host override exists.
 for(const name of ['SUPABASE_URL','MIP_NATIVE_COMPARISON_DATABASE_URL','MIP_NATIVE_COMPARISON_DATABASE_LOGIN','MIP_NATIVE_COMPARISON_AUTH_PUBLIC_KEY'])
  if(Deno.env.get(name)!==undefined)fail();
 const entry=await import('../supabase/functions/native-comparison-display/index.ts');
 const missing=await entry.default.fetch(new Request('https://qikvmopbtijoebdqosyq.supabase.co/functions/v1/native-comparison-display',{
  method:'POST',headers:{Origin:'https://jkelsen13-tech.github.io'},body:'{}'}));
 if(missing.status!==503||JSON.stringify(await missing.json())!==JSON.stringify({error:{code:'service_unavailable'}}))fail();
 if(typeof globalThis.Buffer?.from!=='function'||globalThis.Buffer.from('A😀é').toString('utf8')!=='A😀é'
 ||globalThis.process?.env?.MIP_DISPOSABLE_POSTGRES!=='qik-native-caller')fail();
 // Import the real npm driver in Deno. The canonical host below imports and
 // connects through that same driver with the actual fixture SCRAM login.
 const pg=await import('pg');if(typeof pg.default?.Client!=='function')fail();
 const {createNativeComparisonCaller}=await import('../supabase/qualification/native-comparison-caller/host.mjs');
 const {validateDisplay}=await import('../supabase/qualification/native-comparison-display/displayContract.mjs');
 const origin='https://qikvmopbtijoebdqosyq.supabase.co',key='sb_publishable_synthetic';
 const claims={sub:context.user,session_id:context.session,iss:origin+'/auth/v1',aud:'authenticated',role:'authenticated',
  is_anonymous:false,iat:now-1,exp:context.exp};
 const token='synthetic.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.synthetic';
 let authCalls=0;
 const handler=createNativeComparisonCaller({
  connection:{connectionString:context.connectionString,expectedLogin:context.expectedLogin,sessionPoolerHost:null,disposable:true},
  anonKey:key,
  fetchImpl:async(url,options)=>{
   if(url!==origin+'/auth/v1/user'||options.method!=='GET'||options.headers.apikey!==key
    ||options.headers.Authorization!=='Bearer '+token||options.redirect!=='error'||options.credentials!=='omit')fail();
   authCalls++;
   return new Response(JSON.stringify({id:context.user,is_anonymous:false}),{headers:{'Content-Type':'application/json'}});
  },
 });
 const response=await handler(new Request(origin+'/functions/v1/native-comparison-display',{method:'POST',
  headers:{Origin:'https://jkelsen13-tech.github.io',Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify(context.selection)}));
 if(response.status!==200||authCalls!==1||response.headers.get('Cache-Control')!=='private, no-store')fail();
 const value=validateDisplay(await response.json(),context.selection);
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))));
 const digest=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
 // No DTO, password, token, user/session or error diagnostics leave the child.
 console.log(JSON.stringify({status:'passed',deno:'2.5.2',index_unavailable:true,node_globals:true,pg_import:true,http_status:200,dto_sha256:digest}));
}catch{
 console.log('{"status":"failed","code":"native_comparison_deno_failed"}');
 Deno.exitCode=1;
}
