"""Isolated extension concurrency, not independent review or production qualification."""
import json
import uuid
import unittest
from pathlib import Path
import comparisonPostgresConcurrency as h
from candidateInterfacesPostgres import CandidateInterfaces as Base
q=h.quoted
class Extension(unittest.TestCase):
    setUp=Base.setUp
    cleanup=Base.cleanup
    session=Base.session
    admin=Base.admin
    blocked=Base.blocked
    claim_sql=Base.claim_sql
    complete_sql=Base.complete_sql
    def fixture(self):
        sessions=Base.fixture(self)
        self.admin(Path("supabase/qualification/mip-cutover-authority/003_scoped_queue.sql").read_text())
        return sessions
    def ordering(self,kind,first):
        sa,sb=self.fixture()
        job=json.loads(self.a.execute(self.claim_sql(str(uuid.uuid4()),sa,"runtime-a")))
        revoke=("select comparison_qualification.revoke_source_scope('runtime-a','source');" if kind=="source"
                else "select comparison_qualification.revoke_evaluated_implementation('runtime-a','fixture');")
        r=self.session()
        r.execute("reset role;")
        if first=="accept":
            self.a.execute("begin;")
            self.assertEqual(self.a.execute(self.complete_sql(str(uuid.uuid4()),sa,"runtime-a",job)),"completed")
            r.start(revoke)
            self.blocked(r,self.a)
            self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
            self.a.execute("commit;")
            self.assertEqual(r.finish(),"revoked")
            self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")
        else:
            r.execute("begin;")
            self.assertEqual(r.execute(revoke),"revoked")
            self.a.start(self.complete_sql(str(uuid.uuid4()),sa,"runtime-a",job))
            self.blocked(self.a,r)
            r.execute("commit;")
            with self.assertRaisesRegex(RuntimeError,"mip_source_not_in_scope|mip_implementation_not_evaluated"):
                self.a.finish()
            self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
            self.assertEqual(self.admin("select count(*) from comparison_qualification.request_runs where rpc_name='worker_complete'"),"0")
            self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"processing")
    def test_source_acceptance_first(self):self.ordering("source","accept")
    def test_source_revocation_first(self):self.ordering("source","revoke")
    def test_implementation_acceptance_first(self):self.ordering("implementation","accept")
    def test_implementation_revocation_first(self):self.ordering("implementation","revoke")
    def test_scope_revocation_rollback_allows_completion(self):
        sa,sb=self.fixture()
        job=json.loads(self.a.execute(self.claim_sql(str(uuid.uuid4()),sa,"runtime-a")))
        r=self.session();r.execute("reset role;begin;")
        r.execute("select comparison_qualification.revoke_source_scope('runtime-a','source');")
        self.a.start(self.complete_sql(str(uuid.uuid4()),sa,"runtime-a",job))
        self.blocked(self.a,r);r.execute("rollback;")
        self.assertEqual(self.a.finish(),"completed")
    def test_scoped_claim_rollback_retains_fairness_and_attempt(self):
        sa,sb=self.fixture()
        self.a.execute("begin;")
        self.a.execute(self.claim_sql(str(uuid.uuid4()),sa,"runtime-a"))
        self.b.start(self.claim_sql(str(uuid.uuid4()),sa,"runtime-a"))
        self.blocked(self.b,self.a)
        self.a.execute("rollback;")
        self.assertIsNotNone(json.loads(self.b.finish())["lease_token"])
        self.assertEqual(self.admin("select attempt from comparison_qualification.jobs"),"1")
        self.assertEqual(self.admin("select count(*) from mip_cutover_authority.source_turns"),"1")

    def publication_fixture(self):
        sa,sb=self.fixture()
        job=json.loads(self.a.execute(self.claim_sql(str(uuid.uuid4()),sa,"runtime-a")))
        self.a.execute(self.complete_sql(str(uuid.uuid4()),sa,"runtime-a",job))
        self.admin(Path("supabase/qualification/mip-cutover-authority/004_publication_staging.sql").read_text())
        dep=self.admin("""insert into mip_cutover_authority.dependency_versions
          (dependency_key,source,children,record_hash,privacy_eligible,rights_eligible,retained_evidence,
           correction_current,explanation_eligible,publication_eligible,state,valid_until,predicate_version)
          values('root','source','{}',repeat('a',64),true,true,true,true,true,true,'current','2999-01-01','synthetic')
          returning id;""")
        self.admin("insert into mip_cutover_authority.dependency_heads values('root',"+q(dep)+");")
        approved=self.admin("insert into mip_cutover_authority.approved_payloads(source,generation_id,payload,payload_hash,dependency_versions,owner_approval_ref) values('source',"+q(job["generation_id"])+",'{}',encode(sha256(convert_to('{}','UTF8')),'hex'),array["+q(dep)+"::uuid],'synthetic-only') returning id;")
        self.a.execute("reset role;")
        self.b.execute("reset role;")
        return approved
    def test_publication_selection_first_serializes_dependency_revocation(self):
        approved=self.publication_fixture()
        self.a.execute("begin;")
        self.a.execute("select mip_cutover_authority.select_approved_payload("+q(approved)+");")
        self.b.start("delete from mip_cutover_authority.dependency_heads where dependency_key='root';")
        self.blocked(self.b,self.a)
        self.assertEqual(self.admin("select count(*) from mip_cutover_authority.publication_selections"),"0")
        self.a.execute("commit;")
        self.b.finish()
        with self.assertRaisesRegex(RuntimeError,"dependency_ineligible"):
            self.a.execute("select mip_cutover_authority.select_approved_payload("+q(approved)+");")
        self.assertEqual(self.admin("select count(*) from mip_cutover_authority.publication_selections"),"1")
    def test_dependency_revocation_first_rolls_back_publication_selection(self):
        approved=self.publication_fixture()
        self.b.execute("begin;delete from mip_cutover_authority.dependency_heads where dependency_key='root';")
        self.a.start("select mip_cutover_authority.select_approved_payload("+q(approved)+");")
        self.blocked(self.a,self.b)
        self.b.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"dependency_ineligible"):
            self.a.finish()
        self.assertEqual(self.admin("select count(*) from mip_cutover_authority.publication_selections"),"0")

if __name__=="__main__":
    h.run("postgres","create role anon;create role authenticated;create role service_role bypassrls;")
    print("MIP_EXTENSION_PG_VERSION="+h.run("postgres","select version();"),flush=True)
    print("MIP_EXTENSION_ISOLATION="+h.run("postgres","show default_transaction_isolation;"),flush=True)
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Extension)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
