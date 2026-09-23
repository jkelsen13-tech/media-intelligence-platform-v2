"""C2 target-compatible portable checks. Fixed disposable identity; source-free."""
from pathlib import Path
import importlib.util
import json
import os
import sys
import psycopg
from psycopg.types.json import Jsonb

ROOT = Path("/workspace")
if os.environ.get("MIP_C2_ISOLATION") != "network-none-socket-only":
    raise RuntimeError("isolated invocation required")
if any(k in os.environ for k in ("SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","GITHUB_TOKEN","OPENAI_API_KEY","PGHOST")):
    raise RuntimeError("credentials or alternate transport denied")
db = psycopg.connect(dbname="mip_c2",user="postgres",host="/var/run/postgresql",autocommit=True)
db.execute("set statement_timeout='20s';set lock_timeout='5s'")
assert db.execute("select inet_server_addr() is null,current_database(),current_setting('server_version_num')").fetchone()==(True,"mip_c2","170006")
def one(q,p=()): return db.execute(q,p).fetchone()[0]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path); mod=importlib.util.module_from_spec(spec)
    sys.modules[name]=mod;spec.loader.exec_module(mod);return mod
def passed(name): print(json.dumps({"case":name,"status":"PASS"}),flush=True)
def rejects(call,code=None):
    try: call()
    except Exception as error:
        if code is not None: assert getattr(error,"sqlstate",None)==code, (type(error).__name__,getattr(error,"sqlstate",None))
        return
    raise AssertionError("expected rejection")
candidate=ROOT/"supabase/production-candidates/news-intake-reader/001_native_source_identity.sql"
installer=load("c2_installer","verifier/news-intake/install_source_identity.py")
# Missing-owner ordering must fail without creating or replacing foundations.
rejects(lambda:installer.install_candidate(db,candidate),"42P01")
assert one("select to_regnamespace('evidence_pipeline')") is None
passed("missing_foundation_refused")
db.execute((ROOT/"verifier/news-intake/c2_target_structure.sql").read_text())
base=(ROOT/"supabase/migrations/20260905082406_evidence_pipeline_reliability.sql").read_text()
db.execute(base)
db.execute((ROOT/"supabase/migrations/20260906042413_evidence_change_queue_v1.sql").read_text())
publication=(ROOT/"supabase/migrations/20260905182355_mip_nested_claim_publication_gates.sql").read_text()
db.execute(publication[publication.index("create or replace view mip_private.reader_claim_surfaces"):publication.index("create or replace view public.comparison_public")])
db.execute("grant select on public.news_detail_public to anon,authenticated")
# Exact live body fingerprints; no behavior-normalizing comparison.
expected=json.loads((ROOT/"verifier/news-intake/c2_function_fingerprints.json").read_text())
for item in expected:
    got=one("select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=%s and p.proname=%s",(item["schema"],item["name"]))
    assert got==item["body_sha256"], item["name"]
passed("native_target_function_identity")
wdb=psycopg.connect(dbname="mip_c2",user="postgres",host="/var/run/postgresql",autocommit=True)
wdb.execute("set role service_role")
def rpc(action,payload=None): return wdb.execute("select public.mip_pipeline_v1(%s,%s)",(action,Jsonb(payload or {}))).fetchone()[0]
legacy={"url":"https://synthetic.invalid/c2-legacy","title":"C2 legacy","outlet":"Synthetic","body_text":None,"summary":None,"published_at":None}
legacyjob=rpc("enqueue",{"run_id":"c2","article":legacy})
before=wdb.execute("select input_hash,payload from evidence_pipeline.import_jobs where id=%s",(legacyjob,)).fetchone()
# The persisted legacy job is intentionally used after install for caller compatibility.
old_defs={sig:one("select pg_get_functiondef(to_regprocedure(%s))",(sig,)) for sig in installer.BASE}
old_acl={sig:one("select proacl::text from pg_proc where oid=to_regprocedure(%s)",(sig,)) for sig in installer.BASE}
db.execute("alter table public.articles alter column reader_state set default 'eligible'")
rejects(lambda:installer.install_candidate(db,candidate))
db.execute("alter table public.articles alter column reader_state set default 'pending_review'")
db.execute("create or replace function evidence_pipeline.enqueue(p_run_id text,p_payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$ begin raise exception 'synthetic conflicting implementation'; end $$")
rejects(lambda:installer.install_candidate(db,candidate))
assert one("select pg_get_functiondef('evidence_pipeline.finish_job(uuid,uuid)'::regprocedure)")==old_defs["evidence_pipeline.finish_job(uuid,uuid)"]
db.execute(old_defs["evidence_pipeline.enqueue(text,jsonb)"])
assert installer.install_candidate(db,candidate)["state"]=="installed"
for sig,acl in old_acl.items(): assert one("select proacl::text from pg_proc where oid=to_regprocedure(%s)",(sig,))==acl
rejects(lambda:installer.install_candidate(db,candidate))
assert rpc("enqueue",{"run_id":"c2","article":legacy})==legacyjob
assert wdb.execute("select input_hash,payload from evidence_pipeline.import_jobs where id=%s",(legacyjob,)).fetchone()==before
passed("guarded_install_conflict_acl_and_legacy")
pipeline=load("c2_pipeline","verifier/ingestion_pipeline.py")
worker_mod=load("c2_worker","verifier/news-intake/native_worker.py")
rejects(lambda:worker_mod.NativeIntakeWorker(db,pipeline))
worker=worker_mod.NativeIntakeWorker(wdb,pipeline)
for bound in (0,11,True,"1"): rejects(lambda:worker.run(bound))
with wdb.transaction(): rejects(lambda:worker.run_one())
assert worker.run_one()["state"]=="completed"
passed("worker_identity_bounds_and_legacy_processing")

