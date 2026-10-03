"""Actual libpq17 transport components; source only, no authorized runtime host.

Import-only connection/query APIs are for a future reviewed private host. Public
source hashes bind bytes, never grant authority. The CLI only inspects the local
library. Private values and libpq diagnostic messages are never output here.
"""
from __future__ import annotations

import ctypes as C
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import select
import sys
import time
from dataclasses import dataclass
from types import MappingProxyType

DEFAULT_LIBRARY = "/usr/lib/x86_64-linux-gnu/libpq.so.5.17"
INVENTORY_SHA256 = "09b6e70225313ae00428219ba86cc945c82dccdce29b8b84681caef0aebf959f"
SOURCE_LOCK_SHA256 = "be46812c3154b58162037d93a755b544e8862d81eb26738369db6887bdf8f18c"
_HERE = Path(__file__).resolve().parent
_PACKAGE = _HERE.parent / "backend-live-rehearsal"
_P = C.c_void_p
_S = C.c_char_p
_I = C.c_int
_U = C.c_uint
_SP = C.POINTER(_S)
_IP = C.POINTER(_I)
_UP = C.POINTER(_U)
NOTICE_RECEIVER = C.CFUNCTYPE(None, _P, _P)

# No diagnostic, synchronous query, pipeline, plaintext cancel or trace symbols.
# char pointers copied with string_at have void* restype to preserve lengths.
SIGNATURES = MappingProxyType({
    "PQlibVersion": (_I, ()),
    "PQconnectStartParams": (_P, (_SP, _SP, _I)),
    "PQconnectPoll": (_I, (_P,)), "PQstatus": (_I, (_P,)),
    "PQsocket": (_I, (_P,)), "PQsetnonblocking": (_I, (_P, _I)),
    "PQisnonblocking": (_I, (_P,)), "PQfinish": (None, (_P,)),
    "PQserverVersion": (_I, (_P,)), "PQprotocolVersion": (_I, (_P,)),
    "PQsslInUse": (_I, (_P,)), "PQsslAttribute": (_P, (_P, _S)),
    "PQhost": (_P, (_P,)), "PQhostaddr": (_P, (_P,)),
    "PQport": (_P, (_P,)), "PQuser": (_P, (_P,)), "PQdb": (_P, (_P,)),
    "PQparameterStatus": (_P, (_P, _S)),
    "PQtransactionStatus": (_I, (_P,)),
    "PQsetNoticeReceiver": (NOTICE_RECEIVER, (_P, NOTICE_RECEIVER, _P)),
    "PQsendQueryParams": (_I, (_P, _S, _I, _UP, _SP, _IP, _IP, _I)),
    "PQflush": (_I, (_P,)), "PQconsumeInput": (_I, (_P,)),
    "PQisBusy": (_I, (_P,)), "PQgetResult": (_P, (_P,)),
    "PQresultStatus": (_I, (_P,)), "PQcmdStatus": (_P, (_P,)),
    "PQntuples": (_I, (_P,)), "PQnfields": (_I, (_P,)),
    "PQfname": (_P, (_P, _I)), "PQftype": (_U, (_P, _I)),
    "PQfformat": (_I, (_P, _I)), "PQgetisnull": (_I, (_P, _I, _I)),
    "PQgetlength": (_I, (_P, _I, _I)), "PQgetvalue": (_P, (_P, _I, _I)),
    "PQclear": (None, (_P,)),
    "PQcancelCreate": (_P, (_P,)), "PQcancelStart": (_I, (_P,)),
    "PQcancelPoll": (_I, (_P,)), "PQcancelStatus": (_I, (_P,)),
    "PQcancelSocket": (_I, (_P,)), "PQcancelFinish": (None, (_P,)),
})
_TX = {0: "IDLE", 1: "ACTIVE", 2: "INTRANS", 3: "INERROR", 4: "UNKNOWN"}
_ALLOWED_CODES = frozenset({
    "LIBPQ_LOAD_REFUSED", "LIBPQ_SYMBOLS_REFUSED", "LIBPQ_VERSION_REFUSED",
    "SOURCE_INVENTORY_REFUSED", "SOURCE_BINDING_REFUSED", "BUDGET_REFUSED",
    "PRIVATE_FIELDS_REFUSED", "PG_ENVIRONMENT_REFUSED", "CONNECT_ATTEMPT_REFUSED",
    "CONNECT_FAILED", "CONNECT_TIMEOUT", "CONNECT_STATUS_REFUSED", "SERVER_VERSION_REFUSED",
    "TLS_REFUSED", "TARGET_REFUSED", "NONBLOCKING_REFUSED", "TRANSACTION_STATUS_REFUSED",
    "CONNECTION_UNAVAILABLE", "COMMAND_REFUSED", "PARAMETERS_REFUSED", "OUTSTANDING_COMMAND",
    "COMMAND_REPLAY_REFUSED", "RECOVERY_ONLY", "SUBMISSION_FAILED", "FLUSH_FAILED",
    "COMMAND_TIMEOUT", "DRAIN_TIMEOUT", "CONSUME_FAILED", "SOCKET_REFUSED", "IO_FAILED",
    "RESULT_REFUSED", "RESULT_COUNT_REFUSED", "RESULT_SHAPE_REFUSED", "RESULT_VALUE_REFUSED",
    "RESULT_LIMIT_REFUSED", "PROTOCOL_UNKNOWN", "TRANSPORT_INTERRUPTED", "TRANSPORT_FAILED",
    "CANCEL_FAILED", "CANCEL_TIMEOUT", "CLI_ARGUMENTS_REFUSED",
})


