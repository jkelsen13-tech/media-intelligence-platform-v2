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
                        "mip_cutover_schema_owner_v1", "anon", "authenticated", "service_role"}
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
    for file in ("001_execute_only_identities.sql", "002_candidate_interfaces.sql", "003_scoped_queue.sql", "013_worker_journal.sql", "014_worker_journal_discovery.sql", "015_worker_claim_resumption.sql"):
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
        sessions[role] = str(one(owner, "select comparison_qualification.issue_session(%s,%s,clock_timestamp()+interval '10 minutes')", (role, RUNTIME)))
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
        return one(worker, "select mip_cutover_authority." + name + "(" + ",".join(["%s"] * len(values)) + ")", values)
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
    fresh=lambda:str(one(owner,"select comparison_qualification.issue_session('mip_comparison_worker_v1',%s,clock_timestamp()+interval '10 minutes')",(RUNTIME,)))
    config=lambda sid:{"session":sid,"runtime":RUNTIME,"implementation":IMPL}
    enqueue=lambda:one(producer,"select mip_cutover_authority.producer_enqueue(%s,%s,%s,'{}',null)",(uuid.uuid4(),sessions["mip_comparison_producer_v1"],RUNTIME))
    expire=lambda generation,seconds:owner.execute("update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-(%s*interval '1 second') where generation_id=%s",(seconds,generation))
    context=lambda sid,key:{"p_session":sid,"p_runtime":RUNTIME,"p_key":key}
    times=[]
    # Death after journal commit before native claim: startup discovers the key itself.
    generation=enqueue()
    killed,ops,request=child(config(fresh()),"before_claim")
    assert killed["state"]=="killed"
    started=time.monotonic()
    recovered,ops,_=child(config(fresh()))
    times.append(round((time.monotonic()-started)*1000,3))
    assert recovered=={"state":"recovery_required","recovered":1}
    assert "worker_resume_claim" in ops and "worker_claim" not in ops
    assert one(owner,"select attempt from comparison_qualification.jobs where generation_id=%s",(generation,))==1
    # Death after native claim commits but before response: active lease cannot be stolen.
    generation=enqueue()
    killed,ops,original=child(config(fresh()),"after_claim")
    assert killed["state"]=="killed" and original["generation_id"]==str(generation)
    key=one(owner,"select journal_key from mip_cutover_authority.worker_journal j join comparison_qualification.request_runs r on r.request_id=(j.entry->'args'->>'p_request')::uuid and r.rpc_name='worker_claim' where r.generation_id=%s and j.entry->>'operation'='worker_claim'",(generation,))
    active,ops,_=child(config(fresh()))
    assert active=={"state":"waiting_native_claim_recovery","recovered":0,"held":1}
    assert one(owner,"select attempt from comparison_qualification.jobs where generation_id=%s",(generation,))==1
    expire(generation,1)
    waiting,_,_=child(config(fresh()))
    assert waiting["state"]=="waiting_native_claim_recovery"
    expire(generation,31)
    started=time.monotonic()
    recovered,ops,_=child(config(fresh()))
    times.append(round((time.monotonic()-started)*1000,3))
    assert recovered=={"state":"recovery_required","recovered":1}
    assert one(owner,"select attempt from comparison_qualification.jobs where generation_id=%s",(generation,))==2
    assert one(owner,"select count(*) from comparison_qualification.outputs where generation_id=%s",(generation,))==1
    reject(lambda:rpc("worker_fail",{"p_request":str(uuid.uuid4()),"p_session":fresh(),"p_runtime":RUNTIME,
      "p_generation":str(generation),"p_token":original["lease_token"],"p_input_hash":original["input_hash"],"p_implementation":IMPL}),"P0001")
    # Two concurrent exact resumes cannot issue two active tokens. Native state owns retry.
    generation=enqueue()
    killed,_,original=child(config(fresh()),"after_claim")
    key=one(owner,"select 'worker_claim:'||request_id::text from comparison_qualification.request_runs where generation_id=%s and rpc_name='worker_claim'",(generation,))
    expire(generation,31)
    sid=fresh()
    def resume_connection():
        conn=connect("mip_comparison_worker_v1")
        return one(conn,"select mip_cutover_authority.worker_resume_claim(%s,%s,%s)",(sid,RUNTIME,key))
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(lambda _:resume_connection(),range(2)))
    assert sorted(v["state"] for v in outcomes)==["resumed","waiting_lease"]
    assert one(owner,"select attempt from comparison_qualification.jobs where generation_id=%s",(generation,))==2
    # Simulate losing that recovery response too; wait then third native attempt completes.
    expire(generation,61)
    recovered,_,_=child(config(fresh()))
    assert recovered["recovered"]==1
    assert one(owner,"select attempt from comparison_qualification.jobs where generation_id=%s",(generation,))==3
    assert one(owner,"select count(*) from comparison_qualification.outputs where generation_id=%s",(generation,))==1
    # Session/source/implementation revocation cannot acquire or rotate a lease.
    generation=enqueue()
    killed,_,original=child(config(fresh()),"after_claim")
    key=one(owner,"select 'worker_claim:'||request_id::text from comparison_qualification.request_runs where generation_id=%s and rpc_name='worker_claim'",(generation,))
    expire(generation,31)
    stale=fresh()
    one(owner,"select comparison_qualification.revoke_session(%s)",(stale,))
    reject(lambda:rpc("worker_resume_claim",context(stale,key)),"42501","mip_authz_revoked_session")
    assert one(owner,"select attempt from comparison_qualification.jobs where generation_id=%s",(generation,))==1
    # Exhaustion retains the same job with native failure; never publishes or duplicates.
    sid=fresh()
    assert rpc("worker_resume_claim",context(sid,key))["state"]=="resumed"
    expire(generation,61)
    assert rpc("worker_resume_claim",context(sid,key))["state"]=="resumed"
    expire(generation,1)
    assert rpc("worker_resume_claim",context(sid,key))["state"]=="exhausted"
    assert one(owner,"select failure_code from comparison_qualification.jobs where generation_id=%s",(generation,))=="lease_attempts_exhausted"
    assert rpc("worker_resume_claim",context(sid,key))["state"]=="resolved"
    # Empty/never-issued native request resolves to native no-ready-work.
    request=str(uuid.uuid4());key="worker_claim:"+request
    rpc("worker_journal_put",{"p_session":sid,"p_runtime":RUNTIME,"p_key":key,"p_entry":{"version":1,"operation":"worker_claim","args":{"p_runtime":RUNTIME,"p_request":request}}})
    resolved,_,_=child(config(fresh()))
    assert resolved=={"state":"recovery_required","recovered":0}
    idle,_,_=child(config(fresh()))
    assert idle=={"state":"idle"}
    generation=enqueue()
    killed,_,_=child(config(fresh()),"after_claim")
    key=one(owner,"select 'worker_claim:'||request_id::text from comparison_qualification.request_runs where generation_id=%s and rpc_name='worker_claim'",(generation,))
    expire(generation,31)
    one(owner,"select comparison_qualification.revoke_source_scope(%s,'synthetic-source')",(RUNTIME,))
    reject(lambda:rpc("worker_resume_claim",context(fresh(),key)),"42501","mip_source_not_in_scope")
    assert one(owner,"select attempt from comparison_qualification.jobs where generation_id=%s",(generation,))==1
    assert one(owner,"select count(*) from comparison_qualification.outputs")==3
    assert one(owner,"select count(*) from comparison_qualification.publication_history")==0
    print(json.dumps({"case":"host_restart_native_claim_resumption","status":"PASS","fresh_process_ms":times}),flush=True)
    print(json.dumps({"case":"active_backoff_concurrent_stale_exhaustion_no_publication","status":"PASS"}),flush=True)
try:
    main()
finally:
    for connection in reversed(connections):
        connection.close()
