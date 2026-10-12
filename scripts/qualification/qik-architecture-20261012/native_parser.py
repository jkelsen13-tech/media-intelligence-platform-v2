#!/usr/bin/env python3
"""Explicit local qualification only: complete unchanged fork, synthetic bytes.
No curl HTTP entrypoint, remote DSN, token or CA is created.
Optional adapter tests use real loopback PostgREST and explicitly mocked sender transport.
Requires an already acquired, user-owned PG17 prefix inside /workspace.
"""
import argparse, hashlib, json, os, pathlib, subprocess, tempfile

WRAPPER = r'''
PG_FUNCTION_INFO_V1(mip_qualification_parse);
Datum mip_qualification_parse(PG_FUNCTION_ARGS) {
 bytea *input=PG_GETARG_BYTEA_PP(0);
 StringInfoData si;
 initStringInfo(&si);
 if (http_writeback(VARDATA_ANY(input),1,VARSIZE_ANY_EXHDR(input),&si)
     != (size_t)VARSIZE_ANY_EXHDR(input))
  elog(ERROR,"mip_http_response_header_refused");
 string_info_remove_cr(&si);
 PG_RETURN_ARRAYTYPE_P(header_string_to_array(&si));
}
'''

def main():
 p=argparse.ArgumentParser();p.add_argument('--pg-prefix',required=True);p.add_argument('--evidence',required=True);p.add_argument('--strict-candidate',action='store_true');p.add_argument('--sanitize',action='store_true');p.add_argument('--postgrest-path')
 a=p.parse_args();prefix=pathlib.Path(a.pg_prefix).resolve(); evidence=pathlib.Path(a.evidence).resolve()
 if not str(prefix).startswith('/workspace/') or prefix.stat().st_uid!=os.getuid():
  raise SystemExit('local user-owned workspace prefix required')
 env={'PATH':str(prefix/'bin')+':/usr/bin:/bin','LANG':'C','LC_ALL':'C'}
 def run(args,sql=None,timeout=30):
  x=subprocess.run([str(v) for v in args],input=sql,text=True,capture_output=True,env=env,timeout=timeout)
  if x.returncode: raise RuntimeError(x.stderr)
  return x.stdout.strip()
 version=run([prefix/'bin/postgres','--version']);assert ' 17.' in version
 root=pathlib.Path(__file__).resolve().parents[1]/'qik-http-source-proposal-20261007'
 source=(root/'src/http-bounded-response.c').read_bytes()
 original_hash=hashlib.sha256(source).hexdigest()
 assert original_hash=='2082cadc2e31ada55db1ea06759c0e05cbef6847127b9c0df85eb395abfb4741'
 wrapper=WRAPPER
 if a.strict_candidate:
  import sys
  sys.path.insert(0,str(root/'tests'))
  from component_support import function
  s=source.decode()
  s=s.replace(function(s,'header_string_to_array'),pathlib.Path(__file__).with_name('strict_header_parser.c').read_text().strip())
  s=s.replace(function(s,'string_info_remove_cr'),'')
  s=s.replace('\t\tstring_info_remove_cr(&si_headers);','\t\t/* Strict candidate parses original bytes without normalization. */')
  s=s.replace('\t\t/* Strip the carriage-returns, because who cares? */','\t\t/* Admit only the bounded single-block response grammar. */')
  source=s.encode();wrapper=wrapper.replace(' string_info_remove_cr(&si);','')
 evidence.mkdir(parents=True,exist_ok=True)
 if a.strict_candidate:
  import difflib
  evidence.joinpath('strict-candidate-full-fork.c').write_bytes(source)
  evidence.joinpath('strict-candidate.patch').write_text(''.join(difflib.unified_diff(
   (root/'src/http-bounded-response.c').read_text().splitlines(keepends=True),source.decode().splitlines(keepends=True),
   fromfile='a/http-bounded-response.c',tofile='b/http-bounded-response.c')))
 receipt={'scope':'FRESH_LOCAL_PG17_COMPLETE_FORK_PARSER_AND_SYNTHETIC_TRANSACTIONS',
 'postgres':version,'forkSha256':hashlib.sha256(source).hexdigest(),
 'actualHttpExecuted':False,'providerQualified':False,'durableCommitQualified':False,
 'productionAuthorized':False,'qikExecuted':False,'liveReady':False,
 'hold':'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD','status':'FAILED'}
 receipt.update(baselineForkSha256=original_hash,strictCandidate=a.strict_candidate,sanitizers=a.sanitize)
 with tempfile.TemporaryDirectory(prefix='mip-parser-',dir='/tmp') as d:
  work=pathlib.Path(d); data=work/'data';sock=work/'socket';sock.mkdir(mode=0o700)
  c=work/'complete-fork.c';c.write_bytes(source+wrapper.encode());so=work/'http.so'
  receipt['compiledTranslationUnitSha256']=hashlib.sha256(c.read_bytes()).hexdigest()
  receipt['harnessSha256']=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
  include=run([prefix/'bin/pg_config','--includedir-server'])
  sanitizer_flags=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer'] if a.sanitize else []
  run(['gcc','-shared','-fPIC','-O1','-g','-Wall','-Wextra',*sanitizer_flags,'-I'+include,'-I'+str(prefix/'include'),c,'-lcurl','-o',so])
  # Minimal qualification extension gives real type membership required by the
  # unmodified typname_get_tupledesc. No operational HTTP function is exposed.
  ext=prefix/'share/postgresql/extension'; ctl=ext/'http.control';sqlfile=ext/'http--mip_qualification.sql'
  if ctl.exists() or sqlfile.exists(): raise RuntimeError('refuse existing extension file')
  ctl.write_text("default_version = 'mip_qualification'\nrelocatable = true\n")
  sqlfile.write_text("CREATE TYPE http_header AS (field text,value text);\n")
  started=False;parent=None
  try:
   run([prefix/'bin/initdb','-D',data,'--no-locale','--encoding=UTF8','--auth=trust'])
   if a.sanitize:
    env.update(LD_PRELOAD=run(['gcc','-print-file-name=libasan.so']),ASAN_OPTIONS='detect_leaks=0:halt_on_error=1',UBSAN_OPTIONS='halt_on_error=1:print_stacktrace=1')
   with (data/'postgresql.conf').open('a') as f:
    f.write("\nlisten_addresses=''\nunix_socket_directories='"+str(sock)+"'\nfsync=on\nsynchronous_commit=on\nfull_page_writes=on\n")
   run([prefix/'bin/pg_ctl','-D',data,'-l',work/'server.log','-w','start']);started=True
   args=[prefix/'bin/psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',sock,'-d','postgres']
   def query(s):return run(args,s)
   query("CREATE EXTENSION http; CREATE FUNCTION mip_parse(bytea) RETURNS http_header[] AS '"+str(so)+"','mip_qualification_parse' LANGUAGE C STRICT;")
   def parse(b):return json.loads(query("SELECT coalesce(json_agg(h),'[]'::json) FROM unnest(mip_parse(decode('"+b.hex()+"','hex'))) h;"))
   checks={}
   valid=b'HTTP/1.1 201 Created\r\nPreference-Applied: return=minimal, tx=commit\r\n\r\n'
   checks['normalCrlfProducesExactPreference']=parse(valid)==[{'field':'Preference-Applied','value':'return=minimal, tx=commit'}]
   def block(headers):return b'HTTP/1.1 201 Created\r\n'+headers+b'\r\n'
   checks['duplicatesPreserved']=len(parse(valid[:-2]+b'Preference-Applied: tx=commit\r\n\r\n'))==2
   malformed={
    'emptyDuplicate':valid[:-2]+b'Preference-Applied:\r\n\r\n',
    'embeddedCarriageReturn':block(b'Preference-Applied: tx=co\rmmit\r\n'),
    'embeddedNul':valid+b'\0Preference-Applied: tx=rollback\r\n'}
   if a.strict_candidate:
    malformed.update(loneLf=b'HTTP/1.1 201 Created\nX: y\n\n',truncated=valid[:-2],
     secondBlock=valid+valid,badStatus=valid.replace(b'201',b'200'),
     tabValue=block(b'X: \ty\r\n'),badField=block(b'Bad Field: y\r\n'),
     headerCount=block(b'X: y\r\n'*33),oversizeField=block(b'X'*129+b': y\r\n'))
    for name,value in malformed.items():
     try:parse(value);checks[name+'Refused']=False
     except RuntimeError as err:checks[name+'Refused']='mip_http_response_header_refused' in str(err)
    for version in [b'HTTP/2',b'HTTP/3']:
     checks[version.decode()+'Accepted']=len(parse(valid.replace(b'HTTP/1.1',version)))==1
   else:
    checks['emptyDuplicateSilentlyOmitted']=len(parse(malformed['emptyDuplicate']))==1
    checks['embeddedCarriageReturnNormalized']=parse(malformed['embeddedCarriageReturn'])==[{'field':'Preference-Applied','value':'tx=commit'}]
    checks['nulTruncatesLaterHeader']=len(parse(malformed['embeddedNul']))==1
   checks['arrayGrowth']=len(parse(block(b'X-Test: value\r\n'*20)))==20
   checks['8191ByteValueAccepted']=len(parse(block(b'X: '+b'a'*8191+b'\r\n'))[0]['value'])==8191
   try:parse(block(b'X: '+b'a'*8192+b'\r\n'));checks['8192ByteValueRefused']=False
   except RuntimeError as err:checks['8192ByteValueRefused']='mip_http_response_header_refused' in str(err)
   try:parse(b'x'*65537);checks['aggregateBufferRefused']=False
   except RuntimeError as err:checks['aggregateBufferRefused']='mip_http_response_header_refused' in str(err)
   query("CREATE TABLE parent_attempt(id int PRIMARY KEY); CREATE TABLE receiver_event(id int PRIMARY KEY,payload text NOT NULL); INSERT INTO receiver_event VALUES(99,'older');")
   # A separate live session holds the parent's uncommitted synthetic write.
   parent=subprocess.Popen([str(v) for v in args],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
   parent.stdin.write("BEGIN; INSERT INTO parent_attempt VALUES(1); SELECT 'parent-held';\n");parent.stdin.flush()
   import selectors
   sel=selectors.DefaultSelector();sel.register(parent.stdout,selectors.EVENT_READ)
   assert sel.select(timeout=10),'parent readiness timeout'
   assert parent.stdout.readline().strip()=='parent-held';sel.close()
   query("INSERT INTO receiver_event VALUES(1,'exact-event');")
   parent.stdin.write('ROLLBACK;\n');parent.stdin.close();assert parent.wait(timeout=10)==0
   checks['separateCommitSurvivesParentRollback']=query("SELECT (SELECT count(*) FROM parent_attempt)=0 AND (SELECT payload FROM receiver_event WHERE id=1)='exact-event';")=='t'
   query("BEGIN; INSERT INTO receiver_event VALUES(2,'rolled-back'); ROLLBACK;")
   checks['receiverRollbackAbsent']=query('SELECT count(*)=0 FROM receiver_event WHERE id=2;')=='t'
   try:query("INSERT INTO receiver_event VALUES(1,'conflicting');");checks['conflictingDuplicateRefused']=False
   except RuntimeError:checks['conflictingDuplicateRefused']=True
   checks['exactEventNotJustAnyRow']=query("SELECT NOT EXISTS(SELECT 1 FROM receiver_event WHERE id=3 AND payload='exact-event');")=='t'
   receiver_source=pathlib.Path(__file__).with_name('receiver_fixture.sql').read_bytes()
   receipt['receiverFixtureSha256']=hashlib.sha256(receiver_source).hexdigest()
   query(receiver_source.decode())
   event="'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',repeat('a',64),'published','provenance'"
   append="SELECT mip_synthetic_receiver.append_event("+event+");"
   writer="SET ROLE mip_synthetic_receiver_writer; "
   observer="SET ROLE mip_synthetic_receiver_observer; "
   ack=query(writer+append)
   checks['typedAppendReturnsExactIdentity']=json.loads(ack)['id']=='11111111-1111-4111-8111-111111111111'
   checks['sameEventReplayReturnsSamePayload']=query(writer+append)==ack
   def refused(sql,code):
    try:query(sql);return False
    except RuntimeError as err:return code in str(err)
   checks['changedDigestSameEventRefused']=refused(writer+append.replace("repeat('a',64)","repeat('c',64)"),'mip_synthetic_event_conflict')
   checks['changedExplanationSameEventRefused']=refused(writer+append.replace('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'),'mip_synthetic_event_conflict')
   checks['changedRuleSameEventRefused']=refused(writer+append.replace("'provenance'","'human_review'"),'mip_synthetic_event_conflict')
   checks['invalidDigestRefused']=refused(writer+append.replace("repeat('a',64)","'invalid'"),'mip_synthetic_event_refused')
   checks['writerCannotReadAudit']=refused(writer+'SELECT * FROM mip_synthetic_receiver.events;','permission denied')
   checks['writerCannotDirectInsert']=refused(writer+'INSERT INTO mip_synthetic_receiver.events SELECT * FROM mip_synthetic_receiver.events;','permission denied')
   checks['observerCannotAppend']=refused(observer+append,'permission denied')
   checks['ownerCannotMutate']=refused("SET ROLE mip_synthetic_receiver_owner; UPDATE mip_synthetic_receiver.events SET rule='human_review';",'mip_synthetic_event_immutable')
   # UPDATE is denied by FORCE RLS with no update policy; the immutable trigger
   # also protects a privileged synthetic caller that bypasses RLS.
   if not checks['ownerCannotMutate']:
    checks['ownerCannotMutate']=query("SET ROLE mip_synthetic_receiver_owner; UPDATE mip_synthetic_receiver.events SET rule='human_review'; SELECT rule='provenance' FROM mip_synthetic_receiver.events;")=='t'
   checks['privilegedMutationGuard']=refused("UPDATE mip_synthetic_receiver.events SET rule='human_review';",'mip_synthetic_event_immutable')
   checks['truncateGuard']=refused('TRUNCATE mip_synthetic_receiver.events;','mip_synthetic_event_immutable')
   rolled_append=append.replace('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444')
   query('BEGIN; '+writer+rolled_append+'ROLLBACK;')
   checks['ReturnedPayloadIsNotCommitProof']=query(observer+"SELECT NOT EXISTS(SELECT 1 FROM mip_synthetic_receiver.events WHERE id='44444444-4444-4444-8444-444444444444');")=='t'
   checks['observerBindsWholeExactEvent']=query(observer+"SELECT count(*)=1 FROM mip_synthetic_receiver.events WHERE id='11111111-1111-4111-8111-111111111111' AND explanation_id='22222222-2222-4222-8222-222222222222' AND assertion_digest=repeat('a',64) AND attempted_transition='published' AND rule='provenance' AND receiver_binding=repeat('b',64);")=='t'
   if a.postgrest_path:
    postgrest=pathlib.Path(a.postgrest_path).resolve()
    assert str(postgrest).startswith('/workspace/') and postgrest.stat().st_uid==os.getuid()
    from adapter_contract_tests import exercise
    result=exercise(query,work,sock,env,postgrest)
    receipt.update(adapter=result,actualHttpExecuted=True,curlForkHttpExecuted=False)
    for filename in ['http_receiver_adapter.sql','adapter_contract_tests.py']:
     receipt[filename+'Sha256']=hashlib.sha256(pathlib.Path(__file__).with_name(filename).read_bytes()).hexdigest()
   run([prefix/'bin/pg_ctl','-D',data,'-m','fast','-w','stop']);started=False
   run([prefix/'bin/pg_ctl','-D',data,'-l',work/'server.log','-w','start']);started=True
   checks['eventSurvivesCleanLocalRestart']=query("SELECT (SELECT count(*) FROM parent_attempt)=0 AND (SELECT payload FROM receiver_event WHERE id=1)='exact-event';")=='t'
   checks['typedEventSurvivesCleanLocalRestart']=query(observer+"SELECT count(*)=1 FROM mip_synthetic_receiver.events WHERE id='11111111-1111-4111-8111-111111111111' AND assertion_digest=repeat('a',64);")=='t'
   server_log=(work/'server.log').read_text()
   assert 'AddressSanitizer' not in server_log and 'runtime error:' not in server_log
   assert all(checks.values()),checks
   receipt.update(status='STRICT_PARSER_CANDIDATE_PASSED' if a.strict_candidate else 'PASSED_WITH_CONFIRMED_PARSER_LIMITATIONS',checks=checks,total=len(checks),
    limitations=[] if a.strict_candidate else ['empty header fields omitted','embedded CR stripped globally','embedded NUL truncates parser input'],
    commitScope='two local sessions, synthetic typed receiver fixture and clean restart only; no HTTP, authenticated receiver, crash/power-loss or provider durability proof')
  finally:
   if parent and parent.poll() is None:parent.kill();parent.wait(timeout=10)
   if started:run([prefix/'bin/pg_ctl','-D',data,'-m','immediate','-w','stop'])
   ctl.unlink(missing_ok=True);sqlfile.unlink(missing_ok=True)
  receipt['localClusterRemoved']=True
 name=('strict-parser' if a.strict_candidate else 'native-parser')+('-sanitized' if a.sanitize else '')+'-receipt.json'
 evidence.joinpath(name).write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt,sort_keys=True))
if __name__=='__main__':main()