BODY="Synthetic record. The National Weather Service said the storm damaged more than 100 homes in the county. A report by the National Weather Service found that emergency crews restored power by noon."
def source(suffix,body=BODY,key=" source-c2 ",feed=" feed-c2 "):
    c=pipeline.ArticleCandidate(key,feed," C2 retained source ","https://synthetic.invalid/"+suffix,"C2 synthetic "+suffix,"Synthetic Outlet","2020-01-02T03:04:05Z","Synthetic summary")
    return pipeline.HydratedArticle(c,body,None,None,"synthetic-retained")
counts=lambda:one("select jsonb_build_array((select count(*) from public.articles),(select count(*) from evidence_pipeline.article_captures),(select count(*) from evidence_pipeline.record_versions),(select count(*) from evidence_pipeline.evidence_changes),(select count(*) from evidence_pipeline.change_jobs))")
s=source("c2-one");j=worker.enqueue_source("c2",s)
assert worker.enqueue_source("c2",s)==j
before_counts=counts()
db.execute("create function public.c2_interrupt() returns trigger language plpgsql as $$ begin raise exception 'synthetic candidate interruption'; end $$")
db.execute("create trigger c2_interrupt before insert on evidence_pipeline.evidence_candidates for each row execute function public.c2_interrupt()")
result=worker.run_one()
assert result=={"state":"retry_wait","code":"native_database_error"},result
assert counts()==before_counts
assert one("select state from evidence_pipeline.import_jobs where id=%s",(j,))=="retry_wait"
db.execute("drop trigger c2_interrupt on evidence_pipeline.evidence_candidates;drop function public.c2_interrupt()")
db.execute("update evidence_pipeline.import_jobs set available_at='-infinity' where id=%s",(j,))
result=worker.run_one();assert result["state"]=="completed" and result["candidate_count"]>0,result
article=result["article_id"]
assert one("select attempt_count from evidence_pipeline.import_jobs where id=%s",(j,))==2
assert one("select reader_state from public.articles where id=%s",(article,))=="pending_review"
assert one("select feed from public.articles where id=%s",(article,))==" feed-c2 "
assert one("select payload->>'source_key' from evidence_pipeline.article_captures where id=%s",(result["capture_id"],))==" source-c2 "
assert one("select count(*) from evidence_pipeline.evidence_changes where capture_id=%s",(result["capture_id"],))==1
assert one("select count(*) from evidence_pipeline.change_jobs where change_position in(select position from evidence_pipeline.evidence_changes where capture_id=%s)",(result["capture_id"],))==2
assert one("select count(*) from evidence_pipeline.evidence_changes where record_version_id in(select id from evidence_pipeline.record_versions where record_key=%s)",(str(article),))==1
assert one("select count(*) from evidence_pipeline.change_jobs where state<>'pending'")==0
passed("worker_atomic_trigger_chain_rollback_retry")
assert worker.enqueue_source("c2",s)==j
assert worker.run_one()=={"state":"idle"}
correction=source("c2-one",BODY+" Synthetic unreviewed correction.")
worker.enqueue_source("c2",correction)
revised=worker.run_one()
assert revised["outcome"]=="revision_pending" and revised["article_id"]==article
assert one("select body_text from public.articles where id=%s",(article,))==BODY
assert one("select count(*) from evidence_pipeline.record_versions where record_kind='article' and record_key=%s",(str(article),))==1
assert one("select count(*) from evidence_pipeline.article_captures where article_id=%s",(article,))==2
assert one("select count(*) from evidence_pipeline.evidence_candidates where review_state<>'pending'")==0
passed("duplicate_and_pending_correction_history")

