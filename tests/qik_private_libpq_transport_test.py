"""Fake libpq state-machine tests + installed-library inspection, no sockets."""
import collections
import contextlib
import ctypes as C
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
MODULE = Path(__file__).resolve().parents[1] / "scripts/qualification/backend-private-client/libpq17.py"
spec = importlib.util.spec_from_file_location("qik_libpq17", MODULE)
q = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = q
spec.loader.exec_module(q)
SYNTHETIC_PRIVATE = "synthetic-private-value-never-output"
FAKE_LIBRARY_BYTES = b"synthetic libpq library bytes for inspection"


class FakeFunction:
    def __init__(self, owner, name):
        self.owner = owner
        self.name = name
        self.restype = None
        self.argtypes = None

    def __call__(self, *args):
        self.owner.calls.append(self.name)
        return getattr(self.owner, self.name)(*args)


class FakeLibpq:
    """Only C function stand-ins; cannot open any socket or connect anywhere."""
    def __init__(self):
        self.calls = []
        self.buffers = []
        self.functions = {}
        self.lib_version = 170011
        self.server_version = 170011
        self.protocol = 3
        self.ssl = 1
        self.ssl_protocol = "TLSv1.3"
        self.status = 2
        self.tx = 0
        self.connect_polls = collections.deque([2, 1, 3])
        self.connect_poll_forever = False
        self.socket = 10
        self.nonblocking = 0
        self.nonblocking_return = 0
        self.notice = None
        self.parameters = {}
        self.expand_dbname = None
        self.result_specs = {}
        self.next_results = []
        self.active_results = collections.deque()
        self.next_result_id = 500
        self.after_tx = 2
        self.flush_returns = collections.deque([0])
        self.busy_forever = False
        self.busy_returns = collections.deque()
        self.consume_return = 1
        self.send_return = 1
        self.send_exception = None
        self.sent = []
        self.cleared = []
        self.finished = []
        self.cancel_finished = []
        self.cancel_create = 200
        self.cancel_status = 14
        self.cancel_start = 1
        self.cancel_polls = collections.deque([2, 1, 3])
        self.cancel_poll_forever = False
        self.cancel_socket = 20
        self.cancel_unblocks_original = False
        self.now = 0.0
        self.waits = []

    def __getattr__(self, name):
        if name in q.SIGNATURES:
            value = self.functions.setdefault(name, FakeFunction(self, name))
            return value
        raise AttributeError(name)

    def dll(self):
        # A CDLL-shaped object whose symbol objects carry ctypes declarations.
        owner = self
        class Symbols:
            def __getattr__(self, name):
                if name not in q.SIGNATURES:
                    raise AssertionError("Non-allowlisted C symbol was requested")
                return owner.functions.setdefault(name, FakeFunction(owner, name))
        return Symbols()

    def ptr(self, value):
        if type(value) is str:
            value = value.encode("utf-8")
        buffer = C.create_string_buffer(value)
        self.buffers.append(buffer)
        return C.addressof(buffer)

    def wait(self, socket, reading, writing, remaining):
        self.waits.append((socket, reading, writing))
        self.now += min(0.01, remaining)
        return True

    def PQlibVersion(self): return self.lib_version
    def PQconnectStartParams(self, keys, values, expand):
        self.expand_dbname = expand
        self.parameters = {keys[n].decode(): values[n].decode() for n in range(len(keys) - 1)}
        return 101
    def PQsetNoticeReceiver(self, conn, callback, arg): self.notice = callback
    def PQconnectPoll(self, conn):
        self.socket += 1
        value = 1 if self.connect_poll_forever else self.connect_polls.popleft()
        if value == 3:
            self.status = 0
        return value
    def PQstatus(self, conn): return self.status
    def PQsocket(self, conn): return self.socket
    def PQsetnonblocking(self, conn, enabled):
        self.nonblocking = enabled
        return self.nonblocking_return
    def PQisnonblocking(self, conn): return self.nonblocking
    def PQfinish(self, conn): self.finished.append(conn)
    def PQserverVersion(self, conn): return self.server_version
    def PQprotocolVersion(self, conn): return self.protocol
    def PQsslInUse(self, conn): return self.ssl
    def PQsslAttribute(self, conn, attribute): return self.ptr(self.ssl_protocol)
    def PQhost(self, conn): return self.ptr(self.parameters["host"])
    def PQhostaddr(self, conn): return self.ptr(self.parameters["hostaddr"])
    def PQport(self, conn): return self.ptr(self.parameters["port"])
    def PQuser(self, conn): return self.ptr(self.parameters["user"])
    def PQdb(self, conn): return self.ptr(self.parameters["dbname"])
    def PQparameterStatus(self, conn, name): return self.ptr("UTF8")
    def PQtransactionStatus(self, conn): return self.tx
    def PQsendQueryParams(self, conn, sql, count, types, values, lengths, formats, result_format):
        if self.notice is None:
            raise AssertionError("notice suppression must precede queries")
        self.sent.append((sql, tuple(values[n] for n in range(count)) if values is not None else (),
                          types, lengths, formats, result_format))
        if self.send_exception:
            raise self.send_exception
        self.tx = 1
        for result in self.next_results:
            self.next_result_id += 1
            self.result_specs[self.next_result_id] = result
            self.active_results.append(self.next_result_id)
        self.next_results = []
        return self.send_return
    def PQflush(self, conn):
        return self.flush_returns.popleft() if self.flush_returns else 0
    def PQconsumeInput(self, conn): return self.consume_return
    def PQisBusy(self, conn):
        return 1 if self.busy_forever else self.busy_returns.popleft() if self.busy_returns else 0
    def PQgetResult(self, conn):
        if self.active_results:
            return self.active_results.popleft()
        self.tx = self.after_tx
        return None
    def PQresultStatus(self, result): return self.result_specs[result]["status"]
    def PQcmdStatus(self, result): return self.ptr(self.result_specs[result]["tag"])
    def PQntuples(self, result): return len(self.result_specs[result]["rows"])
    def PQnfields(self, result): return len(self.result_specs[result]["names"])
    def PQfname(self, result, col): return self.ptr(self.result_specs[result]["names"][col])
    def PQftype(self, result, col): return self.result_specs[result]["oids"][col]
    def PQfformat(self, result, col): return self.result_specs[result].get("format", 0)
    def PQgetisnull(self, result, row, col): return int(self.result_specs[result]["rows"][row][col] is None)
    def PQgetlength(self, result, row, col): return len(self.result_specs[result]["rows"][row][col])
    def PQgetvalue(self, result, row, col): return self.ptr(self.result_specs[result]["rows"][row][col])
    def PQclear(self, result): self.cleared.append(result)
    def PQcancelCreate(self, conn): return self.cancel_create
    def PQcancelStatus(self, cancel): return self.cancel_status
    def PQcancelStart(self, cancel): return self.cancel_start
    def PQcancelSocket(self, cancel): return self.cancel_socket
    def PQcancelPoll(self, cancel):
        self.cancel_socket += 1
        value = 1 if self.cancel_poll_forever else self.cancel_polls.popleft()
        if value == 3:
            self.cancel_status = 0
            if self.cancel_unblocks_original:
                self.busy_forever = False
        return value
    def PQcancelFinish(self, cancel): self.cancel_finished.append(cancel)


