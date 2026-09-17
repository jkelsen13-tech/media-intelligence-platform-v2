"""Disposable exact-chain EFTA qualification. Never accepts a production DSN or emits a dump."""
import json, os, pathlib, subprocess, unittest, uuid, time
import comparisonPostgresConcurrency as base

ROOT=pathlib.Path(__file__).resolve().parents[1]
MANIFEST=json.loads((ROOT/"verifier/efta-postgres-qualification-manifest.json").read_text())
SOURCES=json.loads((ROOT/"verifier/efta-governed-demo/manifest.json").read_text())["sources"]
if os.environ.get("GITHUB_ACTIONS")!="true" or os.environ.get("MIP_EFTA_DISPOSABLE_POSTGRES")!="exact-001-011":
    raise SystemExit("EFTA qualification is restricted to the disposable GitHub Actions PostgreSQL service")
ENV={k:v for k,v in os.environ.items() if not k.startswith("PG")}
ENV.update(PGPASSWORD="mip-efta-disposable-ci-only",PGCONNECT_TIMEOUT="5",
           PGOPTIONS="-c statement_timeout=20000 -c lock_timeout=12000")
PSQL=["psql","-X","-qAt","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","5432","-U","postgres"]
TEMPLATE="mip_efta_template"
SUBJECT="11111111-1111-4111-8111-111111111111"
RUNTIME="efta-qualification-runtime"
ROLES=("mip_efta_reviewer_v1","mip_efta_admitter_v1","mip_efta_private_reader_v1")
KEY="20000000-0000-4000-8000-000000000001"
CREDENTIAL="21000000-0000-4000-8000-000000000001"
MAPPINGS={r:f"30000000-0000-4000-8000-00000000000{i}" for i,r in enumerate(ROLES,1)}
SESSIONS={r:f"40000000-0000-4000-8000-00000000000{i}" for i,r in enumerate(ROLES,1)}
AUTHS={r:f"41000000-0000-4000-8000-00000000000{i}" for i,r in enumerate(ROLES,1)}
ASSIGNMENTS={r:f"50000000-0000-4000-8000-00000000000{i}" for i,r in enumerate(ROLES,1)}
INSTITUTIONS={
 "us-congress-enacted-law":("62bb9132-5a8a-581f-992f-f0a38ae78e39","61000000-0000-4000-8000-000000000001","United States Congress","legislature",None),
 "doj-executive":("a95e3f14-f75d-5718-a7b3-55e4c4e055a9","61000000-0000-4000-8000-000000000002","United States Department of Justice","executive_department",None),
 "doj-oig":("d9e9e444-d183-5e9e-b4cb-f0b4670723a3","61000000-0000-4000-8000-000000000003","U.S. Department of Justice Office of Inspector General","inspector_general","a95e3f14-f75d-5718-a7b3-55e4c4e055a9")
}
def q(v):
    if v is None:return "null"
    return "'"+str(v).replace("'","''")+"'"
def run(db,sql,timeout=40):
    p=subprocess.run(PSQL+["-d",db],input=sql,text=True,capture_output=True,timeout=timeout,env=ENV)
    if p.returncode: raise RuntimeError(p.stderr.strip())
    return p.stdout.strip()
def file_sql(path): return (ROOT/path).read_text()
def git_blob(path):
    return subprocess.check_output(["git","hash-object",str(ROOT/path)],text=True).strip()
