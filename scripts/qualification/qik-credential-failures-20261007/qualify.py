"""Closed synthetic credential-failure probes against the existing Python APIs.

No socket, installed library, server, certificate, credential store, or provider is
used. Fake C symbols are borrowed from the existing transport tests; the transport
and worker code under test are the actual modules. Only fixed receipt data leaves
this harness, including when a probe fails.
"""
import collections
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import traceback
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


fixture = load("credential_failure_fake_c", ROOT / "tests/qik_private_libpq_transport_test.py")
q = fixture.q
worker = load("credential_failure_worker", ROOT / "scripts/qualification/backend-private-host/private_worker.py")
DUMMY_PASSWORD = "SYNTHETIC_ONLY_PASSWORD_20261007"
DUMMY_URI = ("postgresql://SYNTHETIC_ONLY_USER_20261007:" + DUMMY_PASSWORD
             + "@credential-test.invalid:5432/SYNTHETIC_ONLY_DB_20261007?sslmode=verify-full")
MARKERS = (DUMMY_PASSWORD, DUMMY_URI, fixture.SYNTHETIC_PRIVATE)
RECORDS = []
FAULT_MODELS = []


class QualificationFailure(Exception):
    pass


def check(condition, code):
    if not condition:
        raise QualificationFailure(code)


def throw(error):
    raise error


def contains_marker(value):
    return any(marker in value for marker in MARKERS)


def capture(call):
    out, err = io.StringIO(), io.StringIO()
    error = None
    value = None
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            value = call()
        except BaseException as caught:
            error = caught
    # Exception text remains in this private test process, never in a receipt.
    trace = "" if error is None else "".join(traceback.format_exception(error))
    return value, error, out.getvalue(), err.getvalue(), trace


def safe_capture(observed, expected_code=None):
    value, error, out, err, trace = observed
    check(not any(contains_marker(text) for text in (out, err, trace)), "CREDENTIAL_MARKER_EXPOSED")
    check(out == "" and err == "", "UNEXPECTED_CONSOLE_OUTPUT")
    if expected_code is not None:
        check(isinstance(error, q.TransportRefused), "TYPED_REFUSAL_MISSING")
        check(error.code == expected_code and str(error) == expected_code, "FIXED_CODE_MISMATCH")
        check(not contains_marker(repr(error)), "EXCEPTION_REPR_EXPOSED")
    else:
        check(error is None, "UNEXPECTED_EXCEPTION")
    return value


def record(case, boundary, run):
    try:
        run()
        RECORDS.append({"case": case, "boundary": boundary, "passed": True})
    except BaseException as error:
        # Never serialize unexpected exception strings, arguments or tracebacks.
        code = str(error) if isinstance(error, QualificationFailure) else "HARNESS_PROBE_FAILED"
        RECORDS.append({"case": case, "boundary": boundary, "passed": False, "code": code})


def fields(**overrides):
    return fixture.fields(password=DUMMY_PASSWORD, **overrides)


def transport_connect(fake, overrides, code):
    transport, _ = fixture.make(fake, connect=False)
    try:
        with patch.dict(os.environ, {}, clear=True):
            safe_capture(capture(lambda: transport.connect(fields(**overrides))), code)
        if code != "PRIVATE_FIELDS_REFUSED":
            check(transport._conn is None, "CONNECTION_NOT_RELEASED")
    finally:
        safe_capture(capture(transport.finish))


def frame(sequence, operation, payload):
    return (json.dumps({"sequence": sequence, "operation": operation,
                        "privatePayload": payload}) + "\n").encode()


def worker_run(fake, frames, *, guard=False, session="primary"):
    reader, writer = io.BytesIO(b"".join(frames)), io.BytesIO()
    # This calls the existing closed inner loop without changing its production
    # gate. Every loaded C function is fake, and select is replaced before use.
    with patch.object(worker, "_fixed_client", return_value=q), \
            patch.object(q.C, "CDLL", return_value=fake.dll()), \
            patch.object(q.time, "monotonic", lambda: fake.now), \
            patch.object(q, "_wait_socket", fake.wait), \
            patch.dict(os.environ, {}, clear=True):
        call = (lambda: worker.serve_private_pipe(reader, writer, session)) if guard else \
            (lambda: worker._serve_bound_private_pipe(reader, writer, session))
        safe_capture(capture(call))
    raw = writer.getvalue().decode()
    check(not contains_marker(raw), "WORKER_REPLY_EXPOSED")
    return [json.loads(line) for line in raw.splitlines()]


def connect_frame(session="primary", **overrides):
    private = fields(**overrides).__dict__
    return frame(1, "connect_" + session,
                 {"reviewedSourceHashes": q.inspect_source_hashes(), "privateFields": private})


