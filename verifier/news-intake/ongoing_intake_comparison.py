"""R1/R5: actual C1/C2 intake -> retained comparison in one disposable database.

No real source, historical backfill, bridge, worker deployment or hosted identity.
Explicit owner fixture review is separate from intake and never supplied by C2.
The JS candidate is executed over private bounded stdio, with real SQL RPCs.
"""
from pathlib import Path
import importlib.util
import json
import os
import selectors
import subprocess
import sys
import time
import uuid

import psycopg
from psycopg.types.json import Jsonb

ROOT = Path("/workspace")
if os.environ.get("MIP_R5_ISOLATION") != "network-none-socket-only":
    raise RuntimeError("isolated invocation required")
if any(k in os.environ for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GITHUB_TOKEN",
                                 "OPENAI_API_KEY", "PGHOST", "PGPASSWORD", "DATABASE_URL")):
    raise RuntimeError("ambient credentials or alternate transport denied")
DB = "mip_r5"
IMPL = "qualification:c1-c2-comparison-v2"
RUNTIME = "qualification-ongoing"
SOURCE = "qualification-ongoing-source"
RUN = "qualification-ongoing-intake"
EVENT = "f0000000-0000-4000-8000-000000000005"
metrics = {"stream": "ongoing_synthetic", "historical_backfill_rows": 0, "stages": {}}
connections = []
def connect(role=None):
    db = psycopg.connect(dbname=DB, user="postgres", host="/var/run/postgresql", autocommit=True)
    connections.append(db)
    db.execute("set statement_timeout='10s';set lock_timeout='3s'")
    if role:
        assert role in {"service_role", "mip_comparison_producer_v1", "mip_comparison_worker_v1",
                        "qual_selector", "qual_publisher", "anon", "authenticated"}
        db.execute("set role " + role)
    return db
def one(db, sql, args=()):
    return db.execute(sql, args).fetchone()[0]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod
def reject(call, code=None):
    try:
        call()
    except psycopg.Error as error:
        if code is not None:
            assert error.sqlstate == code, error.sqlstate
        return
    raise AssertionError("expected native rejection")
def passed(name):
    print(json.dumps({"case": name, "status": "PASS"}), flush=True)
def stage(name, call):
    begin = time.perf_counter()
    result = call()
    metrics["stages"].setdefault(name, []).append((time.perf_counter() - begin) * 1000)
    return result
