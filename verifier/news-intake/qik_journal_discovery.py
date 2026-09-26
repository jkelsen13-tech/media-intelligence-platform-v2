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
    for file in ("001_execute_only_identities.sql", "002_candidate_interfaces.sql", "003_scoped_queue.sql", "013_worker_journal.sql", "014_worker_journal_discovery.sql"):
        owner.execute((ROOT / "supabase/qualification/mip-cutover-authority" / file).read_text())
    owner.execute("insert into mip_cutover_authority.runtime_config values(%s,'synthetic-source',%s,'{\"entries\":[]}')", (RUNTIME, IMPL))
    one(owner, "select comparison_qualification.bind_source_scope(%s,'synthetic-source')", (RUNTIME,))
    one(owner, "select comparison_qualification.bind_evaluated_implementation(%s,%s)", (RUNTIME, IMPL))
    sessions = {}
    for role, operations in {
        "mip_comparison_producer_v1": ("producer_enqueue",),
        "mip_comparison_worker_v1": ("worker_claim", "worker_complete", "worker_fail", "worker_journal_put", "worker_journal_get", "worker_journal_pending"),
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
    }
    def rpc(name, args):
        assert name in signatures and set(args) == set(signatures[name])
        values = [Jsonb(args[k]) if isinstance(args[k], dict) else args[k] for k in signatures[name]]
        return one(worker, "select mip_cutover_authority." + name + "(" + ",".join(["%s"] * len(values)) + ")", values)
    def child(config, crash=None):
        process = subprocess.Popen(["node", str(ROOT / "verifier/news-intake/qik_journal_driver.mjs")],
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
                value = rpc(operation, args)
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
    durations = []
    for crash, fail in (("before_terminal", False), ("after_terminal", False), ("after_terminal", True)):
        generation = one(producer, "select mip_cutover_authority.producer_enqueue(%s,%s,%s,'{}',null)",
            (uuid.uuid4(), sessions["mip_comparison_producer_v1"], RUNTIME))
        result, operations, ignored_key = child({"mode":"run","session":sessions["mip_comparison_worker_v1"],
            "runtime":RUNTIME,"implementation":"synthetic-mismatch" if fail else IMPL}, crash)
        assert result["state"] == "killed"
        fresh = str(one(owner, "select comparison_qualification.issue_session('mip_comparison_worker_v1',%s,clock_timestamp()+interval '10 minutes')", (RUNTIME,)))
        held_keys=[]
        if crash=="before_terminal":
            # More unresolved claims than the default page must not starve a terminal.
            for _ in range(21):
                request=str(uuid.uuid4());held_keys.append("worker_claim:"+request)
                rpc("worker_journal_put",{"p_session":fresh,"p_runtime":RUNTIME,"p_key":held_keys[-1],
                    "p_entry":{"version":1,"operation":"worker_claim","args":{"p_runtime":RUNTIME,"p_request":request}}})
        started = time.monotonic()
        # NO key/request/output is supplied to the fresh process.
        result, resumed, _ = child({"mode":"resume","session":fresh,"runtime":RUNTIME,"implementation":IMPL})
        durations.append(round((time.monotonic()-started)*1000,3))
        assert result == ({"state":"held_claim_requires_native_owner","recovered":1,"held":19}
                          if held_keys else {"state":"recovery_required","recovered":1})
        assert resumed == ["worker_journal_pending","worker_journal_get","worker_journal_put",
                           "worker_fail" if fail else "worker_complete","worker_journal_put"]
        assert one(owner, "select count(*) from comparison_qualification.request_runs where rpc_name=%s and generation_id=%s",
                   ("worker_fail" if fail else "worker_complete", generation)) == 1
        # Resolve synthetic unissued claim requests via the native owner; no ready work exists.
        for held_key in held_keys:
            request=held_key.split(":")[1]
            assert rpc("worker_claim",{"p_session":fresh,"p_runtime":RUNTIME,"p_request":request}) is None
            rpc("worker_journal_put",{"p_session":fresh,"p_runtime":RUNTIME,"p_key":held_key+":receipt",
                "p_entry":{"version":1,"result":None}})
    # Empty-page invocation reaches the existing worker and confirms idle.
    idle, idle_ops, _=child({"mode":"run","session":sessions["mip_comparison_worker_v1"],"runtime":RUNTIME,"implementation":IMPL})
    assert idle["state"]=="idle" and idle_ops[0]=="worker_journal_pending" and "worker_claim" in idle_ops
    context={"p_session":sessions["mip_comparison_worker_v1"],"p_runtime":RUNTIME,"p_after":"","p_limit":2}
    assert rpc("worker_journal_pending",context)==[]
    # Pagination and safe admission hold for requests whose native result is unknown.
    keys=[]
    for _ in range(3):
        request=str(uuid.uuid4());key="worker_claim:"+request;keys.append(key)
        assert rpc("worker_journal_put",{"p_session":context["p_session"],"p_runtime":RUNTIME,"p_key":key,
          "p_entry":{"version":1,"operation":"worker_claim","args":{"p_runtime":RUNTIME,"p_request":request}}})
    page=rpc("worker_journal_pending",context)
    assert [row["key"] for row in page]==sorted(keys)[:2]
    assert all(set(row)=={"key","action","native_state"} and row["action"]=="hold_claim" for row in page)
    tail=rpc("worker_journal_pending",{**context,"p_after":page[-1]["key"]})
    assert [row["key"] for row in tail]==sorted(keys)[2:]
    result, operations, _=child({"mode":"resume","session":context["p_session"],"runtime":RUNTIME,"implementation":IMPL})
    assert result=={"state":"held_claim_requires_native_owner","recovered":0,"held":3}
    assert operations==["worker_journal_pending"]
    # A committed native lease lacking a prepared terminal request is also held.
    claim=rpc("worker_claim",{"p_session":context["p_session"],"p_runtime":RUNTIME,"p_request":keys[0].split(":")[1]})
    assert claim is None  # no new work was queued in the discovery checks
    assert len(rpc("worker_journal_pending",{**context,"p_limit":50}))==2
    generation=one(producer,"select mip_cutover_authority.producer_enqueue(%s,%s,%s,'{}',null)",
      (uuid.uuid4(),sessions["mip_comparison_producer_v1"],RUNTIME))
    native_claim=rpc("worker_claim",{"p_session":context["p_session"],"p_runtime":RUNTIME,"p_request":keys[1].split(":")[1]})
    assert native_claim["generation_id"]==str(generation)
    claim_key=keys[1]
    assert rpc("worker_journal_put",{"p_session":context["p_session"],"p_runtime":RUNTIME,"p_key":claim_key+":receipt",
      "p_entry":{"version":1,"result":{"generation_id":str(generation)}}})
    listed=rpc("worker_journal_pending",{**context,"p_limit":50})
    assert next(row for row in listed if row["key"]==claim_key)["native_state"]=="processing"
    assert one(owner,"select state from comparison_qualification.jobs where generation_id=%s",(generation,))=="processing"
    for limit in (0,51):
        reject(lambda:rpc("worker_journal_pending",{**context,"p_limit":limit}),"P0001","mip_journal_page_bounds")
    reject(lambda:rpc("worker_journal_pending",{**context,"p_runtime":"foreign-runtime"}),"42501","mip_authz_runtime_mismatch")
    one(owner,"select comparison_qualification.revoke_source_scope(%s,'synthetic-source')",(RUNTIME,))
    reject(lambda:rpc("worker_journal_pending",{**context,"p_limit":50}),"42501","mip_source_not_in_scope")
    one(owner,"select comparison_qualification.revoke_session(%s)",(context["p_session"],))
    reject(lambda:rpc("worker_journal_pending",context),"42501","mip_authz_revoked_session")
    assert one(owner,"select count(*) from comparison_qualification.outputs")==2
    assert one(owner,"select count(*) from comparison_qualification.failure_reports")==1
    assert one(owner,"select count(*) from comparison_qualification.publication_history")==0
    print(json.dumps({"case":"discovered_terminal_recovery_no_caller_keys","status":"PASS","recoveries":3,
      "fresh_process_recovery_ms":durations}),flush=True)
    print(json.dumps({"case":"bounded_discovery_claim_hold_scope_revocation","status":"PASS"}),flush=True)
try:
    main()
finally:
    for connection in reversed(connections):
        connection.close()
