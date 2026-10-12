// Disposable closed-namespace fixture. Authentication strings are dummy markers.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import zlib from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
const cfg = JSON.parse(fs.readFileSync('/runtime/fixture/config.json'));
const checks = {}, outcomes = {}, wire = [];
const BODY = 'MIP_SYNTHETIC_BODY', AUTH = 'Bearer MIP_SYNTHETIC_AUTH', COOKIE = 'mip=MIP_SYNTHETIC_COOKIE';
const USER = 'mip_synthetic_user:MIP_SYNTHETIC_USERPWD', SECRET = 'MIP_SYNTHETIC_CUSTOM_HEADER';
const quote = x => "'"+String(x).replaceAll("'", "''")+"'";
const servers = [];
let started = false;
let protectedMode = 'good';
const pgServerEnv = cfg.sanitize ? {...process.env,LD_PRELOAD:'/runtime/lib/libasan.so.8',
  ASAN_OPTIONS:'detect_leaks=0:halt_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'} : process.env;
// execFile has no stdin option: use a child and write the exact SQL as input.
async function sql(sqlText, lane='stock', user='fixture_bootstrap', allowError=false) {
  return await new Promise((resolve,reject) => {
    const child = execFile('/runtime/pg/bin/psql', ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp/socket','-U',user,'-d',lane],
      {timeout:15000,maxBuffer:1024*1024}, (error,stdout,stderr) => {
        const value = {stdout,stderr,error:Boolean(error)};
        error && !allowError ? reject(Object.assign(error,value)) : resolve(value);
      });
    child.stdin.end(sqlText);
  });
}
function request(path, opts={}) {
  const headers = opts.generated ? `ARRAY[('X-Synthetic-Secret',${quote(SECRET)})::http_header]` :
    `ARRAY[('Authorization',${quote(AUTH)})::http_header,('Cookie',${quote(COOKIE)})::http_header,('X-Synthetic-Secret',${quote(SECRET)})::http_header]`;
  return `ROW('POST',${quote(opts.url || 'https://audit.receiver.test'+path)},${headers},'application/json',${quote(BODY)})::http_request`;
}
function settings(lane, extra='') {
  return `SELECT http_reset_curlopt(); SELECT http_set_curlopt('CURLOPT_CAINFO',${quote(cfg.ca)});
    ${lane==='stock' ? "SELECT http_set_curlopt('CURLOPT_SSL_VERIFYPEER','1'); SELECT http_set_curlopt('CURLOPT_SSL_VERIFYHOST','2'); SELECT http_set_curlopt('CURLOPT_PROXY',''); SELECT http_set_curlopt('CURLOPT_PRE_PROXY','');" : ''}
    SELECT http_set_curlopt('CURLOPT_TIMEOUT_MS','1200'); ${extra}`;
}
async function transfer(lane,path,opts={}) {
  const extra = opts.generated ? `SELECT http_set_curlopt('CURLOPT_USERPWD',${quote(USER)});` : '';
  const res = await sql(settings(lane,extra)+(opts.prefix||'')+` SELECT fixture_try(${request(path,opts)});`,lane);
  const last = res.stdout.trim().split('\n').at(-1);
  const result = JSON.parse(last);
  outcomes[lane+':'+path+(opts.generated?':generated':'')+(opts.caseName?':'+opts.caseName:'')] = result;
  return result;
}
function handler(req,res) {
  const parts = [];
  req.on('data',x=>parts.push(x));
  req.on('end',()=> {
    const body = Buffer.concat(parts).toString();
    wire.push({scheme:req.socket.encrypted?'https':'http',port:req.socket.localPort,
               host:req.headers.host,path:req.url,method:req.method,body,
               authorization:req.headers.authorization||null,cookie:req.headers.cookie||null,
               customHeader:req.headers['x-synthetic-secret']||null});
    res.on('error',()=>{});
    if (req.url.startsWith('/redirect/')) {
      const [, ,code,target] = req.url.split('/');
      const destinations = {same:'https://audit.receiver.test',host:'https://other.receiver.test',
                            port:'https://audit.receiver.test:8443',scheme:'http://audit.receiver.test'};
      res.writeHead(Number(code),{Location:destinations[target]+'/sink/'+code+'/'+target+(req.headers.authorization?.startsWith('Basic')?'/generated':'/manual')});
      res.end(); return;
    }
    if (req.url==='/drop'||(req.url==='/protected'&&protectedMode==='drop')) { req.socket.destroy(); return; }
    if (req.url==='/slow'||(req.url==='/protected'&&protectedMode==='slow')) { setTimeout(()=>{if(!res.destroyed){res.writeHead(201);res.end();}},3000); return; }
    if (req.url==='/large-body') { res.writeHead(201,{'Content-Type':'text/plain'});res.end('x'.repeat(65537));return; }
    if (req.url==='/gzip-large-body') {res.writeHead(201,{'Content-Type':'text/plain','Content-Encoding':'gzip'});res.end(zlib.gzipSync('x'.repeat(65537)));return;}
    if (req.url==='/large-headers') {
      const h = {}; for(let i=0;i<10;i++)h['X-Fill-'+i]='x'.repeat(7000);
      res.writeHead(201,h);res.end();return;
    }
    res.writeHead(201,{'Content-Type':'application/json','Preference-Applied':'return=minimal, tx=commit'});res.end();
  });
}
async function listen(server,port) { servers.push(server); await new Promise((r,j)=>{server.on('error',j);server.listen(port,'127.0.0.1',r);}); }
try {
  checks.namespaceUnprivileged443 = Number(fs.readFileSync('/proc/sys/net/ipv4/ip_unprivileged_port_start','utf8').trim())<=443;
  const good = {key:fs.readFileSync('/runtime/fixture/server.key'),cert:fs.readFileSync('/runtime/fixture/server.pem')};
  const other = tls.createSecureContext({key:fs.readFileSync('/runtime/fixture/untrusted.key'),cert:fs.readFileSync('/runtime/fixture/untrusted.pem')});
  await listen(https.createServer({...good,SNICallback:(name,cb)=>cb(null,name==='untrusted.receiver.test'?other:tls.createSecureContext(good))},handler),443);
  await listen(https.createServer(good,handler),8443);
  await listen(http.createServer(handler),80);
  fs.mkdirSync('/tmp/socket',{mode:0o700});
  await exec('/runtime/pg/bin/initdb',['-D','/tmp/data','--no-locale','--encoding=UTF8','--auth=trust','-U','fixture_bootstrap']);
  fs.appendFileSync('/tmp/data/postgresql.conf',"\nlisten_addresses=''\nunix_socket_directories='/tmp/socket'\nfsync=on\nsynchronous_commit=on\nfull_page_writes=on\nlog_min_messages=debug2\n");
  await exec('/runtime/pg/bin/pg_ctl',['-D','/tmp/data','-l','/tmp/server.log','-w','start'],{env:pgServerEnv});started=true;
  const postmasterPid=Number(fs.readFileSync('/tmp/data/postmaster.pid','utf8').split('\n')[0]);
  const postmasterMaps=fs.readFileSync('/proc/'+postmasterPid+'/maps','utf8');
  outcomes.postmasterAsanMapped=postmasterMaps.includes('/runtime/lib/libasan.so.8');
  if(cfg.sanitize)checks.postmasterSanitizerPreloadObserved=outcomes.postmasterAsanMapped;
  await sql('CREATE DATABASE stock; CREATE DATABASE fork;','postgres');
  for (const lane of ['stock','fork']) {
    await sql(`CREATE EXTENSION http VERSION 'transport_${lane}';
      CREATE FUNCTION fixture_try(r http_request) RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE h http_response; s text; m text; d text; hint text;
      BEGIN h:=http(r); RETURN jsonb_build_object('ok',true,'status',h.status,'contentBytes',coalesce(octet_length(h.content),0),'emptyBodyIsNull',h.content IS NULL);
      EXCEPTION WHEN query_canceled OR OTHERS THEN GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,m=MESSAGE_TEXT,d=PG_EXCEPTION_DETAIL,hint=PG_EXCEPTION_HINT;
      RETURN jsonb_build_object('ok',false,'sqlstate',s,'message',m,'detailEmpty',d='','hintEmpty',hint=''); END $$;`,lane);
    const ident=await sql("SELECT mip_curl_identity(); SELECT count(*) FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE e.extname='http' AND d.classid='pg_proc'::regclass AND d.objid='http(http_request)'::regprocedure AND d.deptype='e';",lane);
    outcomes[lane+'LinkedCurlIdentity']=ident.stdout.trim().split('\n')[0];
    checks[lane+'ActualEntrypointExtensionMember']=ident.stdout.trim().split('\n').at(-1)==='1';
    const abi=await sql(`SELECT p.prosrc='http_request' AND p.probin='/runtime/pg/lib/postgresql/transport_${lane}.so' AND l.lanname='c'
      FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='http(http_request)'::regprocedure;
      SELECT count(*)=3 FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE e.extname='http'
        AND d.classid='pg_type'::regclass AND d.objid IN ('http_header'::regtype,'http_request'::regtype,'http_response'::regtype) AND d.deptype='e';`,lane);
    checks[lane+'CompleteCLibraryEntrypointAndCompositeMembers']=abi.stdout.trim()==='t\nt';
    const ok=await transfer(lane,'/good');checks[lane+'ChainAndNameSuccess']=ok.ok&&ok.status===201&&ok.emptyBodyIsNull;
    for(const name of ['wrong','untrusted']){
      const before=wire.length;
      const result=await transfer(lane,'/tls-'+name,{url:'https://'+name+'.receiver.test/good'});
      checks[lane+name+'TlsRefusedBeforeHttp']=!result.ok&&wire.length===before;
      checks[lane+name+'TlsSqlstateClassified']=result.sqlstate==='XX000';
      if(lane==='fork')checks[lane+name+'Sanitized']=result.message==='mip_http_transport_refused'&&result.detailEmpty&&result.hintEmpty;
    }
    const missing=await sql(`SELECT http_reset_curlopt(); SELECT http_set_curlopt('CURLOPT_CAINFO','/mip/trust/${'f'.repeat(64)}.pem'); SELECT fixture_try(${request('/good')});`,lane);
    const missingResult=JSON.parse(missing.stdout.trim().split('\n').at(-1));outcomes[lane+':missingCa']=missingResult;
    checks[lane+'MissingCaRefused']=!missingResult.ok;
    for(const path of ['/large-body','/gzip-large-body','/large-headers']){
      const result=await transfer(lane,path);checks[lane+path+'BoundBehavior']=lane==='stock'?result.ok:!result.ok;
      if(lane==='fork')checks[lane+path+'ExactSanitizedFailure']=result.message==='mip_http_transport_refused'&&result.sqlstate==='XX000'&&result.detailEmpty&&result.hintEmpty;
      if(lane==='stock'&&path.includes('body'))checks[lane+path+'Only65537Bytes']=result.contentBytes===65537;
    }
    const dropped=await transfer(lane,'/drop');checks[lane+'DroppedConnectionRefused']=!dropped.ok;
    const timed=await transfer(lane,'/slow',{caseName:'curl-timeout',prefix:"SELECT http_set_curlopt('CURLOPT_TIMEOUT_MS','200');"});checks[lane+'TimeoutRefused']=!timed.ok;
    checks[lane+'CurlTimeoutExactClass']=timed.sqlstate==='XX000';
    const canceled=await transfer(lane,'/slow',{caseName:'statement-timeout',prefix:"SET statement_timeout='100ms';"});checks[lane+'CancelRefused']=!canceled.ok;
    checks[lane+'StatementTimeoutExactClass']=canceled.sqlstate==='57014'&&canceled.message==='canceling statement due to statement timeout';
    const reused=await sql(settings(lane)+`SET statement_timeout='100ms'; SELECT fixture_try(${request('/slow')}); SET statement_timeout=0; SELECT fixture_try(${request('/good')});`,lane);
    checks[lane+'SameBackendAfterCancelChecked']=JSON.parse(reused.stdout.trim().split('\n').at(-1)).ok;
    // A distinct session cancels only after the synthetic server observes dispatch.
    // The transfer session then checks cleanup/reuse under its SAME backend PID.
    const mark=wire.length;
    const active=sql(settings(lane)+`SET application_name='mip_transport_cancel_${lane}'; SELECT pg_backend_pid();
      SELECT fixture_try(${request('/slow')}); SELECT pg_backend_pid(); SELECT fixture_try(${request('/after-concurrent-cancel')});`,lane);
    const deadline=Date.now()+5000;
    while(wire.length===mark&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
    checks[lane+'ConcurrentCancelAfterDispatchObserved']=wire.length>mark&&wire[mark].path==='/slow';
    const activePid=Number((await sql(`SELECT pid FROM pg_stat_activity WHERE application_name='mip_transport_cancel_${lane}' AND state='active';`,lane)).stdout.trim());
    const backendMaps=fs.readFileSync('/proc/'+activePid+'/maps','utf8');
    outcomes[lane+'ActiveTransferMappings']={correctLibrary:backendMaps.includes('/runtime/pg/lib/postgresql/transport_'+lane+'.so'),
      asan:backendMaps.includes('/runtime/lib/libasan.so.8'),ubsan:backendMaps.includes('/runtime/lib/libubsan.so.1')};
    checks[lane+'ActualTransferLibraryMapped']=outcomes[lane+'ActiveTransferMappings'].correctLibrary;
    if(cfg.sanitize){checks[lane+'ActualTransferAsanMapped']=outcomes[lane+'ActiveTransferMappings'].asan;
      checks[lane+'ActualTransferUbsanMapped']=outcomes[lane+'ActiveTransferMappings'].ubsan;}
    const cancel=await sql(`SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='mip_transport_cancel_${lane}' AND state='active';`,lane);
    checks[lane+'ConcurrentCancelSignalAccepted']=cancel.stdout.trim()==='t';
    const done=(await active).stdout.trim().split('\n');
    const canceledRaw=JSON.parse(done.at(-3)), successRaw=JSON.parse(done.at(-1));
    outcomes[lane+':concurrentCancel']=canceledRaw;
    checks[lane+'ConcurrentCancelExactClass']=canceledRaw.sqlstate==='57014'&&canceledRaw.message==='canceling statement due to user request';
    checks[lane+'ConcurrentCancelSamePidChecked']=done.at(-4)===done.at(-2)&&!canceledRaw.ok&&successRaw.ok;
    const reconnected=await transfer(lane,'/after-error');checks[lane+'FreshBackendAfterErrors']=reconnected.ok;
    for(const option of ['CURLOPT_FOLLOWLOCATION','CURLOPT_MAXREDIRS','CURLOPT_PROTOCOLS_STR','CURLOPT_MAXFILESIZE','CURLOPT_MAXFILESIZE_LARGE','CURLOPT_CAPATH','CURLOPT_CAINFO_BLOB']){
      const r=await sql(`SELECT http_set_curlopt(${quote(option)},'0');`,lane,'fixture_bootstrap',true);
      checks[lane+option+'AbsentApiRefused']=r.error;
    }
  }
  for(const code of [301,302,303,307,308])for(const target of ['same','host','port','scheme'])for(const generated of [false,true]){
    const path='/redirect/'+code+'/'+target;
    const before=wire.length, r=await transfer('stock',path,{generated});
    const seen=wire.slice(before), first=seen[0], sink=seen[1], base=code+':'+target+':'+(generated?'generated':'manual');
    checks['stock:'+base+':Followed']=r.ok&&seen.length===2&&sink.path.startsWith('/sink/');
    checks['stock:'+base+':MethodBody']=sink.method===(code>=307?'POST':'GET')&&sink.body===(code>=307?BODY:'');
    checks['stock:'+base+':CustomHeader']=sink.customHeader===SECRET;
    checks['stock:'+base+':Authentication']=target==='same' ? sink.authorization===first.authorization : sink.authorization===null;
    if(!generated)checks['stock:'+base+':Cookie']=target==='same'?sink.cookie===COOKIE:sink.cookie===null;
    if(!generated){
      const start=wire.length, fork=await transfer('fork',path);
      checks['fork:'+base+':NoRedirectSideEffect']=!fork.ok&&wire.length===start+1&&wire[start].path===path;
    }
  }
  // Stock raw cache survives transaction rollback; reset replays cached DEBUG2 strings.
  const cache=await sql(`SET client_min_messages=debug2; BEGIN; SELECT http_set_curlopt('CURLOPT_USERPWD','MIP_CACHE_MARKER:MIP_CACHE_SECRET'); ROLLBACK;
    SELECT value='MIP_CACHE_MARKER:MIP_CACHE_SECRET' FROM http_list_curlopt() WHERE curlopt='CURLOPT_USERPWD';
    DO $$ BEGIN RAISE NOTICE 'MIP_RESET_BEGIN'; END $$; SELECT http_reset_curlopt(); DO $$ BEGIN RAISE NOTICE 'MIP_RESET_END'; END $$; SELECT count(*)=0 FROM http_list_curlopt();`);
  checks.stockCachedOptionsSurviveRollback=cache.stdout.trim().split('\n').at(-3)==='t';
  checks.stockResetClearsCache=cache.stdout.trim().endsWith('t');
  checks.stockResetReplayEmitsDummySecret=cache.stderr.split('MIP_RESET_BEGIN')[1]?.split('MIP_RESET_END')[0].includes('MIP_CACHE_SECRET')===true;
  const poisoned=await sql("SELECT http_set_curlopt('CURLOPT_IPRESOLVE','999999'); SELECT http_reset_curlopt();",'stock','fixture_bootstrap',true);
  outcomes.stockInvalidIpResolveSetterRejected=poisoned.error;
  // The stock setter caches before applying. The failed setup option is replayed
  // by reset, so no lower-trust fallback request is issued in this backend.
  const poisonReplay=await sql(`CREATE FUNCTION fixture_poison() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN
    BEGIN PERFORM http_set_curlopt('CURLOPT_IPRESOLVE','999999'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM http_reset_curlopt(); RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END;
    END $$; SELECT fixture_poison();`);
  checks.stockPoisonedCacheResetRefused=poisonReplay.stdout.trim()==='t';
  // Protected fixed wrapper owns narrow raw functions and restores both GUCs.
  await sql(`CREATE ROLE fixture_wrapper_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
    CREATE ROLE fixture_caller LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO fixture_wrapper_owner,fixture_caller;
    CREATE SCHEMA mip_transport_private;
    REVOKE ALL ON SCHEMA mip_transport_private FROM PUBLIC;
    GRANT USAGE ON SCHEMA mip_transport_private TO fixture_wrapper_owner;
    CREATE TABLE mip_transport_private.config(singleton boolean PRIMARY KEY CHECK(singleton),headers public.http_header[] NOT NULL);
    INSERT INTO mip_transport_private.config VALUES(true,ARRAY[('Authorization',${quote(AUTH)})::public.http_header,
      ('Cookie',${quote(COOKIE)})::public.http_header,('X-Synthetic-Secret',${quote(SECRET)})::public.http_header]);
    REVOKE ALL ON mip_transport_private.config FROM PUBLIC;
    GRANT SELECT ON mip_transport_private.config TO fixture_wrapper_owner;
    GRANT EXECUTE ON FUNCTION http(http_request),http_set_curlopt(text,text),http_reset_curlopt() TO fixture_wrapper_owner;
    CREATE FUNCTION protected_fixture() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
    SET search_path='' SET client_min_messages='warning' SET http.timeout_msec='1000' SET http.keepalive='false' AS $$
    DECLARE h public.http_response; protected_headers public.http_header[];
    BEGIN SELECT c.headers INTO STRICT protected_headers FROM mip_transport_private.config c WHERE c.singleton;
    PERFORM public.http_reset_curlopt(); PERFORM public.http_set_curlopt('CURLOPT_CAINFO',${quote(cfg.ca)});
    PERFORM public.http_set_curlopt('CURLOPT_SSL_VERIFYPEER','1'); PERFORM public.http_set_curlopt('CURLOPT_SSL_VERIFYHOST','2');
    PERFORM public.http_set_curlopt('CURLOPT_PROXY',''); PERFORM public.http_set_curlopt('CURLOPT_PRE_PROXY','');
    h:=public.http(ROW('POST','https://audit.receiver.test/protected',protected_headers,'application/json',${quote(BODY)})::public.http_request);
    PERFORM public.http_reset_curlopt(); RETURN h.status;
    EXCEPTION WHEN query_canceled OR OTHERS THEN PERFORM public.http_reset_curlopt(); RAISE EXCEPTION 'mip_synthetic_wrapper_refused'; END $$;
    ALTER FUNCTION protected_fixture() OWNER TO fixture_wrapper_owner;
    REVOKE ALL ON FUNCTION protected_fixture() FROM PUBLIC; GRANT EXECUTE ON FUNCTION protected_fixture() TO fixture_caller;`);
  for(const fn of ["http_reset_curlopt()","http_set_curlopt('CURLOPT_SSL_VERIFYPEER','0')","http_list_curlopt()",`http(${request('/denied')})`]){
    const denied=await sql('\\set VERBOSITY verbose\nSELECT '+fn+';','stock','fixture_caller',true);checks['callerRawDenied:'+fn.split('(')[0]]=denied.error&&denied.stderr.includes('42501')&&denied.stderr.includes('permission denied');
  }
  const stockIdentity=await sql(`SELECT current_user=session_user AND current_user='fixture_caller';
    SELECT bool_and(NOT has_function_privilege(current_user,p.oid,'EXECUTE')) FROM pg_proc p WHERE p.oid IN
      ('http(http_request)'::regprocedure,'http_set_curlopt(text,text)'::regprocedure,'http_reset_curlopt()'::regprocedure,'http_list_curlopt()'::regprocedure);`,'stock','fixture_caller');
  checks.stockActualCallerIdentityAndNoRawPrivilege=stockIdentity.stdout.trim()==='t\nt';
  const configDenied=await sql('\\set VERBOSITY verbose\nSELECT headers FROM mip_transport_private.config;','stock','fixture_caller',true);
  checks.protectedCallerCannotReadPrivateDummyCredentials=configDenied.error&&configDenied.stderr.includes('42501');
  const exposedDefinition=(await sql("SELECT pg_get_functiondef('public.protected_fixture()'::regprocedure);",'stock','fixture_caller')).stdout;
  checks.protectedFunctionDefinitionHasNoDummyCredentials=![AUTH,COOKIE,SECRET,USER].some(x=>exposedDefinition.includes(x));
  const debugCall=await sql(`SET client_min_messages=debug2; SELECT protected_fixture(); SHOW client_min_messages;`,'stock','fixture_caller');
  checks.protectedCallerDebug2GetsNoCredentialMarkers=![AUTH,COOKIE,SECRET,USER].some(x=>debugCall.stderr.includes(x));
  checks.protectedCallerClientDiagnosticGucRestored=debugCall.stdout.trim()==='201\ndebug2';
  const protectedResult=await sql(`SET http.timeout_msec='42'; SET http.keepalive='true'; SELECT protected_fixture(); SHOW http.timeout_msec; SHOW http.keepalive;`,'stock','fixture_caller');
  outcomes.protectedCallerOutput=protectedResult.stdout.trim();
  checks.protectedCallerRealHttpsAndGucRestoration=protectedResult.stdout.trim()==='201\n42ms\non';
  const ownerRole=await sql('SET ROLE fixture_wrapper_owner;','stock','fixture_caller',true);
  checks.protectedCallerCannotAssumeWrapperOwner=ownerRole.error&&ownerRole.stderr.includes('permission denied');
  const createPublic=await sql('CREATE FUNCTION public.mip_untrusted() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;','stock','fixture_caller',true);
  checks.protectedCallerCannotCreatePublicFunction=createPublic.error&&createPublic.stderr.includes('permission denied');
  const tempMask=await sql(`CREATE TEMP TABLE init_temp(x integer);
    CREATE TYPE pg_temp.http_response AS (poison text); CREATE TYPE pg_temp.http_request AS (poison text);
    CREATE TYPE pg_temp.http_header AS (poison text);
    CREATE FUNCTION pg_temp.http_reset_curlopt() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'MIP_TEMP_POISON'; END $$;
    SELECT protected_fixture();`,'stock','fixture_caller');
  checks.protectedCallerTempMaskingCannotChangeRequest=tempMask.stdout.trim()==='201';
  const inherited=await sql(`SELECT http_set_curlopt('CURLOPT_SSL_VERIFYPEER','0'); SELECT http_set_curlopt('CURLOPT_PROXY','http://127.0.0.1:9');
    SELECT protected_fixture(); SELECT count(*)=0 FROM http_list_curlopt();`);
  checks.protectedWrapperResetsInheritedOptions=inherited.stdout.trim().endsWith('201\nt');
  await sql(`CREATE FUNCTION fixture_wrapper_probe() RETURNS jsonb LANGUAGE plpgsql AS $$
    BEGIN RETURN jsonb_build_object('ok',true,'status',protected_fixture());
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'message',SQLERRM,
      'timeout',current_setting('http.timeout_msec'),'keepalive',current_setting('http.keepalive'),
      'clientMinMessages',current_setting('client_min_messages')); END $$;
    REVOKE ALL ON FUNCTION fixture_wrapper_probe() FROM PUBLIC; GRANT EXECUTE ON FUNCTION fixture_wrapper_probe() TO fixture_caller;`);
  protectedMode='drop';
  const failedWrapper=await sql(`SET client_min_messages=debug2; SET http.timeout_msec='42'; SET http.keepalive='true';
    BEGIN; SELECT fixture_wrapper_probe(); ROLLBACK; SHOW http.timeout_msec; SHOW http.keepalive; SHOW client_min_messages;`,'stock','fixture_caller');
  const errorLines=failedWrapper.stdout.trim().split('\n'), errorResult=JSON.parse(errorLines[0]);
  outcomes.protectedWrapperTransferError=errorResult;
  checks.protectedWrapperErrorGucAndRollbackRestoration=!errorResult.ok&&errorResult.message==='mip_synthetic_wrapper_refused'&&
    errorResult.timeout==='42ms'&&errorResult.keepalive==='on'&&errorLines.slice(1).join('\n')==='42ms\non\ndebug2';
  checks.protectedWrapperErrorClientDiagnosticRestoration=errorResult.clientMinMessages==='debug2'&&![AUTH,COOKIE,SECRET,USER].some(x=>failedWrapper.stderr.includes(x));
  protectedMode='slow';
  const canceledWrapper=await sql(`SET client_min_messages=debug2; SET http.timeout_msec='42'; SET http.keepalive='true'; SET statement_timeout='100ms';
    SELECT fixture_wrapper_probe(); SET statement_timeout=0; SHOW http.timeout_msec; SHOW http.keepalive; SHOW client_min_messages;`,'stock','fixture_caller');
  const cancelLines=canceledWrapper.stdout.trim().split('\n'), cancelResult=JSON.parse(cancelLines[0]);
  outcomes.protectedWrapperStatementCancel=cancelResult;
  checks.protectedWrapperExplicitCancelGucRestoration=!cancelResult.ok&&cancelResult.message==='mip_synthetic_wrapper_refused'&&
    cancelResult.timeout==='42ms'&&cancelResult.keepalive==='on'&&cancelLines.slice(1).join('\n')==='42ms\non\ndebug2';
  checks.protectedWrapperCancelClientDiagnosticRestoration=cancelResult.clientMinMessages==='debug2'&&![AUTH,COOKIE,SECRET,USER].some(x=>canceledWrapper.stderr.includes(x));
  protectedMode='good';
  const poisonStart=wire.length;
  const failedCleanup=await sql(`SELECT fixture_poison(); SELECT fixture_wrapper_probe();`);
  const poisonResult=JSON.parse(failedCleanup.stdout.trim().split('\n').at(-1));
  outcomes.protectedWrapperPoisonedCleanup={ok:poisonResult.ok,messageWasFixed:poisonResult.message==='mip_synthetic_wrapper_refused',
    disposition:'fixture retires this backend immediately; no fallback request or retry'};
  checks.protectedWrapperPoisonedCleanupSessionRetired=!poisonResult.ok&&wire.length===poisonStart;
  await sql(`REVOKE ALL ON FUNCTION http(http_request),http_set_curlopt(text,text),http_reset_curlopt(),http_list_curlopt() FROM PUBLIC;
    SELECT true;`,'fork');
  for(const fn of ["http_reset_curlopt()",`http_set_curlopt('CURLOPT_CAINFO','/mip/trust/${'f'.repeat(64)}.pem')`,"http_list_curlopt()",`http(${request('/denied')})`]){
    const denied=await sql('\\set VERBOSITY verbose\nSELECT '+fn+';','fork','fixture_caller',true);checks['forkCallerRawDenied:'+fn.split('(')[0]]=denied.error&&denied.stderr.includes('42501')&&denied.stderr.includes('permission denied');
  }
  const forkIdentity=await sql(`SELECT current_user=session_user AND current_user='fixture_caller';
    SELECT bool_and(NOT has_function_privilege(current_user,p.oid,'EXECUTE')) FROM pg_proc p WHERE p.oid IN
      ('http(http_request)'::regprocedure,'http_set_curlopt(text,text)'::regprocedure,'http_reset_curlopt()'::regprocedure,'http_list_curlopt()'::regprocedure);`,'fork','fixture_caller');
  checks.forkActualCallerIdentityAndNoRawPrivilege=forkIdentity.stdout.trim()==='t\nt';
  await transfer('stock','/MIP_SYNTHETIC_URI');
  const log=fs.readFileSync('/tmp/server.log','utf8');
  checks.stockDebug2HeaderMarkerPresent=log.includes(`pgsql-http: optional request header 'Authorization: ${AUTH}'`)&&log.includes(`pgsql-http: optional request header 'X-Synthetic-Secret: ${SECRET}'`);
  checks.stockDebug2UserpwdMarkerPresent=log.includes(`pgsql-http: set 'CURLOPT_USERPWD' to value '${USER}'`);
  checks.stockDebug2UriMarkerPresent=log.includes("pgsql-http: queried 'https://audit.receiver.test/MIP_SYNTHETIC_URI'");
  // Separate fork backend debug capture: its fixed messages omit request material.
  const logOffset=fs.readFileSync('/tmp/server.log','utf8').length;
  const forkdebug=await sql(settings('fork')+`SET client_min_messages=debug2; SELECT fixture_try(${request('/fork-privacy')});`,'fork');
  checks.forkClientDebug2SyntheticMarkersAbsent=![AUTH,COOKIE,SECRET,BODY].some(x=>forkdebug.stderr.includes(x));
  const forkServerSegment=fs.readFileSync('/tmp/server.log','utf8').slice(logOffset);
  checks.forkServerDebug2FixedCompletionObserved=forkServerSegment.includes('pgsql-http: request completed');
  checks.forkServerDebug2ThisRequestMarkersAbsent=![AUTH,COOKIE,SECRET,BODY].some(x=>forkServerSegment.includes(x));
  const before=wire.length;
  for(const uri of ['http://audit.receiver.test/good','https://127.0.0.1/good','https://audit.receiver.test:443/good']){
    const r=await transfer('fork','/policy',{url:uri});checks['forkInitialRefusal:'+uri]=!r.ok;
  }
  checks.forkInitialPolicyNoWire=wire.length===before;
  const caForbidden=await sql("SELECT http_set_curlopt('CURLOPT_CAINFO','/tmp/ca.pem');",'fork','fixture_bootstrap',true);
  checks.forkForbiddenCaPath=caForbidden.error&&caForbidden.stderr.includes('mip_http_curl_option_refused');
  for(const opt of ['CURLOPT_SSL_VERIFYPEER','CURLOPT_SSL_VERIFYHOST','CURLOPT_PROXY','CURLOPT_USERPWD']){
    const r=await sql(`SELECT http_set_curlopt(${quote(opt)},'0');`,'fork','fixture_bootstrap',true);checks['forkFixedOptionRefused:'+opt]=r.error;
  }
  const finalLog=fs.readFileSync('/tmp/server.log','utf8');
  checks.noServerCrashOrSanitizerDiagnostics=!/terminated by signal|AddressSanitizer|UndefinedBehaviorSanitizer|DEADLYSIGNAL|runtime error:/.test(finalLog);
  await exec('/runtime/pg/bin/pg_ctl',['-D','/tmp/data','-m','fast','-w','stop']);started=false;
  console.log(JSON.stringify({checks,total:Object.keys(checks).length,allChecksPassed:Object.values(checks).every(Boolean),
    outcomes,wire,actualHttpExecuted:true,curlForkHttpExecuted:true,curlStockHttpExecuted:true,
    postgresStopped:true,wireRequestCount:wire.length,
    limits:{responseBodyTestBytes:65537,responseHeaderTestBytes:70000,fixtureTimeoutMs:15000,requestTimeoutMs:1200,cancelMs:100},
    limitations:['synthetic transport only; no receiver database commitment claim','exact staged linked curl only; no managed provider or vendor-backport claim',
      '65,537-byte responses characterize bounded differences without unbounded memory load','connection/DNS/TLS-session cache internals are not exhaustively inspected',
      'Fork marker absence covers client DEBUG2 and one successful request server-log segment; full server/collector custody remains unqualified',
      'DEBUG2 marker evidence concerns dummy fixture material; real log capture/custody remains unqualified','ordinary exception cleanup and callback cancellation are separate boundaries',
      'Protected wrapper suppresses client DEBUG2 and stores dummy credentials in a private table; server DEBUG2 still emits header markers in this deliberate fixture configuration',
      'wrapper ACL qualification is synthetic; managed role/extension custody and exhaustive alternate wrapper reachability are not established']}));
} catch(error) {
  console.log(JSON.stringify({checks,total:Object.keys(checks).length,allChecksPassed:false,status:'FAILED',
    failure:String(error),stderr:error.stderr?.slice(-3000),wire,actualHttpExecuted:wire.length>0,
    serverLog:fs.existsSync('/tmp/server.log')?fs.readFileSync('/tmp/server.log','utf8').slice(-12000):'',
    curlForkHttpExecuted:Boolean(checks.forkChainAndNameSuccess),curlStockHttpExecuted:Boolean(checks.stockChainAndNameSuccess)}));
} finally {
  if(started)try{await exec('/runtime/pg/bin/pg_ctl',['-D','/tmp/data','-m','immediate','-w','stop']);}catch{}
  for(const server of servers){server.closeAllConnections();server.close();}
}