def worker_refusal(fake, frames, count=1, session="primary"):
    replies = worker_run(fake, frames, session=session)
    check(len(replies) == count, "WORKER_REPLY_COUNT")
    check(replies[-1]["ok"] is False, "WORKER_REFUSAL_MISSING")
    check(replies[-1]["result"] == {"code": "PRIVATE_WORKER_COMMAND_REFUSED"}, "WORKER_FIXED_CODE")


def run_matrix():
    # These names label simulated failure causes. They do not classify a real
    # libpq authentication/TLS response or qualify certificate verification.
    for case in ("authentication", "hostname-verification", "untrusted-ca", "missing-ca",
                 "rejected-role", "rejected-database"):
        def probe():
            fake = fixture.FakeLibpq()
            fake.connect_polls = collections.deque([0])
            transport_connect(fake, {}, "CONNECT_FAILED")
            check("PQsetNoticeReceiver" in fake.calls, "NOTICE_RECEIVER_MISSING")
        record(case, "PrivateTransport.connect/fake-native-poll-failure", probe)
        def worker_probe():
            fake = fixture.FakeLibpq()
            fake.connect_polls = collections.deque([0])
            worker_refusal(fake, [connect_frame()])
        record(case, "private_worker/closed-inner-loop", worker_probe)

    malformed = (("uri-in-host", {"host": DUMMY_URI}),
                 ("uri-in-user", {"user": DUMMY_URI}),
                 ("uri-in-database", {"dbname": DUMMY_URI}),
                 ("relative-ca-path", {"sslrootcert": DUMMY_PASSWORD}),
                 ("nul-in-password", {"password": DUMMY_PASSWORD + "\0"}))
    for case, overrides in malformed:
        def probe(overrides=overrides):
            fake = fixture.FakeLibpq()
            actual_fields = fixture.fields(**{"password": DUMMY_PASSWORD, **overrides})
            transport, _ = fixture.make(fake, connect=False)
            with patch.dict(os.environ, {}, clear=True):
                safe_capture(capture(lambda: transport.connect(actual_fields)), "PRIVATE_FIELDS_REFUSED")
            check("PQconnectStartParams" not in fake.calls, "MALFORMED_INPUT_REACHED_C")
        record(case, "PrivateTransport.connect/input-validation", probe)
        def worker_probe(overrides=overrides):
            fake = fixture.FakeLibpq()
            private = fixture.fields(**{"password": DUMMY_PASSWORD, **overrides}).__dict__
            worker_refusal(fake, [frame(1, "connect_primary", {
                "reviewedSourceHashes": q.inspect_source_hashes(), "privateFields": private})])
            check("PQconnectStartParams" not in fake.calls, "MALFORMED_WORKER_INPUT_REACHED_C")
        record(case, "private_worker/closed-input-validation", worker_probe)

    def environment_probe():
        fake = fixture.FakeLibpq()
        transport, _ = fixture.make(fake, connect=False)
        with patch.dict(os.environ, {"PGPASSWORD": DUMMY_PASSWORD}, clear=True):
            before = dict(os.environ)
            safe_capture(capture(lambda: transport.connect(fields())), "PG_ENVIRONMENT_REFUSED")
            check(dict(os.environ) == before, "ENVIRONMENT_MUTATED")
        check("PQconnectStartParams" not in fake.calls, "ENVIRONMENT_REACHED_C")
    record("password-environment-refusal", "PrivateTransport.connect", environment_probe)

    def timeout_probe():
        fake = fixture.FakeLibpq()
        fake.connect_poll_forever = True
        transport_connect(fake, {}, "CONNECT_TIMEOUT")
    record("connection-timeout", "PrivateTransport.connect/fake-clock", timeout_probe)

    def worker_timeout():
        fake = fixture.FakeLibpq()
        fake.connect_poll_forever = True
        worker_refusal(fake, [connect_frame()])
    record("connection-timeout", "private_worker/fake-clock", worker_timeout)

    for case, function, code in (("host-target-mismatch", "PQhost", "TARGET_REFUSED"),
                                 ("database-target-mismatch", "PQdb", "TARGET_REFUSED"),
                                 ("role-target-mismatch", "PQuser", "TARGET_REFUSED")):
        def probe(function=function, code=code):
            fake = fixture.FakeLibpq()
            setattr(fake, function, lambda *_: fake.ptr(DUMMY_URI))
            transport_connect(fake, {}, code)
        record(case, "PrivateTransport.connect/native-target-check", probe)

    def tls_probe():
        fake = fixture.FakeLibpq()
        fake.ssl = 0
        transport_connect(fake, {}, "TLS_REFUSED")
    record("post-connect-tls-unavailable", "PrivateTransport.connect", tls_probe)

    for function in ("PQconnectStartParams", "PQconnectPoll", "PQsetnonblocking"):
        def probe(function=function):
            fake = fixture.FakeLibpq()
            setattr(fake, function, lambda *_: throw(RuntimeError(DUMMY_URI + DUMMY_PASSWORD)))
            transport_connect(fake, {}, "TRANSPORT_FAILED")
        record("exception-" + function, "PrivateTransport.connect", probe)

    for exception, code in ((RuntimeError, "TRANSPORT_FAILED"), (KeyboardInterrupt, "TRANSPORT_INTERRUPTED"),
                            (SystemExit, "TRANSPORT_INTERRUPTED")):
        def probe(exception=exception, code=code):
            transport, fake = fixture.make()
            fake.send_exception = exception(DUMMY_URI + DUMMY_PASSWORD)
            safe_capture(capture(lambda: transport.execute("begin")), code)
            check(transport.outstanding, "UNCERTAINTY_NOT_RETAINED")
            safe_capture(capture(transport.finish))
        record("query-exception-" + exception.__name__, "PrivateTransport.execute", probe)

    def rejected_result():
        transport, fake = fixture.make()
        fake.next_results = [fixture.result_for(transport, "begin", status=7)]
        safe_capture(capture(lambda: transport.execute("begin")), "RESULT_REFUSED")
        check(len(fake.cleared) == 1, "ERROR_RESULT_NOT_FREED")
        check(not transport.outstanding, "ERROR_RESULT_NOT_DRAINED")
        safe_capture(capture(transport.finish))
    record("post-connect-error-result", "PrivateTransport.execute/fake-PGresult", rejected_result)

    def malformed_parameters():
        transport, fake = fixture.make()
        safe_capture(capture(lambda: transport.execute("begin", [DUMMY_URI])), "PARAMETERS_REFUSED")
        check("PQsendQueryParams" not in fake.calls, "MALFORMED_PARAMETERS_SENT")
        safe_capture(capture(transport.finish))
    record("malformed-query-parameters", "PrivateTransport.execute", malformed_parameters)

    def notice_probe():
        transport, fake = fixture.make()
        pointer = fake.ptr(DUMMY_URI + DUMMY_PASSWORD)
        safe_capture(capture(lambda: fake.notice(None, pointer)))
        check(repr(fields()) == "<PrivateConnectionFields>", "PRIVATE_FIELDS_REPR")
        check(not any(hasattr(transport._pq, name) for name in (
            "PQerrorMessage", "PQresultErrorMessage", "PQresultErrorField", "PQtrace", "PQcancelErrorMessage")),
            "RAW_DIAGNOSTIC_SYMBOL_BOUND")
        safe_capture(capture(transport.finish))
    record("notice-and-native-diagnostic-suppression", "Libpq17/no-op-notice-callback", notice_probe)

    for exception, code in ((RuntimeError, "TRANSPORT_FAILED"), (KeyboardInterrupt, "TRANSPORT_INTERRUPTED"),
                            (SystemExit, "TRANSPORT_INTERRUPTED")):
        def finish_probe(exception=exception, code=code):
            transport, fake = fixture.make()
            fake.PQfinish = lambda *_: throw(exception(DUMMY_URI + DUMMY_PASSWORD))
            safe_capture(capture(transport.finish), code)
            check(transport._conn is None and transport._failed, "FINISH_STATE_NOT_CLOSED")
            safe_capture(capture(transport.finish))
        record("cleanup-exception-" + exception.__name__, "PrivateTransport.finish", finish_probe)
        def connect_cleanup_probe(exception=exception):
            fake = fixture.FakeLibpq()
            fake.connect_polls = collections.deque([0])
            fake.PQfinish = lambda *_: throw(exception(DUMMY_URI + DUMMY_PASSWORD))
            transport_connect(fake, {}, "CONNECT_FAILED")
        record("failed-connect-cleanup-" + exception.__name__, "PrivateTransport.connect", connect_cleanup_probe)

    def worker_query():
        fake = fixture.FakeLibpq()
        fake.send_exception = RuntimeError(DUMMY_URI + DUMMY_PASSWORD)
        worker_refusal(fake, [connect_frame(), frame(2, "execute", {
            "session": "primary", "commandId": "begin", "parameters": []})], 2)
        check(len(fake.finished) == 1, "WORKER_CONNECTION_NOT_FINISHED")
    record("post-connect-query-exception", "private_worker/closed-inner-loop", worker_query)

    def worker_cleanup():
        fake = fixture.FakeLibpq()
        fake.PQfinish = lambda *_: throw(RuntimeError(DUMMY_URI + DUMMY_PASSWORD))
        replies = worker_run(fake, [connect_frame(), frame(2, "finish", {})])
        check(replies[-1]["result"] == {"finished": True}, "WORKER_FINISH_REPLY")
    record("final-cleanup-exception", "private_worker/closed-inner-loop", worker_cleanup)

    for case, frames in (("malformed-json", [(DUMMY_URI + "\n").encode()]),
                         ("unknown-operation", [frame(1, DUMMY_URI, {"password": DUMMY_PASSWORD})]),
                         ("wrong-session", [connect_frame("verifier")])):
        record(case, "private_worker/protocol-validation",
               lambda frames=frames: worker_refusal(fixture.FakeLibpq(), frames))

    def production_guard():
        fake = fixture.FakeLibpq()
        replies = worker_run(fake, [connect_frame()], guard=True)
        check(replies == [{"sequence": 0, "ok": False,
                           "result": {"code": "APPROVED_PRIVATE_HOST_RUNTIME_UNBOUND"}}], "RUNTIME_GUARD_CHANGED")
        check(fake.calls == [], "UNBOUND_GUARD_CALLED_C")
        check(worker.PRODUCTION_RUNTIME_BOUND is False, "RUNTIME_BOUND_MUTATED")
    record("unbound-runtime-precedes-private-input", "private_worker/production-guard", production_guard)

    def cli_arguments():
        value, error, out, err, trace = capture(lambda: q.main(["--dsn=" + DUMMY_URI]))
        check(error is None and value == 2 and err == "", "CLI_REFUSAL_FAILED")
        check(not any(contains_marker(text) for text in (out, err, trace)), "CLI_ARGUMENT_ECHO")
        check(json.loads(out)["code"] == "CLI_ARGUMENTS_REFUSED", "CLI_FIXED_CODE")
    record("credential-cli-argument-refusal", "libpq17.main/in-process", cli_arguments)

    # Direct private import APIs have additional Python-fault seams. These are
    # deliberately retained as unqualified model findings; real C functions take
    # PGconn pointers and do not throw our supplied credential-bearing objects.
    for function in ("PQstatus", "PQtransactionStatus"):
        def fault_probe(function=function):
            transport, fake = fixture.make()
            setattr(fake, function, lambda *_: throw(RuntimeError(DUMMY_URI + DUMMY_PASSWORD)))
            observed = capture(lambda: transport.execute("begin"))
            check(contains_marker(observed[4]), "DIRECT_FAULT_MODEL_NOT_REPRODUCED")
            check(observed[2] == observed[3] == "", "FAULT_MODEL_CONSOLE_OUTPUT")
            # The worker catches these exceptions before replying to its pipe.
            second = fixture.FakeLibpq()
            setattr(second, function, lambda *_: throw(RuntimeError(DUMMY_URI + DUMMY_PASSWORD)))
            worker_refusal(second, [connect_frame()])
            FAULT_MODELS.append({"function": function, "directPrivateApiInjectedTracebackContainsMarker": True,
                                 "workerReplyContainsMarker": False, "nativeReachabilityQualified": False})
            safe_capture(capture(transport.finish))
        record("private-precheck-fault-" + function, "synthetic-only/direct-API-limitation", fault_probe)


