"""J1 synthetic-only native archive restoration qualification."""
from pathlib import Path
import importlib.util
import hashlib
import json
import os
import sys
import psycopg
from psycopg import sql

ROOT=Path("/workspace")
if os.environ.get("MIP_J1_ISOLATION")!="network-none-socket-only":
    raise RuntimeError("isolated invocation required")
if any(k in os.environ for k in ("SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","GITHUB_TOKEN","OPENAI_API_KEY","PGHOST")):
    raise RuntimeError("production transport or credential refused")
def connect(name,user="postgres"):
    return psycopg.connect(dbname=name,user=user,host="/var/run/postgresql",autocommit=True)
admin=connect("postgres")
for statement in ("create role anon nologin","create role authenticated nologin","create role service_role nologin bypassrls","create role spatial_owner nologin","create role spatial_writer_runtime login"):
    admin.execute(statement)
for name in ("mip_jfn_source","mip_jfn_archive","mip_jfn_restore"):
    admin.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
source=connect("mip_jfn_source");archive=connect("mip_jfn_archive");target=connect("mip_jfn_restore")
for db in (source,archive,target):
    assert db.execute("select inet_server_addr() is null,current_setting('server_version_num')").fetchone()==(True,"170006")
    db.execute("set statement_timeout='20s';set lock_timeout='3s'")
native=(ROOT/"verifier/jfn-retirement/native_structure.sql").read_text()
source.execute(native);target.execute(native)
source.execute((ROOT/"verifier/jfn-retirement/synthetic_rows.sql").read_text())
archive.execute("create schema mip_private")
for name in ("20260909181233_spatial_history_retention.sql","20260909190228_spatial_parent_retention.sql","20260909191503_spatial_source_ancestor.sql"):
    archive.execute((ROOT/"supabase/migrations"/name).read_text())
spec=importlib.util.spec_from_file_location("j1_preservation",ROOT/"verifier/jfn-retirement/preservation.py")
helper=importlib.util.module_from_spec(spec);sys.modules[spec.name]=helper;spec.loader.exec_module(helper)
def passed(case): print(json.dumps({"case":case,"status":"PASS"}),flush=True)
def reject(call,code=None,message=None):
    try:call()
    except Exception as e:
        if code: assert getattr(e,"sqlstate",None)==code,(type(e).__name__,getattr(e,"sqlstate",None))
        if message: assert str(e)==message,(type(e).__name__,str(e))
        return
    raise AssertionError("expected refusal")
def digest(db,relation):
    return db.execute(sql.SQL("select count(*)::int,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') from {} t").format(sql.Identifier(*relation.split(".")))).fetchone()
manifest={r:dict(zip(("count","sha256"),digest(source,r))) for r in sorted(helper.RELATIONS)}
facts=json.loads((ROOT/"verifier/jfn-retirement/native_facts.json").read_text())
for name,expected in facts["functionHashes"].items():
    got=source.execute("select encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='spatial' and p.proname=%s",(name,)).fetchone()[0]
    assert got==expected,name
assert len(facts["functionHashes"])==17
passed("native_definition_identity_and_constraints")
# Existing retention owner, actual SQL and raw JSONB text; no payload parsed in Python.
for relation in list(helper.SPATIAL)+list(helper.PARENTS):
    raw=source.execute(sql.SQL("select jsonb_agg(to_jsonb(t) order by id)::text from {} t").format(sql.Identifier(*relation.split(".")))).fetchone()[0]
    archive.execute("set role service_role")
    try:
        receipt=archive.execute("select mip_private.retain_spatial_rows(%s,%s,clock_timestamp(),%s::jsonb)",(helper.SOURCE_PROJECT,relation,raw)).fetchone()[0]
        assert receipt["inserted"]==manifest[relation]["count"]
        replay=archive.execute("select mip_private.retain_spatial_rows(%s,%s,clock_timestamp(),%s::jsonb)",(helper.SOURCE_PROJECT,relation,raw)).fetchone()[0]
        assert replay["inserted"]==0
    finally:archive.execute("reset role")
verified=helper.verify_archive(archive,manifest)
assert verified["rows"]==sum(i["count"] for i in manifest.values())
passed("source_qualified_archive_exactness_replay_and_closure")
catalog=helper.catalog_signature(target)
def restore():return helper.restore_isolated(archive,target,manifest,catalog,isolation_token="synthetic-isolated-restore")
reject(lambda:helper.restore_isolated(archive,source,manifest,catalog,isolation_token="synthetic-isolated-restore"))
wrong={r:dict(v) for r,v in manifest.items()};wrong["public.nodes"]["sha256"]="0"*64
reject(lambda:helper.verify_archive(archive,wrong))
target.execute("alter role anon bypassrls")
reject(restore)
target.execute("alter role anon nobypassrls")
assert helper.catalog_signature(target)==catalog
passed("target_identity_manifest_and_role_drift_refused")
# Missing dependency is tested on a disposable view of the real immutable archive.
archive.execute("alter table mip_private.spatial_row_versions rename to j1_saved_versions")
archive.execute("create view mip_private.spatial_row_versions as select * from mip_private.j1_saved_versions where source_relation<>'public.nodes'")
missing={r:dict(v) for r,v in manifest.items()};missing["public.nodes"]={"count":0,"sha256":hashlib.sha256(b"").hexdigest()}
reject(lambda:helper.verify_archive(archive,missing),message="archive dependency missing")
archive.execute("drop view mip_private.spatial_row_versions;alter table mip_private.j1_saved_versions rename to spatial_row_versions")
passed("missing_dependency_refused")
# A source field absent from the target must fail, even when its value is null.
archive.execute("alter table mip_private.spatial_row_versions rename to j1_saved_versions")
archive.execute("""create view mip_private.spatial_row_versions as
select source_project,source_relation,source_key,
 encode(sha256(convert_to(case when source_relation='public.articles' then (payload||'{"embedding":null}'::jsonb)::text else payload::text end,'UTF8')),'hex') as payload_hash,
 case when source_relation='public.articles' then payload||'{"embedding":null}'::jsonb else payload end as payload,
 source_observed_at,retained_at from mip_private.j1_saved_versions""")
