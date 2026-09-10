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
        self.blocked(retry,self.a)
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

if __name__ == "__main__":
    run("postgres","create role anon;create role authenticated;create role service_role bypassrls;")
    print("MIP_PG_VERSION="+run("postgres","select version();"),flush=True)
    unittest.main(verbosity=2)
