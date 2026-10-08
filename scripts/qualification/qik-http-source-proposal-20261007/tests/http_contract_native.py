#!/usr/bin/env python3
"""Explicit opt-in synthetic PG17 regression runner; never a live transport.

No arguments: fixed NOT_RUN receipt, no Docker or database action.
--run-isolated-pg17: cached pinned image only; unprivileged, disposable,
network-none, read-only, resource-bounded, Unix socket inside tmpfs. SQL is sent
over stdin; no host mounts, port publication, credentials, extension, or HTTP.
Receipts expose whitelisted derived counts and source hashes, never SQL traces
or captured diagnostics. Startup/SQL/cleanup failure is a failure, not a pass.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

IMAGE = "postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"
SOURCE_FILES = (
    "tests/http_contract_fixture.sql",
    "003_ack_contract.sql",
    "002_http_transport_proposal.sql",
    "tests/http_contract_regressions.sql",
)
EXPECTED_COUNTS = {
    "responseShape": 91,
    "inputBoundary": 60,
    "recordCompatibility": 6,
    "syntheticAbiErrors": 6,
    "senderResponseRefusals": 11,
    "senderPreflightRefusals": 19,
    "senderResetErrors": 12,
    "senderBooleanRefusals": 10,
    "preparedAcl": 4,
}
ENV = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}


def base_receipt():
    return {
        "schema": "mip-http-contract-synthetic-pg17-20261008-1",
        "scope": "NEW_SYNTHETIC_SQL_REGRESSIONS_NOT_PRIVATE_HISTORY",
        "hold": "PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD",
        "productionAuthorized": False,
        "liveReady": False,
        "qikExecuted": False,
        "actualHttpExecuted": False,
        "tlsQualified": False,
        "providerQualified": False,
        "durableCommitQualified": False,
        "privateHistoricalRunsAuthenticated": False,
    }


def call(args, *, data=None, timeout=15):
    return subprocess.run(
        args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=ENV, timeout=timeout, check=False,
    )


def run_isolated():
    receipt = base_receipt()
    receipt.update(status="FAILED", code="ISOLATED_PG17_REGRESSION_FAILED")
    name = "mip-http-contract-" + uuid.uuid4().hex
    creation_attempted = False
    try:
        root = Path(__file__).resolve().parents[1]
        source = [(path, (root / path).read_bytes()) for path in SOURCE_FILES]
        inspected = call(["docker", "image", "inspect", IMAGE, "--format", "{{.Id}}"])
        if inspected.returncode != 0:
            return receipt
        creation_attempted = True
        started = call([
            "docker", "run", "--detach", "--pull=never", "--name", name,
            "--network=none", "--read-only", "--user", "1000:1000",
            "--cap-drop=ALL", "--security-opt=no-new-privileges",
            "--cpus=1", "--memory=384m", "--memory-swap=384m", "--pids-limit=64",
            "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=192m,uid=1000,gid=1000,mode=0700",
            "--entrypoint", "/bin/sh", IMAGE, "-c",
            # The pinned official image already includes libnss_wrapper. Give
            # the otherwise unnamed UID1000 a disposable identity in tmpfs;
            # no account/password, image/host edit, or installation is involved.
            "printf 'fixture:x:1000:1000:fixture:/tmp:/bin/sh\\n' > /tmp/passwd; "
            "printf 'fixture:x:1000:\\n' > /tmp/group; "
            "export NSS_WRAPPER_PASSWD=/tmp/passwd NSS_WRAPPER_GROUP=/tmp/group "
            "LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libnss_wrapper.so; "
            "initdb -D /tmp/data -U fixture_owner --no-locale --encoding=UTF8 --auth=trust "
            ">/tmp/init.log 2>&1 && exec postgres -D /tmp/data -k /tmp "
            "-c listen_addresses= -c max_connections=10 -c shared_buffers=16MB "
            "-c logging_collector=off -c log_min_messages=panic",
        ], timeout=20)
        if started.returncode != 0:
            return receipt
        ready = False
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            probe = call(["docker", "exec", name, "pg_isready", "-h", "/tmp",
                          "-U", "fixture_owner", "-d", "postgres"], timeout=5)
            if probe.returncode == 0:
                ready = True
                break
            running = call(["docker", "container", "inspect", "--format",
                            "{{.State.Running}}", name], timeout=5)
            if running.returncode != 0 or running.stdout.strip() != b"true":
                break
            time.sleep(0.2)
        if not ready:
            return receipt
        # One disposable database/session, exact committed bytes, no SQL echo.
        sql = b"\n".join(content for _, content in source)
        executed = call([
            "docker", "exec", "-i", name, "psql", "-X", "-q", "-A", "-t",
            "-v", "ON_ERROR_STOP=1", "-h", "/tmp", "-U", "fixture_owner", "-d", "postgres",
        ], data=sql, timeout=60)
        if executed.returncode != 0 or executed.stderr:
            return receipt
        observed = json.loads(executed.stdout)
        if (type(observed) is not dict or set(observed) != {"serverMajor", "cases", "total"}
                or type(observed["serverMajor"]) is not int or observed["serverMajor"] != 17
                or observed["cases"] != EXPECTED_COUNTS
                or type(observed["total"]) is not int
                or observed["total"] != sum(EXPECTED_COUNTS.values())):
            return receipt
        receipt.update(
            status="PASSED", code="ISOLATED_SYNTHETIC_PG17_REGRESSIONS_PASSED",
            serverMajor=17, counts=observed["cases"], total=observed["total"],
            imageDigest=IMAGE.split("@", 1)[1],
            sourceSha256={path: hashlib.sha256(content).hexdigest() for path, content in source},
        )
    except (OSError, subprocess.TimeoutExpired, ValueError, TypeError, KeyError):
        # Never relay exception text, process output, SQL, or private trace.
        pass
    finally:
        cleanup_ok = not creation_attempted
        if creation_attempted:
            try:
                call(["docker", "rm", "--force", name], timeout=15)
                absent = call(["docker", "container", "ls", "--all", "--filter",
                               "name=^/" + name + "$", "--format", "{{.ID}}"], timeout=10)
                cleanup_ok = absent.returncode == 0 and absent.stdout == b""
            except (OSError, subprocess.TimeoutExpired):
                cleanup_ok = False
        if not cleanup_ok:
            receipt.clear()
            receipt.update(base_receipt())
            receipt.update(status="FAILED", code="ISOLATED_PG17_CLEANUP_FAILED")
        elif receipt["status"] == "PASSED":
            receipt["taskContainerRemoved"] = True
    return receipt


def main():
    if sys.argv[1:] not in ([], ["--run-isolated-pg17"]):
        receipt = base_receipt()
        receipt.update(status="NOT_RUN", code="NATIVE_ARGUMENTS_REFUSED")
        print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
        return 2
    if not sys.argv[1:]:
        receipt = base_receipt()
        receipt.update(status="NOT_RUN", code="NATIVE_OPT_IN_REQUIRED")
    else:
        receipt = run_isolated()
    print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
    return 1 if receipt["status"] == "FAILED" else 0


if __name__ == "__main__":
    raise SystemExit(main())
