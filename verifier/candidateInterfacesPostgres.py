"""Candidate mip_* interfaces; implementation-agent native tests, not independent review.
Uses the unchanged guarded disposable PostgreSQL harness. Never production.
Author: codex-root-post-review-reconciliation-20260911.
"""
import json
import uuid
import unittest
from pathlib import Path
import comparisonPostgresConcurrency as h
BASELINE = False
q = h.quoted
class CandidateInterfaces(unittest.TestCase):
    setUp=h.ConcurrentContract.setUp
    cleanup=h.ConcurrentContract.cleanup
    session=h.ConcurrentContract.session
    admin=h.ConcurrentContract.admin
    blocked=h.ConcurrentContract.blocked
    def fixture(self):
        for name in ("selection.sql","capability.sql","source-fixture.sql","source-snapshot.sql"):
            self.admin(Path("supabase/qualification/comparison-generations/"+name).read_text())
        for name in ("001_execute_only_identities.sql","002_candidate_interfaces.sql"):
            self.admin(Path("supabase/qualification/mip-cutover-authority/"+name).read_text())
        sessions=[]
        for runtime in ("runtime-a","runtime-b"):
            self.admin("insert into mip_cutover_authority.runtime_config values("+q(runtime)+",'source','fixture','{\"entries\":[]}');")
            self.admin("select comparison_qualification.bind_source_scope("+q(runtime)+",'source');")
            self.admin("select comparison_qualification.bind_evaluated_implementation("+q(runtime)+",'fixture');")
            for rpc in ("worker_claim","worker_complete"):
                self.admin("select comparison_qualification.bind_runtime("+q(runtime)+",'mip_comparison_worker_v1',"+q(rpc)+");")
            sessions.append(self.admin("select comparison_qualification.issue_session('mip_comparison_worker_v1',"+q(runtime)+",'2999-01-01');"))
        self.admin("select comparison_qualification.bind_runtime('runtime-a','mip_comparison_producer_v1','producer_enqueue');")
        producer=self.admin("select comparison_qualification.issue_session('mip_comparison_producer_v1','runtime-a','2999-01-01');")
        self.admin("set role mip_comparison_producer_v1;select mip_cutover_authority.producer_enqueue("+q(str(uuid.uuid4()))+","+q(producer)+",'runtime-a','{}',null);")
        self.a.execute("reset role;set role mip_comparison_worker_v1;")
        self.b.execute("reset role;set role mip_comparison_worker_v1;")
        return sessions
    def claim_sql(self,request,session,runtime):
        return "select mip_cutover_authority.worker_claim("+q(request)+","+q(session)+","+q(runtime)+");"
    def complete_sql(self,request,session,runtime,job,token=True):
        args=[q(request),q(session),q(runtime),q(job["generation_id"]),q(job["lease_token"]) if token else "null",
              q(job["input_hash"]),q(job["implementation_ref"]),q('{"claims":[]}')+"::jsonb"]
        return "select mip_cutover_authority.worker_complete("+",".join(args)+");"
    def revoke_sql(self):
        return "select comparison_qualification.revoke_principal('runtime-a','mip_comparison_worker_v1');"
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
        other.execute("reset role;set role mip_comparison_worker_v1;")
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

    def test_completion_acceptance_first_delays_revocation_until_commit(self):
        sa,sb=self.fixture()
        job=json.loads(self.a.execute(self.claim_sql(str(uuid.uuid4()),sa,"runtime-a")))
        self.a.execute("begin;")
        self.assertEqual(self.a.execute(self.complete_sql(str(uuid.uuid4()),sa,"runtime-a",job)),"completed")
        revoker=self.session()
        revoker.execute("reset role;")
        revoker.start(self.revoke_sql())
        self.blocked(revoker,self.a)
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
        self.a.execute("commit;")
        self.assertEqual(revoker.finish(),"revoked")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")
        with self.assertRaisesRegex(RuntimeError,"mip_authz_revoked"):
            self.a.execute(self.complete_sql(str(uuid.uuid4()),sa,"runtime-a",job))
    def test_concurrent_identical_claim_retry_converges_without_second_lease(self):
        sa,sb=self.fixture()
        request=str(uuid.uuid4())
        self.a.execute("begin;")
        first=json.loads(self.a.execute(self.claim_sql(request,sa,"runtime-a")))
        self.b.start(self.claim_sql(request,sa,"runtime-a"))
        self.blocked(self.b,self.a)
        self.a.execute("commit;")
        retry=json.loads(self.b.finish())
        self.assertEqual(retry["generation_id"],first["generation_id"])
        self.assertIsNone(retry["lease_token"])
        self.assertEqual(self.admin("select count(*) from comparison_qualification.request_runs"),"1")
        self.assertEqual(self.admin("select attempt from comparison_qualification.jobs"),"1")
    def test_concurrent_foreign_claim_waits_then_denies_without_consuming_work(self):
        sa,sb=self.fixture()
        request=str(uuid.uuid4())
        self.a.execute("begin;")
        self.a.execute(self.claim_sql(request,sa,"runtime-a"))
        self.b.start(self.claim_sql(request,sb,"runtime-b"))
        self.blocked(self.b,self.a)
        self.a.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"mip_request_replay_owner"):
            self.b.finish()
        self.assertEqual(self.admin("select count(*) from comparison_qualification.request_runs"),"1")

if __name__ == '__main__': unittest.main(verbosity=2)
