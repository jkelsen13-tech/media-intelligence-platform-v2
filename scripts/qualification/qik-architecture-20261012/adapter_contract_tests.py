"""Synthetic SQL and real loopback PostgREST tests; no provider/TLS evidence."""
import json, pathlib, socket, subprocess, time, urllib.request, urllib.error


def exercise(query, work, sock, env, postgrest):
 assert subprocess.check_output([str(postgrest),'--version'],env=env,text=True).strip()=='PostgREST 13.0.7'
 root=pathlib.Path(__file__).resolve().parent
 query((root/'http_receiver_adapter.sql').read_text())
 headers={'content-type':'application/json','prefer':'return=minimal, tx=commit'}
 event={'id':'55555555-5555-4555-8555-555555555555','explanation_id':'22222222-2222-4222-8222-222222222222','assertion_digest':'a'*64,'attempted_transition':'published','rule':'provenance'}
 def sql_event(e):return "'"+json.dumps(e).replace("'","''")+"'::jsonb"
 setup="SET ROLE mip_synthetic_http_caller; SELECT set_config('request.method','POST',false); SELECT set_config('request.headers','"+json.dumps(headers)+"',false); "
 call='SELECT mip_synthetic_http.append_event('+sql_event(event)+');'
 checks={}
 checks['adapterVoid201']=query('BEGIN; '+setup+call+"SELECT current_setting('response.status'); ROLLBACK;").splitlines()[-1]=='201'
 checks['adapterReturnThenRollbackNotProof']=query("SELECT count(*)=0 FROM mip_synthetic_receiver.events WHERE id='"+event['id']+"';")=='t'
 def refuses(e,ctx=setup):
  try:query(ctx+'SELECT mip_synthetic_http.append_event('+sql_event(e)+');');return False
  except RuntimeError as err:return 'mip_http_receiver_refused' in str(err)
 for name,e in [('missingKey',{k:v for k,v in event.items() if k!='rule'}),('extraKey',{**event,'commit':True}),('nullId',{**event,'id':None}),('numberId',{**event,'id':1}),('badUuid',{**event,'id':'not-uuid'}),('badDigest',{**event,'assertion_digest':'short'}),('badRule',{**event,'rule':'arbitrary'}),('badTransition',{**event,'attempted_transition':'draft'}),('array',[event])]:checks[name+'Refused']=refuses(e)
 checks['wrongMethodRefused']=refuses(event,setup.replace("'POST'","'GET'"))
 checks['rollbackRequestRefused']=refuses(event,setup.replace('tx=commit','tx=rollback'))
 checks['wrongContentTypeRefused']=refuses(event,setup.replace('application/json','text/plain'))
 checks['unnamedJsonVoidSignature']=query("SELECT proargnames IS NULL AND prorettype='void'::regtype AND prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='mip_synthetic_http.append_event(jsonb)'::regprocedure;")=='t'
 old=root.parent/'qik-http-source-proposal-20261007'
 query((old/'tests/http_contract_fixture.sql').read_text())
 query((old/'003_ack_contract.sql').read_text())
 query((old/'002_http_transport_proposal.sql').read_text())
 query("SELECT http_contract_test.reset_fixture(); SELECT http_contract_test.assert_refusal('mip_http_commit_unqualified',1,3,3);")
 checks['unchangedSenderStillRefusesMockedValidShape']=True
 def shape(status,applied,body):
  prefs='NULL::text[]' if applied is None else "ARRAY['"+applied.replace("'","''")+"']::text[]"
  return query("SELECT mip_http_transport.response_shape_satisfies('commit-allow-override',"+str(status)+','+prefs+",'"+body.replace("'","''")+"');")=='t'
 def count(e):return query("SELECT count(*) FROM mip_synthetic_receiver.events WHERE id='"+e['id']+"';")
 actual_checks={}
 for mode in ['commit-allow-override','rollback-allow-override','rollback','commit']:
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  config=work/('postgrest-'+mode+'.conf')
  config.write_text('db-uri = "postgresql:///postgres?host='+str(sock)+'"\ndb-schemas = "mip_synthetic_http"\ndb-anon-role = "mip_synthetic_http_caller"\ndb-tx-end = "'+mode+'"\nserver-host = "127.0.0.1"\nserver-port = '+str(port)+'\nlog-level = "crit"\n')
  log=(work/('postgrest-'+mode+'.log')).open('w')
  proc=subprocess.Popen([str(postgrest),str(config)],stdout=log,stderr=log,env=env)
  url='http://127.0.0.1:'+str(port)+'/rpc/append_event'
  try:
   deadline=time.monotonic()+10
   while True:
    try:
     with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/',timeout=1):break
    except (OSError,urllib.error.HTTPError):
     if proc.poll() is not None or time.monotonic()>deadline:raise RuntimeError('isolated PostgREST startup failed')
     time.sleep(.1)
   e={**event,'id':{'commit-allow-override':'66666666-6666-4666-8666-666666666666','rollback-allow-override':'77777777-7777-4777-8777-777777777777','rollback':'88888888-8888-4888-8888-888888888888','commit':'99999999-9999-4999-8999-999999999999'}[mode]}
   def request(payload,preferences='return=minimal, tx=commit',method='POST'):
    req=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','Prefer':preferences},method=method)
    try:r=urllib.request.urlopen(req,timeout=5)
    except urllib.error.HTTPError as err:r=err
    with r:return r.status,r.headers.get_all('Preference-Applied'),r.read()
   status,prefs,body=request(e)
   actual_checks[mode+'201Empty']=status==201 and body==b''
   applied=prefs[0] if prefs and len(prefs)==1 else None
   if mode.endswith('allow-override'):
    actual_checks[mode+'ActualShapeAccepted']=shape(status,applied,body.decode())
    actual_checks[mode+'FreshObserverSeesEvent']=count(e)=='1'
   else:
    actual_checks[mode+'MissingAppliedCommitRefused']=not shape(status,applied,body.decode())
    actual_checks[mode+'ActualRowFate']=count(e)==('0' if mode=='rollback' else '1')
   # Replay has the same minimal response; conflicting replay always fails.
   status2,prefs2,body2=request(e)
   actual_checks[mode+'IdenticalReplay201Empty']=status2==201 and body2==b''
   status3,_,body3=request({**e,'assertion_digest':'c'*64})
   if mode!='rollback':actual_checks[mode+'ConflictingReplayRefused']=status3>=400 and b'mip_http_receiver_refused' in body3
   status4,_,_=request({**e,'commit':True})
   actual_checks[mode+'ExtraKeyRefused']=status4>=400
   status5,_,_=request(e,'return=minimal, tx=rollback')
   actual_checks[mode+'ExplicitRollbackRequestRefused']=status5>=400
  finally:
   proc.terminate()
   try:proc.wait(timeout=5)
   except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=5)
   log.close()
 checks.update(actual_checks)
 assert all(checks.values()),checks
 return {'checks':checks,'total':len(checks),'nativeSqlCases':len(checks)-len(actual_checks),'actualPostgrestCases':len(actual_checks),'postgrestHttpExecuted':True,'curlForkHttpExecuted':False,'postgrestScope':'official13.0.7 loopback plaintext HTTP and disposable local PG17; no TLS/provider/real credentials','mockedTransportChecks':['unchangedSenderStillRefusesMockedValidShape'],'postgrestProcessesRemoved':True}
