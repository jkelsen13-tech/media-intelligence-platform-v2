"""Import-only private pipe bridge SOURCE; no executable main or credential CLI.

Real libpq transport is imported only behind the currently unavailable reviewed
private-host runtime boundary. Protocol errors never echo input or native errors.
"""
import importlib.util
import json
from pathlib import Path

PRODUCTION_RUNTIME_BOUND = False
MAX_FRAME = 16 * 1024 * 1024
CLIENT_PATH = Path(__file__).resolve().parent.parent / "backend-private-client" / "libpq17.py"
FIELD_NAMES = {"host", "hostaddr", "port", "user", "dbname", "password", "sslrootcert"}


def _write(writer, sequence, ok, result):
    # The writer is an inherited private pipe, never console/error/receipt output.
    writer.write((json.dumps({"sequence": sequence, "ok": ok, "result": result},
                             separators=(",", ":")) + "\n").encode("utf-8"))
    writer.flush()


def _result(value):
    return {"completed": value.completed, "commandTag": value.command_tag,
            "transactionStatus": value.transaction_status,
            "columnNames": list(value.column_names), "typeOids": list(value.type_oids),
            "rows": [list(row) for row in value.rows]}


def _fixed_client():
    # Fixed module path. The native loader pins the full frozen submission inventory
    # and reviewed public source hashes; SQL/module paths are never pipe options.
    import sys
    spec = importlib.util.spec_from_file_location("qik_fixed_libpq17", CLIENT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _serve_bound_private_pipe(reader, writer, expected_session):
    """Concrete bounded request loop for a future reviewed host boundary.

    This private routine is uncalled while PRODUCTION_RUNTIME_BOUND is False.
    Authority verification belongs to the fixed trusted host before child spawn;
    a payload boolean, claimed issuer, callback, or candidate check is not proof.
    """
    client = _fixed_client()
    import secrets
    primary = verifier = None
    connect_attempted = False
    sequence = 0
    try:
        for _ in range(96):  # A single frozen attempt; no indefinite session.
            frame = reader.readline(MAX_FRAME + 1)
            if not frame or len(frame) > MAX_FRAME or not frame.endswith(b"\n"):
                break
            try:
                request = json.loads(frame)
                if set(request) != {"sequence", "operation", "privatePayload"}:
                    raise ValueError()
                if type(request["sequence"]) is not int or request["sequence"] != sequence + 1:
                    raise ValueError()
                sequence = request["sequence"]
                operation, payload = request["operation"], request["privatePayload"]
                if not isinstance(payload, dict):
                    raise ValueError()
                if operation in ("connect_primary", "connect_verifier"):
                    if connect_attempted:
                        raise ValueError()
                    connect_attempted = True
                    if set(payload) != {"reviewedSourceHashes", "privateFields"}:
                        raise ValueError()
                    fields = payload["privateFields"]
                    if not isinstance(fields, dict) or set(fields) != FIELD_NAMES:
                        raise ValueError()
                    if operation == "connect_primary" and primary is not None:
                        raise ValueError()
                    if operation == "connect_verifier" and verifier is not None:
                        raise ValueError()
                    session = "primary" if operation == "connect_primary" else "verifier"
                    if session != expected_session or primary is not None or verifier is not None:
                        raise ValueError()
                    transport = client.PrivateTransport(client.Libpq17(), payload["reviewedSourceHashes"],
                                                        client.ObservationBudgets(), session=session)
                    transport.connect(client.PrivateConnectionFields(**fields))
                    if session == "primary":
                        primary = transport
                    else:
                        verifier = transport
                    # No credential hashes, connection strings, or raw field values.
                    _write(writer, sequence, True, {"connected": True, "session": session, "context": {
                        "connectionId": secrets.token_hex(16), "database": fields["dbname"],
                        "authenticatedUser": fields["user"], "host": fields["host"],
                        "hostaddr": fields["hostaddr"], "port": fields["port"], "tlsVerified": True,
                        "clientReadOnlyInventory": session == "verifier", "sqlIdentityObserved": False,
                        "serverReadOnlyObserved": False,
                        "observationBasis": "NATIVE TRANSPORT TARGET AND TLS MATCH; SQL IDENTITY AND SERVER READONLY UNOBSERVED AT CONNECT"}})
                    # Native connect checked PQdb/PQuser/PQhost/addr/port and TLS
                    # against these fields. SQL session/current_user, the project,
                    # and server read-only state are not inferred from fields.
                    fields = None
                elif operation == "execute":
                    if set(payload) != {"session", "commandId", "parameters"}:
                        raise ValueError()
                    if payload["session"] not in ("primary", "verifier"):
                        raise ValueError()
                    transport = primary if payload["session"] == "primary" else verifier
                    if payload["session"] != expected_session:
                        raise ValueError()
                    if transport is None or not isinstance(payload["parameters"], list):
                        raise ValueError()
                    _write(writer, sequence, True, _result(transport.execute(payload["commandId"], tuple(payload["parameters"]))))
                elif operation == "cancel_and_drain":
                    if payload or primary is None:
                        raise ValueError()
                    # Native extraction may have refused after consuming final
                    # NULL. Observe that already-quiescent state instead of
                    # inventing an outstanding command or queueing a rollback.
                    if primary.outstanding:
                        drained = primary.cancel_and_drain()
                    else:
                        status = primary.transaction_status
                        if status not in ("IDLE", "INTRANS", "INERROR"):
                            raise ValueError()
                        drained = client.DrainOutcome(True, 0, status)
                    _write(writer, sequence, True, {"completed": True, "commandTag": "CANCEL_AND_DRAIN",
                        "transactionStatus": drained.transaction_status, "columnNames": [], "typeOids": [],
                        "rows": [], "drained": drained.original_drained,
                        "cancelDispatched": drained.cancel_dispatched, "cancelCode": drained.cancel_code})
                elif operation == "finish":
                    if payload:
                        raise ValueError()
                    _write(writer, sequence, True, {"finished": True})
                    break
                else:
                    raise ValueError()
            except Exception as error:
                # No str(error), repr(error), traceback, parameter echo or digest.
                _write(writer, sequence, False, {"code": "PRIVATE_WORKER_COMMAND_REFUSED"})
                # Typed native command failures can be followed by cancel/drain.
                # Protocol violations terminate; no ROLLBACK is pipelined here.
                if not isinstance(error, client.TransportRefused):
                    break
    finally:
        for transport in (verifier, primary):
            if transport is not None:
                try:
                    transport.finish()
                except Exception:
                    pass


def serve_private_pipe(reader, writer, expected_session="primary"):
    # No authority/activation flag comes from the pipe. This factual deployment
    # guard precedes import of libpq, all connection creation, and all secret reads.
    if not PRODUCTION_RUNTIME_BOUND:
        _write(writer, 0, False, {"code": "APPROVED_PRIVATE_HOST_RUNTIME_UNBOUND"})
        return
    if expected_session not in ("primary", "verifier"):
        _write(writer, 0, False, {"code": "PRIVATE_WORKER_SESSION_REFUSED"})
        return
    _serve_bound_private_pipe(reader, writer, expected_session)