def uuid_for(*parts): return str(uuid.uuid5(uuid.NAMESPACE_URL,"qualification:"+":".join(parts)))
def build_extra_schema():
    generic=["claims","article_claims","claim_evidence_links","claim_corrections","story_arcs","nodes","edges","arc_events","arc_milestones","arc_membership_candidates"]
    sql="""alter table public.articles add column reader_state text not null default 'pending_review';
alter table public.articles add column source_status text not null default 'active';
alter table public.articles enable row level security; alter table public.articles force row level security;
"""
    for name in generic:
        sql+=f"create table public.{name}(id uuid primary key default gen_random_uuid(),payload jsonb not null default '{{}}'::jsonb);\n"
    sql+="""drop table public.explanations;
create table public.explanations(
 id uuid primary key default gen_random_uuid(),assertion_id text not null,assertion_type text not null,
 version integer not null,is_current boolean not null default true,source_ids uuid[] not null default '{}',
 archived_sources jsonb not null default '[]',source_roles jsonb not null default '{}',supporting_passage text,
 contradicting_evidence jsonb not null default '[]',missing_evidence jsonb not null default '[]',
 shared_entities uuid[] not null default '{}',relationship_type text,rule_version text,provenance_class text not null,
 created_at timestamptz not null default now(),recomputed_at timestamptz,reviewed_at timestamptz,
 review_status text not null default 'draft',falsification_condition text,correction_history jsonb not null default '[]',
 remaining_uncertainty text,state text not null default 'explanation_pending');
create schema evidence_pipeline;
create table evidence_pipeline.article_captures(
 id uuid primary key,article_id uuid not null references public.articles,id_unused text,content_hash text not null,
 payload jsonb not null,captured_at timestamptz not null default clock_timestamp(),review_state text not null default 'pending');
create table evidence_pipeline.evidence_candidates(
 id uuid primary key,capture_id uuid not null references evidence_pipeline.article_captures,
 source_field text,span_start int,span_end int,excerpt text,review_state text default 'pending',
 predecessor_candidate_id uuid,event_node_id uuid,related_node_id uuid,place_id uuid,spatial_revision_id uuid);
alter table evidence_pipeline.article_captures enable row level security;
alter table evidence_pipeline.article_captures force row level security;
alter table evidence_pipeline.evidence_candidates enable row level security;
alter table evidence_pipeline.evidence_candidates force row level security;
"""
    return sql
