#!/usr/bin/env python3
"""Explicit isolated original009 qualification; never production/managed authority.

Exact009 is run without byte substitutions. Its dblink extension is deliberately
a qualification shim: only the logger's fixed INSERT grammar is accepted, then
sent by the complete actual curl fork over verified HTTPS to official PostgREST.
"""
import argparse, base64, difflib, hashlib, hmac, json, os, pathlib, re, shutil, subprocess, sys, time, uuid
sys.dont_write_bytecode = True

HERE = pathlib.Path(__file__).resolve().parent
IMAGE = 'postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
ORIGINAL_SHA = '2b782d7d1698f165173ce6f3129e2fb0f02869956a0401d03922a7c3edcf4765'
FORK_SHA = '2082cadc2e31ada55db1ea06759c0e05cbef6847127b9c0df85eb395abfb4741'
HISTORICAL_COMMIT = '948f83d050ec6b15badd9aa96d867e2840e54840'
HISTORICAL_PATH = 'supabase/qualification/mip-cutover-authority/009_factual_enforcement.sql'
HISTORICAL_BLOB = '60e6198c3ad389c335dfe56024153a187f30f0a4'

def sha(path): return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
def literal(value): return "'" + str(value).replace("'", "''") + "'"

def checkout_identity(source_path):
 """Sample the harness's checkout, never the process's unrelated current dir.

 HEAD/tree identify committed history. Status and input hashes separately
 identify executed working-tree bytes; a dirty checkout is never called pristine.
 Missing Git provenance fails before any runtime starts.
 """
 path=pathlib.Path(source_path).resolve()
 def git(*args):
  result=subprocess.run(['git','-C',str(path.parent if path.is_file() else path),*args],
   text=True,capture_output=True,check=True)
  return result.stdout.rstrip('\n')
 head=git('rev-parse','HEAD')
 status=git('status','--porcelain=v1','--untracked-files=all')
 return {'root':git('rev-parse','--show-toplevel'),'headCommit':head,
  'committedTree':git('rev-parse',head+'^{tree}'),
  'parents':git('show','-s','--format=%P',head).split(),
  'dirty':bool(status),'porcelainStatus':status.splitlines()}

def source_input_manifest(paths,checkout_root):
 """Hash compilation/runtime source inputs, including external historical input."""
 root=pathlib.Path(checkout_root).resolve();result={}
 for path in paths:
  path=pathlib.Path(path).resolve();data=path.read_bytes()
  try:key='checkout:'+path.relative_to(root).as_posix()
  except ValueError:key='external:'+path.as_posix()
  result[key]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
 return result