def main():
    if sys.argv[1:] == ["--closed-process-custody"]:
        # A synthetic child only: hold dummy stdin in memory while its parent
        # inspects this child's actual /proc argv/environment. Production bridge
        # activation and the private credential handoff remain unavailable.
        private_input = sys.stdin.buffer.readline(65536)
        check(private_input == (DUMMY_URI + "\n").encode(), "CUSTODY_INPUT_REFUSED")
        reader, writer = io.BytesIO(private_input), io.BytesIO()
        worker.serve_private_pipe(reader, writer)
        reply = json.loads(writer.getvalue())
        check(reader.tell() == 0, "UNBOUND_RUNTIME_READ_INPUT")
        print(json.dumps({"ready": True, "runtimeGuardCode": reply["result"]["code"],
                          "guardConsumedPrivateInput": False}), flush=True)
        sys.stdin.buffer.readline(65536)
        return 0
    if sys.argv[1:] != ["--report-json"]:
        print(json.dumps({"code": "QUALIFICATION_ARGUMENTS_REFUSED", "networkMode": "none"}))
        return 2
    run_matrix()
    failed = sum(not item["passed"] for item in RECORDS)
    receipt = {"scope": "SYNTHETIC FAKE C AND CLOSED WORKER ONLY", "networkMode": "none",
               "pythonVersion": list(sys.version_info[:3]),
               "nativeServerQualified": False, "qikExecuted": False, "realCredentialsUsed": False,
               "providerInternalTelemetryObserved": False, "certificateVerificationQualified": False,
               "tests": len(RECORDS), "failures": failed, "skipped": 0,
               "unqualifiedPythonFaultModels": FAULT_MODELS, "cases": RECORDS}
    print(json.dumps(receipt, sort_keys=True))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
