"""Synthetic native ingestion-to-candidate integration; never invoke the CLI.

Foundation: deterministic_literal_extraction + exact evidence_pipeline migration.
Missing integration: no isolated test joins generated literal candidates to the
native capture/candidate persistence and an independently readable restore.
Correction: this harness supplies only that adapter and synthetic dependencies.
No semantic evaluator, accepted identity/relation, public approval or live client.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys

import psycopg
from psycopg.types.json import Jsonb

ROOT = Path("/workspace")
DBS = {"mip_native_path", "mip_native_path_restored"}
if os.environ.get("MIP_NATIVE_SYNTHETIC") != "network-none-socket-only":
    raise RuntimeError("isolated opt-in required")
if len(sys.argv) != 3 or sys.argv[1] not in {"exercise", "readback"} or sys.argv[2] not in DBS:
    raise RuntimeError("bounded invocation required")
if any(k in os.environ for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GITHUB_TOKEN", "OPENAI_API_KEY", "PGHOST")):
    raise RuntimeError("unexpected credential or transport")
# Fixed socket and fixed disposable names: callers cannot supply a production DSN.
db = psycopg.connect(dbname=sys.argv[2], user="postgres", host="/var/run/postgresql", autocommit=True)
db.execute("set statement_timeout='20s';set lock_timeout='5s'")
assert db.execute("select inet_server_addr() is null and current_database()=%s", (sys.argv[2],)).fetchone()[0]
assert db.execute("select current_setting('server_version_num')::int").fetchone()[0] == 170006

def sql(statement, params=()):
    return db.execute(statement, params)

def one(statement, params=()):
    return sql(statement, params).fetchone()[0]

def rpc(action, payload=None):
    sql("set role service_role")
    try:
        return one("select public.mip_pipeline_v1(%s,%s)", (action, Jsonb(payload or {})))
    finally:
        sql("reset role")

def denied(statement, params=(), role="service_role"):
    sql("set role " + role)
    try:
        try:
            sql(statement, params)
        except psycopg.Error as error:
            assert error.sqlstate in {"42501", "P0001"}, error.sqlstate
            return
        raise AssertionError("expected denial")
    finally:
        sql("reset role")

def digest_rows(table):
    rows = one("select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from " + table + " t")
    return hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

TABLES = ["public.articles", "evidence_pipeline.article_identities", "evidence_pipeline.import_jobs",
          "evidence_pipeline.import_receipts", "evidence_pipeline.job_events",
          "evidence_pipeline.article_captures", "evidence_pipeline.evidence_candidates",
          "evidence_pipeline.record_versions"]
def state():
    return {t: digest_rows(t) for t in TABLES}

def definitions():
    return one("""select md5(string_agg(pg_get_functiondef(p.oid),E'\n' order by p.oid::regprocedure::text))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='evidence_pipeline' or (n.nspname='public' and p.proname='mip_pipeline_v1')""")

if sys.argv[1] == "readback":
    expected = one("select payload from native_test_receipt")
    assert state() == expected["rows"], "restore row/identity/history mismatch"
    assert definitions() == expected["definitions"], "restore definition mismatch"
    # The orchestrator revoked current worker authority before any restored read.
    for role in ("anon", "authenticated", "service_role"):
        assert not one("select has_function_privilege(%s,'public.mip_pipeline_v1(text,jsonb)','EXECUTE')", (role,))
        denied("select public.mip_pipeline_v1('status','{}')", role=role)
        denied("select * from evidence_pipeline.article_captures", role=role)
    assert one("select count(*) from public.articles where reader_state<>'pending_review'") == 0
    print(json.dumps({"status": "PASS", "stage": "independent_dump_restore_readback",
                      "source_sha256": expected["source_sha256"], "rows": state(),
                      "current_authority_reconciled": True, "public_release": False}, sort_keys=True))
    sys.exit(0)

# Minimal synthetic dependency substrate, not a canonical-project schema restore.
sql("""
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.articles(
 id uuid primary key default gen_random_uuid(),feed text,outlet text,title text,
 url text unique,summary text,body_text text,published_at timestamptz,ingestion_run_id text,
 reader_state text default 'pending_review' not null);
