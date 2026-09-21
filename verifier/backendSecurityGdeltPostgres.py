"""Isolated native-definition ACL qualification for five staged-GDELT functions."""
import json, os, re, subprocess, uuid
from pathlib import Path
if os.environ.get("GITHUB_ACTIONS")!="true" or os.environ.get("MIP_DISPOSABLE_POSTGRES")!="gdelt-function-qualification":
    raise SystemExit("fixed disposable GitHub Actions PostgreSQL only")
E={k:v for k,v in os.environ.items() if not k.startswith("PG")}
E.update(PGPASSWORD="mip-disposable-ci-only",PGCONNECT_TIMEOUT="5",
         PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=5000")
B=["psql","-X","-qAt","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","5432","-U","postgres"]
R=Path("supabase/production-candidates/backend-consolidation-security")
M=Path("supabase/migrations")
C=(R/"yhb_gdelt_function_containment_v1.sql").read_text()
I=(R/"yhb_gdelt_function_containment_v1_inverse.sql").read_text()
H={
"mip_v2_gdelt_stage_batch(text,jsonb)":"a2002a66e606d9187bebb650213441efa6b67b54dc0c8a72d6f5456a227304ff",
"mip_v2_gdelt_materialize_batch(text,integer)":"184c0b5f31638c886f67c58d755b13e0e23105a70909e66dc1b1920a001ae9e7",
"mip_v2_gdelt_attach_batch(text,integer)":"44dd7112fca94db0586bff655b182f76c655ba3b7c22f6f878e3192d0174f9ac",
"mip_v2_gdelt_originate_batch(text,integer)":"7506627e27e7b83e4bf3e32dc56f5d1a644c6342461f1212fb44d3e9108d2ede",
"mip_v2_gdelt_close_staging(text)":"85b2bf4d3be95b4102ce2385d617cc1dd50586e07f158ec74f4480e6adfc2031"}
D="gdelt_acl_"+uuid.uuid4().hex[:10]
def run(db,sql,ok=True):
 p=subprocess.run(B+["-d",db],input=sql,text=True,capture_output=True,env=E)
 if ok and p.returncode: raise RuntimeError(p.stderr or p.stdout)
 return p
def val(sql): return run(D,sql).stdout.strip()
def err(sql,msg):
 p=run(D,sql,False); assert p.returncode and msg.lower() in p.stderr.lower(),p.stderr
def denied(role,expr): err(f"set role {role}; select {expr};","permission denied for function")
def block(src,name):
 m=re.search(rf"create or replace function public\.{re.escape(name)}\b.*?\n\$\$;",src,re.I|re.S)
 assert m,name
 return m.group(0)
def cat():
 return json.loads(val("""select jsonb_agg(jsonb_build_object(
 'sig',p.oid::regprocedure::text,'owner',r.rolname,'definer',p.prosecdef,
 'config',p.proconfig,'acl',p.proacl::text,
 'sha',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
 'anon',has_function_privilege('anon',p.oid,'execute'),
 'auth',has_function_privilege('authenticated',p.oid,'execute'),
 'service',has_function_privilege('service_role',p.oid,'execute'),
 'public',has_function_privilege('public',p.oid,'execute'))
 order by p.oid::regprocedure::text)::text from pg_proc p join pg_roles r on r.oid=p.proowner
 where p.oid=any(array[
 'public.mip_v2_gdelt_stage_batch(text,jsonb)'::regprocedure,
 'public.mip_v2_gdelt_materialize_batch(text,integer)'::regprocedure,
 'public.mip_v2_gdelt_attach_batch(text,integer)'::regprocedure,
 'public.mip_v2_gdelt_originate_batch(text,integer)'::regprocedure,
 'public.mip_v2_gdelt_close_staging(text)'::regprocedure]);"""))
def native(rows):
 assert len(rows)==5
 for x in rows:
  sig=x["sig"].replace("public.","")
  assert H[sig]==x["sha"],(sig,x["sha"])
  assert x["owner"]=="postgres" and x["definer"] and x["config"]==["search_path=public, pg_temp"]
  assert not x["public"]
  d=val(f"select pg_get_functiondef('public.{sig}'::regprocedure);").lower()
  assert not re.search(r"writer.?key|auth\\.uid|current_user|request\\.jwt|jwt\\(\\)",d)
BOOT=r"""
create extension pgcrypto;
do $roles$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator nologin noinherit; end if;
end $roles$;
grant anon,authenticated,service_role to authenticator;
create domain vector as text;
create table articles(id uuid primary key default gen_random_uuid(),feed text,outlet text,title text,url text unique,summary text,published_at timestamptz,body_text text,claims jsonb,unattributed boolean,monoculture boolean,is_digest boolean,ingestion_run_id text,source_status text,source_status_note text,arc_id uuid,arc_assignment_evidence jsonb,embedding vector);
create table entities(id uuid primary key default gen_random_uuid(),canonical_name text,normalized_name text unique,entity_type text,mention_count integer,last_seen timestamptz);
create table article_entities(article_id uuid,entity_id uuid,confidence numeric,extraction_method text,role text,primary key(article_id,entity_id));
create table nodes(id uuid primary key default gen_random_uuid(),slug text unique,label text,type text,description text,summary text,confidence numeric,occurred_at date,metadata jsonb,updated_at timestamptz default now());
create table story_arcs(id uuid primary key default gen_random_uuid(),slug text unique,title text,category text,category_confidence numeric,category_evidence jsonb,seed_article_id uuid,title_article_count integer,status text,root_node_id uuid,summary text,started_at date,last_assignment_run timestamptz,last_update_at timestamptz,embedding vector);
create table arc_entities(arc_id uuid,entity_id uuid,role text,primary key(arc_id,entity_id));
create table events(id uuid primary key default gen_random_uuid(),canonical_title text,occurred_at_start date,occurred_at_end date,arc_id uuid,status text,rule_version text,comparison_validation_state text);
create table event_articles(event_id uuid,article_id uuid,membership_method text,membership_confidence numeric,primary key(event_id,article_id));
create table pipeline_config(key text primary key,value jsonb);
-- Deliberately non-native dependency: pgvector is unavailable. The tested empty
-- chain cannot reach this stub; data-bearing membership compatibility is omitted.
create function attach_article_to_arc(uuid,uuid,vector,jsonb) returns jsonb language sql as $$select '{"status":"not_reached"}'::jsonb$$;
"""
S=(M/"20260823_gdelt_staged_bulk_ingestion.sql").read_text()
T=(M/"20260823_gdelt_origination_terminal_state.sql").read_text()
try:
 run("postgres",f'create database "{D}";'); run(D,BOOT); run(D,S)
 run(D,block(T,"mip_v2_gdelt_originate_batch"))
 run(D,"\n".join(f"revoke all on function public.{s} from public,anon,authenticated,service_role; grant execute on function public.{s} to anon,authenticated,service_role;" for s in H))
 b=cat(); native(b); assert all(x["anon"] and x["auth"] and x["service"] for x in b)
 bacl={x["sig"]:x["acl"] for x in b}
 roles=val("select jsonb_agg(jsonb_build_array(roleid::regrole::text,member::regrole::text,admin_option) order by 1,2)::text from pg_auth_members;")
 other=val("""select coalesce(jsonb_object_agg(p.oid::regprocedure::text,coalesce(p.proacl::text,'<null>') order by p.oid::regprocedure::text),'{}')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname<>all(array['mip_v2_gdelt_stage_batch','mip_v2_gdelt_materialize_batch','mip_v2_gdelt_attach_batch','mip_v2_gdelt_originate_batch','mip_v2_gdelt_close_staging']);""")
 for role,suf in (("anon","01"),("authenticated","02")):
  run(D,f"""select mip_v2_gdelt_begin_stage('mip-v2-gdelt-stage-202609{suf}','synthetic','urn:synthetic',date '2026-09-01',date '2026-09-01');
set role {role}; select mip_v2_gdelt_stage_batch('mip-v2-gdelt-stage-202609{suf}','[{{"gdelt_event_id":"{suf}","source_url":"https://synthetic.invalid/{suf}","source_domain":"synthetic.invalid"}}]'::jsonb);""")
  assert val(f"select count(*) from gdelt_staged_articles where run_id='mip-v2-gdelt-stage-202609{suf}';")=="1"
 run(D,C); a=cat(); native(a)
 assert all(not x["anon"] and not x["auth"] and x["service"] and not x["public"] for x in a)
 calls={"mip_v2_gdelt_stage_batch":"'x','[]'::jsonb","mip_v2_gdelt_materialize_batch":"'x',1","mip_v2_gdelt_attach_batch":"'x',1","mip_v2_gdelt_originate_batch":"'x',1","mip_v2_gdelt_close_staging":"'x'"}
 for role in ("anon","authenticated"):
  for name,args in calls.items(): denied(role,f"{name}({args})")
 run(D,"select mip_v2_gdelt_begin_stage('mip-v2-gdelt-stage-20260903','synthetic','urn:synthetic',date '2026-09-03',date '2026-09-03');")
 err("set role service_role; select mip_v2_gdelt_materialize_batch('mip-v2-gdelt-stage-20260903',1);","not ready to materialize")
 assert val("select state from gdelt_staging_runs where run_id='mip-v2-gdelt-stage-20260903';")=="staging"
 run(D,'''set role service_role;
select mip_v2_gdelt_stage_batch('mip-v2-gdelt-stage-20260903','[{"gdelt_event_id":"bad","source_url":"not-a-url","source_domain":"synthetic.invalid"}]'::jsonb);
select mip_v2_gdelt_close_staging('mip-v2-gdelt-stage-20260903');''')
 err("set role service_role; select mip_v2_gdelt_attach_batch('mip-v2-gdelt-stage-20260903',1);","not ready to attach")
 err("set role service_role; select mip_v2_gdelt_materialize_batch('mip-v2-gdelt-stage-20260903',0);","batch must be 1..500")
 assert val("select state from gdelt_staging_runs where run_id='mip-v2-gdelt-stage-20260903';")=="staged"
 run(D,"set role service_role; select mip_v2_gdelt_materialize_batch('mip-v2-gdelt-stage-20260903',5);")
 err("set role service_role; select mip_v2_gdelt_originate_batch('mip-v2-gdelt-stage-20260903',1);","not ready for origination")
 run(D,"set role service_role; select mip_v2_gdelt_attach_batch('mip-v2-gdelt-stage-20260903',5); select mip_v2_gdelt_originate_batch('mip-v2-gdelt-stage-20260903',5);")
 assert val("select state from gdelt_staging_runs where run_id='mip-v2-gdelt-stage-20260903';")=="completed"
 assert val("select jsonb_agg(jsonb_build_array(roleid::regrole::text,member::regrole::text,admin_option) order by 1,2)::text from pg_auth_members;")==roles
 assert val("""select coalesce(jsonb_object_agg(p.oid::regprocedure::text,coalesce(p.proacl::text,'<null>') order by p.oid::regprocedure::text),'{}')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname<>all(array['mip_v2_gdelt_stage_batch','mip_v2_gdelt_materialize_batch','mip_v2_gdelt_attach_batch','mip_v2_gdelt_originate_batch','mip_v2_gdelt_close_staging']);""")==other
 run(D,I); r=cat(); native(r); assert {x["sig"]:x["acl"] for x in r}==bacl
 run(D,C); r=cat(); native(r); assert all(not x["anon"] and not x["auth"] and x["service"] and not x["public"] for x in r)
 print(json.dumps({"status":"PASS","hashes":H,"browser_write_reproduced":["anon","authenticated"],"preserved":["postgres","service_role","PUBLIC absence","definitions","memberships","non-target ACLs"],"state_chain":["stage","close","materialize","attach","originate","completed"],"inverse":"exact direct ACL restoration and candidate replay","limitation":"synthetic empty-selection chain; pgvector helper and membership/queue triggers not executed"},sort_keys=True))
finally: run("postgres",f'drop database if exists "{D}" with (force);',False)
