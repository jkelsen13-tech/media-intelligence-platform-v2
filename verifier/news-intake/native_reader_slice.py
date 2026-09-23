#!/usr/bin/env python3
"""Source-free native intake plus role-enforced public News GET test bridge.

Only disposable mip_news_reader on a Unix PostgreSQL socket is accepted. The
HTTP subset is test infrastructure for the installed Supabase JS client; it
executes real SQL under anon and never acts as a production PostgREST service.
"""
from __future__ import annotations

import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib.util
import json
import os
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse

import psycopg
from psycopg import sql as psql
from psycopg.types.json import Jsonb
from psycopg.pq import TransactionStatus

ROOT = Path("/workspace")
if sys.argv != [__file__, "serve"] or os.environ.get("MIP_NEWS_READER_ISOLATION") != "network-none-socket-only":
    raise RuntimeError("fixed isolated invocation required")
if any(key in os.environ for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GITHUB_TOKEN", "OPENAI_API_KEY", "PGHOST")):
    raise RuntimeError("credentials or alternate transport present")

db = psycopg.connect(dbname="mip_news_reader", user="postgres", host="/var/run/postgresql", autocommit=True)
db.execute("set statement_timeout='20s';set lock_timeout='5s'")
assert db.execute("select inet_server_addr() is null and current_database()='mip_news_reader'").fetchone()[0]
assert db.execute("select current_setting('server_version_num')::int").fetchone()[0] == 170006

def one(statement, params=()):
    return db.execute(statement, params).fetchone()[0]

def rpc(action, payload=None):
    db.execute("set role service_role")
    try:
        return one("select public.mip_pipeline_v1(%s,%s)", (action, Jsonb(payload or {})))
    finally:
        # A failed statement inside atomic() aborts that transaction. RESET ROLE
        # cannot run until rollback; the rollback itself reverts SET ROLE.
        if db.info.transaction_status != TransactionStatus.INERROR:
            db.execute("reset role")

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    return result

pipeline = load_module("mip_native_source_worker", ROOT / "verifier/ingestion_pipeline.py")
adapter = load_module("mip_native_source_adapter", ROOT / "verifier/news-intake/native_adapter.py")

db.execute("""
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.articles(
 id uuid primary key default gen_random_uuid(), feed text not null, outlet text not null,
 title text not null, url text not null unique, summary text, body_text text,
 published_at timestamptz, fetched_at timestamptz not null default now(),
 ingestion_run_id text, reader_state text not null default 'pending_review'
 check(reader_state in ('eligible','pending_review','withheld')),
 source_status text not null default 'active'
 check(source_status in ('active','corrected','withdrawn')),
 claims jsonb not null default '[]'::jsonb, arc_id uuid, author_id uuid,
 monoculture boolean not null default false, unattributed boolean not null default false);
alter table public.articles enable row level security;
create policy articles_select_eligible on public.articles for select to anon,authenticated
 using (reader_state='eligible' and source_status='active');
create table public.nodes(id uuid primary key,type text);
create table public.pipeline_config(key text primary key,value jsonb);
create table public.geographic_places(id uuid primary key);
create view public.spatial_projection_v1 as
 select null::uuid revision_id,null::uuid canonical_place_id,null::uuid subject_graph_node_id where false;
create table public.citations(article_id uuid,cited_entity text,cited_type text,
 documentation_strength numeric);
create schema mip_private;
create table public.article_claims(id uuid,claim_id uuid,article_id uuid,is_current boolean,
 auditability_state text,surface_text text,auditability_note text,evidence_source_field text,
 evidence_excerpt text);
create table public.claims(id uuid,event_id uuid,status text,rule_version text,canonical_text text);
create table public.events(id uuid,comparison_validation_state text,status text);
create table public.event_articles(event_id uuid,article_id uuid);
create table public.claim_evidence_links(claim_id uuid,evidence_url text,evidence_type text,
 linked_from_article_id uuid);
revoke all on all tables in schema public from public,anon,authenticated,service_role;
grant select on public.articles,public.citations to anon;
-- The native append_candidate function references this projection during
-- validation even for a null spatial revision. It remains empty here.
grant select on public.nodes,public.spatial_projection_v1 to service_role;
""")
db.execute((ROOT / "supabase/migrations/20260905082406_evidence_pipeline_reliability.sql").read_text())
db.execute((ROOT / "supabase/production-candidates/news-intake-reader/001_native_source_identity.sql").read_text())
# Execute the actual current nested News view definitions against empty minimal
# dependencies. No approved event/claim rows are invented for this slice.
publication = (ROOT / "supabase/migrations/20260905182355_mip_nested_claim_publication_gates.sql").read_text()
start = publication.index("create or replace view mip_private.reader_claim_surfaces")
end = publication.index("create or replace view public.comparison_public")
db.execute(publication[start:end])
db.execute("grant select on public.news_detail_public to anon")

body = ("Synthetic record. The National Weather Service said the storm damaged "
        "more than 100 homes in the county. A report by the National Weather Service found "
        "that emergency crews restored power by noon.")
def source(key, feed, outlet, suffix, text=body):
    candidate = pipeline.ArticleCandidate(
        key, feed, outlet, "https://synthetic.invalid/" + suffix,
        "Synthetic old storm record " + suffix, outlet, "2020-01-02T03:04:05Z",
        "Publisher-supplied summary " + suffix)
    return pipeline.HydratedArticle(candidate, text, None, None, "synthetic-retained")

first = source("source-a", "synthetic-feed-a", "Synthetic Outlet A", "one")
job = adapter.enqueue_source(rpc, "synthetic-native-reader", first)
assert adapter.enqueue_source(rpc, "synthetic-native-reader", first) == job
lease = rpc("claim")
assert lease["id"] == job
assert lease["payload"]["source_key"] == "source-a"
assert lease["payload"]["source_feed"] == "synthetic-feed-a"
# A forced post-finish failure rolls back capture, job completion and candidates.
def interrupted(action, payload=None):
    if action == "candidate": raise RuntimeError("synthetic candidate write interruption")
    return rpc(action, payload)
try:
    adapter.process_claim(interrupted, lease, pipeline, db.transaction)
    raise AssertionError("expected atomic rollback")
except RuntimeError as error:
    assert str(error) == "synthetic candidate write interruption"
assert one("select state from evidence_pipeline.import_jobs where id=%s", (job,)) == "processing"
assert one("select count(*) from evidence_pipeline.article_captures") == 0
result = adapter.process_claim(rpc, lease, pipeline, db.transaction)
article_id = result["job"]["article_id"]
assert result["job"]["outcome"] == "inserted"
assert result["candidate_ids"]
assert one("select reader_state from public.articles where id=%s", (article_id,)) == "pending_review"
assert one("select feed from public.articles where id=%s", (article_id,)) == "synthetic-feed-a"
assert one("select count(*) from evidence_pipeline.article_captures where job_id=%s", (job,)) == 1
assert one("select count(*) from evidence_pipeline.evidence_candidates where capture_id=%s", (result["job"]["capture_id"],)) == len(result["candidate_ids"])
print(json.dumps({"stage":"first_native_capture_and_atomic_recovery","status":"PASS"}), flush=True)

# Identical publisher URL/body through a different registry entry retains a
# distinct private capture, without manufacturing a second article or support.
copy = source("source-copy", "synthetic-feed-copy", "Synthetic Outlet A", "one")
copy_job = adapter.enqueue_source(rpc, "synthetic-native-reader", copy)
assert copy_job != job
copy_lease = rpc("claim")
assert copy_lease["id"] == copy_job
copy_result = adapter.process_claim(rpc, copy_lease, pipeline, db.transaction)
assert copy_result["job"]["outcome"] == "existing"
assert copy_result["job"]["article_id"] == article_id
assert one("select count(*) from public.articles") == 1
assert one("select count(*) from evidence_pipeline.article_captures where article_id=%s", (article_id,)) == 2
print(json.dumps({"stage":"same_url_source_identity","status":"PASS"}), flush=True)
# Explicit malformed metadata must fail, rather than collapsing to legacy V1.
invalid = {**adapter.source_payload(first), "source_key": " ", "source_feed": " "}
try:
    rpc("enqueue", {"run_id": "synthetic-native-reader", "article": invalid})
    raise AssertionError("blank source metadata accepted")
except psycopg.Error:
    pass
invalid_without_label = {**invalid}
invalid_without_label.pop("source_label")
try:
    rpc("enqueue", {"run_id": "synthetic-native-reader", "article": invalid_without_label})
    raise AssertionError("blank source pair without label accepted")
except psycopg.Error:
    pass

# Same underlying statement at another outlet is another report, not independent proof.
second = source("source-b", "synthetic-feed-b", "Synthetic Outlet B", "two")
job_two = adapter.enqueue_source(rpc, "synthetic-native-reader", second)
lease_two = rpc("claim")
assert lease_two["id"] == job_two
assert rpc("fail", {"job_id": str(job_two), "lease_token": str(lease_two["lease_token"]),
                    "code": "synthetic_transient", "retryable": True}) == "retry_wait"
db.execute("update evidence_pipeline.import_jobs set available_at='-infinity' where id=%s", (job_two,))
retry = rpc("claim")
assert retry["id"] == job_two and retry["attempt_count"] == 2
try:
    rpc("finish", {"job_id": str(job_two), "lease_token": str(lease_two["lease_token"])})
    raise AssertionError("revoked lease unexpectedly finished")
except psycopg.Error:
    pass
second_result = adapter.process_claim(rpc, retry, pipeline, db.transaction)
assert second_result["job"]["outcome"] == "inserted"
assert one("select count(*) from public.articles") == 2
assert one("select count(*) from evidence_pipeline.article_captures") == 3
print(json.dumps({"stage":"bounded_retry_and_multi_outlet","status":"PASS"}), flush=True)

# Changed source version retains original public row and creates a pending capture.
correction = source("source-a", "synthetic-feed-a", "Synthetic Outlet A", "one",
                    body + " Synthetic correction: the count remains under review.")
new_job = adapter.enqueue_source(rpc, "synthetic-native-reader", correction)
assert new_job != job
new_lease = rpc("claim")
assert new_lease["id"] == new_job
revised = adapter.process_claim(rpc, new_lease, pipeline, db.transaction)
assert revised["job"]["outcome"] == "revision_pending"
assert revised["job"]["article_id"] == article_id
assert one("select body_text from public.articles where id=%s", (article_id,)) == body
assert one("select count(*) from evidence_pipeline.article_captures where article_id=%s", (article_id,)) == 3
assert one("select count(*) from evidence_pipeline.record_versions where record_kind='article' and record_key=%s", (str(article_id),)) == 1
assert one("select count(*) from public.nodes") == 0
print(json.dumps({"stage":"revision_pending_preservation","status":"PASS"}), flush=True)

# The fixture represents an explicit synthetic reader admission, not a
# publication decision produced by extraction or a model.
db.execute("update public.articles set reader_state='eligible' where id=%s", (article_id,))
assert one("select count(*) from public.articles where reader_state='eligible'") == 1
assert one("select count(*) from public.articles where reader_state='pending_review'") == 1
# Synthetic eligible-but-withdrawn status remains invisible under active RLS.
db.execute("update public.articles set reader_state='eligible',source_status='withdrawn' where id=%s", (second_result["job"]["article_id"],))
db.execute("set role anon")
try:
    assert one("select count(*) from public.articles") == 1
    try:
        one("select public.mip_pipeline_v1('claim','{}'::jsonb)")
        raise AssertionError("anon native RPC access")
    except psycopg.Error as error:
        assert error.sqlstate == "42501"
    try:
        one("select count(*) from evidence_pipeline.article_captures")
        raise AssertionError("anon private capture access")
    except psycopg.Error as error:
        assert error.sqlstate == "42501"
finally:
    db.execute("reset role")
assert one("select count(*) from evidence_pipeline.evidence_candidates where review_state<>'pending'") == 0
expected = {
    "id": str(article_id), "title": first.candidate.title,
    "hidden_id": str(second_result["job"]["article_id"]),
    "outlets_reporting": one("select count(distinct outlet) from public.articles"),
    "independent_origins": None,
    "published_at": one("select published_at from public.articles where id=%s", (article_id,)).isoformat(),
    "capture_count": one("select count(*) from evidence_pipeline.article_captures"),
    "job_count": one("select count(*) from evidence_pipeline.import_jobs"),
}
print(json.dumps({"stage": "native_intake", "status": "PASS", "expected": expected}, sort_keys=True), flush=True)

COLUMNS = {
    "articles": {"id","feed","outlet","title","url","summary","published_at","fetched_at",
                 "reader_state","source_status","monoculture","unattributed","arc_id","author_id","claims"},
    "citations": {"article_id","cited_entity","cited_type","documentation_strength"},
    "news_detail_public": {"article_id","reviewed_claims"},
}
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        return
    def do_POST(self):
        if self.path != "/test/revoke":
            self.send_error(404); return
        db.execute("revoke select on public.articles from anon")
        self._reply(200, {"revoked": True})
    def do_HEAD(self):
        self._read()
    def do_GET(self):
        if self.path == "/test/expected":
            self._reply(200, expected); return
        self._read()
    def _reply(self, status, payload, count=None, head=False):
        data = json.dumps(payload, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        if count is not None:
            self.send_header("Content-Range", f"0-{max(0,count-1)}/{count}")
        self.send_header("Content-Length", str(0 if head else len(data)))
        self.end_headers()
        if not head:
            self.wfile.write(data)
    def _read(self):
        parsed = urlparse(self.path)
        table = parsed.path.removeprefix("/rest/v1/")
        if table not in COLUMNS or parsed.path != "/rest/v1/" + table:
            self.send_error(404); return
        q = parse_qs(parsed.query, keep_blank_values=True)
        fields = (q.get("select", ["*"])[0]).split(",")
        if "*" in fields or not set(fields) <= COLUMNS[table]:
            self._reply(400, {"code":"PGRST204","message":"unsupported test projection"}); return
        filters, args = [], []
        for key, values in q.items():
            if key in {"select", "order", "limit", "offset"}: continue
            if key not in COLUMNS[table] or len(values) != 1 or not values[0].startswith("eq."):
                self._reply(400, {"code":"PGRST204","message":"unsupported test filter"}); return
            filters.append(psql.SQL("{} = %s").format(psql.Identifier(key)))
            args.append(values[0][3:])
        query = psql.SQL("select {} from {}").format(
            psql.SQL(",").join(map(psql.Identifier, fields)), psql.Identifier("public", table))
        if filters: query += psql.SQL(" where ") + psql.SQL(" and ").join(filters)
        orders = []
        for item in filter(None, q.get("order", [""])[0].split(",")):
            parts = item.split(".")
            if parts[0] not in COLUMNS[table] or len(parts)>3 or (len(parts)>1 and parts[1] not in {"asc","desc"}) or (len(parts)==3 and parts[2] not in {"nullsfirst","nullslast"}):
                self._reply(400, {"code":"PGRST204","message":"unsupported test order"}); return
            order_sql = psql.SQL("{} {}").format(psql.Identifier(parts[0]), psql.SQL(parts[1] if len(parts)>1 else "asc"))
            if len(parts)==3: order_sql += psql.SQL(" " + ("nulls first" if parts[2]=="nullsfirst" else "nulls last"))
            orders.append(order_sql)
        if orders: query += psql.SQL(" order by ") + psql.SQL(",").join(orders)
        try:
            db.execute("set role anon")
            try:
                rows = db.execute(query, args).fetchall()
                names = [c.name for c in db.execute(query + psql.SQL(" limit 0"), args).description]
            finally:
                db.execute("reset role")
        except psycopg.Error as error:
            self._reply(403, {"code":error.sqlstate or "42501","message":"permission denied"}); return
        objects = [dict(zip(names,row)) for row in rows]
        count = len(objects)
        start = int(q.get("offset",["0"])[0])
        limit = int(q.get("limit",["1000"])[0])
        objects = objects[start:start+limit]
        single = "vnd.pgrst.object" in self.headers.get("Accept","")
        if single and len(objects)!=1:
            self._reply(406, {"code":"PGRST116","message":"Cannot coerce the result to a single JSON object","details":"The result contains 0 rows"}); return
        self._reply(200, objects[0] if single else objects, count, self.command=="HEAD")

server = HTTPServer(("127.0.0.1", 8765), Handler)
print("MIP_NEWS_READER_READY", flush=True)
server.serve_forever()
