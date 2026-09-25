"""Focused R5 qik-owned journal and fresh-process recovery; source-free only.
Existing intake/comparison qualification is not replayed. SQL and broker paths
run against disposable PostgreSQL; no hosted login or durable host is claimed.
"""
from pathlib import Path
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
def reject(call, code=None):
    try:
        call()
    except psycopg.Error as error:
        if code is not None:
            assert error.sqlstate == code
        return
    raise AssertionError("expected SQL refusal")
def main():
    owner = connect()
    assert one(owner, "select inet_server_addr() is null and current_database()='mip_r5_journal'")
    owner.execute("create role anon;create role authenticated;create role service_role bypassrls")
    for file in ("contract.sql", "selection.sql", "capability.sql", "source-fixture.sql", "source-snapshot.sql"):
        owner.execute((ROOT / "supabase/qualification/comparison-generations" / file).read_text())
    for file in ("001_execute_only_identities.sql", "002_candidate_interfaces.sql", "013_worker_journal.sql"):
        owner.execute((ROOT / "supabase/qualification/mip-cutover-authority" / file).read_text())
    owner.execute("insert into mip_cutover_authority.runtime_config values(%s,'synthetic-source',%s,'{\"entries\":[]}')", (RUNTIME, IMPL))
    one(owner, "select comparison_qualification.bind_source_scope(%s,'synthetic-source')", (RUNTIME,))
    one(owner, "select comparison_qualification.bind_evaluated_implementation(%s,%s)", (RUNTIME, IMPL))
    sessions = {}
    for role, operations in {
        "mip_comparison_producer_v1": ("producer_enqueue",),
        "mip_comparison_worker_v1": ("worker_claim", "worker_complete", "worker_fail", "worker_journal_put", "worker_journal_get"),
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
            for _ in range(16):
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
    last_key = None
    completed_key = None
    for crash, fail in (("before_terminal", False), ("after_terminal", False), ("after_terminal", True)):
        generation = one(producer, "select mip_cutover_authority.producer_enqueue(%s,%s,%s,'{}',null)",
            (uuid.uuid4(), sessions["mip_comparison_producer_v1"], RUNTIME))
        config = {"mode": "run", "session": sessions["mip_comparison_worker_v1"], "runtime": RUNTIME,
                  "implementation": "synthetic-mismatch" if fail else IMPL}
        result, operations, key = child(config, crash)
        assert result["state"] == "killed" and key
        if crash == "before_terminal":
            assert "worker_complete" not in operations
            assert one(owner, "select state from comparison_qualification.jobs where generation_id=%s", (generation,)) == "processing"
        else:
            assert one(owner, "select state from comparison_qualification.jobs where generation_id=%s", (generation,)) == ("failed" if fail else "completed")
        fresh = str(one(owner, "select comparison_qualification.issue_session('mip_comparison_worker_v1',%s,clock_timestamp()+interval '10 minutes')", (RUNTIME,)))
        # No original JS closure or request/output object survives into this child.
        result, resumed, _ = child({"mode": "recover", "session": fresh, "runtime": RUNTIME, "key": key})
        assert result["state"] == ("failed" if fail else "completed")
        assert resumed == ["worker_journal_get", "worker_journal_put", "worker_fail" if fail else "worker_complete", "worker_journal_put"]
        assert "worker_claim" not in resumed
        assert one(owner, "select count(*) from comparison_qualification.request_runs where rpc_name=%s and generation_id=%s",
                   ("worker_fail" if fail else "worker_complete", generation)) == 1
        assert one(owner, "select count(*) from mip_cutover_authority.worker_journal where entry->'args' ?| array['p_token','p_session']") == 0
        print(json.dumps({"case": crash + ("_failure" if fail else "_completion"), "status": "PASS"}), flush=True)
        last_key = key
        if not fail:
            completed_key = key
    assert one(owner, "select count(*) from comparison_qualification.outputs") == 2
    assert one(owner, "select count(*) from comparison_qualification.failure_reports") == 1
    assert one(owner, "select count(*) from comparison_qualification.publication_history") == 0
    context = {"p_session": sessions["mip_comparison_worker_v1"], "p_runtime": RUNTIME, "p_key": last_key}
    entry = rpc("worker_journal_get", context)
    assert rpc("worker_journal_put", {**context, "p_entry": entry}) is True
    changed = json.loads(json.dumps(entry))
    changed["args"]["p_request"] = str(uuid.uuid4())
    reject(lambda: rpc("worker_journal_put", {**context, "p_entry": changed}))
    complete_context = {**context, "p_key": completed_key}
    completed_entry = rpc("worker_journal_get", complete_context)
    completed_entry["args"]["p_output"]["synthetic_conflict"] = True
    reject(lambda: rpc("worker_journal_put", {**complete_context, "p_entry": completed_entry}))
    reject(lambda: rpc("worker_journal_put", {**context, "p_key": last_key + ":receipt", "p_entry": {"version": 1, "result": "completed"}}))
    leaked = json.loads(json.dumps(entry))
    leaked["args"]["p_session"] = context["p_session"]
    reject(lambda: rpc("worker_journal_put", {**context, "p_entry": leaked}))
    for role in ("mip_comparison_worker_v1", "mip_comparison_producer_v1", "anon", "authenticated", "service_role"):
        denied = connect(role)
        reject(lambda: one(denied, "select entry from mip_cutover_authority.worker_journal"), "42501")
    table_owner = connect("mip_cutover_schema_owner_v1")
    # The schema has no USAGE for this NOLOGIN owner; FORCE RLS remains on.
    reject(lambda: one(table_owner, "select count(*) from mip_cutover_authority.worker_journal"), "42501")
    assert one(owner, "select relforcerowsecurity from pg_class where oid='mip_cutover_authority.worker_journal'::regclass")
    reject(lambda: rpc("worker_journal_get", {**context, "p_runtime": "foreign-runtime"}))
    one(owner, "select comparison_qualification.revoke_source_scope(%s,'synthetic-source')", (RUNTIME,))
    reject(lambda: rpc("worker_journal_get", context))
    one(owner, "select comparison_qualification.revoke_principal(%s,'mip_comparison_worker_v1')", (RUNTIME,))
    reject(lambda: rpc("worker_journal_get", context))
    print(json.dumps({"case": "journal_access_shape_conflict_revocation_no_publication", "status": "PASS"}), flush=True)
try:
    main()
finally:
    for connection in reversed(connections):
        connection.close()
