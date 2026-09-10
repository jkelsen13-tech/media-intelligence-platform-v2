"""Real PostgreSQL connection qualification. Synthetic, disposable GitHub CI only."""
import json
import os
import queue
import subprocess
import threading
import time
import unittest
import uuid
from pathlib import Path

if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("MIP_DISPOSABLE_POSTGRES") != "comparison-qualification":
    raise SystemExit("Only the explicit disposable GitHub Actions PostgreSQL service is allowed")

# Fixed loopback test service. Never accept a production DSN or inherited PG settings.
ENV = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
ENV.update(PGPASSWORD="mip-disposable-ci-only", PGCONNECT_TIMEOUT="5",
           PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=10000")
BASE = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
        "-h", "127.0.0.1", "-p", "5432", "-U", "postgres"]
CONTRACT = Path("supabase/qualification/comparison-generations/contract.sql").read_text()
def quoted(value):
    return "'" + str(value).replace("'", "''") + "'"
def run(database, sql):
    result = subprocess.run(BASE + ["-d", database], input=sql, text=True,
                            capture_output=True, timeout=25, env=ENV)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()
def enqueue(source="synthetic"):
    return ("select comparison_qualification.enqueue(" + quoted(source) +
            ",'{\"value\":9007199254740993,\"published_at\":\"2026-01-01\"}'::jsonb,"
            "'qualification:concurrent','2026-01-01T00:00:00Z');")
def completion(job, output='{"claims":[]}'):
    args = [job["generation_id"], job["lease_token"], job["input_hash"],
            job["implementation_ref"], output]
    return "select comparison_qualification.complete(" + ",".join(map(quoted,args)) + "::jsonb);"

def failure(job):
    args = [job["generation_id"], job["lease_token"], job["input_hash"], job["implementation_ref"]]
    return "select comparison_qualification.fail(" + ",".join(map(quoted,args)) + ");"

class Session:
    def __init__(self, database):
        self.process = subprocess.Popen(BASE + ["-d",database], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=ENV)
        self.lines = queue.Queue()
        def reader():
            for line in self.process.stdout:
                self.lines.put(line.rstrip("\n"))
            self.lines.put(None)
        self.thread = threading.Thread(target=reader, daemon=True)
        self.thread.start()
        self.pid = int(self.execute("select pg_backend_pid();"))
        self.execute("set role service_role;")
    def start(self, sql):
        self.marker = "done_" + uuid.uuid4().hex
        self.process.stdin.write(sql + "\n\\echo " + self.marker + "\n")
        self.process.stdin.flush()
    def finish(self):
        lines = []
        deadline = time.monotonic() + 20
        while True:
            line = self.lines.get(timeout=max(0.01, deadline-time.monotonic()))
            if line is None:
                raise RuntimeError("\n".join(lines))
            if line == self.marker:
                return "\n".join(lines).strip()
            lines.append(line)
    def execute(self, sql):
        self.start(sql)
        return self.finish()
    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
        self.process.wait(timeout=5)
        self.thread.join(timeout=5)

