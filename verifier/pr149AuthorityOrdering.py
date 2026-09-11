"""PR149 authority counterexamples and corrected contract. Disposable PostgreSQL ONLY.
Correction author run: codex-root-pr149-authority-543e423-20260911.
--baseline uses an immutable copy of candidate 543e423's SQL and asserts its defects.
"""
import sys
import json
import unittest
import uuid
from pathlib import Path
import comparisonPostgresConcurrency as h
BASELINE = "--baseline" in sys.argv
if BASELINE: sys.argv.remove("--baseline")
C = h.ConcurrentContract
q = h.quoted
class AuthorityOrdering(unittest.TestCase):
    setUp=C.setUp
    cleanup=C.cleanup
    session=C.session
    admin=C.admin
    blocked=C.blocked
    def fixture(self):
        self.admin(Path("supabase/qualification/comparison-generations/selection.sql").read_text())
        path="verifier/pr149-authority-baseline.sql" if BASELINE else "supabase/qualification/comparison-generations/capability.sql"
        self.admin(Path(path).read_text())
        result=[]
        for runtime in ("runtime-a","runtime-b"):
            for rpc in ("worker_claim","worker_complete"):
                self.admin("select comparison_qualification.bind_runtime("+q(runtime)+",'qual_comparison_worker',"+q(rpc)+");")
            result.append(self.admin("select comparison_qualification.issue_session('qual_comparison_worker',"+q(runtime)+",'2999-01-01');"))
        self.a.execute(h.enqueue())
        self.a.execute("reset role;set role qual_comparison_worker;")
        self.b.execute("reset role;set role qual_comparison_worker;")
        return result
    def claim_sql(self,request,session,runtime):
        return "select comparison_qualification.worker_claim("+q(request)+","+q(session)+","+q(runtime)+");"
    def complete_sql(self,request,session,runtime,job,token=True):
        args=[q(request),q(session),q(runtime),q(job["generation_id"]),q(job["lease_token"]) if token else "null",
              q(job["input_hash"]),q(job["implementation_ref"]),q('{"claims":[]}')+"::jsonb"]
        return "select comparison_qualification.worker_complete("+",".join(args)+");"
    def revoke_sql(self):
        return "select comparison_qualification.revoke_principal('runtime-a','qual_comparison_worker');"
    def test_completion_paused_after_initial_authorization_then_revoke_commits(self):
        sa,sb=self.fixture()
        job=json.loads(self.a.execute(self.claim_sql(str(uuid.uuid4()),sa,"runtime-a")))
        # BEFORE INSERT is reached after initial auth/replay and lease validation.
        # This barrier is created only in the synthetic disposable fixture.
        self.admin("""create function public.pause_output() returns trigger language plpgsql as $$
          begin perform pg_advisory_xact_lock(987149); return new; end $$;
          create trigger pause_output before insert on comparison_qualification.outputs
          for each row execute function public.pause_output();""")
        self.a.execute("select pg_advisory_lock(987149);")
        self.b.start(self.complete_sql(str(uuid.uuid4()),sa,"runtime-a",job))
        self.blocked(self.b,self.a)
        self.assertEqual(self.admin(self.revoke_sql()),"revoked")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.principal_sessions where runtime_id='runtime-a' and revoked_at is not null"),"1")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
        print("MIP_AUTHORITY_REVOKE_COMMITTED_WHILE_COMPLETION_BLOCKED",flush=True)
        self.a.execute("select pg_advisory_unlock(987149);")
        if BASELINE:
            self.assertEqual(self.b.finish(),"completed")
            self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"completed")
            self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")
            print("MIP_COUNTEREXAMPLE_REVOCATION_AFTER_INITIAL_AUTH=confirmed",flush=True)
        else:
            with self.assertRaisesRegex(RuntimeError,"mip_authz_revoked"):
                self.b.finish()
            self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
            self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"processing")
            self.assertEqual(self.admin("select count(*) from comparison_qualification.request_runs where rpc_name='worker_complete'"),"0")
    def test_cross_runtime_claim_and_completion_replay(self):
        sa,sb=self.fixture()
        request=str(uuid.uuid4())
        job=json.loads(self.a.execute(self.claim_sql(request,sa,"runtime-a")))
        own=json.loads(self.a.execute(self.claim_sql(request,sa,"runtime-a")))
        self.assertIsNone(own["lease_token"])
        self.assertEqual(own["input_text"],job["input_text"])
        if BASELINE:
            foreign=json.loads(self.b.execute(self.claim_sql(request,sb,"runtime-b")))
            self.assertEqual(foreign["input_text"],job["input_text"])
            self.assertEqual(foreign["generation_id"],job["generation_id"])
            print("MIP_COUNTEREXAMPLE_REPLAY_RETAINED_INPUT=confirmed",flush=True)
        else:
            with self.assertRaisesRegex(RuntimeError,"mip_request_replay_owner"):
                self.b.execute(self.claim_sql(request,sb,"runtime-b"))
        complete_request=str(uuid.uuid4())
        sql=self.complete_sql(complete_request,sa,"runtime-a",job)
        self.assertEqual(self.a.execute(sql),"completed")
        self.assertEqual(self.a.execute(sql),"completed")
        other=self.session()
        other.execute("reset role;set role qual_comparison_worker;")
        attempt=self.complete_sql(complete_request,sb,"runtime-b",job,False)
        if BASELINE:
            self.assertEqual(other.execute(attempt),"completed")
            print("MIP_COUNTEREXAMPLE_REPLAY_SUCCESS_WITHOUT_TOKEN=confirmed",flush=True)
        else:
            with self.assertRaisesRegex(RuntimeError,"mip_request_replay_owner"):
                other.execute(attempt)
        self.assertEqual(self.admin("select count(*) from comparison_qualification.request_runs where runtime_id='runtime-b'"),"0")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")
    def test_outstanding_lease_is_not_permission_after_revocation(self):
        sa,sb=self.fixture()
        job=json.loads(self.a.execute(self.claim_sql(str(uuid.uuid4()),sa,"runtime-a")))
        self.admin(self.revoke_sql())
        with self.assertRaisesRegex(RuntimeError,"mip_authz_revoked"):
            self.a.execute(self.complete_sql(str(uuid.uuid4()),sa,"runtime-a",job))
        self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"processing")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
if __name__=="__main__":
    print("MIP_AUTHORITY_MODE="+("frozen-543e423-counterexample" if BASELINE else "corrected-contract"),flush=True)
    unittest.main(verbosity=2)
