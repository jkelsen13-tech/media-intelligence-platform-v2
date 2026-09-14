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
        cls.candidate=candidate
        cls.assessment_context=context
        scalar(db,"mip_assessments_v1","append",{"candidate_id":candidate,"algorithm_key":"synthetic","algorithm_version":"v1",
            "outcome":"insufficient_evidence","rationale":"Synthetic.","remaining_uncertainty":"Synthetic.",
            "context_positions":context["context_positions"]})
        obs = scalar(db,"mip_investigation_briefings_v1","observe",{"observation_id":str(uuid.uuid4()),"candidate_ids":[candidate]})
        cls.observation=obs["id"]
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
        h.run(db,Path("supabase/qualification/hypothesis-assessments/004_bound_history.sql").read_text())
        h.run(db,Path("supabase/qualification/hypothesis-assessments/005_reassessment_causes.sql").read_text())
        h.run(db,Path("supabase/qualification/hypothesis-assessments/006_reassessment_completion.sql").read_text())
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
    def test_favored_allegation_without_support_is_rejected(self):
        assessment=copy.deepcopy(self.assessment)
        assessment["comparison"].update(state="better_supported",favored_ids=["influence"])
        assessment["arguments"][0]["relation"]="reports_allegation"
        with self.assertRaisesRegex(RuntimeError,"requires a supporting argument"):
            self.a.execute(self.append(assessment=assessment))
        self.assertEqual(self.counts(),"0:0")
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
    def history(self):
        return "select mip_hypothesis.read_bound_history("+q(self.user)+","+q(self.iid)+");"
    def test_history_read_first_serializes_permission_revocation(self):
        self.a.execute(self.append())
        self.a.execute("begin;")
        first=json.loads(self.a.execute(self.history()))
        self.assertEqual(first["entries"][0]["status"],"available")
        self.b.execute("reset role;");self.b.start(self.revoke());self.blocked(self.b,self.a)
        self.a.execute("commit;");self.b.finish()
        denied=json.loads(self.a.execute(self.history()))["entries"][0]
        self.assertEqual(denied["status"],"withheld");self.assertNotIn("assessment",denied)
    def test_revocation_first_withholds_saved_reasoning(self):
        self.a.execute(self.append());self.b.execute("reset role;begin;"+self.revoke())
        self.a.start(self.history());self.blocked(self.a,self.b)
        self.b.execute("commit;")
        denied=json.loads(self.a.finish())["entries"][0]
        self.assertEqual(denied["status"],"withheld");self.assertNotIn("assessment",denied)
    def method_change(self):
        return rpc("mip_assessments_v1","append",{"candidate_id":self.candidate,"algorithm_key":"synthetic","algorithm_version":"v2",
            "outcome":"insufficient_evidence","rationale":"Synthetic method revision.","remaining_uncertainty":"Synthetic.",
            "context_positions":self.assessment_context["context_positions"]})
    def test_retained_assessment_acceptance_first(self):
        self.ordering(self.method_change(),"accept","context changed")
        causes=json.loads(self.a.execute(self.backlog()))["causes"]
        self.assertEqual(len(causes),1)
        self.assertEqual(causes[0]["kind"],"retained_assessment_change")
        self.assertFalse(json.loads(self.a.execute(self.history()))["entries"][0]["current_context"])
    def test_retained_assessment_revision_first(self):
        self.ordering(self.method_change(),"revoke","context changed")
    def test_retained_assessment_revision_rollback_preserves_context(self):
        self.a.execute(self.append())
        self.b.execute("reset role;begin;"+self.method_change())
        self.a.start(self.history());self.blocked(self.a,self.b)
        self.b.execute("rollback;")
        self.assertTrue(json.loads(self.a.finish())["entries"][0]["current_context"])
        self.assertEqual(json.loads(self.a.execute(self.backlog()))["causes"],[])
    def test_retained_method_change_has_exact_receipt_without_new_source_capture(self):
        self.a.execute(self.append())
        before=self.admin("select count(*) from evidence_pipeline.evidence_changes")
        changed=json.loads(self.admin(self.method_change()))
        self.assertEqual(self.admin("select count(*) from evidence_pipeline.evidence_changes"),before)
        result=json.loads(self.a.execute(self.reconcile()))
        cause=result["causes"][0]
        self.assertEqual(cause["related_version_id"],changed)
        self.assertEqual(cause["kind"],"retained_assessment_change")
        self.assertFalse(result["completed_reassessment"])
        self.assertNotIn("Synthetic method revision",json.dumps(result))
    def backlog(self):
        return "select mip_hypothesis.reassessment_backlog("+q(self.user)+","+q(self.iid)+");"
    def reconcile(self):
        return "select mip_hypothesis.reconcile_reassessment_causes("+q(self.user)+","+q(self.iid)+");"
    def test_source_change_and_pending_cause_commit_together(self):
        self.a.execute(self.append())
        self.b.execute("reset role;begin;"+self.change())
        self.assertEqual(self.admin("select count(*) from mip_hypothesis.reassessment_causes"),"0")
        self.b.execute("commit;")
        result=json.loads(self.a.execute(self.backlog()))
        self.assertEqual(len(result["causes"]),1)
        self.assertEqual(result["causes"][0]["kind"],"retained_source_change")
        self.assertFalse(result["completed_reassessment"])
        self.assertNotIn("corrected synthetic",json.dumps(result))
    def test_source_change_rollback_leaves_no_pending_cause(self):
        self.a.execute(self.append())
        self.b.execute("reset role;begin;"+self.change())
        self.b.execute("rollback;")
        self.assertEqual(json.loads(self.a.execute(self.backlog()))["causes"],[])
        self.assertTrue(json.loads(self.a.execute(self.history()))["entries"][0]["current_context"])
    def test_missing_notification_reconciliation_recovers_exact_old_position_once(self):
        self.a.execute(self.append())
        # Explicit fixture-only loss of the ledger notification; source/change history remains retained.
        self.admin("alter table evidence_pipeline.evidence_changes disable trigger hypothesis_reassessment_source;")
        self.admin(self.change())
        self.admin("alter table evidence_pipeline.evidence_changes enable trigger hypothesis_reassessment_source;")
        self.assertEqual(json.loads(self.a.execute(self.backlog()))["causes"],[])
        first=json.loads(self.a.execute(self.reconcile()))
        self.assertEqual(len(first["causes"]),1)
        self.assertEqual(first["coverage"],"current_head_watch_scope_at_reconciliation")
        again=json.loads(self.a.execute(self.reconcile()))
        self.assertEqual(again["causes"],first["causes"])
        position=first["causes"][0]["change_position"]
        self.assertEqual(self.admin("select count(*) from evidence_pipeline.evidence_changes where position="+q(position)),"1")
    def test_permission_revocation_records_each_affected_operation_without_body_text(self):
        self.a.execute(self.append());self.admin(self.revoke())
        result=json.loads(self.a.execute(self.backlog()))
        causes=result["causes"]
        self.assertEqual(len(causes),3)
        self.assertEqual({c["detail"]["operation"] for c in causes},{"retention","analysis","excerpt_display"})
        self.assertEqual({c["detail"]["domain"] for c in causes},{"privacy"})
        self.assertNotIn("meeting record",json.dumps(result))
    def test_pending_reassessment_survives_client_restart_without_resolving_itself(self):
        self.a.execute(self.append());self.admin(self.change())
        first=json.loads(self.a.execute(self.backlog()))
        self.a.process.kill();self.a.process.wait(timeout=5)
        after=json.loads(self.b.execute(self.backlog()))
        self.assertEqual(after,first)
        self.assertTrue(all(c["state"]=="pending_explicit_reconciliation" for c in after["causes"]))
        self.assertEqual(self.counts(),"1:1")
    def test_unauthorized_cause_write_and_mutation_are_rejected(self):
        self.a.execute(self.append());self.admin(self.change())
        with self.assertRaisesRegex(RuntimeError,"permission denied"):
            self.b.execute("select mip_hypothesis.discover_reassessment_causes("+q(self.iid)+");")
        with self.assertRaisesRegex(RuntimeError,"append-only"):
            self.admin("delete from mip_hypothesis.reassessment_causes;")
        self.assertEqual(len(json.loads(self.a.execute(self.backlog()))["causes"]),1)
    def grant_observed_fixture_operations(self,version):
        binding=json.loads(self.admin("select mip_hypothesis.observation_binding("+",".join(map(q,[self.user,self.iid,version]))+");"))
        statements=[]
        for entry in binding["observation"]["snapshot"]["inputs"]:
            kind="capture" if "capture" in entry else "record_version"
            material=entry[kind]
            for operation in ["retention","analysis","excerpt_display"]:
                for domain in ["rights","privacy"]:
                    scope={"source_project":self.source,"material_ref":kind+":"+material["id"],
                        "material_version":material["source_version_hash"],"source_version":material["id"],
                        "audience":"isolated_internal_review","operation":operation,"domain":domain}
                    if self.admin("select count(*) from mip_identity.operation_evidence_heads where scope="+js(scope))=="1":continue
                    revision=str(uuid.uuid4())
                    statements.append("insert into mip_identity.operation_evidence_versions values("+q(revision)+","+js(scope)+
                        ",'synthetic-fixture-v1','synthetic-policy','v1',"+q(hashlib.sha256(b"synthetic policy").hexdigest())+
                        ",'synthetic-evidence','synthetic-owner','synthetic-approval','recorded','allow','2000-01-01','2999-01-01','[]',true);"+
                        "insert into mip_identity.operation_evidence_heads values("+js(scope)+","+q(revision)+",true);")
        if statements:self.admin("".join(statements))
        return binding
    def prepare_completion(self,source_change=False):
        self.first=json.loads(self.a.execute(self.append()))
        self.admin(self.change() if source_change else self.method_change())
        obs=scalar(self.database,"mip_investigation_briefings_v1","observe",{
            "observation_id":str(uuid.uuid4()),"previous_observation_id":self.observation,"candidate_ids":[self.candidate]})
        self.new_version=str(uuid.uuid4())
        scalar(self.database,"mip_investigation_workspace_v1","put",{"investigation_id":self.iid,"version_id":self.new_version,
            "previous_version_id":self.vid,"observation_id":obs["id"],"state":self.state,"change_reason":"Synthetic reassessment context."})
        self.new_binding=self.grant_observed_fixture_operations(self.new_version)
        causes=json.loads(self.a.execute(self.reconcile()))["causes"]
        self.pending=[c for c in causes if c["state"]=="pending_explicit_reconciliation"]
        self.completion_assessment=copy.deepcopy(self.assessment)
        cutoff=self.admin("""select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')""")
        self.completion_assessment.update(id="synthetic-next",revision=2,predecessor_id=self.first["assessment"]["id"],
            knowledge_cutoff=cutoff,completed_at=cutoff,revision_trigger="correction" if source_change else "methodology",
            revision_effect="unchanged",revision_reason="Synthetic retained reassessment.",
            reassessment_causes=[{"cause_id":c["cause_id"],"reason":"Synthetic explicit consideration; no semantic qualification."} for c in self.pending])
        self.completion_request=str(uuid.uuid4())
    def complete(self,assessment=None,request=None,version=None):
        return "select mip_hypothesis.complete_reassessment("+",".join(map(q,[
            self.user,self.iid,version or self.new_version,self.source,request or self.completion_request,
            self.first["assessment"]["id"]]))+","+js(assessment or self.completion_assessment)+");"
    def completion_counts(self):
        return self.admin("select (select count(*) from mip_hypothesis.revisions)||':'||"+
            "(select count(*) from mip_hypothesis.acceptance_bindings)||':'||"+
            "(select count(*) from mip_hypothesis.reassessment_completion_receipts)||':'||"+
            "(select count(*) from mip_hypothesis.reassessment_resolutions)")
    def revoke_unselected_closure_permission(self):
        return "update mip_identity.operation_evidence_heads set active=false where scope->>'material_ref' like 'record_version:%' and scope->>'operation'='analysis' and scope->>'domain'='privacy';"
    def test_completion_revision_resolution_and_receipt_commit_atomically(self):
        self.prepare_completion();self.a.execute("begin;")
        result=json.loads(self.a.execute(self.complete()))
        self.assertEqual(self.completion_counts(),"1:1:0:0")
        self.b.start(self.complete());self.blocked(self.b,self.a)
        self.a.execute("commit;")
        self.assertEqual(json.loads(self.b.finish()),result)
        self.assertEqual(self.completion_counts(),"2:2:1:"+str(len(self.pending)))
        self.assertTrue(result["completed_reassessment"]);self.assertFalse(result["publication_allowed"])
        self.assertEqual(result["assessment"]["review_state"],"unreviewed")
        backlog=json.loads(self.a.execute(self.backlog()))
        self.assertTrue(all(c["state"]=="reassessment_recorded" for c in backlog["causes"]))
        self.assertFalse(backlog["is_completion_receipt"])
    def test_completion_outer_rollback_keeps_every_cause_pending(self):
        self.prepare_completion();self.a.execute("begin;");self.a.execute(self.complete());self.a.execute("rollback;")
        self.assertEqual(self.completion_counts(),"1:1:0:0")
        self.assertTrue(all(c["state"]=="pending_explicit_reconciliation" for c in json.loads(self.b.execute(self.backlog()))["causes"]))
    def test_completion_missing_duplicate_and_changed_cause_arguments_fail_closed(self):
        self.prepare_completion()
        for action in ["omit","duplicate","unknown","blank_reason"]:
            changed=copy.deepcopy(self.completion_assessment)
            if action=="omit":changed["reassessment_causes"].pop()
            elif action=="duplicate":changed["reassessment_causes"].append(changed["reassessment_causes"][0])
            elif action=="unknown":changed["reassessment_causes"][0]["cause_id"]=str(uuid.uuid4())
            else:changed["reassessment_causes"][0]["reason"]=""
            with self.assertRaisesRegex(RuntimeError,"cause set changed|ambiguous reassessment|cause explanation"):
                self.session().execute(self.complete(assessment=changed))
        self.assertEqual(self.completion_counts(),"1:1:0:0")
    def test_completion_cannot_acknowledge_a_change_missing_from_observation(self):
        self.prepare_completion(source_change=True)
        with self.assertRaisesRegex(RuntimeError,"missing retained source change"):
            self.a.execute(self.complete(version=self.vid))
        self.assertEqual(self.completion_counts(),"1:1:0:0")
    def test_completion_cannot_bypass_pending_work_via_plain_append(self):
        self.prepare_completion();plain=copy.deepcopy(self.completion_assessment);del plain["reassessment_causes"]
        sql="select mip_hypothesis.append_bound_revision("+",".join(map(q,[self.user,self.iid,self.new_version,self.source,
            str(uuid.uuid4()),self.first["assessment"]["id"]]))+","+js(plain)+");"
        with self.assertRaisesRegex(RuntimeError,"explicit reassessment completion required"):self.a.execute(sql)
        with self.assertRaisesRegex(RuntimeError,"permission denied"):
            self.b.execute(sql.replace("append_bound_revision(","append_bound_revision_v1("))
        self.assertEqual(self.completion_counts(),"1:1:0:0")
    def test_completion_process_loss_before_commit_recovers_pending_work(self):
        self.prepare_completion();self.a.execute("begin;");self.a.execute(self.complete())
        self.a.process.kill();self.a.process.wait(timeout=5)
        result=json.loads(self.b.execute(self.complete()))
        self.assertTrue(result["completed_reassessment"])
        self.assertEqual(self.completion_counts(),"2:2:1:"+str(len(self.pending)))
    def test_completion_process_loss_after_commit_recovers_exact_receipt(self):
        self.prepare_completion();first=json.loads(self.a.execute(self.complete()))
        self.a.process.kill();self.a.process.wait(timeout=5)
        self.assertEqual(json.loads(self.b.execute(self.complete())),first)
        changed=copy.deepcopy(self.completion_assessment);changed["reassessment_causes"][0]["reason"]="Changed synthetic argument."
        with self.assertRaisesRegex(RuntimeError,"retry conflict"):self.session().execute(self.complete(assessment=changed))
        self.assertEqual(self.completion_counts(),"2:2:1:"+str(len(self.pending)))
    def test_completion_acceptance_first_preserves_receipt_then_records_revocation(self):
        self.prepare_completion();self.a.execute("begin;");self.a.execute(self.complete())
        self.b.execute("reset role;");self.b.start(self.revoke());self.blocked(self.b,self.a)
        self.a.execute("commit;");self.b.finish()
        self.assertEqual(self.completion_counts(),"2:2:1:"+str(len(self.pending)))
        with self.assertRaisesRegex(RuntimeError,"operation denied"):self.session().execute(self.complete())
    def test_completion_revocation_first_rolls_back_every_new_record(self):
        self.prepare_completion();self.b.execute("reset role;begin;"+self.revoke())
        self.a.start(self.complete());self.blocked(self.a,self.b);self.b.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"operation denied|cause set changed"):self.a.finish()
        self.assertEqual(self.completion_counts(),"1:1:0:0")
    def test_completion_requires_permissions_for_unselected_retained_dependency(self):
        self.prepare_completion();self.admin(self.revoke_unselected_closure_permission())
        with self.assertRaisesRegex(RuntimeError,"operation denied|cause set changed"):self.a.execute(self.complete())
        self.assertEqual(self.completion_counts(),"1:1:0:0")
    def test_completed_closure_revocation_withholds_history_and_preserves_prior_causes(self):
        self.prepare_completion();self.a.execute(self.complete());self.admin(self.revoke_unselected_closure_permission())
        history=json.loads(self.a.execute(self.history()))
        self.assertEqual(history["entries"][-1]["status"],"withheld");self.assertNotIn("assessment",history["entries"][-1])
        backlog=json.loads(self.a.execute(self.backlog()))
        self.assertTrue(any(c["state"]=="pending_explicit_reconciliation" and c["kind"]=="permission_changed" for c in backlog["causes"]))
        self.assertEqual(sum(c["state"]=="reassessment_recorded" for c in backlog["causes"]),len(self.pending))
    def test_later_changes_do_not_get_cleared_by_completion_receipt_replay(self):
        self.prepare_completion();first=json.loads(self.a.execute(self.complete()))
        self.admin("update public.articles set summary='A later synthetic correction.' where url='https://example.org/hypothesis-native-synthetic';")
        replay=json.loads(self.a.execute(self.complete()))
        self.assertEqual(replay["assessment"],first["assessment"]);self.assertTrue(replay["reassessment_pending"])
        self.assertEqual(self.completion_counts(),"2:2:1:"+str(len(self.pending)))
        self.assertTrue(any(c["state"]=="pending_explicit_reconciliation" for c in json.loads(self.a.execute(self.backlog()))["causes"]))
    def test_completion_receipts_and_resolutions_are_not_worker_writable_or_mutable(self):
        self.prepare_completion();self.a.execute(self.complete())
        for table in ["reassessment_completion_receipts","reassessment_resolutions"]:
            with self.assertRaisesRegex(RuntimeError,"permission denied"):
                self.session().execute("insert into mip_hypothesis."+table+" default values;")
            with self.assertRaisesRegex(RuntimeError,"append-only"):
                self.admin("delete from mip_hypothesis."+table+";")

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