# Native constraints, permission fences and immutable history remain active.
rejects(lambda:wdb.execute("update public.articles set reader_state='eligible' where id=%s",(article,)),"42501")
rejects(lambda:wdb.execute("insert into public.articles(feed,outlet,title,url,reader_state) values('s','s','s','https://synthetic.invalid/forbidden','eligible')"),"42501")
rejects(lambda:db.execute("update public.articles set reader_state='invented' where id=%s",(article,)),"23514")
rejects(lambda:db.execute("update public.articles set outlet_id='f0000000-0000-0000-0000-000000000099' where id=%s",(article,)),"23503")
rejects(lambda:wdb.execute("update evidence_pipeline.article_captures set review_state='eligible'"),"42501")
rejects(lambda:db.execute("delete from evidence_pipeline.article_captures"),"P0001")
rejects(lambda:db.execute("truncate evidence_pipeline.record_versions cascade"),"P0001")
passed("native_constraints_and_history_denials")
# Exercise exact article invalidation trigger with explicit synthetic reviewed premise.
arc="f0000000-0000-0000-0000-000000000001"
member="f0000000-0000-0000-0000-000000000002"
db.execute("insert into public.story_arcs(id,slug,title,category,status) values(%s,'c2','Synthetic C2','test','active')",(arc,))
# Current target candidate ID has no default: unapproved attachment fails closed.
# Preserve this target limitation instead of silently manufacturing a new default.
rejects(lambda:db.execute("update public.articles set arc_id=%s where id=%s",(arc,article)),"23502")
assert one("select arc_id from public.articles where id=%s",(article,)) is None
passed("target_unapproved_arc_attachment_rejected")
db.execute("insert into public.arc_membership_candidates(id,article_id,arc_id,state) values(%s,%s,%s,'approved')",(member,article,arc))
with db.transaction():
    db.execute("select set_config('app.arc_membership_approval_candidate_id',%s,true)",(member,))
    db.execute("update public.articles set arc_id=%s where id=%s",(arc,article))
assert one("select state from public.arc_membership_candidates where id=%s",(member,))=="approved"
db.execute("update public.articles set source_status='withdrawn' where id=%s",(article,))
assert one("select state from public.arc_membership_candidates where id=%s",(member,))=="invalidated"
passed("native_article_membership_invalidation")
# Admission is a test premise, not a worker publication capability.
db.execute("update public.articles set reader_state='eligible',source_status='active' where id=%s",(article,))
for role in ("anon","authenticated"):
    db.execute("set role "+role)
    try:
        assert one("select count(*) from public.articles")==1
        assert one("select reviewed_claims from public.news_detail_public where article_id=%s",(article,))==[]
        rejects(lambda:one("select public.mip_pipeline_v1('claim','{}')"),"42501")
        rejects(lambda:one("select payload from evidence_pipeline.article_captures"),"42501")
    finally: db.execute("reset role")
db.execute("update public.articles set source_status='withdrawn' where id=%s",(article,))
db.execute("set role anon")
try: assert one("select count(*) from public.articles")==0
finally: db.execute("reset role")
passed("reader_rls_private_denial_and_withdrawal")
# Native stale-token refusal and expiry recovery do not publish partial work.
j2=worker.enqueue_source("c2",source("c2-expiry"))
lease=rpc("claim")
assert lease["id"]==str(j2) or str(lease["id"])==str(j2)
db.execute("update evidence_pipeline.import_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=%s",(j2,))
rejects(lambda:rpc("finish",{"job_id":str(j2),"lease_token":lease["lease_token"]}))
rpc("claim")
assert one("select state from evidence_pipeline.import_jobs where id=%s",(j2,))=="retry_wait"
db.execute("update evidence_pipeline.import_jobs set available_at='-infinity' where id=%s",(j2,))
assert worker.run_one()["state"]=="completed"
passed("expired_lease_secure_recovery")
# A literal validation failure becomes a bounded terminal diagnostic, with no capture.
from types import SimpleNamespace
bad=SimpleNamespace(**{name:getattr(pipeline,name) for name in ("ArticleCandidate","HydratedArticle","validate_extraction","ALGORITHM_VERSION")})
bad.deterministic_literal_extraction=lambda item:(None,["synthetic withheld extraction"])
j3=worker.enqueue_source("c2",source("c2-validation"))
bad_worker=worker_mod.NativeIntakeWorker(wdb,bad)
baseline_counts=counts()
assert bad_worker.run_one()=={"state":"dead_letter","code":"literal_validation_failed"}
assert counts()==baseline_counts
assert one("select error_code from evidence_pipeline.import_jobs where id=%s",(j3,))=="literal_validation_failed"
assert worker.run(2)==[]
passed("terminal_validation_and_sanitized_diagnostic")
print(json.dumps({"section":"C2","status":"PORTABLE_SCOPE_PASS","hosted":False,"omissions":["nullable vector embeddings","parent lookup write semantics","spatial write constraints/triggers and non-null spatial candidates","populated reviewed claim analytical propagation","Auth/JWT/PostgREST/Edge/pooler/scheduler"],"build_repeated":False}),flush=True)
wdb.close();db.close()