def seed_sources(db):
    for s in SOURCES:
        payload={"url":s["url"],"title":s["title"],"outlet":s["outlet"],"summary":None,
                 "body_text":s["excerpt"],"published_at":None}
        run(db,f"""insert into public.articles(id,url,title,outlet,summary,body_text,published_at,reader_state,source_status)
values({q(s['article_id'])},{q(s['url'])},{q(s['title'])},{q(s['outlet'])},null,{q(s['excerpt'])},null,'pending_review','active');
insert into evidence_pipeline.article_captures(id,article_id,content_hash,payload)
values({q(s['capture_id'])},{q(s['article_id'])},{q(s['content_hash'])},{q(json.dumps(payload,separators=(',',':')))}::jsonb);
insert into evidence_pipeline.evidence_candidates(id,capture_id,source_field,span_start,span_end,excerpt)
values({q(s['candidate_id'])},{q(s['capture_id'])},{q(s['source_field'])},{s['span_start']},{s['span_end']},{q(s['excerpt'])});""")
def seed_authority(db):
    run(db,f"""insert into mip_identity.key_versions values(
 {q(KEY)},'qualification-issuer','qualification-key','{{}}','2020-01-01','2999-01-01','mechanism-only');
insert into mip_identity.key_heads values('qualification-issuer','qualification-key',{q(KEY)},true);
with x as(select {q(CREDENTIAL)}::uuid revision,'efta-private-gateway-v1'::text gateway_id,
 repeat('a',64)::text fingerprint,null::uuid predecessor,'current'::text state,
 '2020-01-01'::timestamptz valid_from,'2999-01-01'::timestamptz valid_until)
insert into mip_identity.efta_gateway_credential_versions
select revision,gateway_id,fingerprint,predecessor,state,'owner_approved',repeat('b',64),
 comparison_qualification.argument_digest(jsonb_build_object('revision',revision,'gateway_id',gateway_id,
 'credential_fingerprint_hash',fingerprint,'predecessor',predecessor,'state',state,
 'valid_from',valid_from,'valid_until',valid_until)),valid_from,valid_until,clock_timestamp() from x;
insert into mip_identity.efta_gateway_credential_heads values('efta-private-gateway-v1',{q(CREDENTIAL)},true);""")
    for i,role in enumerate(ROLES,1):
        mapping=MAPPINGS[role];session=SESSIONS[role];auth=AUTHS[role];assignment=ASSIGNMENTS[role]
        token=(hex(i)[2:]*64)[:64]
        run(db,f"""insert into mip_identity.mapping_versions values(
 {q(mapping)},{q(RUNTIME)},{q(role)},'qualification-issuer','qualification-audience',
 {q('auth_user:'+SUBJECT)},{q(KEY)},600,'mechanism-only');
insert into mip_identity.mapping_heads values({q(RUNTIME)},{q(role)},{q(mapping)},true);
insert into comparison_qualification.principal_sessions(session_id,principal,runtime_id,expires_at)
values({q(session)},{q(role)},{q(RUNTIME)},'2999-01-01');
insert into mip_identity.sessions values({q(session)},{q(auth)},{q(token)},{q(mapping)},{q(KEY)},'2999-01-01','mechanism-only');
with x as(select {q(assignment)}::uuid revision,{q(SUBJECT)}::uuid subject_id,{q(role)}::text principal,
 {q(mapping)}::uuid mapping_revision,{q(KEY)}::uuid key_revision,{q(CREDENTIAL)}::uuid credential_revision,
 null::uuid predecessor,'2020-01-01'::timestamptz valid_from,'2999-01-01'::timestamptz valid_until)
insert into mip_identity.efta_authority_assignment_versions
select revision,subject_id,principal,'efta-bounded-demo-v1',mapping_revision,key_revision,credential_revision,
 predecessor,'owner_approved',repeat('c',64),
 comparison_qualification.argument_digest(jsonb_build_object('revision',revision,'subject_id',subject_id,
 'database_principal',principal,'scope','efta-bounded-demo-v1','mapping_revision',mapping_revision,
 'key_revision',key_revision,'credential_revision',credential_revision,'predecessor',predecessor,
 'valid_from',valid_from,'valid_until',valid_until)),'disposable mechanism fixture',valid_from,valid_until,clock_timestamp() from x;
insert into mip_identity.efta_authority_assignment_heads values({q(SUBJECT)},{q(role)},{q(assignment)},true);""")
    for origin,(iid,revision,label,kind,parent) in INSTITUTIONS.items():
        receipt=json.dumps({"contract":"efta-ci-institution-v1","mechanism_fixture":True,"origin":origin},separators=(",",":"))
        run(db,f"""insert into mip_identity.efta_institution_versions(
revision,institution_id,normalized_label,institution_kind,parent_institution_id,predecessor,state,approval_state,
proposal_receipt,proposal_receipt_hash,owner_approval_receipt_hash)
values({q(revision)},{q(iid)},{q(label)},{q(kind)},{q(parent)},null,'current','owner_approved',
{q(receipt)}::jsonb,comparison_qualification.argument_digest({q(receipt)}::jsonb),repeat('d',64));
insert into mip_identity.efta_institution_heads values({q(iid)},{q(revision)},true);""")
    for s in SOURCES:
        for op in ("retention","analysis","excerpt_display"):
            for domain in ("rights","privacy"):
                rev=uuid_for(s["candidate_id"],op,domain)
                run(db,f"""insert into mip_identity.efta_operation_evidence_versions(
revision,candidate_id,operation,domain,audience,capture_id,content_hash,evidence_ref,evidence_hash,
authority_adapter,disposition,approval_state,owner_approval_receipt_hash,non_fixture,valid_from,valid_until)
values({q(rev)},{q(s['candidate_id'])},{q(op)},{q(domain)},'isolated_internal_review',
{q(s['capture_id'])},{q(s['content_hash'])},{q('qualification-authoritative-record:'+s['candidate_id']+':'+op+':'+domain)},
repeat('e',64),'efta-authoritative-rights-privacy-v1','allow','owner_approved',repeat('f',64),true,'2020-01-01','2999-01-01');
insert into mip_identity.efta_operation_evidence_heads values({q(s['candidate_id'])},{q(op)},{q(domain)},{q(rev)},true);""")
def build_template():
    run("postgres",f"drop database if exists {TEMPLATE};create database {TEMPLATE};")
    for f in ["contract.sql","selection.sql","capability.sql","source-fixture.sql","source-snapshot.sql"]:
        run(TEMPLATE,file_sql(pathlib.Path("supabase/qualification/comparison-generations")/f))
    run(TEMPLATE,build_extra_schema())
    paths=[x["path"] for x in MANIFEST["migrations"]]
    for path in paths[:6]: run(TEMPLATE,file_sql(path),90)
    run(TEMPLATE,"insert into mip_identity.collector_config values(true,'efta-bounded-demo-v1');select mip_identity.capture_backlog();")
    run(TEMPLATE,file_sql(paths[6]),90)
    run(TEMPLATE,"select mip_identity.install_survivor_fences();")
    for path in paths[7:]: run(TEMPLATE,file_sql(path),120)
    seed_sources(TEMPLATE)
    seed_authority(TEMPLATE)