class TransportRefused(Exception):
    """Only allowlisted codes escape; never attach private payloads or errors."""
    def __init__(self, code):
        self.code = code if code in _ALLOWED_CODES else "TRANSPORT_FAILED"
        super().__init__(self.code)


def _refuse(code):
    raise TransportRefused(code) from None


def _digest(data):
    return hashlib.sha256(data).hexdigest()


def _json(data):
    def pairs(entries):
        result = {}
        for key, value in entries:
            if key in result:
                _refuse("SOURCE_INVENTORY_REFUSED")
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs,
                      parse_constant=lambda _: _refuse("RESULT_VALUE_REFUSED"))


def _cstring(pointer):
    if not pointer:
        _refuse("RESULT_SHAPE_REFUSED")
    return C.string_at(pointer).decode("utf-8", "strict")


class Libpq17:
    """Binds installed C functions. Construction and inspection never connect."""
    def __init__(self, path=DEFAULT_LIBRARY):
        try:
            if type(path) is not str or not Path(path).is_absolute():
                _refuse("LIBPQ_LOAD_REFUSED")
            self._library_path = path
            self._cdll = C.CDLL(path)
        except TransportRefused:
            raise
        except Exception:
            _refuse("LIBPQ_LOAD_REFUSED")
        try:
            for name, (restype, argtypes) in SIGNATURES.items():
                function = getattr(self._cdll, name)
                function.restype = restype
                function.argtypes = list(argtypes)
                setattr(self, name, function)
        except Exception:
            _refuse("LIBPQ_SYMBOLS_REFUSED")
        if self.PQlibVersion() // 10000 != 17:
            _refuse("LIBPQ_VERSION_REFUSED")

    def inspect(self):
        # Public source/library inventory only; no environment or private input.
        try:
            data = Path(self._library_path).read_bytes()
            return {"mode": "source-only-offline", "networkMode": "none", "liveReady": False,
                    "libpqVersion": self.PQlibVersion(), "libraryBytes": len(data),
                    "librarySha256": _digest(data), "requiredSymbols": list(SIGNATURES),
                    "nativeServerQualified": False, "tlsQualified": False,
                    "cancelDrainQualified": False}
        except Exception:
            _refuse("LIBPQ_LOAD_REFUSED")


@dataclass(frozen=True)
class ObservationBudgets:
    connect_seconds: float = 5.0
    command_seconds: float = 10.0
    cancel_seconds: float = 5.0
    drain_seconds: float = 10.0

    def __post_init__(self):
        for value in (self.connect_seconds, self.command_seconds, self.cancel_seconds, self.drain_seconds):
            if type(value) not in (int, float) or not math.isfinite(value) or not 0 < value <= 300:
                _refuse("BUDGET_REFUSED")


