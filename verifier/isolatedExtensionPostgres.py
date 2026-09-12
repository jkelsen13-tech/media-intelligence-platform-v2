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

if __name__=="__main__":
    h.run("postgres","create role anon;create role authenticated;create role service_role bypassrls;")
    print("MIP_EXTENSION_PG_VERSION="+h.run("postgres","select version();"),flush=True)
    print("MIP_EXTENSION_ISOLATION="+h.run("postgres","show default_transaction_isolation;"),flush=True)
    unittest.main(verbosity=2)