extra={r:dict(v) for r,v in manifest.items()}
extra["public.articles"]["sha256"]=archive.execute("select encode(sha256(convert_to(payload::text,'UTF8')),'hex') from mip_private.spatial_row_versions where source_relation='public.articles'").fetchone()[0]
reject(lambda:helper.restore_isolated(archive,target,extra,catalog,isolation_token="synthetic-isolated-restore"),message="isolated target lacks exact payload fields")
assert all(digest(target,r)[0]==0 for r in helper.RELATIONS)
archive.execute("drop view mip_private.spatial_row_versions;alter table mip_private.j1_saved_versions rename to spatial_row_versions")
passed("unknown_nullable_field_refused_without_partial_restore")
# Consequential interruption after parents have been inserted must roll back all rows.
target.execute("create function public.j1_interrupt() returns trigger language plpgsql as $$begin raise exception 'synthetic interruption';end$$")
target.execute("create trigger j1_interrupt before insert on spatial.assertion_revisions for each row execute function public.j1_interrupt()")
interrupted_catalog=helper.catalog_signature(target)
reject(lambda:helper.restore_isolated(archive,target,manifest,interrupted_catalog,isolation_token="synthetic-isolated-restore"),message="isolated restore failed")
assert all(digest(target,r)[0]==0 for r in helper.RELATIONS)
target.execute("drop trigger j1_interrupt on spatial.assertion_revisions;drop function public.j1_interrupt()")
assert helper.catalog_signature(target)==catalog
passed("interrupted_restore_atomic_recovery")
result=restore();assert result["state"]=="restored",result
assert all(digest(target,r)==(v["count"],v["sha256"]) for r,v in manifest.items())
assert restore()["state"]=="verified_noop"
assert helper.catalog_signature(target)==catalog
assert target.execute("select metadata->>'large_integer' from public.nodes").fetchone()[0]=="900719925474099312345"
assert target.execute("select canonical_geojson->'coordinates'->>0 from spatial.geometry_snapshots").fetchone()[0]=="12.1234567890123456789"
assert target.execute("select count(distinct location_role) from spatial.assertion_revisions").fetchone()[0]==2
assert target.execute("select count(*) from spatial.revision_lineage").fetchone()[0]==1
assert target.execute("select count(*) from spatial.release_decisions where predecessor_release_decision_id is not null").fetchone()[0]==1
passed("native_restore_exact_identity_precision_temporal_lineage_and_noop")
# Exact restored native authorities, not administrator impersonation as worker.
for role in ("anon","authenticated"):
    target.execute("set role "+role);archive.execute("set role "+role)
    try:
        reject(lambda:target.execute("select * from spatial.assertion_revisions"),"42501")
        reject(lambda:target.execute("select * from public.articles"),"42501")
        reject(lambda:archive.execute("select payload from mip_private.spatial_row_versions"),"42501")
        assert target.execute("select count(*) from public.nodes").fetchone()[0]==1
    finally:target.execute("reset role");archive.execute("reset role")
reject(lambda:target.execute("update spatial.assertion_revisions set location_role='publisher'"))
reject(lambda:archive.execute("truncate mip_private.spatial_row_versions"))
target.execute("set role spatial_writer_runtime")
reject(lambda:target.execute("select spatial.append_audience_scope('x','x','{}','{}',encode(sha256(convert_to('{}','UTF8')),'hex'),now(),null,'synthetic')"),"42501")
target.execute("reset role")
writer=connect("mip_jfn_restore","spatial_writer_runtime")
assert writer.execute("select session_user,current_user").fetchone()==("spatial_writer_runtime","spatial_writer_runtime")
writer.execute("select spatial.append_audience_scope('synthetic-writer','v1','{}','{}',encode(sha256(convert_to('{}','UTF8')),'hex'),'2026-01-01',null,'j1-synthetic')")
assert target.execute("select created_by_principal_ref from spatial.audience_scopes where audience_code='synthetic-writer'").fetchone()[0]=="db_role:spatial_writer_runtime;run:j1-synthetic"
writer.close()
# Source role login semantics are tested by real separate socket connection, not hosted auth.
passed("restored_authority_private_denials_and_direct_wire_identity")
reject(restore) # extra writer row makes target divergent; never overwrite it.
passed("divergent_target_refused")
print(json.dumps({"section":"J1","status":"SYNTHETIC_NATIVE_RECOVERY_PASS","rows":verified["rows"],"relations":21,"functions":17,"hosted":False,"live_transfer":False,"omissions":["nullable vector embedding type/column","Auth/profile and managed project config","hosted login credential/pooler/Auth/PostgREST behavior","real archived material recovery"],"catalog_sha256":catalog}),flush=True)
for db in (source,archive,target,admin):db.close()