@dataclass(frozen=True, repr=False)
class PrivateConnectionFields:
    host: str
    hostaddr: str
    port: str
    user: str
    dbname: str
    password: str
    sslrootcert: str

    def __repr__(self):
        return "<PrivateConnectionFields>"

    def _parameters(self):
        try:
            values = (self.host, self.hostaddr, self.port, self.user, self.dbname,
                      self.password, self.sslrootcert)
            if any(type(v) is not str or not v or "\0" in v or len(v.encode("utf-8")) > 65536 for v in values):
                _refuse("PRIVATE_FIELDS_REFUSED")
            if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?", self.host):
                _refuse("PRIVATE_FIELDS_REFUSED")
            ipaddress.ip_address(self.hostaddr)  # No DNS, host list, unix socket, URI or options.
            if not re.fullmatch(r"[1-9][0-9]{0,4}", self.port) or int(self.port) > 65535:
                _refuse("PRIVATE_FIELDS_REFUSED")
            if any(not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", v) for v in (self.user, self.dbname)):
                _refuse("PRIVATE_FIELDS_REFUSED")
            if not Path(self.sslrootcert).is_absolute() or self.sslrootcert == "/dev/null":
                _refuse("PRIVATE_FIELDS_REFUSED")
            return {
                "host": self.host, "hostaddr": self.hostaddr, "port": self.port,
                "user": self.user, "dbname": self.dbname, "password": self.password,
                "sslrootcert": self.sslrootcert, "sslmode": "verify-full", "gssencmode": "disable",
                "require_auth": "password,md5,scram-sha-256", "gssdelegation": "0",
                "passfile": "/dev/null", "sslcertmode": "disable", "sslcert": "/dev/null",
                "sslkey": "/dev/null", "sslpassword": "unused", "sslcrl": "/dev/null",
                "sslcrldir": "/dev/null", "ssl_min_protocol_version": "TLSv1.2",
                "sslnegotiation": "postgres", "sslsni": "1", "channel_binding": "prefer",
                "client_encoding": "UTF8", "connect_timeout": "5", "target_session_attrs": "any",
                "application_name": "qik-private-rollback-source",
            }
        except TransportRefused:
            raise
        except Exception:
            _refuse("PRIVATE_FIELDS_REFUSED")


@dataclass(frozen=True, repr=False)
class PrivateResult:
    command_id: str
    command_tag: str
    transaction_status: str
    column_names: tuple
    type_oids: tuple
    rows: tuple
    completed: bool = True

    def __repr__(self):
        return "<PrivateResult>"


@dataclass(frozen=True)
class DrainOutcome:
    original_drained: bool
    result_count: int
    transaction_status: str
    cancel_dispatched: bool = False
    cancel_code: str | None = None


@dataclass(frozen=True)
class ExpectedResult:
    status: int
    command_tag: str
    column_names: tuple = ()
    type_oids: tuple = ()
    row_count: int = 0
    transaction_status: str = "INTRANS"
    every_boolean_true: bool = False


@dataclass(frozen=True, repr=False)
class _FixedCommand:
    command_id: str
    sql: bytes
    parameter_count: int
    expected: ExpectedResult


def inspect_source_hashes():
    """Public local byte inventory, not review approval or execution authority."""
    try:
        lock_bytes = (_PACKAGE / "source-lock.json").read_bytes()
        inventory_bytes = (_HERE / "frozen-inventory.json").read_bytes()
        if _digest(lock_bytes) != SOURCE_LOCK_SHA256 or _digest(inventory_bytes) != INVENTORY_SHA256:
            _refuse("SOURCE_INVENTORY_REFUSED")
        lock = _json(lock_bytes)
        hashes = {"sourceLock": SOURCE_LOCK_SHA256, "transportInventory": INVENTORY_SHA256,
                  "transport": _digest(Path(__file__).read_bytes())}
        # The hard-pinned lock supplies fixed relative paths, never caller paths.
        for name, pin in lock["sources"].items():
            data = (_PACKAGE / pin["path"]).read_bytes()
            if len(data) != pin["bytes"] or _digest(data) != pin["sha256"]:
                _refuse("SOURCE_INVENTORY_REFUSED")
            hashes[name] = pin["sha256"]
        return hashes
    except TransportRefused:
        raise
    except Exception:
        _refuse("SOURCE_INVENTORY_REFUSED")


def _load_fixed_commands(reviewed_source_hashes, session):
    hashes = inspect_source_hashes()
    if type(reviewed_source_hashes) is not dict or reviewed_source_hashes != hashes:
        _refuse("SOURCE_BINDING_REFUSED")
    if session not in ("primary", "verifier"):
        _refuse("SOURCE_BINDING_REFUSED")
    try:
        data = (_HERE / "frozen-inventory.json").read_bytes()
        if _digest(data) != INVENTORY_SHA256:
            _refuse("SOURCE_INVENTORY_REFUSED")
        bundle = _json(data)
        commands = {}
        shapes = {
            "capture_baseline": (("snapshot",), (3802,)),
            "capture_primary_backend": (("primary_backend_pid", "primary_backend_start"), (23, 25)),
            "inspect_public_row_counts": (("selected_count", "unrelated_count"), (20, 20)),
            "capture_private_security": (("private_snapshot",), (3802,)),
            "inspect_private_row_guards": (("selected_count", "unrelated_count", "selected_nonnull",
                "selected_source_matches", "receipt_count", "bootstrap_count", "head_count", "qualification_count"),
                (20, 20, 16, 16, 20, 20, 20, 20)),
            "capture_private_rows": (("private_rows",), (3802,)),
        }
        tags = {"begin": "BEGIN", "rollback": "ROLLBACK", "guarded_operation": "DO",
                "grant_set_membership": "GRANT ROLE", "revoke_introduced_set_membership": "REVOKE ROLE"}
        for phase in bundle["successPath"]:
            submission = phase["submission"]
            if submission is None:
                continue
            command_id = phase["commandId"]
            verifier = phase["session"] == "distinct-approved-read-only-verifier"
            if verifier != (session == "verifier"):
                continue
            sql = submission["text"].encode("utf-8")
            if b"\0" in sql or len(sql) != submission["bytes"] or _digest(sql) != submission["sha256"]:
                _refuse("SOURCE_INVENTORY_REFUSED")
            param_count = len(phase.get("parameters", []))
            if {int(n) for n in re.findall(rb"\$(\d+)", sql)} != set(range(1, param_count + 1)):
                _refuse("SOURCE_INVENTORY_REFUSED")
            boolean = phase.get("expectedResult")
            if boolean and boolean.get("everyBooleanMustBeTrue"):
                names = tuple(boolean["exactColumnNames"])
                expected = ExpectedResult(2, "SELECT 1", names, (16,) * len(names), 1,
                                          every_boolean_true=True)
            elif command_id in shapes:
                names, oids = shapes[command_id]
                expected = ExpectedResult(2, "SELECT 1", names, oids, 1)
            else:
                tag = tags.get(command_id)
                if not tag:
                    if phase["kind"] == "deadline-source" or command_id.startswith("set_owner_"):
                        tag = "SET"
                    elif command_id.startswith("grant_"):
                        tag = "GRANT"
                    elif command_id.startswith("revoke_"):
                        tag = "REVOKE"
                    elif command_id.startswith("reset_role_"):
                        tag = "RESET"
                    else:
                        _refuse("SOURCE_INVENTORY_REFUSED")
                expected = ExpectedResult(1, tag)
            tx = "IDLE" if verifier or command_id in ("rollback", "verify_primary_session_rollback") else "INTRANS"
            expected = ExpectedResult(expected.status, expected.command_tag, expected.column_names,
                expected.type_oids, expected.row_count, tx, expected.every_boolean_true)
            commands[command_id] = _FixedCommand(command_id, sql, param_count, expected)
        return MappingProxyType(commands)
    except TransportRefused:
        raise
    except Exception:
        _refuse("SOURCE_INVENTORY_REFUSED")


def _wait_socket(socket, reading, writing, remaining):
    try:
        readable, writable, exceptional = select.select([socket] if reading else [],
            [socket] if writing else [], [socket], remaining)
        if exceptional:
            _refuse("IO_FAILED")
        return bool(readable or writable)
    except InterruptedError:
        return False
    except TransportRefused:
        raise
    except Exception:
        _refuse("IO_FAILED")


class PrivateTransport:
    """Single connection, fixed SQL only, no retries or pipelining.

    This is NOT an authority verifier. The future trusted host must authenticate
    approvals, qualifications, source/library pins, window and private custody
    before calling connect or each dependent execute. These APIs can open sockets
    when called; current CLI/production host do not activate them.
    """
    def __init__(self, libpq, reviewed_source_hashes, budgets=ObservationBudgets(), *, session="primary"):
        self._commands = _load_fixed_commands(reviewed_source_hashes, session)
        if type(budgets) is not ObservationBudgets:
            _refuse("BUDGET_REFUSED")
        if type(libpq) is not Libpq17:
            _refuse("LIBPQ_LOAD_REFUSED")
        if libpq.PQlibVersion() // 10000 != 17:
            _refuse("LIBPQ_VERSION_REFUSED")
        self._pq = libpq
        self._budgets = budgets
        self._session = session
        self._conn = None
        self._connect_attempted = False
        self._begin_attempted = False
        self._outstanding = None
        self._attempted = set()
        self._failed = False
        self._poisoned = False
        self._results_seen = 0
        self._first_result = None
        self._result_error = None
        self._clock = time.monotonic
        self._waiter = _wait_socket
        # Keep callback alive through PQfinish. Never decode notice PGresults.
        self._notice_receiver = NOTICE_RECEIVER(lambda _arg, _result: None)

    @property
    def outstanding(self):
        return self._outstanding is not None

    @property
    def transaction_status(self):
        if not self._conn:
            return "UNKNOWN"
        return _TX.get(self._pq.PQtransactionStatus(self._conn), "UNKNOWN")

    def _check(self):
        if not self._conn or self._pq.PQstatus(self._conn) != 0:
            _refuse("CONNECTION_UNAVAILABLE")

    def _wait(self, deadline, reading, writing, code, cancel=None):
        while True:
            remaining = deadline - self._clock()
            if remaining <= 0:
                _refuse(code)
            # Re-fetch after EVERY poll/consume/flush. libpq may replace the socket.
            socket = self._pq.PQcancelSocket(cancel) if cancel else self._pq.PQsocket(self._conn)
            if socket < 0:
                _refuse("SOCKET_REFUSED")
            if self._waiter(socket, reading, writing, remaining):
                return
            # EINTR/early wakeup is not readiness; wait again before polling.

    def connect(self, fields):
        if self._connect_attempted:
            _refuse("CONNECT_ATTEMPT_REFUSED")
        if type(fields) is not PrivateConnectionFields:
            _refuse("PRIVATE_FIELDS_REFUSED")
        if any(name.upper().startswith("PG") for name in os.environ):
            _refuse("PG_ENVIRONMENT_REFUSED")
        parameters = fields._parameters()
        self._connect_attempted = True
        try:
            keys = (_S * (len(parameters) + 1))(*(k.encode("ascii") for k in parameters), None)
            values = (_S * (len(parameters) + 1))(*(v.encode("utf-8") for v in parameters.values()), None)
            self._conn = self._pq.PQconnectStartParams(keys, values, 0)
            if not self._conn:
                _refuse("CONNECT_FAILED")
            self._pq.PQsetNoticeReceiver(self._conn, self._notice_receiver, None)
            if self._pq.PQstatus(self._conn) == 1:
                _refuse("CONNECT_FAILED")
            deadline = self._clock() + self._budgets.connect_seconds
            poll = 2  # First iteration must wait for writing before first poll.
            while poll != 3:
                if poll == 0:
                    _refuse("CONNECT_FAILED")
                if poll not in (1, 2):
                    _refuse("CONNECT_STATUS_REFUSED")
                self._wait(deadline, poll == 1, poll == 2, "CONNECT_TIMEOUT")
                poll = self._pq.PQconnectPoll(self._conn)
            if self._pq.PQstatus(self._conn) != 0:
                _refuse("CONNECT_FAILED")
            if self._pq.PQserverVersion(self._conn) // 10000 != 17:
                _refuse("SERVER_VERSION_REFUSED")
            if self._pq.PQprotocolVersion(self._conn) != 3:
                _refuse("CONNECT_STATUS_REFUSED")
            if self._pq.PQsslInUse(self._conn) != 1 or _cstring(self._pq.PQsslAttribute(self._conn, b"protocol")) not in ("TLSv1.2", "TLSv1.3"):
                _refuse("TLS_REFUSED")
            for method, value in (("PQhost", fields.host), ("PQhostaddr", fields.hostaddr),
                    ("PQport", fields.port), ("PQuser", fields.user), ("PQdb", fields.dbname)):
                if _cstring(getattr(self._pq, method)(self._conn)) != value:
                    _refuse("TARGET_REFUSED")
            if _cstring(self._pq.PQparameterStatus(self._conn, b"client_encoding")) != "UTF8":
                _refuse("CONNECT_STATUS_REFUSED")
            if self._pq.PQsetnonblocking(self._conn, 1) != 0 or self._pq.PQisnonblocking(self._conn) != 1:
                _refuse("NONBLOCKING_REFUSED")
            if self.transaction_status != "IDLE":
                _refuse("TRANSACTION_STATUS_REFUSED")
        except BaseException as error:
            self._failed = True
            self.finish()
            if isinstance(error, TransportRefused):
                raise
            _refuse("TRANSPORT_INTERRUPTED" if isinstance(error, (KeyboardInterrupt, SystemExit)) else "TRANSPORT_FAILED")

    def _parameters(self, command, parameters):
        if type(parameters) not in (tuple, list) or len(parameters) != command.parameter_count:
            _refuse("PARAMETERS_REFUSED")
        encoded = []
        try:
            for value in parameters:
                # Serialization belongs to private host; None is SQL NULL.
                if value is None:
                    encoded.append(None)
                elif type(value) is str and "\0" not in value and len(value.encode("utf-8")) <= 16 * 1024 * 1024:
                    encoded.append(value.encode("utf-8"))
                else:
                    _refuse("PARAMETERS_REFUSED")
            return (_S * len(encoded))(*encoded) if encoded else None
        except TransportRefused:
            raise
        except Exception:
            _refuse("PARAMETERS_REFUSED")

    def execute(self, command_id, parameters=()):
        if self.outstanding:
            _refuse("OUTSTANDING_COMMAND")
        self._check()
        if type(command_id) is not str or command_id not in self._commands:
            _refuse("COMMAND_REFUSED")
        if command_id in self._attempted:
            _refuse("COMMAND_REPLAY_REFUSED")
        if self._failed and command_id not in ("rollback", "verify_primary_session_rollback"):
            _refuse("RECOVERY_ONLY")
        if self._poisoned:
            _refuse("PROTOCOL_UNKNOWN")
        command = self._commands[command_id]
        values = self._parameters(command, parameters)
        tx = self.transaction_status
        required_tx = "IDLE" if command_id == "begin" or self._session == "verifier" or command_id == "verify_primary_session_rollback" else "INTRANS"
        if command_id == "rollback":
            if not self._begin_attempted or tx not in ("IDLE", "INTRANS", "INERROR"):
                _refuse("TRANSACTION_STATUS_REFUSED")
        elif tx != required_tx:
            _refuse("TRANSACTION_STATUS_REFUSED")
        # Start uncertainty BEFORE send. Even rejected/lost BEGIN must not retry.
        self._attempted.add(command_id)
        self._begin_attempted = self._begin_attempted or command_id == "begin"
        self._outstanding = command
        self._results_seen = 0
        self._first_result = None
        self._result_error = None
        deadline = self._clock() + self._budgets.command_seconds
        try:
            if self._pq.PQsendQueryParams(self._conn, command.sql, command.parameter_count,
                                          None, values, None, None, 0) != 1:
                _refuse("SUBMISSION_FAILED")
            self._flush(deadline, "COMMAND_TIMEOUT")
            outcome = self._drain(deadline, "COMMAND_TIMEOUT", extract=True)
            if self._result_error:
                _refuse(self._result_error)
            if outcome.result_count != 1 or self._first_result is None:
                _refuse("RESULT_COUNT_REFUSED")
            if outcome.transaction_status != command.expected.transaction_status:
                _refuse("TRANSACTION_STATUS_REFUSED")
            result = self._first_result
            self._first_result = None
            return PrivateResult(command_id, result[0], outcome.transaction_status, result[1], result[2], result[3])
        except BaseException as error:
            self._failed = True
            self._first_result = None
            if isinstance(error, TransportRefused):
                raise
            _refuse("TRANSPORT_INTERRUPTED" if isinstance(error, (KeyboardInterrupt, SystemExit)) else "TRANSPORT_FAILED")

    def _flush(self, deadline, code):
        while True:
            if self._clock() >= deadline:
                _refuse(code)
            flushed = self._pq.PQflush(self._conn)
            if flushed == 0:
                return
            if flushed != 1:
                _refuse("FLUSH_FAILED")
            # Server might be blocked on sending; service reads while flushing.
            self._wait(deadline, True, True, code)
            if self._pq.PQconsumeInput(self._conn) != 1:
                _refuse("CONSUME_FAILED")

    def _extract(self, result, expected):
        if self._pq.PQresultStatus(result) != expected.status:
            _refuse("RESULT_REFUSED")
        tag = _cstring(self._pq.PQcmdStatus(result))
        count = self._pq.PQntuples(result)
        fields = self._pq.PQnfields(result)
        if count != expected.row_count or fields != len(expected.column_names) or tag != expected.command_tag:
            _refuse("RESULT_SHAPE_REFUSED")
        names = tuple(_cstring(self._pq.PQfname(result, col)) for col in range(fields))
        oids = tuple(self._pq.PQftype(result, col) for col in range(fields))
        if names != expected.column_names or oids != expected.type_oids or any(self._pq.PQfformat(result, col) != 0 for col in range(fields)):
            _refuse("RESULT_SHAPE_REFUSED")
        rows = []
        total = 0
        for row in range(count):
            values = []
            for col, oid in enumerate(oids):
                null = self._pq.PQgetisnull(result, row, col)
                if null not in (0, 1):
                    _refuse("RESULT_VALUE_REFUSED")
                if null:
                    values.append(None)
                    continue
                length = self._pq.PQgetlength(result, row, col)
                total += length
                if length < 0 or total > 16 * 1024 * 1024:
                    _refuse("RESULT_LIMIT_REFUSED")
                pointer = self._pq.PQgetvalue(result, row, col)
                if not pointer:
                    _refuse("RESULT_VALUE_REFUSED")
                raw = C.string_at(pointer, length).decode("utf-8", "strict")
                if oid == 16:
                    if raw not in ("t", "f"):
                        _refuse("RESULT_VALUE_REFUSED")
                    value = raw == "t"
                elif oid in (20, 21, 23):
                    if not re.fullmatch(r"-?(?:0|[1-9][0-9]*)", raw):
                        _refuse("RESULT_VALUE_REFUSED")
                    value = int(raw)
                    bits = {20: 64, 21: 16, 23: 32}[oid]
                    if not -(1 << (bits - 1)) <= value < (1 << (bits - 1)):
                        _refuse("RESULT_VALUE_REFUSED")
                elif oid in (114, 3802):
                    value = _json(raw)
                elif oid in (19, 25, 1042, 1043):
                    value = raw  # Preserve exact text, including embedded NULL.
                else:
                    _refuse("RESULT_VALUE_REFUSED")
                values.append(value)
            rows.append(tuple(values))
        if expected.every_boolean_true and any(v is not True for row in rows for v in row):
            _refuse("RESULT_VALUE_REFUSED")
        return tag, names, oids, tuple(rows)

    def _drain(self, deadline, code, *, extract):
        while True:
            if self._clock() >= deadline:
                _refuse(code)
            self._check()
            if self._poisoned:
                _refuse("PROTOCOL_UNKNOWN")
            if self._pq.PQconsumeInput(self._conn) != 1:
                _refuse("CONSUME_FAILED")
            busy = self._pq.PQisBusy(self._conn)
            if busy not in (0, 1):
                _refuse("PROTOCOL_UNKNOWN")
            if busy:
                self._wait(deadline, True, False, code)
                continue
            result = self._pq.PQgetResult(self._conn)
            if not result:
                self._check()
                tx = self.transaction_status
                if tx in ("UNKNOWN", "ACTIVE"):
                    _refuse("TRANSACTION_STATUS_REFUSED")
                self._outstanding = None  # Final NULL, connected, known quiescent state.
                return DrainOutcome(True, self._results_seen, tx)
            self._results_seen += 1
            try:
                status = self._pq.PQresultStatus(result)
                if status not in (1, 2, 7):  # COPY/pipeline/unknown need separate qualification.
                    self._poisoned = True
                    self._result_error = "PROTOCOL_UNKNOWN"
                elif extract and self._results_seen == 1:
                    try:
                        self._first_result = self._extract(result, self._outstanding.expected)
                    except TransportRefused as error:
                        self._result_error = error.code
                    except Exception:
                        self._result_error = "RESULT_VALUE_REFUSED"
                elif self._results_seen > 1:
                    self._result_error = "RESULT_COUNT_REFUSED"
            finally:
                self._pq.PQclear(result)  # Every obtained result, even failure/mismatch.

    def drain(self):
        """Discard original private results through final NULL; not a success ack."""
        if not self.outstanding:
            _refuse("COMMAND_REFUSED")
        self._check()
        self._failed = True
        self._first_result = None
        try:
            deadline = self._clock() + self._budgets.drain_seconds
            self._flush(deadline, "DRAIN_TIMEOUT")
            return self._drain(deadline, "DRAIN_TIMEOUT", extract=False)
        except BaseException as error:
            if isinstance(error, TransportRefused):
                raise
            _refuse("TRANSPORT_INTERRUPTED" if isinstance(error, (KeyboardInterrupt, SystemExit)) else "TRANSPORT_FAILED")

    def _cancel(self):
        cancel = None
        try:
            cancel = self._pq.PQcancelCreate(self._conn)
            if not cancel or self._pq.PQcancelStatus(cancel) == 1 or self._pq.PQcancelStart(cancel) != 1:
                _refuse("CANCEL_FAILED")
            deadline = self._clock() + self._budgets.cancel_seconds
            poll = 2
            while poll != 3:
                if poll not in (1, 2):
                    _refuse("CANCEL_FAILED")
                self._wait(deadline, poll == 1, poll == 2, "CANCEL_TIMEOUT", cancel)
                poll = self._pq.PQcancelPoll(cancel)
            if self._pq.PQcancelStatus(cancel) != 0:
                _refuse("CANCEL_FAILED")
            return True
        finally:
            if cancel:
                self._pq.PQcancelFinish(cancel)

    def cancel_and_drain(self):
        if not self.outstanding:
            _refuse("COMMAND_REFUSED")
        self._check()
        self._failed = True
        dispatched = False
        cancel_code = None
        try:
            dispatched = self._cancel()
        except BaseException as error:
            cancel_code = error.code if isinstance(error, TransportRefused) else "TRANSPORT_INTERRUPTED" if isinstance(error, (KeyboardInterrupt, SystemExit)) else "CANCEL_FAILED"
        # Cancellation success or failure does not replace original protocol drain.
        outcome = self.drain()
        return DrainOutcome(outcome.original_drained, outcome.result_count, outcome.transaction_status,
                            dispatched, cancel_code)

    def finish(self):
        """Release PGconn. Closing never acknowledges rollback or original drain."""
        if self._conn:
            connection, self._conn = self._conn, None
            self._pq.PQfinish(connection)
        self._failed = True
        self._first_result = None
        # Retain outstanding uncertainty after close for independent verification.


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if args not in ([], ["--inspect-local-libpq"]):
        print(json.dumps({"mode": "source-only-offline", "liveReady": False,
                          "outcome": "REFUSED", "code": "CLI_ARGUMENTS_REFUSED"}))
        return 2
    try:
        receipt = Libpq17().inspect()
        receipt["publicSourceHashes"] = inspect_source_hashes()
        print(json.dumps(receipt, sort_keys=True))
        return 0
    except BaseException as error:
        code = error.code if isinstance(error, TransportRefused) else "TRANSPORT_FAILED"
        print(json.dumps({"mode": "source-only-offline", "liveReady": False,
                          "outcome": "REFUSED", "code": code}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
