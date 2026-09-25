"""Source-free tests for the optional pre-claim drain deadline only.

Fake run_one calls do not establish PostgreSQL, hosted-login or pooler behavior.
The unchanged native C1/C2 and representative R1/R5 receipts remain separate.
"""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


def run_tests(worker_module):
    class DrainDeadlineTests(unittest.TestCase):
        def worker(self, operation):
            instance = worker_module.NativeIntakeWorker.__new__(worker_module.NativeIntakeWorker)
            instance.run_one = operation
            return instance

        def test_default_preserves_count_without_reading_clock(self):
            seen = []
            def operation():
                seen.append(1)
                return {"state": "completed"}
            with patch.object(worker_module.time, "monotonic", side_effect=AssertionError("unexpected clock")):
                result = self.worker(operation).run(3)
            self.assertEqual(len(result), 3)
            self.assertEqual(len(seen), 3)

        def test_zero_budget_claims_nothing(self):
            with patch.object(worker_module.time, "monotonic", return_value=100):
                result = self.worker(lambda: self.fail("claim after zero budget")).run(10, max_elapsed_seconds=0)
            self.assertEqual(result, [])

        def test_exact_deadline_prevents_next_claim(self):
            seen = []
            def operation():
                seen.append(1)
                return {"state": "completed"}
            with patch.object(worker_module.time, "monotonic", side_effect=[100, 100, 102]):
                result = self.worker(operation).run(10, max_elapsed_seconds=2)
            self.assertEqual(len(result), 1)
            self.assertEqual(len(seen), 1)

        def test_inflight_work_finishes_and_result_is_retained(self):
            clock = [100]
            seen = []
            def operation():
                # Model atomic finish/retry bookkeeping that outlasts the deadline.
                clock[0] = 150
                seen.append("finish-and-record")
                return {"state": "retry_wait", "code": "native_database_error"}
            with patch.object(worker_module.time, "monotonic", side_effect=lambda: clock[0]):
                result = self.worker(operation).run(10, max_elapsed_seconds=2)
            self.assertEqual(result, [{"state": "retry_wait", "code": "native_database_error"}])
            self.assertEqual(seen, ["finish-and-record"])

        def test_recovery_and_idle_stops_are_preserved_with_deadline(self):
            for state in ("idle", "claim_unavailable", "lease_recovery_pending"):
                seen = []
                def operation():
                    seen.append(1)
                    return {"state": state}
                with self.subTest(state=state), patch.object(worker_module.time, "monotonic", return_value=100):
                    result = self.worker(operation).run(10, max_elapsed_seconds=2)
                self.assertEqual(len(seen), 1)
                self.assertEqual(result, [] if state == "idle" else [{"state": state}])

        def test_invalid_budget_rejected_before_clock_or_claim(self):
            for budget in (True, False, -1, 10 ** 1000, float("nan"), float("inf"), -float("inf"), "1", [], {}):
                with self.subTest(budget=budget), patch.object(worker_module.time, "monotonic", side_effect=AssertionError("unexpected clock")):
                    with self.assertRaises(ValueError):
                        self.worker(lambda: self.fail("invalid budget claimed")).run(1, max_elapsed_seconds=budget)

    return unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(DrainDeadlineTests))


if __name__ == "__main__":
    path = Path(__file__).with_name("native_worker.py")
    spec = importlib.util.spec_from_file_location("native_worker_deadline_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    raise SystemExit(0 if run_tests(module).wasSuccessful() else 1)