def fields(**overrides):
    return q.PrivateConnectionFields(**{"host": "approved.invalid", "hostaddr": "192.0.2.1",
        "port": "5432", "user": "postgres", "dbname": "postgres", "password": SYNTHETIC_PRIVATE,
        "sslrootcert": "/tmp/synthetic-reviewed-ca.pem", **overrides})


def make(fake=None, session="primary", connect=True):
    fake = fake or FakeLibpq()
    with patch.object(q.C, "CDLL", return_value=fake.dll()):
        library = q.Libpq17()
    transport = q.PrivateTransport(library, q.inspect_source_hashes(),
        q.ObservationBudgets(0.06, 0.06, 0.06, 0.06), session=session)
    transport._clock = lambda: fake.now
    transport._waiter = fake.wait
    if connect:
        with patch.dict(os.environ, {}, clear=True):
            transport.connect(fields())
    return transport, fake


def result_for(transport, command_id, rows=None, **overrides):
    expected = transport._commands[command_id].expected
    if rows is None:
        defaults = {16: b"t", 20: b"1", 23: b"42", 25: b"2000-01-01 00:00:00+00", 3802: b"{}"}
        rows = [tuple(defaults[oid] for oid in expected.type_oids)] if expected.row_count else []
    return {"status": expected.status, "tag": expected.command_tag,
            "names": expected.column_names, "oids": expected.type_oids, "rows": rows, **overrides}