class ConcurrentContract(unittest.TestCase):
    def setUp(self):
        self.database = "mip_comparison_" + uuid.uuid4().hex
        run("postgres", "create database " + self.database)
        self.sessions = []
        self.addCleanup(self.cleanup)
        run(self.database, CONTRACT)
        self.a = self.session()
        self.b = self.session()
        self.assertNotEqual(self.a.pid,self.b.pid)
    def cleanup(self):
        for session in self.sessions:
            session.close()
        run("postgres", "drop database " + self.database)
    def session(self):
        s = Session(self.database)
        self.sessions.append(s)
        return s
    def admin(self,sql):
        return run(self.database,sql)
    def blocked(self, session, blocker):
        deadline = time.monotonic()+5
        while time.monotonic()<deadline:
            result = self.admin("select " + str(blocker.pid) +
                "=any(pg_blocking_pids(" + str(session.pid) + "));")
            if result == "t":
                print("MIP_PG_LOCK_OBSERVED="+json.dumps({"blocked":session.pid,"holder":blocker.pid}),flush=True)
                return
            time.sleep(0.025)
        self.fail("Expected concurrent lock wait was not observed")
    def claim(self,session):
        raw=session.execute("select comparison_qualification.claim();")
        return json.loads(raw) if raw else None

    def test_duplicate_enqueue_waits_and_converges(self):
        self.a.execute("begin;")
        first=self.a.execute(enqueue())
        self.b.start(enqueue())
        self.blocked(self.b,self.a)
        self.assertEqual(self.admin("select count(*) from comparison_qualification.generations"),"0")
        self.a.execute("commit;")
        self.assertEqual(self.b.finish(),first)
        self.assertEqual(self.admin("select count(*) from comparison_qualification.generations"),"1")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.jobs"),"1")

    def test_claim_skips_locked_generation_and_rollback_preserves_budget(self):
        first=self.a.execute(enqueue())
        self.a.execute("begin;")
        held=self.claim(self.a)
        self.assertEqual(held["generation_id"],first)
        self.assertIsNone(self.claim(self.b))
        sibling=self.b.execute(enqueue("sibling"))
        other=self.claim(self.b)
        self.assertEqual(other["generation_id"],sibling)
        self.assertEqual(self.admin("select attempt from comparison_qualification.jobs where generation_id="+quoted(first)),"0")
        self.a.execute("rollback;")
        reclaimed=self.claim(self.b)
        self.assertEqual(reclaimed["generation_id"],first)
        self.assertNotEqual(reclaimed["lease_token"],held["lease_token"])
        self.assertEqual(self.admin("select attempt from comparison_qualification.jobs where generation_id="+quoted(first)),"1")

    def test_completion_visibility_and_concurrent_exact_retry(self):
        self.a.execute(enqueue())
        job=self.claim(self.a)
        self.a.execute("begin;")
        self.assertEqual(self.a.execute(completion(job)),"completed")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
        self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"processing")
        self.b.start(completion(job))
        self.blocked(self.b,self.a)
        self.a.execute("commit;")
        self.assertEqual(self.b.finish(),"completed")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")
        self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"completed")

    def test_rolled_back_completion_has_no_visible_output_or_acknowledgement(self):
        self.a.execute(enqueue())
        job=self.claim(self.a)
        self.a.execute("begin;")
        self.a.execute(completion(job))
        self.b.start(completion(job))
        self.blocked(self.b,self.a)
        self.a.execute("rollback;")
        self.assertEqual(self.b.finish(),"completed")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")
        self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"completed")

    def test_stale_completion_rechecks_committed_replacement_lease(self):
        self.a.execute(enqueue())
        old=self.claim(self.a)
        self.admin("update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '31 seconds'")
        self.a.execute("begin;")
        current=self.claim(self.a)
        self.assertNotEqual(current["lease_token"],old["lease_token"])
        self.b.start(completion(old))
        self.blocked(self.b,self.a)
        self.a.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"invalid or expired comparison lease"):
            self.b.finish()
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
        self.assertEqual(self.a.execute(completion(current)),"completed")

    def test_locked_exhausted_row_does_not_block_independent_work(self):
        first=self.a.execute(enqueue())
        self.claim(self.a)
        self.admin("update comparison_qualification.jobs set attempt=3,lease_expires_at=clock_timestamp()-interval '1 second'")
        self.a.execute("reset role;begin;select generation_id from comparison_qualification.jobs for update;")
        sibling=self.b.execute(enqueue("sibling"))
        self.assertEqual(self.claim(self.b)["generation_id"],sibling)
        self.assertEqual(self.admin("select state from comparison_qualification.jobs where generation_id="+quoted(first)),"processing")
        self.a.execute("rollback;set role service_role;")
        self.assertIsNone(self.claim(self.b))
        self.assertEqual(self.admin("select state||':'||attempt||':'||failure_code from comparison_qualification.jobs where generation_id="+quoted(first)),
                         "failed:3:lease_attempts_exhausted")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")

    def test_failure_commit_blocks_completion_and_exact_report_converges(self):
        self.a.execute(enqueue())
        job=self.claim(self.a)
        self.a.execute("begin;")
        self.assertEqual(self.a.execute(failure(job)),"failed")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.failure_reports"),"0")
        self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"processing")
        self.b.start(completion(job))
        self.blocked(self.b,self.a)
        retry=self.session()
        retry.start(failure(job))
        self.blocked(retry,self.b)
        self.a.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"invalid or expired comparison lease"):
            self.b.finish()
        self.assertEqual(retry.finish(),"failed")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.failure_reports"),"1")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"0")
        self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"failed")

    def test_completion_commit_rejects_waiting_failure(self):
        self.a.execute(enqueue())
        job=self.claim(self.a)
        self.a.execute("begin;")
        self.a.execute(completion(job))
        self.b.start(failure(job))
        self.blocked(self.b,self.a)
        self.a.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"invalid or expired comparison lease"):
            self.b.finish()
        self.assertEqual(self.admin("select count(*) from comparison_qualification.failure_reports"),"0")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")
        self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"completed")

    def test_failure_rollback_allows_waiting_completion(self):
        self.a.execute(enqueue())
        job=self.claim(self.a)
        self.a.execute("begin;")
        self.a.execute(failure(job))
        self.b.start(completion(job))
        self.blocked(self.b,self.a)
        self.a.execute("rollback;")
        self.assertEqual(self.b.finish(),"completed")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.failure_reports"),"0")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")
        self.assertEqual(self.admin("select state from comparison_qualification.jobs"),"completed")

    def source_fixture(self):
        self.admin(Path("supabase/qualification/comparison-generations/source-fixture.sql").read_text())
        self.admin(Path("supabase/qualification/comparison-generations/source-snapshot.sql").read_text())

    def test_source_capture_keeps_one_snapshot_during_committed_multi_table_correction(self):
        self.source_fixture()
        # Fixture-only view barrier forces the capture to pause after its snapshot starts.
        self.admin("""alter table public.events rename to source_events;
          create function public.fixture_pause() returns boolean language plpgsql as $$
          begin perform pg_advisory_xact_lock(987123); return true; end $$;
          create view public.events as select * from public.source_events where public.fixture_pause();""")
        self.a.execute("select pg_advisory_lock(987123);")
        self.b.start("select comparison_qualification.capture_source('{}','qualification:source-snapshot');")
        self.blocked(self.b,self.a)
        self.admin("""begin;
          update public.source_events set canonical_title='Corrected event';
          update public.articles set summary='Corrected article';
          update public.event_articles set membership_method='revised';
          update public.pipeline_config set value='0.7';
          commit;""")
        self.a.execute("select pg_advisory_unlock(987123);")
        first=self.b.finish()
        old=json.loads(self.admin("select input_payload from comparison_qualification.generations where id="+quoted(first)))
        self.assertEqual(old["eventInputs"][0]["event"]["canonical_title"],"Council water funding")
        self.assertEqual(old["eventInputs"][0]["members"][0]["article"]["summary"],"Council approves water infrastructure funding")
        self.assertEqual(old["eventInputs"][0]["members"][0]["membership"]["membership_method"],"reviewed")
        self.assertEqual(old["configRows"][0]["value"],0.6)
        later=self.b.execute("select comparison_qualification.capture_source('{}','qualification:source-snapshot');")
        new=json.loads(self.admin("select input_payload from comparison_qualification.generations where id="+quoted(later)))
        self.assertNotEqual(first,later)
        self.assertEqual(new["eventInputs"][0]["event"]["canonical_title"],"Corrected event")
        self.assertEqual(new["eventInputs"][0]["members"][0]["article"]["summary"],"Corrected article")
        self.assertEqual(new["eventInputs"][0]["members"][0]["membership"]["membership_method"],"revised")
        self.assertEqual(new["configRows"][0]["value"],0.7)
        self.assertEqual(self.admin("select count(*) from comparison_qualification.jobs where state='pending'"),"2")
        self.assertEqual(json.loads(self.admin("select input_payload from comparison_qualification.generations where id="+quoted(first))),old)

    def test_source_capture_retention_and_queue_rollback_are_invisible_to_observer(self):
        self.source_fixture()
        self.a.execute("begin;")
        self.a.execute("select comparison_qualification.capture_source('{}','qualification:source-snapshot');")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.generations"),"0")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.jobs"),"0")
        self.a.execute("rollback;")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.generations"),"0")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.jobs"),"0")


    def selection_fixture(self):
        self.admin(Path("supabase/qualification/comparison-generations/selection.sql").read_text())
        self.a.execute(enqueue())
        job=self.claim(self.a)
        self.a.execute(completion(job))
        out=json.loads(self.admin("select row_to_json(o) from comparison_qualification.outputs o"))
        return out

    def selection_sql(self, action, output, predecessor=None):
        previous=quoted(predecessor) if predecessor else "null"
        generation=quoted(output["generation_id"]) if output else "null"
        digest=quoted(output["output_hash"]) if output else "null"
        return ("select comparison_qualification.select_output("+quoted(action)+",'synthetic',"+
                previous+","+generation+","+digest+",'{}');")

    def test_selection_rechecks_predecessor_after_concurrent_commit(self):
        output=self.selection_fixture()
        first=str(uuid.uuid4())
        self.a.execute("begin;")
        self.a.execute(self.selection_sql(first,output))
        self.assertEqual(self.admin("select count(*) from comparison_qualification.selection_history"),"0")
        self.b.start(self.selection_sql(str(uuid.uuid4()),output))
        self.blocked(self.b,self.a)
        self.a.execute("commit;")
        with self.assertRaisesRegex(RuntimeError,"stale selection predecessor"):
            self.b.finish()
        self.assertEqual(self.admin("select selection_id from comparison_qualification.selection_heads"),first)
        self.assertEqual(self.admin("select count(*) from comparison_qualification.selection_history"),"1")

    def test_selection_rollback_and_concurrent_retry_preserve_withdrawal(self):
        output=self.selection_fixture()
        first=str(uuid.uuid4())
        self.a.execute("begin;")
        self.a.execute(self.selection_sql(first,output))
        self.b.start(self.selection_sql(first,output))
        self.blocked(self.b,self.a)
        self.a.execute("rollback;")
        self.assertEqual(self.b.finish(),first)
        withdrawn=str(uuid.uuid4())
        self.a.execute("begin;")
        self.a.execute(self.selection_sql(withdrawn,None,first))
        self.b.start(self.selection_sql(first,output))
        self.blocked(self.b,self.a)
        self.a.execute("commit;")
        self.assertEqual(self.b.finish(),first)
        self.assertEqual(self.admin("select selection_id from comparison_qualification.selection_heads"),withdrawn)
        self.assertEqual(self.admin("select count(*) from comparison_qualification.selection_history"),"2")
        self.assertEqual(self.admin("select count(*) from comparison_qualification.outputs"),"1")

if __name__ == "__main__":
    run("postgres","create role anon;create role authenticated;create role service_role bypassrls;")
    print("MIP_PG_VERSION="+run("postgres","select version();"),flush=True)
    unittest.main(verbosity=2)
