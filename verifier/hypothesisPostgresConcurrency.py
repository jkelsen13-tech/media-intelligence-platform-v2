"""Native isolation/order/restart evidence for hypothesis assessments. Synthetic only.
Uses the existing fixed-loopback GitHub disposable service; no production DSN.
"""
import copy
import hashlib
import json
import subprocess
import unittest
import uuid
from pathlib import Path
import comparisonPostgresConcurrency as h
q = h.quoted
def js(value):
    return q(json.dumps(value, ensure_ascii=False)) + "::jsonb"
def rpc(name, action, value):
    return "select public." + name + "(" + q(action) + "," + js(value) + ");"
def scalar(db, name, action, value):
    return json.loads(h.run(db, rpc(name, action, value)))
class Hypothesis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = "mip_hypothesis_template_" + uuid.uuid4().hex
        h.run("postgres", "create database " + cls.template)
        db = cls.template
        h.run(db, Path("tests/changeQueueFixture.sql").read_text())
        h.run(db, "create table public.mip_profiles(id uuid primary key)")
        for suffix in ["evidence_pipeline_reliability","evidence_change_queue_v1","evidence_assessment_dependencies_v1","investigation_change_briefings_v1","investigation_workspace_batch_v1"]:
            files = list(Path("supabase/migrations").glob("*_" + suffix + ".sql"))
            assert len(files) == 1
            h.run(db, files[0].read_text())
        cls.user, cls.iid, cls.vid = [str(uuid.uuid4()) for _ in range(3)]
        h.run(db, "insert into public.mip_profiles values(" + q(cls.user) + ")")
        scalar(db,"mip_pipeline_v1","enqueue",{"run_id":"hypothesis-native-synthetic","article":{
            "url":"https://example.org/hypothesis-native-synthetic","title":"Synthetic meeting record",
            "summary":"A 😀 B meeting record.","outlet":"Synthetic","published_at":"2026-08-01"}})
        job = scalar(db,"mip_pipeline_v1","claim",{})
        capture = scalar(db,"mip_pipeline_v1","finish",{"job_id":job["id"],"lease_token":job["lease_token"]})
        candidate = scalar(db,"mip_pipeline_v1","candidate",{"capture_id":capture["capture_id"],
            "candidate_key":"synthetic","candidate_kind":"claim","statement":"A 😀 B meeting record.",
            "source_field":"summary","span_start":0,"span_end":21,"excerpt":"A 😀 B meeting record.",
            "extractor_version":"synthetic","remaining_uncertainty":"Synthetic mechanism only."})
        context = scalar(db,"mip_assessments_v1","context",{"candidate_id":candidate})
        scalar(db,"mip_assessments_v1","append",{"candidate_id":candidate,"algorithm_key":"synthetic","algorithm_version":"v1",
            "outcome":"insufficient_evidence","rationale":"Synthetic.","remaining_uncertainty":"Synthetic.",
            "context_positions":context["context_positions"]})
        obs = scalar(db,"mip_investigation_briefings_v1","observe",{"observation_id":str(uuid.uuid4()),"candidate_ids":[candidate]})
        cls.state = {"question":"What explains the fictional contract award?","scope_note":"Synthetic only.","canonical_subject":None,
            "time_range":{"from":None,"to":None,"meaning":"Not established."},"unresolved_questions":[],
            "hypotheses":[],"commitments":[],"coverage":[]}
        scalar(db,"mip_investigation_workspace_v1","put",{"investigation_id":cls.iid,"version_id":cls.vid,
            "previous_version_id":None,"observation_id":obs["id"],"state":cls.state,"change_reason":"Synthetic."})
        scalar(db,"mip_investigation_workspace_v1","set_access",{"investigation_id":cls.iid,"user_id":cls.user,
            "access_role":"reviewer","reason":"Synthetic assignment."})
        h.run(db, Path("supabase/qualification/hypothesis-assessments/001_revision_store.sql").read_text())
        policy = Path("supabase/qualification/mip-cutover-authority/008_operation_evidence.sql").read_text()
        fence = Path("supabase/qualification/mip-cutover-authority/004_publication_staging.sql").read_text()
        h.run(db, "create schema mip_identity;create schema mip_cutover_authority;create table mip_cutover_authority.publication_fence(id boolean primary key check(id));insert into mip_cutover_authority.publication_fence values(true)")
        h.run(db, policy[policy.index("create table mip_identity.operation_evidence_versions"):policy.index("create table mip_identity.review_operation_bindings")])
        h.run(db, policy[policy.index("create function mip_identity.operation_check"):policy.index("alter function mip_identity.validate_review")])
        h.run(db, fence[fence.index("create function mip_cutover_authority.fence_publication_write"):fence.index("create trigger dependency_versions_fence")])
        h.run(db, policy[policy.index("create trigger operation_fence"):policy.index("create trigger operation_retirement")])
        h.run(db, "alter table mip_cutover_authority.publication_fence enable row level security;alter table mip_cutover_authority.publication_fence force row level security")
        h.run(db, Path("supabase/qualification/hypothesis-assessments/002_retained_observation_reader.sql").read_text())
        binding = json.loads(h.run(db,"select mip_hypothesis.observation_binding("+",".join(map(q,[cls.user,cls.iid,cls.vid]))+");"))
        entry = next(i for i in binding["observation"]["snapshot"]["inputs"] if "capture" in i)
        fixture = subprocess.run(["node","--input-type=module","-e",
            "import {hypothesisFixture} from './tests/hypothesisAssessmentFixture.mjs';process.stdout.write(JSON.stringify(hypothesisFixture()))"],
            check=True,capture_output=True,text=True).stdout
        cls.assessment = json.loads(fixture)
        cls.assessment.update(question_id=cls.iid,question=cls.state["question"])
        cutoff=h.run(db, """select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')""")
        cls.assessment.update(knowledge_cutoff=cutoff,completed_at=cutoff)
        cls.assessment["evidence"][0].update(input_position=entry["position"],material_version=entry["capture"]["id"],
            acquired_at=entry["capture"]["captured_at"],published_at=entry["capture"]["payload"].get("published_at"),event_time=None,
            source_span={"source_field":"summary","start":2,"end":5,"excerpt_sha256":hashlib.sha256("😀 B".encode()).hexdigest()})
        cls.source = "synthetic-hypothesis-native"
        base = {"source_project":cls.source,"material_ref":"capture:"+entry["capture"]["id"],
            "material_version":entry["capture"]["source_version_hash"],"source_version":entry["capture"]["id"],"audience":"isolated_internal_review"}
        statements=[]
        for operation in ["retention","analysis","excerpt_display"]:
            for domain in ["rights","privacy"]:
                scope={**base,"operation":operation,"domain":domain}
                revision=str(uuid.uuid4())
                statements.append("insert into mip_identity.operation_evidence_versions values("+q(revision)+","+js(scope)+
                    ",'synthetic-fixture-v1','synthetic-policy','v1',"+q(hashlib.sha256(b"synthetic policy").hexdigest())+
                    ",'synthetic-evidence','synthetic-owner','synthetic-approval','recorded','allow','2000-01-01','2999-01-01','[]',true);"+
                    "insert into mip_identity.operation_evidence_heads values("+js(scope)+","+q(revision)+",true);")
        h.run(db,"".join(statements))
        h.run(db,Path("supabase/qualification/hypothesis-assessments/003_bound_acceptance.sql").read_text())
        cls.request=str(uuid.uuid4())

    @classmethod
    def tearDownClass(cls):
        h.run("postgres","drop database "+cls.template)
    def setUp(self):
        self.database="mip_hypothesis_"+uuid.uuid4().hex
        h.run("postgres","create database "+self.database+" template "+self.template)
        self.sessions=[]
        self.addCleanup(self.cleanup)
        self.a=self.session();self.b=self.session()
    def cleanup(self):
        for s in self.sessions:s.close()
        h.run("postgres","drop database "+self.database)
    def session(self):
        s=h.Session(self.database);self.sessions.append(s)
        s.execute("reset role;set role mip_hypothesis_gateway;")
        return s
    def admin(self,sql):return h.run(self.database,sql)
    blocked=h.ConcurrentContract.blocked
    def append(self,request=None,assessment=None,predecessor=None):
        return "select mip_hypothesis.append_bound_revision("+",".join(map(q,[self.user,self.iid,self.vid,self.source,request or self.request]))+","+("null" if predecessor is None else q(predecessor))+","+js(assessment or self.assessment)+");"
    def counts(self):
        return self.admin("select (select count(*) from mip_hypothesis.revisions)||':'||(select count(*) from mip_hypothesis.acceptance_bindings)")
    def revoke(self):
        return "update mip_identity.operation_evidence_heads set active=false where scope->>'domain'='privacy';"
    def change(self):
        return "update public.articles set source_status='corrected',summary='A corrected synthetic record.' where url='https://example.org/hypothesis-native-synthetic';"
    def test_exact_concurrent_retry_one_atomic_receipt(self):
        self.a.execute("begin;")
        result=self.a.execute(self.append())
        self.assertEqual(self.counts(),"0:0")
        self.b.start(self.append());self.blocked(self.b,self.a)
        self.a.execute("commit;")
        self.assertEqual(self.b.finish(),result);self.assertEqual(self.counts(),"1:1")
    def test_competing_completion_requires_current_predecessor(self):
        self.a.execute("begin;");self.a.execute(self.append())
        self.b.start(self.append(request=str(uuid.uuid4())));self.blocked(self.b,self.a)
        self.a.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"predecessor changed"):self.b.finish()
        self.assertEqual(self.counts(),"1:1")
    def ordering(self,mutation,first,denial):
        self.b.execute("reset role;")
        if first=="accept":
            self.a.execute("begin;");self.a.execute(self.append())
            self.b.start(mutation);self.blocked(self.b,self.a)
            self.assertEqual(self.counts(),"0:0")
            self.a.execute("commit;");self.b.finish();self.assertEqual(self.counts(),"1:1")
        else:
            self.b.execute("begin;"+mutation)
            self.a.start(self.append());self.blocked(self.a,self.b)
            self.b.execute("commit;")
            with self.assertRaisesRegex(RuntimeError,denial):self.a.finish()
            self.assertEqual(self.counts(),"0:0")
    def test_permission_acceptance_first(self):self.ordering(self.revoke(),"accept","operation denied")
    def test_permission_revocation_first(self):self.ordering(self.revoke(),"revoke","operation denied")
    def test_source_acceptance_first(self):self.ordering(self.change(),"accept","context changed")
    def test_source_correction_first(self):self.ordering(self.change(),"revoke","context changed")
    def test_membership_revocation_first(self):
        mutation=rpc("mip_investigation_workspace_v1","set_access",{"investigation_id":self.iid,"user_id":self.user,
            "access_role":"revoked","reason":"Synthetic revocation."})
        self.ordering(mutation,"revoke","read denied")
    def test_revocation_rollback_preserves_acceptance(self):
        self.b.execute("reset role;begin;"+self.revoke())
        self.a.start(self.append());self.blocked(self.a,self.b)
        self.b.execute("rollback;");self.assertTrue(json.loads(self.a.finish())["current_context"])
        self.assertEqual(self.counts(),"1:1")
    def test_process_loss_before_commit_rolls_back_and_retry_recovers(self):
        self.a.execute("begin;");self.a.execute(self.append());self.assertEqual(self.counts(),"0:0")
        # Kill only the disposable client, never cancel a work item or revoke a lease.
        self.a.process.kill();self.a.process.wait(timeout=5)
        self.assertTrue(json.loads(self.b.execute(self.append()))["current_context"])
        self.assertEqual(self.counts(),"1:1")
    def test_process_loss_after_commit_recovers_exact_result_with_current_authority(self):
        first=json.loads(self.a.execute(self.append()))
        self.a.process.kill();self.a.process.wait(timeout=5)
        self.assertEqual(json.loads(self.b.execute(self.append())),first)
        self.admin(self.revoke())
        with self.assertRaisesRegex(RuntimeError,"operation denied"):self.session().execute(self.append())
        self.assertEqual(self.counts(),"1:1")
    def test_gateway_cannot_write_approve_or_use_unbound_primitive(self):
        for sql in ["select * from mip_hypothesis.revisions;","update mip_identity.operation_evidence_heads set active=true;",
            "select mip_hypothesis.append_revision("+",".join(map(q,[self.user,self.iid,self.request]))+",null,"+js(self.assessment)+");"]:
            with self.assertRaisesRegex(RuntimeError,"permission denied"):self.session().execute(sql)
        self.assertEqual(self.admin("select pg_has_role('mip_hypothesis_gateway','mip_hypothesis_owner','MEMBER')"),"f")
        self.assertEqual(self.admin("select rolcanlogin or rolbypassrls or rolsuper or rolcreaterole from pg_roles where rolname='mip_hypothesis_gateway'"),"f")
        self.assertEqual(self.counts(),"0:0")
if __name__=="__main__":
    print("MIP_HYPOTHESIS_PG_VERSION="+h.run("postgres","select version();"),flush=True)
    print("MIP_HYPOTHESIS_FIXTURES=synthetic_only;CC_closed;no_live_access",flush=True)
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Hypothesis))
    raise SystemExit(0 if result.wasSuccessful() else 1)