def role_sql(session,role,sql):
    session.execute("reset role;set role "+role+";")
    return session.execute(sql)
class EftaPG(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.blobs={x["path"]:git_blob(x["path"]) for x in MANIFEST["migrations"]}
        for x in MANIFEST["migrations"]:
            if cls.blobs[x["path"]]!=x["blob"]: raise AssertionError("migration blob mismatch: "+x["path"])
        build_template()
    @classmethod
    def tearDownClass(cls):
        run("postgres",f"drop database if exists {TEMPLATE};")
    def setUp(self):
        self.db="mip_efta_"+uuid.uuid4().hex
        run("postgres",f"create database {self.db} template {TEMPLATE};")
        self.sessions=[]
        self.addCleanup(self.cleanup)
    def cleanup(self):
        for s in self.sessions:s.close()
        run("postgres",f"drop database if exists {self.db};")
    def session(self):
        s=base.Session(self.db);self.sessions.append(s);return s
    def admin(self,sql): return run(self.db,sql)
    def blocked(self,waiter,holder):
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if self.admin(f"select {holder.pid}=any(pg_blocking_pids({waiter.pid}));")=="t":return
            time.sleep(.03)
        self.fail("expected lock wait")
    def resolve_all(self,s=None):
        s=s or self.session();ids={}
        for origin,(_,revision,_,_,_) in INSTITUTIONS.items():
            rid=uuid_for("resolution",origin)
            sql=f"select mip_identity.efta_resolve_identity({q(rid)},{q(origin)},{q(revision)},null,'resolved','mechanism qualification',{q(SESSIONS[ROLES[0]])},{q(RUNTIME)},{q(ASSIGNMENTS[ROLES[0]])});"
            ids[origin]=role_sql(s,ROLES[0],sql)
        return ids
    def review(self,source,resolution):
        return {"reason":"disposable PostgreSQL mechanism qualification","semantic_kind":source["semantic_kind"],
          "audience":"isolated_internal_review","publication_allowed":False,"uncertainty":source["remaining_uncertainty"],
          "event_time":{"date":source["source_date"],"precision":"day",
             "evidence_basis":source["event_time_proposal"]["basis_id"],"uncertainty":"day only"},
          "identity_resolution_id":resolution}
    def decide(self,s,source,resolution,request=None,action="approve",predecessor=None,review=None):
        request=request or str(uuid.uuid4());review=review or self.review(source,resolution)
        sql=f"select mip_identity.efta_decide({q(request)},{q(source['candidate_id'])},{q(action)},{q(predecessor)},{q(json.dumps(review,separators=(',',':')))}::jsonb,{q(SESSIONS[ROLES[0]])},{q(RUNTIME)},{q(ASSIGNMENTS[ROLES[0]])});"
        return role_sql(s,ROLES[0],sql),request
    def admit(self,s,decision,request=None):
        request=request or str(uuid.uuid4())
        sql=f"select mip_identity.efta_admit({q(request)},{q(decision)},{q(SESSIONS[ROLES[1]])},{q(RUNTIME)},{q(ASSIGNMENTS[ROLES[1]])});"
        return role_sql(s,ROLES[1],sql),request
    def read(self,s,request=None):
        request=request or str(uuid.uuid4())
        sql=f"select mip_identity.efta_private_read({q(request)},{q(SESSIONS[ROLES[2]])},{q(RUNTIME)},{q(ASSIGNMENTS[ROLES[2]])});"
        return json.loads(role_sql(s,ROLES[2],sql)),request
    def admit_all(self):
        s=self.session();res=self.resolve_all(s);decisions=[]
        for src in SOURCES:
            d,_=self.decide(s,src,res[src["origin_id"]]);self.admit(s,d);decisions.append(d)
        return s,res,decisions
    def test_exact_install_revision_anchors_and_scope(self):
        self.assertTrue(self.admin("show server_version").startswith("17.6"))
        self.assertEqual(self.admin("""select count(*) from mip_identity.efta_scope s
join mip_identity.source_changes a on a.relation_name='public.articles' and a.row_key=s.binding->>'article_id'
join mip_identity.source_changes c on c.relation_name='evidence_pipeline.article_captures' and c.row_key=s.binding->>'capture_id'
join mip_identity.source_changes e on e.relation_name='evidence_pipeline.evidence_candidates' and e.row_key=s.candidate_id::text"""),"7")
        self.assertEqual(self.admin("select count(*) from mip_identity.efta_operation_evidence_heads where active"),"42")
        self.assertEqual(self.admin("select count(*) from mip_identity.efta_institution_heads where active"),"3")
    def test_acl_rls_owners_search_path_and_default_acl(self):
        self.assertEqual(self.admin("""select count(*) from pg_roles where rolname like 'mip_efta_%'
and not rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb and not rolinherit and not rolreplication and not rolbypassrls"""),"4")
        self.assertEqual(self.admin("""select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_roles r on r.oid=p.proowner where n.nspname='mip_identity'
and p.proname in('efta_current_binding','efta_require_identity','efta_resolve_identity','efta_decide','efta_admit','efta_private_read')
and p.prosecdef and r.rolname='mip_efta_owner_v1' and p.proconfig@>array['search_path=']"""),"6")
        self.assertEqual(self.admin("""select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_roles r on r.oid=c.relowner where n.nspname='mip_identity' and c.relname like 'efta_%'
and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity and r.rolname='mip_cutover_schema_owner_v1'"""),"12")
        for role in ("public","anon","authenticated","service_role","mip_factual_reviewer_v3","mip_projection_publisher_v1"):
            self.assertEqual(self.admin(f"""select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='mip_identity' and p.proname like 'efta_%'
and has_function_privilege({q(role)},p.oid,'execute')"""),"0")
        self.assertEqual(self.admin("""select count(*) from pg_default_acl d join pg_roles r on r.oid=d.defaclrole,
lateral aclexplode(d.defaclacl) x where r.rolname='mip_efta_owner_v1'
and d.defaclobjtype='f' and x.grantee=0 and (x.privilege_type='EXECUTE')"""),"0")
        self.assertEqual(self.admin("select has_function_privilege('service_role','mip_identity.efta_private_read(uuid,uuid,text,uuid)','execute')"),"f")
        self.assertEqual(self.admin("select has_table_privilege('authenticated','mip_identity.efta_decisions','select')"),"f")
    def test_governed_end_to_end_replay_correction_reversal_and_identity(self):
        s,res,decisions=self.admit_all();payload,receipt=self.read(s)
        self.assertEqual(len(payload["sources"]),7);self.assertFalse(payload["public_release"])
        self.assertEqual(payload["contract"],"efta-private-review-v2")
        self.assertTrue(all(x["review"]["entity"]["kind"]=="institution" for x in payload["sources"]))
        same,_=self.read(s,receipt);self.assertEqual(same,payload)
        src=SOURCES[0];corr=str(uuid.uuid4())
        corrected={**self.review(src,res[src["origin_id"]]),"reason":"corrected immutable review"}
        d2,_=self.decide(s,src,res[src["origin_id"]],corr,"correct",decisions[0],corrected)
        self.admit(s,d2)
        rev,_=self.decide(s,src,res[src["origin_id"]],action="reverse",predecessor=d2,
                          review={"reason":"withdraw private review"})
        after,_=self.read(s);self.assertEqual(len(after["sources"]),6)
        self.assertEqual(self.admin("select count(*) from mip_identity.efta_decisions where candidate_id="+q(src["candidate_id"])),"3")
    def test_stale_source_permission_identity_and_replay_fail_closed(self):
        s=self.session();res=self.resolve_all(s);src=SOURCES[0]
        d,request=self.decide(s,src,res[src["origin_id"]]);self.admit(s,d)
        self.admin("update mip_identity.efta_operation_evidence_heads set active=false where candidate_id="+q(src["candidate_id"])+" and operation='analysis' and domain='rights'")
        with self.assertRaisesRegex(RuntimeError,"operation_denied|stale"):self.read(s)
        with self.assertRaisesRegex(RuntimeError,"operation_denied|stale"):self.decide(s,src,res[src["origin_id"]],request=request)
        self.admin("update mip_identity.efta_operation_evidence_heads set active=true where candidate_id="+q(src["candidate_id"])+" and operation='analysis' and domain='rights'")
        self.admin("update public.articles set body_text='changed' where id="+q(src["article_id"]))
        with self.assertRaisesRegex(RuntimeError,"stale"):self.read(s)
    def test_unrelated_review_release_publication_and_direct_dml_denied(self):
        s=self.session()
        forbidden=[
          ("mip_efta_reviewer_v1","select mip_factual.review_publish(gen_random_uuid(),'x')"),
          ("mip_efta_private_reader_v1","select mip_identity.release_isolated(gen_random_uuid(),gen_random_uuid(),'x',gen_random_uuid())"),
          ("mip_efta_admitter_v1","select mip_identity.stage_review(gen_random_uuid(),'x',gen_random_uuid())"),
          ("mip_efta_private_reader_v1","insert into public.claims default values"),
          ("mip_efta_reviewer_v1","select * from mip_identity.efta_decisions")]
        for role,sql in forbidden:
            with self.assertRaisesRegex(RuntimeError,"permission denied"):role_sql(s,role,sql)
        with self.assertRaisesRegex(RuntimeError,"public_release_disabled"):
            self.admin("select mip_identity.release_public()")
    def test_concurrent_decisions_serialize_and_loser_denies(self):
        a=self.session();b=self.session();res=self.resolve_all(a);src=SOURCES[0]
        review=q(json.dumps(self.review(src,res[src["origin_id"]]),separators=(",",":")))
        a.execute("reset role;set role mip_efta_reviewer_v1;begin;")
        one=str(uuid.uuid4());two=str(uuid.uuid4())
        a.execute(f"select mip_identity.efta_decide({q(one)},{q(src['candidate_id'])},'approve',null,{review}::jsonb,{q(SESSIONS[ROLES[0]])},{q(RUNTIME)},{q(ASSIGNMENTS[ROLES[0]])})")
        b.execute("reset role;set role mip_efta_reviewer_v1;")
        b.start(f"select mip_identity.efta_decide({q(two)},{q(src['candidate_id'])},'approve',null,{review}::jsonb,{q(SESSIONS[ROLES[0]])},{q(RUNTIME)},{q(ASSIGNMENTS[ROLES[0]])})")
        self.blocked(b,a);a.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"predecessor_conflict"):b.finish()
        self.assertEqual(self.admin("select count(*) from mip_identity.efta_decisions"),"1")
    def test_private_read_serializes_source_change_then_invalidates(self):
        reader,res,decisions=self.admit_all()
        reader.execute("reset role;set role mip_efta_private_reader_v1;begin;")
        rid=str(uuid.uuid4())
        reader.execute(f"select mip_identity.efta_private_read({q(rid)},{q(SESSIONS[ROLES[2]])},{q(RUNTIME)},{q(ASSIGNMENTS[ROLES[2]])})")
        mut=self.session();mut.execute("reset role;")
        mut.start("update public.articles set body_text='changed' where id="+q(SOURCES[0]["article_id"]))
        self.blocked(mut,reader);reader.execute("commit;");mut.finish()
        with self.assertRaisesRegex(RuntimeError,"stale"):self.read(self.session())
if __name__=="__main__":
    run("postgres","do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end$$;")
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(EftaPG)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    receipt={"contract":"efta-postgres-qualification-receipt-v1","git_sha":os.environ.get("GITHUB_SHA"),
      "postgres":run("postgres","show server_version"),"migration_blobs":getattr(EftaPG,"blobs",{}),
      "tests_run":result.testsRun,"failures":len(result.failures),"errors":len(result.errors),
      "fixture":"disposable mechanism-only; no owner authorization, production data, credential, token, admission or release",
      "result":"PASS" if result.wasSuccessful() else "FAIL"}
    print("MIP_EFTA_POSTGRES_RECEIPT="+json.dumps(receipt,sort_keys=True),flush=True)
    raise SystemExit(0 if result.wasSuccessful() else 1)