alter table public.articles enable row level security;
create table public.nodes(id uuid primary key,type text);
create table public.pipeline_config(key text primary key,value jsonb);
create table public.geographic_places(id uuid primary key);
create view public.spatial_projection_v1 as
 select null::uuid revision_id,null::uuid canonical_place_id,null::uuid subject_graph_node_id where false;
revoke all on all tables in schema public from public,anon,authenticated,service_role;
""")
migration = ROOT / "supabase/migrations/20260905082406_evidence_pipeline_reliability.sql"
sql(migration.read_text())
# Import the existing implementation; never run its live discovery/write CLI.
spec = importlib.util.spec_from_file_location("mip_native_extractor", ROOT / "verifier/ingestion_pipeline.py")
pipeline = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pipeline
spec.loader.exec_module(pipeline)
body = ("Synthetic fixture. \U0001f600 The National Weather Service said the unprecedented storm damaged "
        "more than 100 homes in the county. A report by the National Weather Service found "
        "that emergency crews restored power by noon.")
source_bytes = body.encode("utf-8")
source_hash = hashlib.sha256(source_bytes).hexdigest()
article = {"url": "https://synthetic.invalid/native-path", "title": "Synthetic native path",
           "outlet": "Synthetic qualification input", "summary": None, "body_text": body,
           "published_at": "2026-01-01T00:00:00Z"}
candidate = pipeline.ArticleCandidate("synthetic", "synthetic", "Synthetic", article["url"],
                                     article["title"], article["outlet"], article["published_at"], None)
hydrated = pipeline.HydratedArticle(candidate, body, None, None, "retained-synthetic-bytes")
output, warnings = pipeline.deterministic_literal_extraction(hydrated)
assert output and not warnings and output["claims"]
assert output["cross_surface"] == [] and output["locations"] == []
assert pipeline.validate_extraction(body, output) == []

def enqueue(value=article):
    return rpc("enqueue", {"run_id": "synthetic-native-path-v1", "article": value})

job = enqueue()
assert enqueue() == job
lease = rpc("claim")
assert str(lease["id"]) == str(job)
# Partial failure rolls back native persistence; a new connection can resume.
sql("begin")
sql("set local role service_role")
one("select public.mip_pipeline_v1('finish',%s)", (Jsonb({"job_id": job, "lease_token": lease["lease_token"]}),))
sql("rollback")
assert one("select count(*) from evidence_pipeline.article_captures") == 0
db.close()
db = psycopg.connect(dbname=sys.argv[2], user="postgres", host="/var/run/postgresql", autocommit=True)
sql("set statement_timeout='20s';set lock_timeout='5s'")
finished = rpc("finish", {"job_id": job, "lease_token": lease["lease_token"]})
assert finished["outcome"] == "inserted"
# Ambiguous completion: native finish rejects a stale lease; reuse identity and
# inspect the committed capture instead of silently creating a fresh input.
denied("select public.mip_pipeline_v1('finish',%s)", (Jsonb({"job_id": job, "lease_token": lease["lease_token"]}),))
assert enqueue() == job
assert one("select count(*) from evidence_pipeline.article_captures where job_id=%s", (job,)) == 1
capture = one("select payload from evidence_pipeline.article_captures where id=%s", (finished["capture_id"],))
assert capture["body_text"].encode() == source_bytes
assert hashlib.sha256(capture["body_text"].encode()).hexdigest() == source_hash
assert one("select reader_state from public.articles where id=%s", (finished["article_id"],)) == "pending_review"

candidate_ids = []
for i, claim in enumerate(output["claims"]):
    value = {"capture_id": finished["capture_id"], "candidate_key": "literal-" + str(i),
             "candidate_kind": "claim", "statement": claim["text"], "source_field": "body_text",
             "span_start": claim["start"], "span_end": claim["end"], "excerpt": claim["text"],
             "extractor_version": pipeline.ALGORITHM_VERSION,
             "remaining_uncertainty": "Literal extraction only; no truth, identity or semantic assessment."}
    assert body[claim["start"]:claim["end"]] == claim["text"]
    cid = rpc("candidate", value)
    assert rpc("candidate", value) == cid
    candidate_ids.append(cid)
    denied("select public.mip_pipeline_v1('candidate',%s)", (Jsonb({**value, "excerpt": "invented"}),))
assert one("select count(*) from evidence_pipeline.evidence_candidates") == len(output["claims"])
assert one("select count(*) from evidence_pipeline.evidence_candidates where review_state<>'pending'") == 0
original_history = one("select count(*) from evidence_pipeline.record_versions where record_kind='article'")
corrected = {**article, "body_text": body + " Synthetic correction: the count remains under review."}
next_job = enqueue(corrected)
assert next_job != job
next_lease = rpc("claim")
assert next_lease["id"] == next_job
correction = rpc("finish", {"job_id": next_job, "lease_token": next_lease["lease_token"]})
assert correction["outcome"] == "revision_pending"
assert correction["article_id"] == finished["article_id"]
assert one("select body_text from public.articles where id=%s", (finished["article_id"],)) == body
assert one("select count(*) from evidence_pipeline.article_captures") == 2
assert one("select count(*) from evidence_pipeline.record_versions where record_kind='article'") == original_history
# The changed capture is not silently projected or treated as an accepted rewrite.
assert one("select count(*) from evidence_pipeline.evidence_candidates where capture_id=%s", (correction["capture_id"],)) == 0
assert one("select count(*) from public.nodes") == 0
denied("update public.articles set reader_state='eligible'")
for role in ("anon", "authenticated"):
    denied("select public.mip_pipeline_v1('claim')", role=role)
    denied("select * from evidence_pipeline.article_captures", role=role)
denied("update evidence_pipeline.article_captures set payload='{}'")
denied("delete from evidence_pipeline.record_versions")
# Retryable failure and lease recovery preserve the original identity.
retry_job = enqueue({**article, "url": "https://synthetic.invalid/retry"})
retry_lease = rpc("claim")
assert retry_lease["id"] == retry_job
assert rpc("fail", {"job_id": retry_job, "lease_token": retry_lease["lease_token"],
                    "code": "synthetic_partial_failure", "retryable": True}) == "retry_wait"
sql("update evidence_pipeline.import_jobs set available_at='-infinity' where id=%s", (retry_job,))
retry_lease2 = rpc("claim")
assert retry_lease2["id"] == retry_job and retry_lease2["attempt_count"] == 2
assert retry_lease2["lease_token"] != retry_lease["lease_token"]
denied("select public.mip_pipeline_v1('finish',%s)", (Jsonb({"job_id": retry_job, "lease_token": retry_lease["lease_token"]}),))
rpc("finish", {"job_id": retry_job, "lease_token": retry_lease2["lease_token"]})
assert rpc("status", {"run_id": "synthetic-native-path-v1"}) == [{"state": "completed", "jobs": 3}]
assert one("select count(*) from evidence_pipeline.record_versions where reason like 'ingestion:%'") == 2
receipt = {"rows": state(), "definitions": definitions(), "source_sha256": source_hash,
           "source_bytes": len(source_bytes), "claims": len(output["claims"]),
           "input_permission": "synthetic_original_test_fixture",
           "migration_sha256": hashlib.sha256(migration.read_bytes()).hexdigest()}
sql("create table native_test_receipt(payload jsonb not null);revoke all on native_test_receipt from public,anon,authenticated,service_role")
sql("insert into native_test_receipt values(%s)", (Jsonb(receipt),))
print(json.dumps({"status": "PASS", "stage": "native_extraction_capture_candidate_recovery",
                  **receipt, "semantic_evaluator": "not_exercised", "canonical_schema": "minimal_synthetic_dependencies",
                  "hosted_auth_pooler_gateway": "not_exercised", "public_release": False}, sort_keys=True))
