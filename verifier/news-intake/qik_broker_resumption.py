"""Focused R5 qik-owned journal and fresh-process recovery; source-free only.
Existing intake/comparison qualification is not replayed. SQL and broker paths
run against disposable PostgreSQL; no hosted login or durable host is claimed.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json
import os
import selectors
import subprocess
import time
import uuid
import psycopg
from psycopg.types.json import Jsonb

ROOT = Path("/workspace")
if os.environ.get("MIP_R5_ISOLATION") != "network-none-socket-only":
    raise RuntimeError("isolated invocation required")
if any(k in os.environ for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GITHUB_TOKEN",
                                 "OPENAI_API_KEY", "PGHOST", "PGPASSWORD", "DATABASE_URL")):
    raise RuntimeError("ambient credentials denied")
RUNTIME = "qualification-journal"
IMPL = "qualification:journal-worker-v2"
DB = "mip_r5_journal"
connections = []
def connect(role=None):
    db = psycopg.connect(dbname=DB, user="postgres", host="/var/run/postgresql", autocommit=True)
    connections.append(db)
    db.execute("set statement_timeout='10s';set lock_timeout='3s'")
    if role:
        assert role in {"mip_comparison_worker_v1", "mip_comparison_producer_v1",
                        "mip_cutover_schema_owner_v1", "mip_identity_broker_v2", "anon", "authenticated", "service_role"}
        db.execute("set role " + role)
    return db
def one(db, sql, args=()):
    return db.execute(sql, args).fetchone()[0]
def reject(call, code, diagnostic=None):
    try:
        call()
    except psycopg.Error as error:
        assert error.sqlstate == code, "unexpected refusal SQLSTATE"
        if diagnostic is not None:
            assert error.diag.message_primary == diagnostic, "unexpected refusal diagnostic"
        return
    raise AssertionError("expected SQL refusal")
def main():
    owner = connect()
    assert one(owner, "select inet_server_addr() is null and current_database()='mip_r5_journal'")
    owner.execute("create role anon;create role authenticated;create role service_role bypassrls")
    for file in ("contract.sql", "selection.sql", "capability.sql", "source-fixture.sql", "source-snapshot.sql"):
        owner.execute((ROOT / "supabase/qualification/comparison-generations" / file).read_text())
    for file in ("001_execute_only_identities.sql", "002_candidate_interfaces.sql", "003_scoped_queue.sql", "004_publication_staging.sql", "005_broker_sessions.sql", "013_worker_journal.sql", "014_worker_journal_discovery.sql", "015_worker_claim_resumption.sql", "016_worker_broker_recovery.sql"):
        owner.execute((ROOT / "supabase/qualification/mip-cutover-authority" / file).read_text())
    owner.execute("insert into mip_cutover_authority.runtime_config values(%s,'synthetic-source',%s,'{\"entries\":[]}')", (RUNTIME, IMPL))
    one(owner, "select comparison_qualification.bind_source_scope(%s,'synthetic-source')", (RUNTIME,))
    one(owner, "select comparison_qualification.bind_evaluated_implementation(%s,%s)", (RUNTIME, IMPL))
    sessions = {}
    for role, operations in {
        "mip_comparison_producer_v1": ("producer_enqueue",),
        "mip_comparison_worker_v1": ("worker_claim", "worker_complete", "worker_fail", "worker_journal_put", "worker_journal_get", "worker_journal_pending", "worker_resume_claim"),
    }.items():
        for operation in operations:
            one(owner, "select comparison_qualification.bind_runtime(%s,%s,%s)", (RUNTIME, role, operation))

    worker = connect("mip_comparison_worker_v1")
    producer = connect("mip_comparison_producer_v1")
    signatures = {
        "worker_claim": ("p_request", "p_session", "p_runtime"),
        "worker_complete": ("p_request", "p_session", "p_runtime", "p_generation", "p_token", "p_input_hash", "p_implementation", "p_output"),
        "worker_fail": ("p_request", "p_session", "p_runtime", "p_generation", "p_token", "p_input_hash", "p_implementation"),
        "worker_journal_put": ("p_session", "p_runtime", "p_key", "p_entry"),
        "worker_journal_get": ("p_session", "p_runtime", "p_key"),
        "worker_journal_pending": ("p_session", "p_runtime", "p_after", "p_limit"),
        "worker_resume_claim": ("p_session", "p_runtime", "p_key"),
    }
    def rpc(name, args):
        assert name in signatures and set(args) == set(signatures[name])
        values = [Jsonb(args[k]) if isinstance(args[k], dict) else args[k] for k in signatures[name]]
        return one(worker, "select mip_identity." + name + "(" + ",".join(["%s"] * len(values)) + ")", values)
    def child(config, crash=None):
        process = subprocess.Popen(["node", str(ROOT / "verifier/news-intake/qik_host_driver.mjs")],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1, env={"PATH": os.environ.get("PATH", ""), "MIP_R5_ISOLATION": "network-none-socket-only"})
        poll = selectors.DefaultSelector()
        poll.register(process.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + 25
        operations = []
        terminal_key = None
        try:
            process.stdin.write(json.dumps(config) + "\n")
            process.stdin.flush()
            for _ in range(32):
                assert poll.select(max(0, deadline-time.monotonic())), "child timed out"
                line = process.stdout.readline(3*1024*1024)
                assert line.endswith("\n"), "bounded protocol line required"
                message = json.loads(line)
                if "result" in message:
                    process.stdin.close()
                    assert process.wait(timeout=5) == 0
                    return message["result"], operations, terminal_key
                assert message["schema"] == "mip_identity", "host bypassed broker profile"
                operation, args = message["rpc"], message["args"]
                operations.append(operation)
                if operation == "worker_claim" and crash == "before_claim":
                    process.kill();process.wait(timeout=5)
                    return {"state":"killed"},operations,args["p_request"]
                value = rpc(operation, args)
                if operation in {"worker_claim","worker_resume_claim"} and crash == "after_claim":
                    process.kill();process.wait(timeout=5)
                    return {"state":"killed"},operations,value
                if operation == "worker_journal_put" and args["p_entry"].get("operation") in {"worker_complete", "worker_fail"}:
                    terminal_key = args["p_key"]
                    if crash == "before_terminal":
                        process.kill()
                        process.wait(timeout=5)
                        return {"state": "killed"}, operations, terminal_key
                if operation in {"worker_complete", "worker_fail"} and crash == "after_terminal":
                    process.kill()
                    process.wait(timeout=5)
                    return {"state": "killed"}, operations, terminal_key
                process.stdin.write(json.dumps({"result": value}, default=str) + "\n")
                process.stdin.flush()
            raise AssertionError("protocol operation limit")
        finally:
            poll.close()
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()
    # Generate disposable signing material in memory, never files/logs/artifacts.
    pair=json.loads(subprocess.check_output(["node","--input-type=module","-e",
      "import {generateKeyPairSync} from 'node:crypto';const p=generateKeyPairSync('rsa',{modulusLength:2048});process.stdout.write(JSON.stringify({privateKey:p.privateKey.export({type:'pkcs8',format:'pem'}),publicJwk:p.publicKey.export({format:'jwk'})}));"],text=True))
    key_revision=str(uuid.uuid4());issuer="https://qualification.invalid"
    owner.execute("insert into mip_identity.key_versions values(%s,%s,'synthetic',%s,'2000-01-01','2999-01-01','synthetic')",(key_revision,issuer,Jsonb(pair["publicJwk"])))
    owner.execute("insert into mip_identity.key_heads values(%s,'synthetic',%s,true)",(issuer,key_revision))
    mappings={}
    def mapping(role):
        revision=str(uuid.uuid4());mappings[role]=revision
        owner.execute("insert into mip_identity.mapping_versions values(%s,%s,%s,%s,'synthetic-broker',%s,%s,600,'synthetic')",
          (revision,RUNTIME,role,issuer,RUNTIME+":"+role,key_revision))
        owner.execute("insert into mip_identity.mapping_heads values(%s,%s,%s,true) on conflict(runtime,principal) do update set revision=excluded.revision,active=true",(RUNTIME,role,revision))
    for role in ("mip_comparison_worker_v1","mip_comparison_producer_v1"):mapping(role)
    broker=connect("mip_identity_broker_v2")
    def issue(role="mip_comparison_worker_v1"):
        process=subprocess.Popen(["node",str(ROOT/"verifier/news-intake/qik_broker_issue_driver.mjs")],
          stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1,
          env={"PATH":os.environ.get("PATH",""),"MIP_R5_ISOLATION":"network-none-socket-only"})
        poll=selectors.DefaultSelector();poll.register(process.stdout,selectors.EVENT_READ)
        try:
            process.stdin.write(json.dumps({"runtime":RUNTIME,"principal":role,"privateKey":pair["privateKey"]})+"\n");process.stdin.flush()
            for _ in range(3):
                assert poll.select(10),"broker issuance timeout"
                line=process.stdout.readline(65536);assert line.endswith("\n")
                message=json.loads(line)
                if "session" in message:
                    process.stdin.close();assert process.wait(timeout=5)==0
                    return message["session"]
                assert message["broker"] in {"configuration","issue"}
                args=message["args"]
                result=one(broker,"select mip_identity."+message["broker"]+"("+",".join(["%s"]*len(args))+")",args)
                process.stdin.write(json.dumps({"result":result},default=str)+"\n");process.stdin.flush()
            raise AssertionError("broker protocol bound")
        finally:
            poll.close()
            if process.poll() is None:process.kill();process.wait(timeout=5)
            for stream in (process.stdin,process.stdout,process.stderr):stream.close()
    sessions["mip_comparison_producer_v1"]=issue("mip_comparison_producer_v1")
    sid=issue()
    config=lambda session:{"session":session,"runtime":RUNTIME,"implementation":IMPL}
    enqueue=lambda:one(producer,"select mip_identity.producer_enqueue(%s,%s,%s,'{}',null)",(uuid.uuid4(),sessions["mip_comparison_producer_v1"],RUNTIME))
    # Actual broker-issued session plus source-free host resumes a lost native claim.
    generation=enqueue()
    killed,_,original=child(config(sid),"after_claim")
    assert killed["state"]=="killed"
    owner.execute("update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '31 seconds' where generation_id=%s",(generation,))
    fresh=issue()
    started=time.monotonic();resumed,ops,_=child(config(fresh));elapsed=round((time.monotonic()-started)*1000,3)
    assert resumed=={"state":"recovery_required","recovered":1}
    assert "worker_resume_claim" in ops
    assert one(owner,"select attempt from comparison_qualification.jobs where generation_id=%s",(generation,))==2
    # Wrapper journal-get/put exact terminal recovery after lost committed response.
    generation2=enqueue()
    killed,_,_=child(config(fresh),"after_terminal")
    assert killed["state"]=="killed"
    resumed,ops,_=child(config(issue()))
    assert resumed=={"state":"recovery_required","recovered":1} and "worker_journal_get" in ops
    # No alternate direct API or native table path is available to external workers.
    for signature in ("worker_claim(uuid,uuid,text)","worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)",
      "worker_fail(uuid,uuid,text,uuid,uuid,text,text)","worker_journal_put(uuid,text,text,jsonb)",
      "worker_journal_get(uuid,text,text)","worker_journal_pending(uuid,text,text,integer)","worker_resume_claim(uuid,text,text)"):
        assert not one(owner,"select has_function_privilege('mip_comparison_worker_v1',%s,'EXECUTE')",("mip_cutover_authority."+signature,))
    reject(lambda:one(worker,"select mip_cutover_authority.worker_journal_pending(%s,%s,'',20)",(fresh,RUNTIME)),"42501")
    for table in ("worker_journal","lease_owners"):
        reject(lambda:one(worker,"select count(*) from mip_cutover_authority."+table),"42501")
    assert not one(owner,"select has_function_privilege('mip_comparison_worker_v1','mip_identity.configuration(text,text)','EXECUTE')")
    # Unregistered kernel session cannot substitute for verified broker issuance.
    unregistered=one(owner,"select comparison_qualification.issue_session('mip_comparison_worker_v1',%s,clock_timestamp()+interval '10 minutes')",(RUNTIME,))
    reject(lambda:rpc("worker_journal_pending",{"p_session":str(unregistered),"p_runtime":RUNTIME,"p_after":"","p_limit":20}),"P0001","mip_identity_expired")
    # A concurrent mapping revocation waits behind an already-authorized exact
    # resume, then blocks all later calls. No in-flight cancellation is claimed.
    generation3=enqueue()
    killed,_,_=child(config(fresh),"after_claim")
    owner.execute("update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '31 seconds' where generation_id=%s",(generation3,))
    key=one(owner,"select 'worker_claim:'||request_id::text from comparison_qualification.request_runs where generation_id=%s and rpc_name='worker_claim'",(generation3,))
    blocker=connect();blocker.execute("begin")
    blocker.execute("select generation_id from comparison_qualification.jobs where generation_id=%s for update",(generation3,))
    resumer=connect("mip_comparison_worker_v1");resume_pid=one(resumer,"select pg_backend_pid()")
    revoker=connect();revoke_pid=one(revoker,"select pg_backend_pid()")
    def await_blocked(pid):
        deadline=time.monotonic()+2
        while not one(owner,"select cardinality(pg_blocking_pids(%s))>0",(pid,)):
            assert time.monotonic()<deadline,"expected authorization serialization lock"
            time.sleep(0.01)
    with ThreadPoolExecutor(max_workers=2) as pool:
        resuming=pool.submit(lambda:one(resumer,"select mip_identity.worker_resume_claim(%s,%s,%s)",(fresh,RUNTIME,key)))
        await_blocked(resume_pid)
        revoking=pool.submit(lambda:revoker.execute("update mip_identity.mapping_heads set active=false where runtime=%s and principal='mip_comparison_worker_v1'",(RUNTIME,)))
        await_blocked(revoke_pid)
        blocker.execute("commit")
        assert resuming.result(timeout=3)["state"]=="resumed"
        revoking.result(timeout=3)
    reject(lambda:rpc("worker_resume_claim",{"p_session":fresh,"p_runtime":RUNTIME,"p_key":key}),"P0001","mip_identity_mapping_revoked")
    # Mapping replacement invalidates still-unexpired sessions; fresh approval/session works.
    mapping("mip_comparison_worker_v1")
    reject(lambda:rpc("worker_journal_pending",{"p_session":fresh,"p_runtime":RUNTIME,"p_after":"","p_limit":20}),"P0001","mip_identity_stale_revision")
    current=issue()
    owner.execute("update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '61 seconds' where generation_id=%s",(generation3,))
    resumed,_,_=child(config(current))
    assert resumed=={"state":"recovery_required","recovered":1}
    assert rpc("worker_journal_pending",{"p_session":current,"p_runtime":RUNTIME,"p_after":"","p_limit":20})==[]
    # Scope revocation retires the external mapping. Rebinding scope/evaluation alone
    # cannot reactivate it; the exact external mapping must receive fresh approval.
    one(owner,"select comparison_qualification.revoke_source_scope(%s,'synthetic-source')",(RUNTIME,))
    one(owner,"select comparison_qualification.bind_source_scope(%s,'synthetic-source')",(RUNTIME,))
    one(owner,"select comparison_qualification.bind_evaluated_implementation(%s,%s)",(RUNTIME,IMPL))
    reject(lambda:rpc("worker_journal_pending",{"p_session":current,"p_runtime":RUNTIME,"p_after":"","p_limit":20}),"P0001","mip_identity_mapping_revoked")
    mapping("mip_comparison_worker_v1")
    current=issue()
    # Key revocation also blocks the new APIs with no direct-route fallback.
    owner.execute("update mip_identity.key_heads set active=false where issuer=%s and kid='synthetic'",(issuer,))
    for name,args in (
      ("worker_journal_pending",{"p_after":"","p_limit":20}),
      ("worker_journal_get",{"p_key":"worker_claim:"+str(uuid.uuid4())}),
      ("worker_resume_claim",{"p_key":"worker_claim:"+str(uuid.uuid4())}),
      ("worker_journal_put",{"p_key":"worker_claim:"+str(uuid.uuid4()),"p_entry":{}})):
        reject(lambda:rpc(name,{"p_session":current,"p_runtime":RUNTIME,**args}),"P0001","mip_identity_key_revoked")
    assert one(owner,"select count(*) from comparison_qualification.outputs")==3
    assert one(owner,"select count(*) from comparison_qualification.publication_history")==0
    print(json.dumps({"case":"broker_host_native_resume_and_terminal_recovery","status":"PASS","fresh_process_ms":elapsed}),flush=True)
    print(json.dumps({"case":"broker_mapping_key_scope_direct_api_denials","status":"PASS"}),flush=True)
try:
    main()
finally:
    for connection in reversed(connections):connection.close()