def execute(transport, fake, command_id, parameters=(), rows=None, **overrides):
    fake.next_results = [result_for(transport, command_id, rows, **overrides)]
    fake.after_tx = {"IDLE": 0, "INTRANS": 2}[transport._commands[command_id].expected.transaction_status]
    return transport.execute(command_id, parameters)


class TransportTests(unittest.TestCase):
    def code(self, code, function):
        with self.assertRaises(q.TransportRefused) as raised:
            function()
        self.assertEqual(raised.exception.code, code)
        self.assertEqual(str(raised.exception), code)
        self.assertNotIn(SYNTHETIC_PRIVATE, repr(raised.exception))

    def begun(self):
        transport, fake = make()
        execute(transport, fake, "begin")
        return transport, fake

    def interrupted_begin(self):
        transport, fake = make()
        fake.busy_forever = True
        fake.next_results = [result_for(transport, "begin")]
        self.code("COMMAND_TIMEOUT", lambda: transport.execute("begin"))
        return transport, fake

    def test_fake_library_exact_ctypes_declarations_without_network(self):
        transport, fake = make(connect=False)
        library = transport._pq
        self.assertEqual(library.PQlibVersion(), 170011)
        expected_pointers = {
            "PQconnectStartParams": (q._SP, q._SP, C.c_int),
            "PQsendQueryParams": (C.c_void_p, C.c_char_p, C.c_int, C.POINTER(C.c_uint),
                q._SP, C.POINTER(C.c_int), C.POINTER(C.c_int), C.c_int),
            "PQsetNoticeReceiver": (C.c_void_p, q.NOTICE_RECEIVER, C.c_void_p),
        }
        self.assertEqual(library.PQsetNoticeReceiver.restype, q.NOTICE_RECEIVER)
        for name, (restype, argtypes) in q.SIGNATURES.items():
            function = getattr(library, name)
            self.assertIs(function.restype, restype)
            self.assertEqual(tuple(function.argtypes), argtypes)
        for name, args in expected_pointers.items():
            self.assertEqual(tuple(getattr(library, name).argtypes), args)
        for name in ("PQcancelCreate", "PQcancelStart", "PQcancelPoll", "PQcancelStatus", "PQcancelSocket", "PQcancelFinish"):
            self.assertEqual(getattr(library, name).argtypes, [C.c_void_p])
        with patch.object(Path, "read_bytes", return_value=FAKE_LIBRARY_BYTES):
            receipt = library.inspect()
        self.assertEqual(receipt["libraryBytes"], len(FAKE_LIBRARY_BYTES))
        self.assertEqual(receipt["librarySha256"], q._digest(FAKE_LIBRARY_BYTES))
        self.assertEqual(receipt["networkMode"], "none")
        self.assertFalse(receipt["nativeServerQualified"])
        for name in ("PQerrorMessage", "PQresultErrorField", "PQresultErrorMessage", "PQgetCancel", "PQcancel", "PQexec", "PQtrace"):
            self.assertFalse(hasattr(library, name))
        self.assertNotIn("PQconnectStartParams", fake.calls)

    def test_fixed_inventory_and_public_hash_binding(self):
        hashes = q.inspect_source_hashes()
        self.assertEqual(len(hashes), 21)
        transport, fake = make(connect=False)
        self.assertNotIn("verify_independently", transport._commands)
        self.assertEqual(transport._commands["guarded_operation"].sql.__len__(), 7101)
        self.assertEqual(q._digest(transport._commands["guarded_operation"].sql), hashes["guardedOperation"])
        self.assertEqual(transport._commands["grant_set_membership"].expected.command_tag, "GRANT ROLE")
        self.assertEqual(transport._commands["revoke_introduced_set_membership"].expected.command_tag, "REVOKE ROLE")
        for changed in ({}, {**hashes, "transport": "0" * 64}, {**hashes, "extra": "0" * 64}):
            self.code("SOURCE_BINDING_REFUSED", lambda: q.PrivateTransport(transport._pq, changed))
        self.assertNotIn("PQconnectStartParams", fake.calls)

    def test_source_drift_fails_before_network(self):
        original = Path.read_bytes
        def drift(path):
            value = original(path)
            return value + b" " if path.name == "snapshot-public.sql" else value
        with patch.object(Path, "read_bytes", drift):
            self.code("SOURCE_INVENTORY_REFUSED", q.inspect_source_hashes)

    def test_libpq_wrong_version_and_arbitrary_adapter_refused(self):
        fake = FakeLibpq()
        fake.lib_version = 180001
        with patch.object(q.C, "CDLL", return_value=fake.dll()):
            self.code("LIBPQ_VERSION_REFUSED", q.Libpq17)
        self.code("LIBPQ_LOAD_REFUSED", lambda: q.PrivateTransport(FakeLibpq(), q.inspect_source_hashes()))

    def test_pg_environment_refused_without_mutating_global_environment(self):
        transport, fake = make(connect=False)
        with patch.dict(os.environ, {"PGPASSWORD": SYNTHETIC_PRIVATE}, clear=True):
            before = dict(os.environ)
            self.code("PG_ENVIRONMENT_REFUSED", lambda: transport.connect(fields()))
            self.assertEqual(dict(os.environ), before)
        self.assertNotIn("PQconnectStartParams", fake.calls)

    def test_private_fields_refuse_uris_lists_defaults_and_address_guessing(self):
        for overrides in ({"host": "/tmp"}, {"host": "one,two"}, {"hostaddr": "approved.invalid"},
                {"hostaddr": "192.0.2.1,192.0.2.2"}, {"dbname": "postgresql://"},
                {"dbname": "user=postgres"}, {"port": "5432,5433"}, {"port": "65536"},
                {"sslrootcert": "system"}, {"sslrootcert": "relative.crt"},
                {"password": ""}, {"password": "a\0b"}, {"user": None}):
            transport, fake = make(connect=False)
            with patch.dict(os.environ, {}, clear=True):
                self.code("PRIVATE_FIELDS_REFUSED", lambda: transport.connect(fields(**overrides)))
            self.assertNotIn("PQconnectStartParams", fake.calls)

    def test_nonblocking_connect_explicit_arrays_changing_socket_notice(self):
        transport, fake = make()
        self.assertEqual(fake.expand_dbname, 0)
        for name, value in {"sslmode": "verify-full", "gssencmode": "disable", "passfile": "/dev/null",
                "sslcertmode": "disable", "sslcert": "/dev/null", "sslkey": "/dev/null",
                "hostaddr": "192.0.2.1", "sslrootcert": "/tmp/synthetic-reviewed-ca.pem"}.items():
            self.assertEqual(fake.parameters[name], value)
        self.assertNotIn("service", fake.parameters)
        self.assertEqual(fake.waits, [(10, False, True), (11, False, True), (12, True, False)])
        self.assertEqual(fake.nonblocking, 1)
        self.assertEqual(transport.transaction_status, "IDLE")
        self.assertLess(fake.calls.index("PQsetNoticeReceiver"), fake.calls.index("PQconnectPoll"))
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            fake.notice(None, 202)
        self.assertEqual((stdout.getvalue(), stderr.getvalue()), ("", ""))
        self.assertNotIn("PQresultStatus", fake.calls)
        self.assertEqual(repr(fields()), "<PrivateConnectionFields>")

    def test_connect_status_version_tls_target_protocol_fail_closed_and_finish(self):
        for attribute, value, expected in (("status", 1, "CONNECT_FAILED"),
                ("server_version", 180001, "SERVER_VERSION_REFUSED"),
                ("ssl", 0, "TLS_REFUSED"), ("ssl_protocol", "TLSv1.1", "TLS_REFUSED"),
                ("protocol", 2, "CONNECT_STATUS_REFUSED"),
                ("nonblocking_return", 1, "NONBLOCKING_REFUSED"),
                ("tx", 3, "TRANSACTION_STATUS_REFUSED")):
            fake = FakeLibpq()
            setattr(fake, attribute, value)
            transport, fake = make(fake, connect=False)
            with patch.dict(os.environ, {}, clear=True):
                self.code(expected, lambda: transport.connect(fields()))
            self.assertEqual(fake.finished, [101])
            self.assertEqual(fake.sent, [])
        transport, fake = make(connect=False)
        fake.PQhostaddr = lambda conn: fake.ptr("192.0.2.2")
        with patch.dict(os.environ, {}, clear=True):
            self.code("TARGET_REFUSED", lambda: transport.connect(fields()))

    def test_connect_timeout_failed_poll_and_attempt_not_retried(self):
        fake = FakeLibpq()
        fake.connect_poll_forever = True
        transport, fake = make(fake, connect=False)
        with patch.dict(os.environ, {}, clear=True):
            self.code("CONNECT_TIMEOUT", lambda: transport.connect(fields()))
            self.code("CONNECT_ATTEMPT_REFUSED", lambda: transport.connect(fields()))
        self.assertEqual(fake.finished, [101])
        for poll, code in ((0, "CONNECT_FAILED"), (4, "CONNECT_STATUS_REFUSED")):
            fake = FakeLibpq()
            fake.connect_polls = collections.deque([poll])
            transport, fake = make(fake, connect=False)
            with patch.dict(os.environ, {}, clear=True):
                self.code(code, lambda: transport.connect(fields()))
            self.assertEqual(fake.finished, [101])

    def test_interrupted_socket_wait_does_not_poll_without_readiness(self):
        transport, fake = make(connect=False)
        first = True
        def interrupted(socket, reading, writing, remaining):
            nonlocal first
            fake.wait(socket, reading, writing, remaining)
            if first:
                first = False
                return False
            self.assertNotIn("PQconnectPoll", fake.calls)
            transport._waiter = fake.wait
            return True
        transport._waiter = interrupted
        with patch.dict(os.environ, {}, clear=True):
            transport.connect(fields())
        self.assertEqual(fake.waits[:2], [(10, False, True), (10, False, True)])

    def test_flush_services_read_and_write_before_ack_and_final_null(self):
        transport, fake = make()
        fake.flush_returns = collections.deque([1, 1, 0])
        fake.busy_returns = collections.deque([1, 0])
        result = execute(transport, fake, "begin")
        self.assertTrue(result.completed)
        self.assertEqual(result.command_tag, "BEGIN")
        self.assertEqual(result.transaction_status, "INTRANS")
        self.assertFalse(transport.outstanding)
        self.assertEqual(len(fake.cleared), 1)
        self.assertEqual(fake.calls.count("PQgetResult"), 2)
        self.assertTrue(any(reading and writing for _, reading, writing in fake.waits))
        self.assertEqual(fake.sent[0][2:], (None, None, None, 0))

    def test_typed_private_results_exact_json_counts_and_nulls(self):
        transport, fake = self.begun()
        rows = [(json.dumps({"secret": SYNTHETIC_PRIVATE, "null": None}).encode(),)]
        result = execute(transport, fake, "capture_private_rows", rows=rows)
        self.assertEqual(result.rows[0][0], {"secret": SYNTHETIC_PRIVATE, "null": None})
        self.assertEqual(result.type_oids, (3802,))
        self.assertEqual(repr(result), "<PrivateResult>")
        counts = execute(transport, fake, "inspect_public_row_counts", rows=[(b"1", b"2")])
        self.assertEqual(counts.rows, ((1, 2),))
        backend = execute(transport, fake, "capture_primary_backend", rows=[(b"42", None)])
        self.assertEqual(backend.rows, ((42, None),))

    def test_parameters_are_private_text_or_null_never_sql_and_no_arbitrary_commands(self):
        transport, fake = self.begun()
        value = execute(transport, fake, "restore_statement_deadline", (SYNTHETIC_PRIVATE,), rows=[(b"t",)])
        self.assertEqual(value.rows, ((True,),))
        self.assertEqual(fake.sent[-1][1], (SYNTHETIC_PRIVATE.encode(),))
        self.code("COMMAND_REFUSED", lambda: transport.execute("SELECT 'caller SQL';"))
        for params in ((1,), (False,), ({"secret": SYNTHETIC_PRIVATE},), ("a\0b",), (), ("a", "b")):
            self.code("PARAMETERS_REFUSED", lambda: transport.execute("restore_lock_deadline", params))
        result = execute(transport, fake, "restore_lock_deadline", (None,), rows=[(b"t",)])
        self.assertEqual(result.rows, ((True,),))
        self.assertEqual(fake.sent[-1][1], (None,))

    def test_wrong_shape_tag_type_and_format_free_result_and_drain(self):
        for overrides in ({"tag": "SELECT 2"}, {"names": ("wrong",)}, {"oids": (25,)},
                {"format": 1}, {"rows": []}, {"rows": [(b"t",), (b"t",)]}):
            transport, fake = self.begun()
            self.code("RESULT_SHAPE_REFUSED", lambda: execute(transport, fake, "verify_private_logging_guard", **overrides))
            self.assertFalse(transport.outstanding)
            self.assertEqual(len(fake.cleared), 2)
            self.assertEqual(fake.calls.count("PQgetResult"), 4)
            self.code("RECOVERY_ONLY", lambda: transport.execute("guarded_operation"))

    def test_boolean_false_null_invalid_refused(self):
        for value in (b"f", None, b"TRUE", SYNTHETIC_PRIVATE.encode()):
            transport, fake = self.begun()
            self.code("RESULT_VALUE_REFUSED", lambda: execute(transport, fake, "verify_private_logging_guard", rows=[(value,)]))
            self.assertFalse(transport.outstanding)
            self.assertEqual(len(fake.cleared), 2)

    def test_invalid_private_json_diagnostics_suppressed_and_freed(self):
        transport, fake = self.begun()
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.code("RESULT_VALUE_REFUSED", lambda: execute(transport, fake, "capture_private_rows",
                rows=[(("{" + SYNTHETIC_PRIVATE).encode(),)]))
        self.assertEqual((stdout.getvalue(), stderr.getvalue()), ("", ""))
        self.assertEqual(len(fake.cleared), 2)

    def test_extra_results_all_freed_final_null_and_no_result_refused(self):
        transport, fake = self.begun()
        item = result_for(transport, "guarded_operation")
        fake.next_results = [item, item, item]
        self.code("RESULT_COUNT_REFUSED", lambda: transport.execute("guarded_operation"))
        self.assertFalse(transport.outstanding)
        self.assertEqual(len(fake.cleared), 4)
        self.assertEqual(fake.calls.count("PQgetResult"), 6)
        transport, fake = make()
        self.code("RESULT_COUNT_REFUSED", lambda: transport.execute("begin"))
        self.assertFalse(transport.outstanding)

    def test_server_error_result_never_reads_payload_allows_only_recovery(self):
        transport, fake = self.begun()
        item = {"status": 7, "tag": SYNTHETIC_PRIVATE, "names": (SYNTHETIC_PRIVATE,), "oids": (25,),
                "rows": [(SYNTHETIC_PRIVATE.encode(),)]}
        fake.next_results = [item]
        fake.after_tx = 3
        before = len(fake.calls)
        self.code("RESULT_REFUSED", lambda: transport.execute("guarded_operation"))
        self.assertEqual(transport.transaction_status, "INERROR")
        self.assertNotIn("PQcmdStatus", fake.calls[before:])
        self.assertNotIn("PQgetvalue", fake.calls[before:])
        self.assertFalse(transport.outstanding)
        result = execute(transport, fake, "rollback")
        self.assertEqual(result.command_tag, "ROLLBACK")
        self.assertEqual(result.transaction_status, "IDLE")

    def test_copy_pipeline_unknown_result_refuses_claim_of_original_drain(self):
        for status in (3, 4, 8, 9, 10, 11, 12, 999):
            transport, fake = self.begun()
            fake.next_results = [result_for(transport, "guarded_operation", status=status)]
            self.code("PROTOCOL_UNKNOWN", lambda: transport.execute("guarded_operation"))
            self.assertTrue(transport.outstanding)
            self.assertEqual(len(fake.cleared), 2)
            self.code("PROTOCOL_UNKNOWN", transport.drain)
            self.code("OUTSTANDING_COMMAND", lambda: transport.execute("rollback"))

    def test_timeout_cancel_encrypted_poll_changing_socket_then_original_drain_and_rollback(self):
        transport, fake = self.interrupted_begin()
        self.assertTrue(transport.outstanding)
        self.code("OUTSTANDING_COMMAND", lambda: transport.execute("rollback"))
        fake.cancel_unblocks_original = True
        fake.after_tx = 3
        # Cancellation response and original result are deliberately separate.
        fake.result_specs[next(iter(fake.active_results))]["status"] = 7
        before = len(fake.calls)
        outcome = transport.cancel_and_drain()
        self.assertTrue(outcome.cancel_dispatched)
        self.assertTrue(outcome.original_drained)
        self.assertEqual(outcome.transaction_status, "INERROR")
        self.assertEqual(outcome.result_count, 1)
        self.assertFalse(transport.outstanding)
        self.assertEqual(fake.cancel_finished, [200])
        self.assertEqual([w[0] for w in fake.waits if w[0] >= 20], [20, 21, 22])
        self.assertLess(fake.calls.index("PQcancelFinish", before), fake.calls.index("PQgetResult", before))
        self.assertNotIn("PQcmdStatus", fake.calls[before:])
        rollback = execute(transport, fake, "rollback")
        self.assertEqual(rollback.transaction_status, "IDLE")

    def test_cancel_dispatch_does_not_prove_original_canceled_or_drained(self):
        transport, fake = self.interrupted_begin()
        self.code("DRAIN_TIMEOUT", transport.cancel_and_drain)
        self.assertEqual(fake.cancel_status, 0)
        self.assertEqual(fake.cancel_finished, [200])
        self.assertTrue(transport.outstanding)
        self.code("OUTSTANDING_COMMAND", lambda: transport.execute("rollback"))
        self.assertEqual(len(fake.sent), 1)

    def test_cancel_failure_still_drains_original_and_returns_distinct_outcome(self):
        for setting, value in (("cancel_create", None), ("cancel_status", 1), ("cancel_start", 0)):
            transport, fake = self.interrupted_begin()
            setattr(fake, setting, value)
            fake.busy_forever = False
            outcome = transport.cancel_and_drain()
            self.assertTrue(outcome.original_drained)
            self.assertFalse(outcome.cancel_dispatched)
            self.assertEqual(outcome.cancel_code, "CANCEL_FAILED")
            self.assertFalse(transport.outstanding)
            self.assertEqual(fake.cancel_finished, [] if setting == "cancel_create" else [200])
            self.assertEqual(execute(transport, fake, "rollback").command_tag, "ROLLBACK")

    def test_cancel_failed_poll_and_application_timeout_with_separate_drain_budget(self):
        for forever in (False, True):
            transport, fake = self.interrupted_begin()
            fake.busy_forever = False
            fake.cancel_poll_forever = forever
            fake.cancel_polls = collections.deque([0])
            outcome = transport.cancel_and_drain()
            self.assertFalse(outcome.cancel_dispatched)
            self.assertEqual(outcome.cancel_code, "CANCEL_TIMEOUT" if forever else "CANCEL_FAILED")
            self.assertTrue(outcome.original_drained)
            self.assertEqual(fake.cancel_finished, [200])

    def test_interrupt_or_failed_send_tracks_begin_uncertainty_before_enqueue(self):
        for exception in (KeyboardInterrupt(SYNTHETIC_PRIVATE), RuntimeError(SYNTHETIC_PRIVATE), None):
            transport, fake = make()
            fake.send_exception = exception
            fake.send_return = 0
            code = "TRANSPORT_INTERRUPTED" if isinstance(exception, KeyboardInterrupt) else "TRANSPORT_FAILED" if exception else "SUBMISSION_FAILED"
            self.code(code, lambda: transport.execute("begin"))
            self.assertTrue(transport.outstanding)
            self.assertTrue(transport._begin_attempted)
            self.code("OUTSTANDING_COMMAND", lambda: transport.execute("rollback"))
            self.assertEqual(len(fake.sent), 1)

    def test_flush_consume_socket_errors_keep_original_unknown(self):
        for setting, value, code in (("flush_returns", collections.deque([-1]), "FLUSH_FAILED"),
                ("consume_return", 0, "CONSUME_FAILED"), ("socket", -1, "SOCKET_REFUSED")):
            transport, fake = make()
            setattr(fake, setting, value)
            fake.busy_forever = setting == "socket"
            fake.next_results = [result_for(transport, "begin")]
            self.code(code, lambda: transport.execute("begin"))
            self.assertTrue(transport.outstanding)
            self.code("OUTSTANDING_COMMAND", lambda: transport.execute("rollback"))

    def test_known_transaction_state_required_and_begin_rollback_not_replayed(self):
        transport, fake = self.begun()
        self.code("COMMAND_REPLAY_REFUSED", lambda: transport.execute("begin"))
        fake.after_tx = 0
        fake.next_results = [result_for(transport, "guarded_operation")]
        self.code("TRANSACTION_STATUS_REFUSED", lambda: transport.execute("guarded_operation"))
        self.assertFalse(transport.outstanding)
        execute(transport, fake, "rollback")
        self.code("COMMAND_REPLAY_REFUSED", lambda: transport.execute("rollback"))

    def test_lost_rollback_ack_close_cannot_infer_rollback_or_drain(self):
        transport, fake = self.begun()
        fake.busy_forever = True
        fake.next_results = [result_for(transport, "rollback")]
        self.code("COMMAND_TIMEOUT", lambda: transport.execute("rollback"))
        transport.finish()
        transport.finish()
        self.assertTrue(transport.outstanding)
        self.assertEqual(transport.transaction_status, "UNKNOWN")
        self.assertEqual(fake.finished, [101])
        self.code("OUTSTANDING_COMMAND", lambda: transport.execute("rollback"))
        before = len(fake.calls)
        self.code("CONNECTION_UNAVAILABLE", transport.drain)
        self.code("CONNECTION_UNAVAILABLE", transport.cancel_and_drain)
        self.assertEqual(len(fake.calls), before)

    def test_disconnect_or_unknown_transaction_at_final_null_stays_outstanding(self):
        transport, fake = self.begun()
        fake.next_results = [result_for(transport, "guarded_operation")]
        fake.after_tx = 4
        self.code("TRANSACTION_STATUS_REFUSED", lambda: transport.execute("guarded_operation"))
        self.assertTrue(transport.outstanding)
        self.assertEqual(len(fake.cleared), 2)
        self.code("OUTSTANDING_COMMAND", lambda: transport.execute("rollback"))
        fake.status = 1
        self.code("CONNECTION_UNAVAILABLE", transport.drain)
        transport.finish()
        self.assertTrue(transport.outstanding)

    def test_distinct_verifier_has_only_fixed_independent_queries_and_idle_status(self):
        transport, fake = make(session="verifier")
        self.assertEqual(set(transport._commands), {"verify_private_rollback_rows", "verify_security_rollback", "verify_primary_completion"})
        self.code("COMMAND_REFUSED", lambda: transport.execute("begin"))
        result = execute(transport, fake, "verify_private_rollback_rows", ("[]", "/tmp/synthetic-ca", "false"))
        self.assertEqual(result.transaction_status, "IDLE")
        self.assertTrue(all(value is True for value in result.rows[0]))

    def test_observation_budgets_are_explicit_positive_finite_bounded(self):
        for value in (0, -1, float("inf"), float("nan"), True, 301, "1"):
            self.code("BUDGET_REFUSED", lambda: q.ObservationBudgets(command_seconds=value))


