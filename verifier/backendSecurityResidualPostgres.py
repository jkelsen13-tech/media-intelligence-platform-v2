"""Isolated native-definition qualification for yhb projection-retraction ACL containment."""
import json, os, subprocess, uuid
from pathlib import Path

if os.environ.get("GITHUB_ACTIONS")!="true" or os.environ.get("MIP_DISPOSABLE_POSTGRES")!="residual-authority-qualification":
    raise SystemExit("fixed disposable GitHub Actions PostgreSQL only")

ENV={k:v for k,v in os.environ.items() if not k.startswith("PG")}
ENV.update(PGPASSWORD="mip-disposable-ci-only",PGCONNECT_TIMEOUT="5",
           PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=5000")
BASE=["psql","-X","-qAt","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","5432","-U","postgres"]
ROOT=Path("supabase/production-candidates/backend-consolidation-security")
C=(ROOT/"yhb_arc_projection_retract_containment_v1.sql").read_text()
I=(ROOT/"yhb_arc_projection_retract_containment_v1_inverse.sql").read_text()
F=(ROOT/"qualification/yhb_arc_projection_retract_native.sql").read_text()
DB="residual_acl_"+uuid.uuid4().hex[:10]
TARGET="public.mip_retract_arc_membership_projection(uuid)"
TRIGGER="public.mip_arc_membership_projection_state_change()"
EXPECTED={
 TARGET:"232c921ca5c157da976cd25b70f59fa0fa6364a0fe437092d5c4a55ba87d3023",
 TRIGGER:"ddeb2f97ad70b568c66770782f9fc7a724c7feebb0c9d810e409ab52ff9d0569",
}

def run(db,sql,ok=True):
    p=subprocess.run(BASE+["-d",db],input=sql,text=True,capture_output=True,env=ENV)
    if ok and p.returncode: raise RuntimeError(p.stderr or p.stdout)
    return p
def val(sql): return run(DB,sql).stdout.strip()
def denied(role,candidate):
    p=run(DB,f"set role {role}; select {TARGET.split('(')[0]}('{candidate}'::uuid);",False)
    assert p.returncode and "permission denied for function" in p.stderr.lower(),p.stderr
def seed(candidate,with_candidate=False):
    parts=[
      f"insert into arc_membership_projection_runs values('{candidate}','projected',null,now())",
      f"insert into edges values('{candidate}')",f"insert into sources values('{candidate}')",
      f"insert into arc_events values('{candidate}')",f"insert into nodes values('{candidate}')"]
    if with_candidate: parts.insert(0,f"insert into arc_membership_candidates values('{candidate}','approved')")
    run(DB,";".join(parts)+";")
def remaining(candidate):
    return val(f"""select (select state from arc_membership_projection_runs where candidate_id='{candidate}')
      ||':'||(select count(*) from edges where arc_membership_candidate_id='{candidate}')
      ||':'||(select count(*) from sources where arc_membership_candidate_id='{candidate}')
      ||':'||(select count(*) from arc_events where arc_membership_candidate_id='{candidate}')
      ||':'||(select count(*) from nodes where arc_membership_candidate_id='{candidate}');""")
def call(role,candidate):
    return val(f"set role {role}; select {TARGET.split('(')[0]}('{candidate}'::uuid)::text;")
def acl():
    return json.loads(val(f"""select jsonb_agg(jsonb_build_array(coalesce(g.rolname,'PUBLIC'),h.rolname,a.privilege_type,a.is_grantable)
      order by coalesce(g.rolname,'PUBLIC'),h.rolname,a.privilege_type)::text
      from pg_proc p cross join lateral aclexplode(p.proacl) a
      left join pg_roles g on g.oid=a.grantee join pg_roles h on h.oid=a.grantor
      where p.oid='{TARGET}'::regprocedure;"""))
def hashes():
    return json.loads(val(f"""select jsonb_object_agg(p.oid::regprocedure::text,
      encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'))::text
      from pg_proc p where p.oid=any(array['{TARGET}'::regprocedure,'{TRIGGER}'::regprocedure]);"""))

try:
    run("postgres","""do $x$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
      if not exists(select 1 from pg_roles where rolname='trigger_driver') then create role trigger_driver nologin; end if;
    end $x$;""")
    run("postgres",f'create database "{DB}";')
    run(DB,"create extension pgcrypto;"+F)
    assert hashes()==EXPECTED,hashes()
    before_acl=acl()
    assert before_acl==[
      ["anon","postgres","EXECUTE",False],["authenticated","postgres","EXECUTE",False],
      ["postgres","postgres","EXECUTE",False],["service_role","postgres","EXECUTE",False]]
    other_acl=val(f"select proacl::text from pg_proc where oid='{TRIGGER}'::regprocedure;")

    anon="00000000-0000-4000-8000-000000000101"
    auth="00000000-0000-4000-8000-000000000102"
    seed(anon); seed(auth)
    call("anon",anon); call("authenticated",auth)
    assert remaining(anon)=="retracted:0:0:0:0" and remaining(auth)=="retracted:0:0:0:0"

    run(DB,C)
    assert hashes()==EXPECTED and val(f"select proacl::text from pg_proc where oid='{TRIGGER}'::regprocedure;")==other_acl
    after=acl()
    assert after==[["postgres","postgres","EXECUTE",False],["service_role","postgres","EXECUTE",False]]

    denied_anon="00000000-0000-4000-8000-000000000103"
    denied_auth="00000000-0000-4000-8000-000000000104"
    seed(denied_anon);seed(denied_auth)
    denied("anon",denied_anon);denied("authenticated",denied_auth)
    assert remaining(denied_anon)=="projected:1:1:1:1"
    assert remaining(denied_auth)=="projected:1:1:1:1"

    service="00000000-0000-4000-8000-000000000105"
    seed(service);call("service_role",service)
    assert remaining(service)=="retracted:0:0:0:0"

    trigger_id="00000000-0000-4000-8000-000000000106"
    seed(trigger_id,True)
    assert val(f"select has_function_privilege('trigger_driver','{TARGET}','execute');")=="f"
    run(DB,f"set role trigger_driver; update arc_membership_candidates set state='rejected' where id='{trigger_id}';")
    assert remaining(trigger_id)=="retracted:0:0:0:0"

    rollback_id="00000000-0000-4000-8000-000000000107"
    seed(rollback_id)
    run(DB,f"begin;set role service_role;select {TARGET.split('(')[0]}('{rollback_id}'::uuid);rollback;")
    assert remaining(rollback_id)=="projected:1:1:1:1"

    run(DB,I)
    assert acl()==before_acl and hashes()==EXPECTED
    run(DB,C)
    assert acl()==after and hashes()==EXPECTED
    print(json.dumps({
      "status":"PASS",
      "native_definition_hashes":EXPECTED,
      "original_browser_destructive_path":["anon","authenticated"],
      "preserved":["service_role direct caller","postgres-owned state-change trigger path","definitions","non-target trigger ACL"],
      "recovery":"exact normalized ACL inverse then candidate replay",
      "transaction_failure":"synthetic destructive call rolled back with all rows restored",
      "limitations":["synthetic rows","milestone refresh loop had no evidence rows","approval/project path not exercised","no deployed Edge or external operator caller executed"]
    },sort_keys=True))
finally:
    run("postgres",f'drop database if exists "{DB}" with (force);',False)