def main():
 p = argparse.ArgumentParser()
 p.add_argument('--evidence', required=True)
 p.add_argument('--pg-prefix', default='/workspace/mip-qik-architecture-20261012-evidence/tooling/pg17')
 p.add_argument('--postgrest-path', default='/workspace/mip-qik-http-adapter-20261012-evidence/tooling/postgrest')
 p.add_argument('--historical-source', default=str(HERE/'original009_factual_enforcement.sql'))
 a=p.parse_args();evidence=pathlib.Path(a.evidence).resolve();evidence.mkdir(parents=True,exist_ok=True)
 if not str(evidence).startswith('/workspace/'): raise SystemExit('workspace evidence required')
 stage=evidence/'owned-stage';stage.mkdir(exist_ok=False)
 inputs=evidence/'inputs';inputs.mkdir()
 for path in HERE.glob('*'):
  if path.is_file():shutil.copy2(path,inputs/path.name)
 receipt={'scope':'ISOLATED_FULL_ORIGINAL009_WITH_EXPLICIT_HTTP_TRANSPORT_SHIM', 'status':'FAILED',
 'allChecksPassed':False,
 'actualHttpExecuted':False,'postgrestHttpExecuted':False,'curlForkHttpExecuted':False,'originalTriggerExecuted':False,
 'providerQualified':False,'durableCommitQualified':False,'productionAuthorized':False,'qikExecuted':False,'liveReady':False,
 'hold':'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD','checks':{},'events':[], 'failedRuns':[],
 'historicalSourceCommit':HISTORICAL_COMMIT,'historicalSourcePath':HISTORICAL_PATH,
 'historicalSourceBlob':HISTORICAL_BLOB,
 'limitations':['synthetic dependency schemas/fences/roles, not compiled installed source',
 'synthetic dblink extension routes only original logger fixed INSERT to HTTP',
 'qualification sender admits response shape only; unchanged production sender retains fail-closed gate',
 'container-local DNS/dummy TLS/bearer; no provider credential/key/DNS custody or power-loss claim']}
 container='mip-original009-'+uuid.uuid4().hex[:12];created=False;pg_started=False
 def run(args, sql=None, timeout=30, check=True):
  result=subprocess.run([str(x) for x in args],input=sql,text=True,capture_output=True,timeout=timeout)
  if check and result.returncode: raise RuntimeError(result.stderr[-2500:] or result.stdout[-2500:])
  return result
 def dx(args,sql=None,timeout=30,check=True):return run(['docker','exec','-i',container,*args],sql,timeout,check)
 def query(sql,role='bootstrap',db='parent',check=True):
  return dx(['/fixture/pg/bin/psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','/run/qik/socket','-U',role,'-d',db],sql,check=check)
 def q(sql,role='bootstrap',db='parent'):return query(sql,role,db).stdout.strip()
 def verify(name,condition):
  receipt['checks'][name]=bool(condition)
  if not condition:raise AssertionError(name)
 def observer(sql):return q(sql,'mip_synthetic_receiver_observer','receiver')
 def all_events():return json.loads(observer("SELECT coalesce(json_agg(e ORDER BY id),'[]') FROM mip_synthetic_receiver.events e;"))
 def rejects(sql,role,expected):
  result=query(sql,role,check=False)
  return result.returncode!=0 and expected in result.stderr
 try:
  verify('original009BytePin',sha(a.historical_source)==ORIGINAL_SHA)
  receipt['sourceCheckout']=checkout_identity(__file__)
  receipt['sourceCommit']=receipt['sourceCheckout']['headCommit']
  receipt['sourceTree']=receipt['sourceCheckout']['committedTree']
  src=HERE.parent/'qik-http-source-proposal-20261007';arch=HERE.parent/'qik-architecture-20261012'
  source_paths=[pathlib.Path(__file__),pathlib.Path(a.historical_source),
   HERE/'original_fixture_dependencies.sql',HERE/'original_transport_shim.sql',
   src/'003_ack_contract.sql',src/'002_http_transport_proposal.sql',
   src/'src/http-bounded-response.c',src/'tests/component_support.py',
   arch/'strict_header_parser.c',arch/'receiver_fixture.sql',arch/'http_receiver_adapter.sql']
  receipt['sourceInputs']=source_input_manifest(source_paths,receipt['sourceCheckout']['root'])
  for path in source_paths:
   path=path.resolve()
   try:target=inputs/'source'/path.relative_to(receipt['sourceCheckout']['root'])
   except ValueError:target=inputs/'source/external-historical'/path.name
   target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
  historical=subprocess.run(['git','-C',receipt['sourceCheckout']['root'],'cat-file','blob',
   HISTORICAL_COMMIT+':'+HISTORICAL_PATH],capture_output=True)
  receipt['historicalGitObjectVerified']=historical.returncode==0 and hashlib.sha256(historical.stdout).hexdigest()==ORIGINAL_SHA
  receipt['original009Sha256']=sha(a.historical_source)
  receipt['harnessSha256']=sha(__file__)
  prefix=pathlib.Path(a.pg_prefix).resolve()
  verify('pg17Pin','17.11' in run([prefix/'bin/postgres','--version']).stdout)
  verify('postgrestPin',run([a.postgrest_path,'--version']).stdout.strip()=='PostgREST 13.0.7')
  shutil.copytree(prefix,stage/'pg');shutil.copy2(a.postgrest_path,stage/'postgrest')
  node=pathlib.Path(shutil.which('node')).resolve();shutil.copy2(node,stage/'node')
  dummy_secret='qualification-only-dummy-jwt-secret-20261012'
  def b64(value):return base64.urlsafe_b64encode(value).decode().rstrip('=')
  jwt_parts=[b64(json.dumps({'alg':'HS256','typ':'JWT'}).encode()),b64(json.dumps({'role':'mip_synthetic_http_caller','exp':int(time.time())+3600}).encode())]
  jwt_message='.'.join(jwt_parts);dummy_token=jwt_message+'.'+b64(hmac.new(dummy_secret.encode(),jwt_message.encode(),hashlib.sha256).digest())
  original=(src/'src/http-bounded-response.c').read_text()
  verify('fullForkBytePin',hashlib.sha256(original.encode()).hexdigest()==FORK_SHA)
  sys.path.insert(0,str(src/'tests'));from component_support import function
  assembled=original.replace(function(original,'header_string_to_array'),(arch/'strict_header_parser.c').read_text().strip())
  assembled=assembled.replace(function(assembled,'string_info_remove_cr'),'')
  assembled=assembled.replace('\t\tstring_info_remove_cr(&si_headers);','\t\t/* Strict parser consumes original bytes. */')
  c=stage/'complete-fork.c';c.write_text(assembled)
  shutil.copy2(c,inputs/'complete-fork.c')
  (evidence/'strict-parser-substitution.patch').write_text(''.join(difflib.unified_diff(original.splitlines(True),assembled.splitlines(True),fromfile='a/http-bounded-response.c',tofile='b/http-bounded-response.c')))
  receipt['forkSha256']=sha(c);receipt['baselineForkSha256']=FORK_SHA
  include=run([prefix/'bin/pg_config','--includedir-server']).stdout.strip()
  run(['gcc','-shared','-fPIC','-O1','-g','-Wall','-Wextra','-I'+include,'-I'+str(prefix/'include'),c,'-lcurl','-o',stage/'http.so'])
  libs=stage/'libs';libs.mkdir()
  # Stage full dynamic dependency closure, read-only, without host installation.
  for binary in [stage/'http.so',node,*[prefix/'bin'/n for n in ['postgres','initdb','pg_ctl','psql']]]:
   output=run(['ldd',binary]).stdout
   for path in re.findall(r'(/[\w/+.\-]+)',output):
    dep=pathlib.Path(path)
    if dep.is_file() and not (libs/dep.name).exists():shutil.copy2(dep,libs/dep.name)
  receipt['runtimePins']={'imageDigest':IMAGE,'imageId':run(['docker','image','inspect',IMAGE,'--format','{{.Id}}']).stdout.strip(),
   'postgresSha256':sha(stage/'pg/bin/postgres'),'postgrestSha256':sha(stage/'postgrest'),'nodeSha256':sha(stage/'node'),
   'forkSoSha256':sha(stage/'http.so'),'linkedLibraries':{f.name:sha(f) for f in sorted(libs.iterdir())}}
  ext=stage/'pg/share/postgresql/extension'
  (ext/'http.control').write_text("default_version='qualification'\nrelocatable=true\n")
  (ext/'http--qualification.sql').write_text("""CREATE TYPE http_header AS(field text,value text);
CREATE TYPE http_request AS(method text,uri text,headers http_header[],content_type text,content text);
CREATE TYPE http_response AS(status integer,content_type text,headers http_header[],content text);
CREATE FUNCTION http(http_request) RETURNS http_response AS '/fixture/http.so','http_request' LANGUAGE C STRICT;
CREATE FUNCTION http_set_curlopt(varchar,varchar) RETURNS boolean AS '/fixture/http.so','http_set_curlopt' LANGUAGE C STRICT;
CREATE FUNCTION http_reset_curlopt() RETURNS boolean AS '/fixture/http.so','http_reset_curlopt' LANGUAGE C;
""")
  (ext/'dblink.control').write_text("default_version='qualification'\nrelocatable=true\n")
  (ext/'dblink--qualification.sql').write_text("CREATE FUNCTION dblink_exec(text,text) RETURNS text LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'qualification_shim_not_initialized';END $$;\n")
  trust=stage/'trust';trust.mkdir();tls=stage/'tls';tls.mkdir()
  run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',tls/'ca.key','-out',tls/'ca.pem','-days','1','-subj','/CN=Qualification Dummy CA'])
  run(['openssl','req','-newkey','rsa:2048','-nodes','-keyout',tls/'server.key','-out',tls/'server.csr','-subj','/CN=audit.receiver.test'])
  (tls/'extensions').write_text('subjectAltName=DNS:audit.receiver.test\nextendedKeyUsage=serverAuth\n')
  run(['openssl','x509','-req','-in',tls/'server.csr','-CA',tls/'ca.pem','-CAkey',tls/'ca.key','-CAcreateserial','-out',tls/'server.pem','-days','1','-extfile',tls/'extensions'])
  ca_name=sha(tls/'ca.pem')+'.pem';shutil.copy2(tls/'ca.pem',trust/ca_name)
  (stage/'passwd').write_text('root:x:0:0:root:/root:/bin/sh\nqualification:x:'+str(os.getuid())+':'+str(os.getgid())+':fixture:/run/qik:/bin/sh\n')
  (stage/'group').write_text('root:x:0:\nqualification:x:'+str(os.getgid())+':\n')
  for key in tls.glob('*.key'):key.chmod(0o600)
  receipt['dummyCaSha256']=ca_name[:-4]
  relay=stage/'relay.mjs';relay.write_text("""import https from 'node:https';import http from 'node:http';import fs from 'node:fs';
let requests=0;
const read=(path,fallback)=>{try{return fs.readFileSync(path,'utf8').trim();}catch{return fallback;}};
https.createServer({key:fs.readFileSync('/fixture/tls/server.key'),cert:fs.readFileSync('/fixture/tls/server.pem')},(req,res)=>{
 fs.writeFileSync('/run/qik/https-count',String(++requests));
 const mode=read('/run/qik/relay-mode','normal');
 if(mode==='drop-before'){req.resume();res.destroy();return;}
 const out=http.request({host:'127.0.0.1',port:3000,path:req.url,method:req.method,headers:req.headers},r=>{
  if(mode==='hold-after'||mode==='withhold-after'){
   r.resume();r.on('end',()=>{
    fs.writeFileSync('/run/qik/relay-committed',String(requests));
    if(mode==='hold-after'){
     const wait=setInterval(()=>{const action=read('/run/qik/relay-action','wait');
      if(action==='drop'){clearInterval(wait);res.destroy();}
      else if(action==='release'){clearInterval(wait);res.writeHead(r.statusCode,r.rawHeaders);res.end();}
     },10);res.on('close',()=>clearInterval(wait));
    }
   });return;
  }
  res.writeHead(r.statusCode,r.rawHeaders);r.pipe(res);
 });out.on('error',()=>{res.destroy();});req.pipe(out);
}).listen(443,'127.0.0.1');
setInterval(()=>{},10000);
""")
  shutil.copy2(relay,inputs/'relay.mjs')
  (inputs/'manifest.json').write_text(json.dumps({f.name:sha(f) for f in inputs.iterdir() if f.is_file()},indent=2)+'\n')
  run(['docker','create','--name',container,'--pull=never','--network=none','--read-only','--user',str(os.getuid())+':'+str(os.getgid()),'--cap-drop=ALL','--security-opt','no-new-privileges','--cpus','2','--memory','1g','--pids-limit','128','--add-host','audit.receiver.test:127.0.0.1','--mount','type=bind,src='+str(stage)+',dst=/fixture,readonly','--mount','type=bind,src='+str(trust)+',dst=/mip/trust,readonly','--mount','type=bind,src='+str(stage/'passwd')+',dst=/etc/passwd,readonly','--mount','type=bind,src='+str(stage/'group')+',dst=/etc/group,readonly','--mount','type=bind,src='+str(libs/'ld-linux-x86-64.so.2')+',dst=/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2,readonly','--tmpfs','/run/qik:rw,nosuid,nodev,size=512m,mode=1777','--env','LD_LIBRARY_PATH=/fixture/libs','--entrypoint','/bin/sh',IMAGE,'-c','while :; do sleep 30; done'])
  created=True;run(['docker','start',container])
  config=json.loads(run(['docker','inspect',container]).stdout)[0]
  verify('containerNetworkNoneReadonlyNoWritableHostMount',config['HostConfig']['NetworkMode']=='none' and config['HostConfig']['ReadonlyRootfs'] and all(not m['RW'] for m in config['Mounts'] if m['Type']=='bind'))
  verify('namespaceUnprivileged443',dx(['cat','/proc/sys/net/ipv4/ip_unprivileged_port_start']).stdout.strip()=='0')
  verify('runtimeNodeCompatible',dx(['/fixture/node','--version']).returncode==0)
  dx(['mkdir','-p','/run/qik/socket'])
  dx(['/fixture/pg/bin/initdb','-D','/run/qik/data','-U','bootstrap','--no-locale','--encoding=UTF8','--auth=trust'])
  dx(['/bin/sh','-c',"cat >> /run/qik/data/postgresql.conf"],"\nlisten_addresses=''\nunix_socket_directories='/run/qik/socket'\nfsync=on\nsynchronous_commit=on\nfull_page_writes=on\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_error_verbosity='terse'\n")
  dx(['/fixture/pg/bin/pg_ctl','-D','/run/qik/data','-l','/run/qik/pg.log','-w','start']);pg_started=True
  q('CREATE DATABASE parent; CREATE DATABASE receiver;',db='postgres')
  q((arch/'receiver_fixture.sql').read_text(),db='receiver');q((arch/'http_receiver_adapter.sql').read_text(),db='receiver')
  q("ALTER ROLE mip_synthetic_receiver_observer LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; CREATE ROLE qik_authenticator LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; GRANT mip_synthetic_http_caller TO qik_authenticator; REVOKE CONNECT ON DATABASE parent FROM PUBLIC; GRANT CONNECT ON DATABASE parent TO bootstrap;",db='receiver')
  # Authenticator is an actual restricted login; no bootstrap SET ROLE helper.
  conf='db-uri = "postgresql://qik_authenticator@/receiver?host=/run/qik/socket"\ndb-schemas = "mip_synthetic_http"\ndb-anon-role = "mip_synthetic_http_caller"\ndb-tx-end = "commit-allow-override"\njwt-secret = "'+dummy_secret+'"\nserver-host = "127.0.0.1"\nserver-port = 3000\nlog-level = "crit"\n'
  dx(['/bin/sh','-c','cat > /run/qik/postgrest.conf'],conf)
  dx(['/bin/sh','-c','/fixture/postgrest /run/qik/postgrest.conf > /run/qik/postgrest.log 2>&1 & echo $! > /run/qik/postgrest.pid'])
  dx(['/bin/sh','-c','/fixture/node /fixture/relay.mjs > /run/qik/relay.log 2>&1 & echo $! > /run/qik/relay.pid'])
  deadline=time.monotonic()+10
  while True:
   ready=dx(['/fixture/node','-e',"require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"],check=False)
   if ready.returncode==0:break
   if time.monotonic()>deadline:raise RuntimeError('postgrest startup: '+dx(['cat','/run/qik/postgrest.log']).stdout[-1000:])
   time.sleep(.1)
  q('CREATE SCHEMA mip_http_raw; CREATE EXTENSION http WITH SCHEMA mip_http_raw; CREATE ROLE mip_http_kernel NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; CREATE SCHEMA mip_http_transport; GRANT USAGE ON SCHEMA mip_http_transport TO mip_http_kernel;')
  q((src/'003_ack_contract.sql').read_text())
  q((HERE/'original_fixture_dependencies.sql').read_text());q(pathlib.Path(a.historical_source).read_text())
  q('CREATE SCHEMA mip_http_private; GRANT USAGE ON SCHEMA mip_http_private TO mip_http_kernel; CREATE TABLE mip_http_private.endpoint_config(id boolean PRIMARY KEY,endpoint text,qualified_endpoint text,bearer_token text,ca_path text,receiver_binding text,tx_end text,qualified_no_redirect_build boolean,provider_admitted boolean); GRANT SELECT ON mip_http_private.endpoint_config TO mip_http_kernel;')
  q((src/'002_http_transport_proposal.sql').read_text());q((HERE/'original_transport_shim.sql').read_text())
  q("INSERT INTO qik_original_fixture.config VALUES(true,"+literal('/mip/trust/'+ca_name)+','+literal(dummy_token)+",false,false); INSERT INTO mip_http_private.endpoint_config VALUES(true,'https://audit.receiver.test/rpc/append_event','https://audit.receiver.test/rpc/append_event',"+literal(dummy_token)+','+literal('/mip/trust/'+ca_name)+",'sha256:'||repeat('b',64),'commit-allow-override',true,true); INSERT INTO mip_factual.audit_connection VALUES(true,'qualification-original009-http');")
  # The booleans above are private synthetic values, never provider flags.
  q("ALTER ROLE mip_factual_owner_v3 LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; ALTER ROLE mip_factual_reviewer_v3 LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; CREATE ROLE qik_direct LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; GRANT CONNECT ON DATABASE parent TO mip_factual_owner_v3,mip_factual_reviewer_v3,qik_direct; GRANT SELECT,INSERT,UPDATE ON public.explanations TO qik_direct; CREATE POLICY fixture_direct ON public.explanations TO qik_direct USING(true) WITH CHECK(true); CREATE FUNCTION public.fixture_insert(x public.explanations) RETURNS void LANGUAGE sql SECURITY INVOKER AS $$INSERT INTO public.explanations SELECT (x).*;$$; REVOKE ALL ON FUNCTION public.fixture_insert(public.explanations) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fixture_insert(public.explanations) TO qik_direct;")
  source_id=str(uuid.uuid4());q("INSERT INTO public.articles VALUES("+literal(source_id)+",'active','eligible');")
  def row(rule='provenance',published=True):
   return {'id':str(uuid.uuid4()),'assertion_id':str(uuid.uuid4()),'version':1,'is_current':True,'state':'ok','review_status':'published' if published else 'awaiting_review','supporting_passage':'' if rule=='provenance' else 'synthetic passage','falsification_condition':'synthetic falsifier','archived_sources':[{'status':'retained'}],'source_ids':[] if rule=='source_state' else [source_id],'rule_version':'fixture1'}
  def record(x):return "jsonb_populate_record(NULL::public.explanations,"+literal(json.dumps(x))+"::jsonb)"
  def insert(x):return 'INSERT INTO public.explanations SELECT ('+record(x)+').*;'
  def exact(x,rule):
   digest=hashlib.sha256(json.dumps({'assertion_id':x['assertion_id']}).encode()).hexdigest()
   return "explanation_id="+literal(x['id'])+"::uuid AND assertion_digest="+literal(digest)+" AND attempted_transition='published' AND rule="+literal(rule)+" AND receiver_binding=repeat('b',64)"
  def check_attempt(name,sql,x,rule,role='qik_direct'):
   before=all_events();verify(name+'ParentRejects',rejects(sql,role,'mip_factual_rejected_'+rule))
   events=all_events();verify(name+'ExactlyOneNewWholeEvent',len(events)==len(before)+1 and observer('SELECT count(*)=1 FROM mip_synthetic_receiver.events WHERE '+exact(x,rule))=='t')
   verify(name+'ParentRowAbsentOrUnpublished',q("SELECT NOT EXISTS(SELECT 1 FROM public.explanations WHERE id="+literal(x['id'])+" AND review_status='published');")=='t')
   receipt['actualHttpExecuted']=receipt['postgrestHttpExecuted']=receipt['curlForkHttpExecuted']=receipt['originalTriggerExecuted']=True
  x=row();check_attempt('firstOriginalInsert',insert(x),x,'provenance')
  receipt['milestone']='FIRST_ORIGINAL_TRIGGER_ACTUAL_HTTPS_COMMIT_ROLLBACK_PASSED'
  (evidence/'first-milestone.json').write_text(json.dumps(receipt,indent=2)+'\n')
  print(receipt['milestone'],flush=True)
  # Full source stays exact: compare each original function body with catalog.
  original009=pathlib.Path(a.historical_source).read_text()
  for function_name in ['log_rejection','guard_publication','review_publish']:
   text=re.search(r'create function mip_factual\.'+function_name+r'\(.*? as \$\$(.*?)\$\$;',original009,re.S|re.I).group(1)
   verify(function_name+'CatalogBodyExact',q("SELECT prosrc="+literal(text)+" FROM pg_proc WHERE oid="+literal('mip_factual.'+function_name+({'log_rejection':'(jsonb,text)','guard_publication':'()','review_publish':'(uuid,text)'}[function_name]))+"::regprocedure;")=='t')
  verify('actualCurlFunctionExtensionMember',q("SELECT exists(SELECT 1 FROM pg_depend WHERE objid='mip_http_raw.http(mip_http_raw.http_request)'::regprocedure AND refobjid=(SELECT oid FROM pg_extension WHERE extname='http') AND deptype='e');")=='t')
  verify('observerActualLoginNoPrivilegeEscalation',observer("SELECT current_user='mip_synthetic_receiver_observer' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit FROM pg_roles WHERE rolname=current_user;")=='t')
  q('ALTER ROLE mip_synthetic_receiver_writer LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; ALTER ROLE mip_synthetic_http_caller LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;',db='receiver')
  for role in ['mip_synthetic_receiver_writer','mip_synthetic_http_caller','qik_authenticator']:
   for sql in ['SELECT * FROM mip_synthetic_receiver.events;','INSERT INTO mip_synthetic_receiver.events DEFAULT VALUES;',"UPDATE mip_synthetic_receiver.events SET rule='human_review';",'DELETE FROM mip_synthetic_receiver.events;','TRUNCATE mip_synthetic_receiver.events;','SET ROLE mip_synthetic_receiver_owner;']:
    verify(role+'ReceiverBoundary'+str(len(receipt['checks'])),query(sql,role,'receiver',False).returncode!=0)
  verify('httpCallerCannotInvokeTypedAppend',query("SELECT mip_synthetic_receiver.append_event(gen_random_uuid(),gen_random_uuid(),repeat('a',64),'published','provenance');",'mip_synthetic_http_caller','receiver',False).returncode!=0)
  verify('observerCannotConnectParent',query('SELECT 1','mip_synthetic_receiver_observer',check=False).returncode!=0)
  for sql in ['INSERT INTO mip_synthetic_receiver.events DEFAULT VALUES;',"UPDATE mip_synthetic_receiver.events SET rule='human_review';",'DELETE FROM mip_synthetic_receiver.events;','TRUNCATE mip_synthetic_receiver.events;',"SELECT mip_synthetic_receiver.append_event(gen_random_uuid(),gen_random_uuid(),repeat('a',64),'published','provenance');"]:
   verify('observerDenied'+str(len(receipt['checks'])),query(sql,'mip_synthetic_receiver_observer','receiver',False).returncode!=0)
  for role in ['qik_direct','mip_factual_reviewer_v3','mip_factual_owner_v3']:
   for sql in ['SELECT * FROM qik_original_fixture.config;','SELECT * FROM mip_http_private.endpoint_config;',"SELECT mip_http_raw.http_reset_curlopt();",'SET ROLE mip_http_kernel;']:
    verify(role+'ProtectedBoundary'+str(len(receipt['checks'])),rejects(sql,role,'permission denied'))
  for role in ['qik_direct','mip_factual_owner_v3']:
   for rule in ['provenance','source_state','human_review']:
    for path in ['insert','update','prepared']:
     x=row(rule)
     if path=='update':
      draft={**x,'review_status':'awaiting_review'};q(insert(draft),role)
      sql="UPDATE public.explanations SET review_status='published' WHERE id="+literal(x['id'])+';'
     elif path=='prepared':sql='PREPARE fixture_statement AS '+insert(x)+' EXECUTE fixture_statement;'
     else:sql=insert(x)
     check_attempt(role+path+rule,sql,x,rule,role)
  for rule in ['provenance','source_state','human_review']:
   x=row(rule);check_attempt('invokerWrapper'+rule,'SELECT public.fixture_insert('+record(x)+');',x,rule)
  for role in ['qik_direct','mip_factual_owner_v3']:
   for path in ['copy','merge','onConflict']:
    x=row('provenance')
    if path=='copy':
     fields=['id','assertion_id','version','is_current','state','review_status','supporting_passage','falsification_condition','archived_sources','source_ids','rule_version']
     import csv,io
     buffer=io.StringIO();writer=csv.writer(buffer,lineterminator='\n');values=[x[k] for k in fields]
     values[3]='t';values[8]=json.dumps(values[8]);values[9]='{'+','.join(values[9])+'}'
     writer.writerow(values);sql='COPY public.explanations FROM STDIN WITH CSV;\n'+buffer.getvalue()+'\\.\n'
     before=all_events();verify(role+'CopyDeniedUnderForceRLS',rejects(sql,role,'row-level security'));verify(role+'CopyDeniedNoRemoteEvent',all_events()==before);continue
    elif path=='merge':sql='MERGE INTO public.explanations e USING (SELECT ('+record(x)+').*) s ON e.id=s.id WHEN NOT MATCHED THEN INSERT VALUES(s.*);'
    else:sql=insert(x).rstrip(';')+' ON CONFLICT(id) DO UPDATE SET review_status=excluded.review_status;'
    check_attempt(role+path,sql,x,'provenance',role)
   # Both syntactic INSERT and actually matched UPDATE branches are admitted.
   for path in ['mergeMatchedUpdate','onConflictMatchedUpdate']:
    for rule in ['provenance','source_state','human_review']:
     x=row(rule);draft={**x,'review_status':'awaiting_review'};q(insert(draft),role)
     prior=json.loads(q('SELECT row_to_json(e) FROM public.explanations e WHERE id='+literal(x['id'])+';'))
     if path=='mergeMatchedUpdate':
      sql='MERGE INTO public.explanations e USING (SELECT ('+record(x)+').*) s ON e.id=s.id WHEN MATCHED THEN UPDATE SET review_status=s.review_status;'
     else:
      # The excluded row stays draft so BEFORE INSERT is allowed; only the
      # actually reached DO UPDATE transition invokes publication rejection.
      sql=insert(draft).rstrip(';')+" ON CONFLICT(id) DO UPDATE SET review_status='published';"
     check_attempt(role+path+rule,sql,x,rule,role)
     verify(role+path+rule+'ExactDraftRetained',json.loads(q('SELECT row_to_json(e) FROM public.explanations e WHERE id='+literal(x['id'])+';'))==prior)
     verify(role+path+rule+'HistoryRollback',q('SELECT NOT EXISTS(SELECT 1 FROM mip_factual.explanation_history WHERE explanation_id='+literal(x['id'])+');')=='t')
  for role in ['mip_factual_reviewer_v3','mip_factual_owner_v3']:
   for rule in ['provenance','source_state']:
    x=row(rule,False);q(insert(x));check_attempt(role+'reviewPublish'+rule,'SELECT mip_factual.review_publish('+literal(x['id'])+",'synthetic approval');",x,rule,role)
    verify(role+'reviewRowsRollback'+rule,q('SELECT NOT EXISTS(SELECT 1 FROM mip_factual.human_reviews WHERE explanation_id='+literal(x['id'])+');')=='t')
  verify('reviewerDirectInsertDenied',rejects(insert(row()),'mip_factual_reviewer_v3','permission denied'))
  verify('directReviewPublishDenied',rejects("SELECT mip_factual.review_publish(gen_random_uuid(),'dummy');",'qik_direct','permission denied'))
  before=all_events();x=row('human_review',False);q(insert(x),'qik_direct');q('SELECT mip_factual.review_publish('+literal(x['id'])+",'synthetic approval');",'mip_factual_reviewer_v3')
  verify('eligiblePublishedAndDraftNoAudit',all_events()==before and q('SELECT review_status FROM public.explanations WHERE id='+literal(x['id'])+';')=='published')
  # Mixed multirow statement: first rejection reached retains its audit; all
  # parent rows roll back. It does not claim audit for unreached later rows.
  good=row('human_review',False);bad=row('provenance');sql='INSERT INTO public.explanations SELECT ('+record(good)+').* UNION ALL SELECT ('+record(bad)+').*;'
  check_attempt('mixedMultirow',sql,bad,'provenance');verify('mixedAllowedRowRolledBack',q('SELECT NOT EXISTS(SELECT 1 FROM public.explanations WHERE id='+literal(good['id'])+');')=='t')
  # Strong physical ordering proof: remote exact event is visible to a fresh
  # least-privilege login while parent is blocked after HTTPS ACK before RAISE.
  q('UPDATE qik_original_fixture.config SET barrier=true;')
  lockargs=['docker','exec','-i',container,'/fixture/pg/bin/psql','-X','-q','-A','-t','-h','/run/qik/socket','-U','bootstrap','-d','parent']
  lockproc=subprocess.Popen(lockargs,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  lockproc.stdin.write("SELECT pg_advisory_lock(61012009); SELECT 'locked';\n");lockproc.stdin.flush()
  verify('barrierControlReady',lockproc.stdout.readline().strip()=='')
  verify('barrierControlMarker',lockproc.stdout.readline().strip()=='locked')
  x=row('human_review');parent=subprocess.Popen(lockargs[:-4]+['-U','qik_direct','-d','parent'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  parent.stdin.write(insert(x)+'\n');parent.stdin.close()
  deadline=time.monotonic()+10
  while observer('SELECT count(*) FROM mip_synthetic_receiver.events WHERE '+exact(x,'human_review')+';')!='1':
   if parent.poll() is not None or time.monotonic()>deadline:raise RuntimeError('preRAISE barrier observation unavailable')
   time.sleep(.05)
  barrier_event=json.loads(observer('SELECT row_to_json(e) FROM mip_synthetic_receiver.events e WHERE '+exact(x,'human_review')+';'))
  barrier_pid=q("SELECT pid FROM pg_stat_activity WHERE usename='qik_direct' AND wait_event='advisory';")
  receipt['preRaiseBarrier']={'parentPid':int(barrier_pid),'event':barrier_event,'observedBeforeRaise':True}
  verify('exactCommitBeforeParentRaise',parent.poll() is None and bool(barrier_pid))
  verify('parentUncommittedExplanationInvisibleBeforeRaise',q('SELECT NOT EXISTS(SELECT 1 FROM public.explanations WHERE id='+literal(x['id'])+');')=='t')
  lockproc.stdin.write('SELECT pg_advisory_unlock(61012009);\n');lockproc.stdin.close();lockproc.wait(timeout=5)
  parent.wait(timeout=5);verify('barrierParentRaisesAfterRelease','mip_factual_rejected_human_review' in parent.stderr.read())
  q('UPDATE qik_original_fixture.config SET barrier=false;')
  verify('sameExactEventAfterParentRollback',observer('SELECT count(*)=1 FROM mip_synthetic_receiver.events WHERE id='+literal(barrier_event['id'])+' AND '+exact(x,'human_review')+';')=='t')
  # Production sender is never softened: actual remote event may commit, then
  # immutable gate throws; original logger maps it to original audit_unavailable.
  q('UPDATE qik_original_fixture.config SET use_production_gate=true;');x=row();before=all_events()
  verify('unchangedProductionSenderParentRejects',rejects(insert(x),'qik_direct','mip_audit_unavailable'))
  verify('unchangedProductionSenderActuallyCommittedRemoteEvent',len(all_events())==len(before)+1 and observer('SELECT count(*)=1 FROM mip_synthetic_receiver.events WHERE '+exact(x,'provenance')+';')=='t')
  q('UPDATE qik_original_fixture.config SET use_production_gate=false;')
  # HTTP failure boundaries are deliberate closed-namespace relay actions.
  # A postdispatch parent error cannot establish receiver absence; observe the
  # exact independently generated event before classifying local synthetic fate.
  receipt['failureObservations']=[]
  def relay_mode(mode,action='wait'):
   dx(['/bin/sh','-c','cat > /run/qik/relay-mode'],mode)
   dx(['/bin/sh','-c','cat > /run/qik/relay-action'],action)
  def async_attempt(x):
   args=['docker','exec','-i',container,'/fixture/pg/bin/psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','/run/qik/socket','-U','qik_direct','-d','parent']
   proc=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   proc.stdin.write(insert(x)+'\n');proc.stdin.close();return proc
  def wait_remote(x,rule):
   deadline=time.monotonic()+5
   while observer('SELECT count(*) FROM mip_synthetic_receiver.events WHERE '+exact(x,rule)+';')!='1':
    if time.monotonic()>deadline:raise RuntimeError('failure exact remote observation timeout')
    time.sleep(.03)
   return json.loads(observer('SELECT row_to_json(e) FROM mip_synthetic_receiver.events e WHERE '+exact(x,rule)+';'))
  # Cancel while the EXACT original collector fence prevents dispatch. The
  # genuine parent backend is lock-blocked before log_rejection is reached.
  fenceproc=subprocess.Popen(lockargs,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  fenceproc.stdin.write("BEGIN; SELECT 'fence-locked' FROM mip_identity.collector_fence WHERE id FOR UPDATE;\n");fenceproc.stdin.flush()
  verify('predispatchFenceControlReady',fenceproc.stdout.readline().strip()=='fence-locked')
  x=row();before=all_events();requests_before=int(dx(['cat','/run/qik/https-count']).stdout.strip());proc=async_attempt(x)
  deadline=time.monotonic()+5;pid=''
  while not pid:
   pid=q("SELECT pid FROM pg_stat_activity WHERE usename='qik_direct' AND wait_event_type='Lock';")
   if time.monotonic()>deadline:raise RuntimeError('original collector fence parent not blocked')
   if not pid:time.sleep(.03)
  verify('predispatchCancelAccepted',q('SELECT pg_cancel_backend('+pid+');')=='t')
  proc.wait(timeout=5);error=proc.stderr.read();verify('predispatchCancel57014',proc.returncode!=0 and '57014' in error)
  verify('predispatchCancelNoActualHttps',int(dx(['cat','/run/qik/https-count']).stdout.strip())==requests_before)
  verify('predispatchCancelExactEventAbsent',all_events()==before and observer('SELECT NOT EXISTS(SELECT 1 FROM mip_synthetic_receiver.events WHERE '+exact(x,'provenance')+');')=='t')
  verify('predispatchCancelParentRollback',q('SELECT NOT EXISTS(SELECT 1 FROM public.explanations WHERE id='+literal(x['id'])+');')=='t')
  fenceproc.stdin.write('ROLLBACK;\n');fenceproc.stdin.close();fenceproc.wait(timeout=5)
  receipt['failureObservations'].append({'case':'original-fence-predispatch-cancel','parentPid':int(pid),'sqlstate':'57014','httpsDispatched':False,'receiverOutcome':'ABSENT_BY_EXACT_OBSERVER'})
  # A real HTTP request reaches PostgREST but SQL append permission is denied.
  # The five-field event cannot commit and original audit failure rejects parent.
  q('REVOKE EXECUTE ON FUNCTION mip_synthetic_receiver.append_event(uuid,uuid,text,text,text) FROM mip_synthetic_receiver_writer;',db='receiver')
  x=row();before=all_events();requests_before=int(dx(['cat','/run/qik/https-count']).stdout.strip())
  verify('receiverSqlPermissionFailureParentUnavailable',rejects(insert(x),'qik_direct','mip_audit_unavailable'))
  verify('receiverSqlPermissionFailureActualHttps',int(dx(['cat','/run/qik/https-count']).stdout.strip())==requests_before+1)
  verify('receiverSqlPermissionFailureNoExactEvent',all_events()==before and observer('SELECT NOT EXISTS(SELECT 1 FROM mip_synthetic_receiver.events WHERE '+exact(x,'provenance')+');')=='t')
  verify('receiverSqlPermissionFailureParentRollback',q('SELECT NOT EXISTS(SELECT 1 FROM public.explanations WHERE id='+literal(x['id'])+');')=='t')
  q('GRANT EXECUTE ON FUNCTION mip_synthetic_receiver.append_event(uuid,uuid,text,text,text) TO mip_synthetic_receiver_writer;',db='receiver')
  receipt['failureObservations'].append({'case':'receiver-sql-permission-failure','sqlstate':'P0001','httpsDispatched':True,'receiverOutcome':'ABSENT_BY_EXACT_OBSERVER','parentRejected':True})
  relay_mode('drop-before');x=row();before=all_events()
  verify('beforeForwardDropParentRejects',rejects(insert(x),'qik_direct','mip_audit_unavailable'))
  verify('beforeForwardDropNoEvent',all_events()==before)
  receipt['failureObservations'].append({'case':'relay-drop-before-forward','receiverOutcome':'ABSENT_BY_EXACT_OBSERVER','parentRejected':True})
  for failure in ['lostAck','timeout','parentCancel','parentTerminate']:
   relay_mode('withhold-after' if failure=='timeout' else 'hold-after');x=row();proc=async_attempt(x)
   event=wait_remote(x,'provenance');verify(failure+'ExactRemoteCommitBeforeFailure',proc.poll() is None)
   if failure=='lostAck':dx(['/bin/sh','-c','cat > /run/qik/relay-action'],'drop')
   elif failure in ['parentCancel','parentTerminate']:
    pid=q("SELECT pid FROM pg_stat_activity WHERE usename='qik_direct' AND state='active';")
    verify(failure+'ParentBackendIdentified',bool(pid))
    verify(failure+'SignalAccepted',q('SELECT '+('pg_cancel_backend' if failure=='parentCancel' else 'pg_terminate_backend')+'('+pid+');')=='t')
   proc.wait(timeout=10);error=proc.stderr.read()
   if failure=='parentCancel':
    verify(failure+'OriginalCancellationBoundary',proc.returncode!=0 and '57014' in error)
   elif failure=='parentTerminate':verify(failure+'DisconnectBoundary',proc.returncode!=0 and ('57P01' in error or 'server closed the connection' in error))
   else:verify(failure+'ParentUnavailableBoundary',proc.returncode!=0 and 'P0001' in error and 'mip_audit_unavailable' in error)
   verify(failure+'ParentRowRolledBack',q('SELECT NOT EXISTS(SELECT 1 FROM public.explanations WHERE id='+literal(x['id'])+');')=='t')
   verify(failure+'SameExactEventRetained',observer('SELECT count(*)=1 FROM mip_synthetic_receiver.events WHERE id='+literal(event['id'])+' AND '+exact(x,'provenance')+';')=='t')
   receipt['failureObservations'].append({'case':failure,'remoteOutcomeAtSenderFailure':'UNKNOWN_WITHOUT_OBSERVATION','receiverOutcome':'COMMITTED_BY_EXACT_SYNTHETIC_OBSERVER','event':event,'automaticRetry':False,'parentRejectedOrDisconnected':True,'sqlstate':re.search(r'(?:ERROR|FATAL):\s+([A-Z0-9]{5}):',error).group(1) if re.search(r'(?:ERROR|FATAL):\s+([A-Z0-9]{5}):',error) else 'disconnect'})
   relay_mode('normal')
  # Concrete audit predispatch failure remains parent rejection with no event.
  q("UPDATE mip_factual.audit_connection SET connection_string='wrong-fixture-route';");x=row();before=all_events()
  verify('auditFailureParentRejects',rejects(insert(x),'qik_direct','mip_audit_unavailable'));verify('auditFailureNoRemoteEvent',all_events()==before)
  q("UPDATE mip_factual.audit_connection SET connection_string='qualification-original009-http';")
  receipt['events']=all_events();verify('receiverNoParentForeignKey',observer("SELECT NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='mip_synthetic_receiver.events'::regclass AND contype='f');")=='t')
  # Save effective runtime grants/membership expectations as genuine fixture
  # catalog evidence; neither this nor its role matrix claims current live ACLs.
  receipt['fixtureRoles']=json.loads(q("SELECT json_agg(r) FROM (SELECT rolname,rolsuper,rolinherit,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('qik_direct','mip_factual_owner_v3','mip_factual_reviewer_v3','mip_http_kernel','qik_authenticator','mip_synthetic_receiver_observer')) r;"))
  receipt['fixtureMemberships']=json.loads(q("SELECT coalesce(json_agg(r),'[]') FROM (SELECT roleid::regrole::text role,member::regrole::text member FROM pg_auth_members) r;"))
  dx(['/fixture/pg/bin/pg_ctl','-D','/run/qik/data','-m','fast','-w','stop']);pg_started=False
  dx(['/fixture/pg/bin/pg_ctl','-D','/run/qik/data','-l','/run/qik/pg.log','-w','start']);pg_started=True
  verify('allExactHttpEventsSurviveCleanRestart',all_events()==receipt['events'])
  dx(['/fixture/pg/bin/pg_ctl','-D','/run/qik/data','-m','immediate','-w','stop']);pg_started=False
  dx(['/fixture/pg/bin/pg_ctl','-D','/run/qik/data','-l','/run/qik/pg.log','-w','start']);pg_started=True
  verify('allExactHttpEventsSurviveImmediatePgCrashRecovery',all_events()==receipt['events'])
  receipt.update(status='PASSED_SYNTHETIC_ORIGINAL_TRIGGER_COMPOSITION',total=len(receipt['checks']),allChecksPassed=True,cleanRestartQualified=True,localPgCrashRecoveryQualified=True)
 except Exception as error:
  # Synthetic errors only; do not store SQL/token/key/error-context dumps.
  receipt['failureClass']=type(error).__name__;receipt['failureSummary']=str(error).replace(locals().get('dummy_token','qualification-dummy-only'),'[dummy-redacted]')[:2500]
  print(receipt['failureClass']+': '+receipt['failureSummary'],file=sys.stderr)
 finally:
  if created:
   count=dx(['cat','/run/qik/https-count'],check=False)
   if count.returncode==0:
    receipt['httpsRequests']=int(count.stdout.strip());receipt['actualHttpExecuted']=receipt['curlForkHttpExecuted']=receipt['httpsRequests']>0
   removed=run(['docker','rm','-f',container],check=False);receipt['ownedContainerRemoved']=removed.returncode==0
  else:receipt['ownedContainerRemoved']=True
  # Private synthetic keys are disposable and never retained in evidence.
  shutil.rmtree(stage);receipt['ownedStageRemoved']=not stage.exists()
  receipt['privateTlsFixturesRemoved']=receipt['ownedStageRemoved']
  receipt['loggingAssumptions']={'localOnly':True,'log_statement':'none','log_min_error_statement':'panic','log_error_verbosity':'terse','providerPrivacyQualified':False}
  if 'sourceCheckout' in receipt:
   try:
    receipt['sourceCheckoutAfterRun']=checkout_identity(__file__)
    receipt['sourceInputsAfterRun']=source_input_manifest(source_paths,receipt['sourceCheckout']['root'])
    receipt['sourceUnchangedDuringRun']=receipt['sourceCheckoutAfterRun']==receipt['sourceCheckout'] and receipt['sourceInputsAfterRun']==receipt['sourceInputs']
   except (OSError,subprocess.SubprocessError):receipt['sourceUnchangedDuringRun']=False
   if not receipt['sourceUnchangedDuringRun']:receipt['status']='FAILED_SOURCE_CHANGED';receipt['allChecksPassed']=False
  if not receipt['ownedContainerRemoved'] or not receipt['ownedStageRemoved']:receipt['status']='FAILED_CLEANUP';receipt['allChecksPassed']=False
  (evidence/'original-trigger-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
  print(json.dumps({'status':receipt['status'],'total':len(receipt['checks']),'actualHttpExecuted':receipt['actualHttpExecuted'],'receipt':str(evidence/'original-trigger-receipt.json')}))
 return 0 if receipt['status']=='PASSED_SYNTHETIC_ORIGINAL_TRIGGER_COMPOSITION' and receipt['ownedContainerRemoved'] and receipt['ownedStageRemoved'] else 1

if __name__=='__main__':raise SystemExit(main())