def inspect_fake_cli():
    fake = FakeLibpq()
    original = Path.read_bytes
    def fixture_bytes(path):
        return FAKE_LIBRARY_BYTES if str(path) == q.DEFAULT_LIBRARY else original(path)
    with patch.object(q.C, "CDLL", return_value=fake.dll()), patch.object(Path, "read_bytes", fixture_bytes):
        exit_code = q.main(["--inspect-local-libpq"])
    assert set(fake.calls) == {"PQlibVersion"}
    return exit_code


def inspect_installed_abi():
    """Separate local inspection command, never part of deterministic CI tests."""
    library = q.Libpq17()
    for name, (restype, args) in q.SIGNATURES.items():
        function = getattr(library, name)
        assert function.restype is restype and tuple(function.argtypes) == args
    receipt = library.inspect()
    receipt["ctypesDeclarationCount"] = len(q.SIGNATURES)
    receipt["scope"] = "LOCAL LIBRARY VERSION/SYMBOL/ABI DECLARATION INSPECTION ONLY; NO SERVER OR SOCKET"
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--inspect-fake-libpq"]:
        sys.exit(inspect_fake_cli())
    if sys.argv[1:] == ["--inspect-installed-abi"]:
        sys.exit(inspect_installed_abi())
    if sys.argv[1:] == ["--report-json"]:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(TransportTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        print(json.dumps({"scope": "FAKE LIBPQ ONLY; NO SERVER OR INSTALLED LIBRARY REQUIRED",
            "tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
            "skipped": len(result.skipped)}, sort_keys=True))
        sys.exit(0 if result.wasSuccessful() else 1)
    unittest.main(verbosity=2)