def main():
    db = connect()
    assert one(db, "select inet_server_addr() is null and current_database()='mip_r5'")
    db.execute((ROOT / "verifier/news-intake/c2_target_structure.sql").read_text())
    for path in ("supabase/migrations/20260905082406_evidence_pipeline_reliability.sql",
                 "supabase/migrations/20260906042413_evidence_change_queue_v1.sql"):
        db.execute((ROOT / path).read_text())
    installer = load("r5_installer", "verifier/news-intake/install_source_identity.py")
    installer.install_candidate(db, ROOT / "supabase/production-candidates/news-intake-reader/001_native_source_identity.sql")
    pipeline = load("r5_pipeline", "verifier/ingestion_pipeline.py")
    worker_module = load("r5_worker", "verifier/news-intake/native_worker.py")
    intake_db = connect("service_role")
    intake = worker_module.NativeIntakeWorker(intake_db, pipeline)

    # Reuse C2's actual event/membership shape, defaults and foreign keys.
    # Membership is a separately reviewed premise, not intake-generated judgment.
    db.execute("""
      alter table public.events enable row level security;
      alter table public.event_articles enable row level security;
      revoke all on public.events,public.event_articles from public,anon,authenticated,service_role;
    """)
    db.execute("insert into public.events(id,canonical_title,status,comparison_validation_state,occurred_at_start,occurred_at_end) values(%s,'Council water infrastructure funding','active','pending_review','2026-01-01','2026-01-01')", (EVENT,))
    for name in ("contract.sql", "selection.sql", "capability.sql", "source-snapshot.sql"):
        db.execute((ROOT / "supabase/qualification/comparison-generations" / name).read_text())
    for name in ("001_execute_only_identities.sql", "002_candidate_interfaces.sql"):
        db.execute((ROOT / "supabase/qualification/mip-cutover-authority" / name).read_text())
    db.execute("insert into mip_cutover_authority.runtime_config values(%s,%s,%s,%s)",
               (RUNTIME, SOURCE, IMPL, Jsonb({"entries": []})))
    one(db, "select comparison_qualification.bind_source_scope(%s,%s)", (RUNTIME, SOURCE))
    one(db, "select comparison_qualification.bind_evaluated_implementation(%s,%s)", (RUNTIME, IMPL))
    sessions = {}
    for role, operations in {
        "mip_comparison_producer_v1": ("producer_enqueue",),
        "mip_comparison_worker_v1": ("worker_claim", "worker_complete", "worker_fail"),
        "qual_selector": ("selector_select",),
        "qual_publisher": ("publisher_propose", "publisher_release"),
    }.items():
        for operation in operations:
            one(db, "select comparison_qualification.bind_runtime(%s,%s,%s)", (RUNTIME, role, operation))
        sessions[role] = str(one(db, "select comparison_qualification.issue_session(%s,%s,clock_timestamp()+interval '10 minutes')", (role, RUNTIME)))
    producer = connect("mip_comparison_producer_v1")
    worker_db = connect("mip_comparison_worker_v1")
    selector = connect("qual_selector")
    publisher = connect("qual_publisher")
    def capture(request=None):
        return one(producer, "select mip_cutover_authority.producer_enqueue(%s,%s,%s,'{}',null)",
                   (request or uuid.uuid4(), sessions["mip_comparison_producer_v1"], RUNTIME))
    def payload(generation):
        return one(db, "select input_payload from comparison_qualification.generations where id=%s", (generation,))
    def snapshot():
        return one(db, "select comparison_qualification.source_snapshot('{}',%s)", (IMPL,))

    body = "Synthetic record. The National Weather Service said the storm damaged more than 100 homes in the county. A report by the National Weather Service found that emergency crews restored power by noon."
    def hydrated(suffix, text=body):
        candidate = pipeline.ArticleCandidate("synthetic-" + suffix, "synthetic-feed-" + suffix,
          "Synthetic source", "https://synthetic.invalid/r5-" + suffix,
          "Council approves water infrastructure funding", "Synthetic Outlet " + suffix,
          "2026-01-01T00:00:00Z", "Council approves water infrastructure funding")
        return pipeline.HydratedArticle(candidate, text, None, None, "synthetic-retained")
    start = time.perf_counter()
    first = hydrated("a")
    job_a = stage("enqueue", lambda: intake.enqueue_source(RUN, first))
    assert stage("enqueue", lambda: intake.enqueue_source(RUN, first)) == job_a
    a = stage("intake", intake.run_one)
    assert a["state"] == "completed" and a["candidate_count"] > 0
    assert intake.run_one() == {"state": "idle"}
    job_b = stage("enqueue", lambda: intake.enqueue_source(RUN, hydrated("b")))
    before = one(db, "select count(*) from evidence_pipeline.article_captures")
    db.execute("create function public.r5_fault() returns trigger language plpgsql as $$ begin raise exception 'synthetic candidate failure'; end $$")
    db.execute("create trigger r5_fault before insert on evidence_pipeline.evidence_candidates for each row execute function public.r5_fault()")
    assert stage("intake_failed", intake.run_one) == {"state": "retry_wait", "code": "native_database_error"}
    assert one(db, "select count(*) from evidence_pipeline.article_captures") == before
    assert one(db, "select count(*) from public.articles") == 1
    db.execute("drop trigger r5_fault on evidence_pipeline.evidence_candidates;drop function public.r5_fault()")
    db.execute("update evidence_pipeline.import_jobs set available_at='-infinity' where id=%s", (job_b,))
    b = stage("intake_retry", intake.run_one)
    assert b["state"] == "completed"
    assert one(db, "select attempt_count from evidence_pipeline.import_jobs where id=%s", (job_b,)) == 2
    article_ids = {a["article_id"], b["article_id"]}
    assert one(db, "select count(*) from evidence_pipeline.evidence_candidates where review_state<>'pending'") == 0
    assert snapshot()["eventInputs"] == []
    for role in ("anon", "authenticated"):
        reader = connect(role)
        assert one(reader, "select count(*) from public.articles") == 0
        reject(lambda: one(reader, "select payload from evidence_pipeline.article_captures"), "42501")
        reject(lambda: one(reader, "select public.mip_pipeline_v1('claim','{}')"), "42501")
        reader.close()
    reject(lambda: intake_db.execute("update public.articles set reader_state='eligible'"), "42501")
    reject(lambda: intake_db.execute("insert into public.event_articles(event_id,article_id) values(%s,%s)", (EVENT,a["article_id"])), "42501")
    passed("actual_intake_duplicate_atomic_failure_retry_and_pending_denials")

    # Explicit synthetic reviewer action, clearly outside both worker identities.
    with db.transaction():
        for article in article_ids:
            db.execute("insert into public.event_articles(event_id,article_id,membership_method,membership_confidence) values(%s,%s,'explicit-synthetic-review',1)", (EVENT,article))
        db.execute("update public.events set comparison_validation_state='approved' where id=%s", (EVENT,))
        db.execute("update public.articles set reader_state='eligible'")
    request = uuid.uuid4()
    generation = stage("comparison_capture", lambda: capture(request))
    assert capture(request) == generation
    retained = payload(generation)
    members = retained["eventInputs"][0]["members"]
    assert {m["article"]["id"] for m in members} == article_ids
    assert {m["article"]["ingestion_run_id"] for m in members} == {RUN}
    assert {m["article"]["feed"] for m in members} == {"synthetic-feed-a", "synthetic-feed-b"}
    for item in (a,b):
        assert str(one(db, "select article_id from evidence_pipeline.article_captures where id=%s", (item["capture_id"],))) == item["article_id"]
    passed("explicit_review_to_same_article_run_source_comparison_input")

    # Pending corrections create custody but cannot overwrite the reviewed article input.
    correction_job = stage("enqueue", lambda: intake.enqueue_source(RUN, hydrated("a", body + " Synthetic correction pending review.")))
    correction = stage("intake_correction", intake.run_one)
    assert correction["outcome"] == "revision_pending" and correction["article_id"] == a["article_id"]
    assert one(db, "select body_text from public.articles where id=%s", (a["article_id"],)) == body
    assert snapshot()["eventInputs"][0]["members"] == retained["eventInputs"][0]["members"]
    assert payload(generation) == retained
    passed("pending_correction_preserves_current_comparison_and_retained_generation")

    signatures = {
      "worker_claim": ("p_request", "p_session", "p_runtime"),
      "worker_complete": ("p_request", "p_session", "p_runtime", "p_generation", "p_token", "p_input_hash", "p_implementation", "p_output"),
      "worker_fail": ("p_request", "p_session", "p_runtime", "p_generation", "p_token", "p_input_hash", "p_implementation"),
    }
    sent = []
    def run_comparison():
        # Only synthetic bounded input and RPC replies enter this child.
        process = subprocess.Popen(["node", str(ROOT / "verifier/news-intake/ongoing_comparison_driver.mjs")],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1, env={"PATH": os.environ.get("PATH",""), "MIP_R5_ISOLATION":"network-none-socket-only"})
        poll = selectors.DefaultSelector()
        poll.register(process.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + 25
        lost = False
        result = None
        try:
            process.stdin.write(json.dumps({"session":sessions["mip_comparison_worker_v1"],"runtime":RUNTIME,"implementation":IMPL})+"\n")
            process.stdin.flush()
            for _ in range(5):
                if not poll.select(max(0,deadline-time.monotonic())):
                    raise AssertionError("comparison worker timed out")
                line = process.stdout.readline(3*1024*1024)
                assert line.endswith("\n"), "bounded complete protocol line required"
                message = json.loads(line)
                if "result" in message:
                    result = message["result"]
                    break
                operation = message["rpc"]
                assert operation in signatures
                args = message["args"]
                assert set(args) == set(signatures[operation])
                sent.append((operation, args))
                values = [Jsonb(args[k]) if isinstance(args[k],dict) else args[k] for k in signatures[operation]]
                value = stage(operation, lambda: one(worker_db,
                    "select mip_cutover_authority." + operation + "(" + ",".join(["%s"]*len(values)) + ")", values))
                # Commit happened in real PostgreSQL before the artificial response loss.
                reply = {"result":value}
                if operation == "worker_complete" and not lost:
                    lost = True
                    reply = {"error":"synthetic_response_loss"}
                process.stdin.write(json.dumps(reply,default=str)+"\n")
                process.stdin.flush()
            assert result is not None
            process.stdin.close()
            assert process.wait(timeout=max(1,deadline-time.monotonic())) == 0
            assert result["initial_state"] == "completion_unconfirmed" and result["state"] == "completed"
            return result
        finally:
            poll.close()
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            for stream in (process.stdin,process.stdout,process.stderr):
                stream.close()
    result = stage("comparison_worker_process", run_comparison)
    assert result["generation"] == str(generation)
    assert [op for op,_ in sent] == ["worker_claim","worker_complete","worker_complete"]
    assert sent[1] == sent[2]
    assert one(db, "select count(*) from comparison_qualification.outputs") == 1
    output = one(db, "select output_payload from comparison_qualification.outputs where generation_id=%s", (generation,))
    assert len(output["projection"]["claims"]) > 0
    assert one(db, "select count(*) from comparison_qualification.jobs where state='pending'") == 0
    assert one(db, "select count(*) from comparison_qualification.publication_history") == 0
    passed("worker_v2_native_completion_lost_response_exact_retry_no_publication")

    output_hash = one(db, "select output_hash from comparison_qualification.outputs where generation_id=%s", (generation,))
    selection = uuid.uuid4()
    select_args = (uuid.uuid4(),sessions["qual_selector"],RUNTIME,selection,SOURCE,None,generation,output_hash,Jsonb({"fixture":"explicit reviewed synthetic membership","publication":"not-authorized"}))
    selection_sql = "select comparison_qualification.selector_select(%s,%s,%s,%s,%s,%s,%s,%s,%s)"
    assert str(stage("selection",lambda:one(selector,selection_sql,select_args))) == str(selection)
    assert one(db, "select state from comparison_qualification.publication_history") == "unpublished"
    reject(lambda: one(publisher, "select comparison_qualification.publisher_release(%s,%s,%s,%s)",
        (uuid.uuid4(),sessions["qual_publisher"],RUNTIME,SOURCE)))
    # A separate explicit withdrawal supersedes selection. Replaying the old receipt
    # must not restore it or publish the pending correction.
    withdrawal = uuid.uuid4()
    one(selector,selection_sql,(uuid.uuid4(),sessions["qual_selector"],RUNTIME,withdrawal,SOURCE,selection,None,None,Jsonb({"fixture":"withdraw"})))
    one(selector,selection_sql,select_args)
    assert str(one(db,"select selection_id from comparison_qualification.selection_heads where source_project=%s",(SOURCE,))) == str(withdrawal)
    assert one(db,"select h.state from comparison_qualification.publication_heads p join comparison_qualification.publication_history h on h.id=p.publication_id") == "withdrawn"
    db.execute("update public.articles set source_status='withdrawn' where id=%s",(a["article_id"],))
    reader=connect("anon")
    assert one(reader,"select count(*) from public.articles") == 1
    passed("selected_output_publication_withheld_withdrawal_and_old_retry_fence")
    metrics.update({
      "elapsed_ms":(time.perf_counter()-start)*1000,
      "intake_enqueue_calls":4,"duplicate_enqueue_calls":1,"new_article_versions":2,
      "pending_corrections":1,"intake_attempts":4,"intake_failures":1,"intake_retries":1,
      "comparison_generations":1,"comparison_computations":1,"completion_rpc_attempts":2,
      "lost_completion_responses":1,"selected_outputs":1,"current_withdrawn_outputs":1,
      "published_outputs":0,"comparison_worker_elapsed_ms":result["worker_elapsed_ms"],
      "comparison_lag_ms":float(one(db,"select extract(epoch from(o.completed_at-g.source_observed_at))*1000 from comparison_qualification.outputs o join comparison_qualification.generations g on g.id=o.generation_id")),
      "pending_intake_jobs":one(db,"select count(*) from evidence_pipeline.import_jobs where state not in ('completed','dead_letter')"),
      "pending_comparison_jobs":one(db,"select count(*) from comparison_qualification.jobs where state in ('pending','processing')"),
      "historical_backfill_executed":False,
      "capacity_claim":False,
    })
    assert metrics["pending_intake_jobs"] == metrics["pending_comparison_jobs"] == 0
    print(json.dumps({"section":"R1_R5","status":"PORTABLE_INTEGRATION_PASS","measurements":metrics,
      "limits":["synthetic source only","explicit fixture review and existing C2 event/membership schema",
        "hosted login/pooler/scheduler not qualified","no historical backfill or transitional bridge",
        "no semantic certification or publication","no live activation/cutover"]}),flush=True)
try:
    main()
finally:
    for connection in reversed(connections):
        connection.close()
