"""Native PostgreSQL 17 qualification for the isolated collector shadow.

Synthetic disposable GitHub CI only. This harness accepts no DSN and never
contacts a Supabase project, external source, provider, or publication path.
"""
import hashlib
import json
import os
import queue
import subprocess
import threading
import time
import unittest
import uuid
from pathlib import Path

MARKER = "collector-shadow-qualification"
if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("MIP_DISPOSABLE_POSTGRES") != MARKER:
    raise SystemExit("Only the explicit disposable collector-shadow GitHub PostgreSQL service is allowed")

HOST = "127.0.0.1"
PORT = "5432"
POSTGRES_PASSWORD = "mip-shadow-disposable-ci-only"
PASSWORDS = {
    "postgres": POSTGRES_PASSWORD,
    "mip_shadow_runtime_a_fixture": "runtime-a-disposable-ci-only",
    "mip_shadow_runtime_b_fixture": "runtime-b-disposable-ci-only",
    "mip_shadow_admitter_fixture": "admitter-disposable-ci-only",
    "mip_shadow_recovery_fixture": "recovery-disposable-ci-only",
    "anon": "anon-disposable-ci-only",
    "authenticated": "authenticated-disposable-ci-only",
    "service_role": "service-disposable-ci-only",
    "authenticator": "authenticator-disposable-ci-only",
}
CONTRACT_PATH = Path("supabase/qualification/collector-algorithm-shadow/contract.sql")
CONTRACT = CONTRACT_PATH.read_text()
CONTRACT_SHA256 = hashlib.sha256(CONTRACT.encode()).hexdigest()
IMPLEMENTATION = "qualification:collector-algorithm-shadow:v1"
RUNTIME_A = "mip_shadow_runtime_a_fixture"
RUNTIME_B = "mip_shadow_runtime_b_fixture"
ADMITTER = "mip_shadow_admitter_fixture"
RECOVERY = "mip_shadow_recovery_fixture"


def sql_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def json_sql(value):
    return sql_quote(json.dumps(value, separators=(",", ":"), sort_keys=True)) + "::jsonb"


def process_env(role):
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update(
        PGPASSWORD=PASSWORDS[role],
        PGCONNECT_TIMEOUT="5",
        PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=15000",
    )
    return env


def command(database, role):
    return [
        "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
        "-h", HOST, "-p", PORT, "-U", role, "-d", database,
    ]


def run(database, sql, role="postgres", timeout=30):
    result = subprocess.run(
        command(database, role), input=sql, text=True, capture_output=True,
        timeout=timeout, env=process_env(role),
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


class Session:
    def __init__(self, database, role):
        self.database = database
        self.role = role
        self.process = subprocess.Popen(
            command(database, role), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, bufsize=1, env=process_env(role),
        )
        self.lines = queue.Queue()

        def reader():
            for line in self.process.stdout:
                self.lines.put(line.rstrip("\n"))
            self.lines.put(None)

        self.thread = threading.Thread(target=reader, daemon=True)
        self.thread.start()
        identity = self.execute("select session_user||':'||current_user||':'||pg_backend_pid();").split(":")
        if identity[0] != role or identity[1] != role:
            raise RuntimeError("direct login identity mismatch")
        self.pid = int(identity[2])

    def start(self, sql):
        if self.process.poll() is not None:
            raise RuntimeError("psql session already exited")
        self.marker = "done_" + uuid.uuid4().hex
        self.process.stdin.write(sql + "\n\\echo " + self.marker + "\n")
        self.process.stdin.flush()

    def finish(self, timeout=20):
        lines = []
        deadline = time.monotonic() + timeout
        while True:
            remaining = max(0.01, deadline - time.monotonic())
            try:
                line = self.lines.get(timeout=remaining)
            except queue.Empty as exc:
                raise RuntimeError("psql response timeout") from exc
            if line is None:
                raise RuntimeError("\n".join(lines))
            if line == self.marker:
                return "\n".join(lines).strip()
            lines.append(line)

    def execute(self, sql):
        self.start(sql)
        return self.finish()

    def kill(self):
        if self.process.poll() is None:
            self.process.kill()
            self.process.wait(timeout=5)
        self.thread.join(timeout=5)

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=5)
        self.thread.join(timeout=5)


def create_cluster_roles():
    statements = [
        "create role mip_shadow_store_owner_v1 nologin noinherit nosuperuser nocreaterole nocreatedb noreplication nobypassrls",
        "create role mip_shadow_worker_fn_owner_v1 nologin noinherit nosuperuser nocreaterole nocreatedb noreplication nobypassrls",
        "create role mip_shadow_authority_fn_owner_v1 nologin noinherit nosuperuser nocreaterole nocreatedb noreplication nobypassrls",
    ]
    for role in [RUNTIME_A, RUNTIME_B, ADMITTER, RECOVERY, "anon", "authenticated", "authenticator"]:
        statements.append(
            "create role " + role + " login noinherit nosuperuser nocreaterole "
            "nocreatedb noreplication nobypassrls password " + sql_quote(PASSWORDS[role])
        )
    statements.append(
        "create role service_role login noinherit nosuperuser nocreaterole "
        "nocreatedb noreplication bypassrls password " + sql_quote(PASSWORDS["service_role"])
    )
    run("postgres", ";".join(statements) + ";")


def postgres_service_container_id():
    containers = subprocess.run(
        ["docker", "ps", "--filter", "ancestor=postgres:17.6", "--filter", "publish=5432",
         "--format", "{{.ID}}"],
        check=True, capture_output=True, text=True, timeout=15,
    ).stdout.split()
    if len(containers) != 1:
        raise RuntimeError("exact disposable PostgreSQL service container not found")
    port = subprocess.run(
        ["docker", "port", containers[0], "5432/tcp"], check=True,
        capture_output=True, text=True, timeout=15,
    ).stdout
    if ":5432" not in port:
        raise RuntimeError("disposable PostgreSQL service does not own loopback test port")
    return containers[0]


def container_postgres_tool(tool, args, input_bytes=None, timeout=60):
    """Run the client shipped in the exact disposable PostgreSQL 17.6 image."""
    result = subprocess.run(
        ["docker", "exec", "-i", postgres_service_container_id(), tool, *args],
        input=input_bytes, capture_output=True, timeout=timeout,
    )
    if result.returncode:
        detail = result.stderr.decode(errors="replace").strip()
        raise RuntimeError(detail or result.stdout.decode(errors="replace").strip())
    return result.stdout


def restart_postgres_service():
    container = postgres_service_container_id()
    subprocess.run(["docker", "restart", container], check=True, capture_output=True, text=True, timeout=30)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            if run("postgres", "select 1;") == "1":
                return
        except RuntimeError:
            pass
        time.sleep(0.25)
    raise RuntimeError("disposable PostgreSQL service did not recover")


def query_lines(database, sql):
    output = run(database, sql)
    return [] if not output else output.splitlines()


def logical_restore_fingerprint(database):
    """Fingerprint the bounded collector schemas and every private history row."""
    schemas = "'collector_shadow_private','collector_shadow_api','collector_shadow_control'"
    catalog = {
        "database": query_lines(database, """
          select pg_get_userbyid(datdba)||'|'||coalesce(datacl::text,'<null>')
          from pg_database where datname=current_database()
        """),
        "schemas": query_lines(database, f"""
          select nspname||'|'||pg_get_userbyid(nspowner)||'|'||coalesce(nspacl::text,'<null>')
          from pg_namespace where nspname in ({schemas}) order by nspname
        """),
        "relations": query_lines(database, f"""
          select n.nspname||'|'||c.relname||'|'||c.relkind||'|'||pg_get_userbyid(c.relowner)
            ||'|'||c.relrowsecurity||'|'||c.relforcerowsecurity||'|'||coalesce(c.relacl::text,'<null>')
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ({schemas}) and c.relkind in ('r','p','v','m','S','i','I')
          order by n.nspname,c.relname,c.relkind
        """),
        "columns": query_lines(database, f"""
          select n.nspname||'|'||c.relname||'|'||a.attnum||'|'||a.attname||'|'
            ||coalesce(a.attacl::text,'<null>')
          from pg_attribute a join pg_class c on c.oid=a.attrelid
            join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ({schemas}) and a.attnum>0 and not a.attisdropped
          order by n.nspname,c.relname,a.attnum
        """),
        "constraints": query_lines(database, f"""
          select n.nspname||'|'||c.relname||'|'||con.conname||'|'||con.contype||'|'
            ||encode(sha256(convert_to(pg_get_constraintdef(con.oid,true),'UTF8')),'hex')
          from pg_constraint con join pg_class c on c.oid=con.conrelid
            join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ({schemas}) order by n.nspname,c.relname,con.conname
        """),
        "indexes": query_lines(database, f"""
          select n.nspname||'|'||c.relname||'|'
            ||encode(sha256(convert_to(pg_get_indexdef(c.oid),'UTF8')),'hex')
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ({schemas}) and c.relkind in ('i','I')
          order by n.nspname,c.relname
        """),
        "triggers": query_lines(database, f"""
          select n.nspname||'|'||c.relname||'|'||t.tgname||'|'||t.tgenabled||'|'
            ||encode(sha256(convert_to(pg_get_triggerdef(t.oid,true),'UTF8')),'hex')
          from pg_trigger t join pg_class c on c.oid=t.tgrelid
            join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ({schemas}) and not t.tgisinternal
          order by n.nspname,c.relname,t.tgname
        """),
        "functions": query_lines(database, f"""
          select n.nspname||'|'||p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'
            ||pg_get_userbyid(p.proowner)||'|'||p.prosecdef||'|'||p.provolatile||'|'||p.proparallel
            ||'|'||coalesce(p.proconfig::text,'<null>')||'|'||coalesce(p.proacl::text,'<null>')||'|'
            ||encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname in ({schemas})
          order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
        """),
        "policies": query_lines(database, f"""
          select n.nspname||'|'||c.relname||'|'||p.polname||'|'||p.polcmd||'|'||p.polpermissive
            ||'|'||coalesce((select string_agg(coalesce(r.rolname,'public'),',' order by coalesce(r.rolname,'public'))
                from unnest(p.polroles) as role_ids(role_oid)
                left join pg_roles r on r.oid=role_ids.role_oid),'')
            ||'|'||encode(sha256(convert_to(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'UTF8')),'hex')
            ||'|'||encode(sha256(convert_to(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'UTF8')),'hex')
          from pg_policy p join pg_class c on c.oid=p.polrelid
            join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ({schemas}) order by n.nspname,c.relname,p.polname
        """),
        "default_acls": query_lines(database, f"""
          select pg_get_userbyid(d.defaclrole)||'|'||coalesce(n.nspname,'<global>')||'|'
            ||d.defaclobjtype||'|'||coalesce(d.defaclacl::text,'<null>')
          from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
          where pg_get_userbyid(d.defaclrole) like 'mip_shadow_%' or n.nspname in ({schemas})
          order by 1
        """),
        "sequences": query_lines(database, f"""
          select schemaname||'|'||sequencename||'|'||sequenceowner||'|'||coalesce(last_value::text,'<null>')
          from pg_sequences where schemaname in ({schemas}) order by schemaname,sequencename
        """),
    }
    tables = query_lines(database, """
      select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='collector_shadow_private' and c.relkind='r' order by c.relname
    """)
    histories = {}
    for table in tables:
        histories[table] = run(database, f"""
          select count(*)||'|'||encode(sha256(convert_to(coalesce(
            string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'UTF8')),'hex')
          from collector_shadow_private.{table} t
        """)
    return {"catalog": catalog, "histories": histories}


def dump_and_restore_database(source_database, restored_database):
    started = time.monotonic()
    dump_version = container_postgres_tool("pg_dump", ["--version"]).decode().strip()
    restore_version = container_postgres_tool("pg_restore", ["--version"]).decode().strip()
    if " 17.6 " not in dump_version + " " or " 17.6 " not in restore_version + " ":
        raise RuntimeError("matching PostgreSQL 17.6 logical backup tools required")
    archive = container_postgres_tool(
        "pg_dump", ["-U", "postgres", "-d", source_database, "--format=custom", "--no-password"],
    )
    if not archive:
        raise RuntimeError("logical archive was empty")
    archive_sha256 = hashlib.sha256(archive).hexdigest()
    run("postgres", "create database " + restored_database)
    # Preserve archive ownership and ACL commands. Do not reapply contract,
    # fixtures, or grants to the empty destination.
    container_postgres_tool(
        "pg_restore", ["-U", "postgres", "-d", restored_database, "--single-transaction",
                       "--exit-on-error", "--no-password"],
        input_bytes=archive,
    )
    print("MIP_SHADOW_LOGICAL_RESTORE=pg17.6_custom_archive;owners_acl_preserved;global_roles_preexisting", flush=True)
    print("MIP_SHADOW_LOGICAL_RESTORE_SCOPE=same_cluster_only;global_roles_not_archived;not_fresh_cluster;not_pitr;not_crash_recovery", flush=True)
    print("MIP_SHADOW_LOGICAL_ARCHIVE_SHA256=" + archive_sha256, flush=True)
    print("MIP_SHADOW_LOGICAL_ARCHIVE_BYTES=" + str(len(archive)), flush=True)
    print("MIP_SHADOW_LOGICAL_RESTORE_DURATION_MS=" + str(round((time.monotonic() - started) * 1000)), flush=True)


class CollectorShadowPostgres(unittest.TestCase):
    def setUp(self):
        self.database = "mip_shadow_" + uuid.uuid4().hex
        run("postgres", "create database " + self.database)
        self.sessions = []
        self.addCleanup(self.cleanup)
        run(self.database, CONTRACT)
        self.runtime_a = str(uuid.uuid4())
        self.runtime_b = str(uuid.uuid4())
        self.refs = self.register_bundle("first", 1)
        self.admitter("select collector_shadow_control.bind_runtime(" + ",".join([
            sql_quote(self.runtime_a), sql_quote(RUNTIME_A), sql_quote(self.refs["source_revision"]), sql_quote(IMPLEMENTATION)]) + ");")
        self.admitter("select collector_shadow_control.bind_runtime(" + ",".join([
            sql_quote(self.runtime_b), sql_quote(RUNTIME_B), sql_quote(self.refs["source_revision"]), sql_quote(IMPLEMENTATION)]) + ");")
        self.session_a = self.issue_session(self.runtime_a)
        self.session_b = self.issue_session(self.runtime_b)
        self.generation = self.admit(self.refs)
        self.a = self.session(RUNTIME_A)
        self.a2 = self.session(RUNTIME_A)
        self.b = self.session(RUNTIME_B)

    def cleanup(self):
        for client in self.sessions:
            try:
                client.close()
            except Exception:
                pass
        self.sessions.clear()
        run("postgres", "drop database if exists " + self.database + " with (force)")

    def session(self, role):
        client = Session(self.database, role)
        self.sessions.append(client)
        return client

    def admin(self, sql):
        return run(self.database, sql)

    def admitter(self, sql):
        return run(self.database, sql, ADMITTER)

    def recovery(self, sql):
        return run(self.database, sql, RECOVERY)

    def register_bundle(self, suffix, second):
        payload = (
            "<rss><channel><item><title>Synthetic retained item " + suffix + "</title>"
            "<link>https://source.invalid/item-" + suffix + "</link>"
            "<description>Qualification evidence only.</description></item></channel></rss>"
        )
        config = {"citation_weights": {"said": 0.8}, "max_items": 10, "outlet_names": ["Synthetic"]}
        hashes = {
            "source": hashlib.sha256(b"synthetic-source-authority").hexdigest(),
            "payload": hashlib.sha256(payload.encode()).hexdigest(),
            "rights": hashlib.sha256(("synthetic-rights-" + suffix).encode()).hexdigest(),
            "edge": hashlib.sha256(b"synthetic-edge-package").hexdigest(),
            "normalized": hashlib.sha256(b"synthetic-normalized-source").hexdigest(),
            "config": hashlib.sha256(json.dumps(config, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        }
        args = [
            "synthetic-predecessor", "synthetic-feed", "https://source.invalid/feed.xml",
            "synthetic-registry-v1", hashes["source"], f"2000-01-01T00:00:{second:02d}Z",
            "application/rss+xml", payload, hashes["payload"], "public",
            "synthetic-qualification", "v1", "approval-" + suffix, hashes["rights"], None,
            IMPLEMENTATION, "synthetic-rss-v1", hashes["edge"], hashes["normalized"],
        ]
        encoded = ["null" if value is None else sql_quote(value) for value in args]
        sql = "select collector_shadow_control.register_bundle(" + ",".join(encoded) + "," + json_sql(config) + "," + sql_quote(hashes["config"]) + ");"
        return json.loads(self.admitter(sql))

    def issue_session(self, runtime, ttl="15 minutes"):
        return self.admitter("select collector_shadow_control.issue_session(" + sql_quote(runtime) + "," + sql_quote(ttl) + "::interval);")

    def admit(self, refs, cause="new_relevant_evidence", prior=None):
        values = [refs["capture_revision"], refs["rights_revision"], refs["config_revision"], cause]
        tail = "null" if prior is None else sql_quote(prior)
        return self.admitter("select collector_shadow_control.admit_generation(" + ",".join(map(sql_quote, values)) + "," + tail + ");")

    def claim_sql(self, runtime, session, request):
        return "select collector_shadow_api.shadow_claim(" + ",".join(map(sql_quote, [session, runtime, request])) + ");"

    def claim(self, client, runtime=None, session=None, request=None):
        runtime = runtime or self.runtime_a
        session = session or self.session_a
        request = request or str(uuid.uuid4())
        raw = client.execute(self.claim_sql(runtime, session, request))
        return json.loads(raw) if raw else None

    def output_for(self, claim):
        retained = json.loads(claim["input_text"])
        method = dict(retained["method"])
        method.update(provider_result="disabled", qualification="unverified_host_assertions")
        return {
            "contract_version": 2,
            "source": retained["source"],
            "rights": retained["rights"],
            "knowledge_change": retained["knowledge_change"],
            "method": method,
            "declared_effect_scope": {
                "canonical_domain_writes": "forbidden",
                "publication_writes": "forbidden",
                "predecessor_acknowledgements": "forbidden",
                "provider_calls": "forbidden",
                "evidence_status": "requires_independent_host_and_database_audit",
            },
            "items": [],
            "coverage": {"state": "not_extracted", "reason": "synthetic_sql_fixture"},
            "output_sha256": hashlib.sha256(b"synthetic-worker-canonical-output").hexdigest(),
        }

    def complete_sql(self, claim, request, output=None, session=None, runtime=None):
        output = output or self.output_for(claim)
        values = [session or self.session_a, runtime or self.runtime_a, request,
                  claim["generation_id"], claim["lease_token"], claim["input_hash"], claim["implementation_ref"]]
        return "select collector_shadow_api.shadow_complete(" + ",".join(map(sql_quote, values)) + "," + json_sql(output) + ");"

    def fail_sql(self, claim, request, session=None, runtime=None):
        values = [session or self.session_a, runtime or self.runtime_a, request,
                  claim["generation_id"], claim["lease_token"], claim["input_hash"],
                  claim["implementation_ref"], "mip_shadow_bounded_algorithm_failure"]
        return "select collector_shadow_api.shadow_fail(" + ",".join(map(sql_quote, values)) + ");"

    def authority_action_sql(self, authority):
        actions = {
            "source": "select collector_shadow_control.retire_source(" + sql_quote(self.refs["source_revision"]) + ");",
            "session": "select collector_shadow_control.revoke_session(" + sql_quote(self.session_a) + ");",
            "runtime": "select collector_shadow_control.revoke_runtime(" + sql_quote(self.runtime_a) + ");",
            "implementation": "select collector_shadow_control.retire_implementation(" + sql_quote(IMPLEMENTATION) + ");",
            "configuration": "select collector_shadow_control.retire_config(" + sql_quote(self.refs["config_revision"]) + ");",
        }
        return actions[authority]

    def authority_is_active_sql(self, authority):
        checks = {
            "source": "select retired_at is null from collector_shadow_private.source_revisions where id=" + sql_quote(self.refs["source_revision"]),
            "session": "select revoked_at is null from collector_shadow_private.runtime_sessions where id=" + sql_quote(self.session_a),
            "runtime": "select b.active and b.revoked_at is null and s.revoked_at is null from collector_shadow_private.runtime_bindings b join collector_shadow_private.runtime_sessions s on s.runtime_id=b.runtime_id where b.runtime_id=" + sql_quote(self.runtime_a) + " and s.id=" + sql_quote(self.session_a),
            "implementation": "select retired_at is null from collector_shadow_private.implementations where implementation_ref=" + sql_quote(IMPLEMENTATION),
            "configuration": "select retired_at is null from collector_shadow_private.config_revisions where id=" + sql_quote(self.refs["config_revision"]),
        }
        return checks[authority]

    def assert_authority_rollback_then_commit_denies(self, authority):
        first = self.claim(self.a)
        rollback_request = str(uuid.uuid4())
        revoker = self.session(ADMITTER)
        revoker.execute("begin;")
        revoker.execute(self.authority_action_sql(authority))
        rollback_waiter = self.session(RUNTIME_A)
        rollback_waiter.start(self.complete_sql(first, rollback_request))
        self.blocked(rollback_waiter, revoker)
        revoker.execute("rollback;")
        self.assertEqual(rollback_waiter.finish(), "completed")
        self.assertEqual(self.admin(self.authority_is_active_sql(authority)), "t")

        second_refs = self.register_bundle("authority-first-" + authority, 10)
        second_generation = self.admit(second_refs)
        second = self.claim(self.a2)
        self.assertEqual(second["generation_id"], second_generation)
        revoker.execute("begin;")
        revoker.execute(self.authority_action_sql(authority))
        committed_waiter = self.session(RUNTIME_A)
        committed_waiter.start(self.complete_sql(second, str(uuid.uuid4())))
        self.blocked(committed_waiter, revoker)
        revoker.execute("commit;")
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_(completion|runtime_session|config)_not_(authorized|active)|query returned no rows"):
            committed_waiter.finish()
        self.assertEqual(self.admin(self.authority_is_active_sql(authority)), "f")
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "1")
        self.assertEqual(self.admin("select state from collector_shadow_private.jobs where generation_id=" + sql_quote(second_generation)), "processing")

    def assert_worker_first_then_authority_denies_replay(self, authority):
        claim = self.claim(self.a)
        request = str(uuid.uuid4())
        self.a.execute("begin;")
        self.assertEqual(self.a.execute(self.complete_sql(claim, request)), "completed")
        revoker = self.session(ADMITTER)
        revoker.start(self.authority_action_sql(authority))
        self.blocked(revoker, self.a)
        self.a.execute("commit;")
        revoker.finish()
        self.assertEqual(self.admin(self.authority_is_active_sql(authority)), "f")
        replay = self.session(RUNTIME_A)
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_(replay|runtime_session)_not_authorized|query returned no rows"):
            replay.execute(self.complete_sql(claim, request))
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "1")

    def blocked(self, waiter, holder):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            result = self.admin("select " + str(holder.pid) + "=any(pg_blocking_pids(" + str(waiter.pid) + "));")
            if result == "t":
                print("MIP_SHADOW_LOCK_OBSERVED=" + json.dumps({"waiter": waiter.role, "holder": holder.role}), flush=True)
                return
            time.sleep(0.025)
        self.fail("expected PostgreSQL lock wait was not observed")

    def wait_for_backend_sleep(self, client):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self.admin("select coalesce(wait_event,'') from pg_stat_activity where pid=" + str(client.pid)) == "PgSleep":
                return
            time.sleep(0.025)
        self.fail("expected disposable backend sleep was not observed")

    def wait_for_backend_exit(self, pid):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self.admin("select count(*) from pg_stat_activity where pid=" + str(pid)) == "0":
                return
            time.sleep(0.025)
        self.fail("terminated client backend remained active")

    def terminate_backend(self, client):
        self.assertEqual(self.admin("select pg_terminate_backend(" + str(client.pid) + ");"), "t")
        with self.assertRaises(RuntimeError):
            client.finish(timeout=5)
        self.wait_for_backend_exit(client.pid)

    def test_actual_logins_acl_inventory_and_isolation_guard(self):
        pids = {self.a.pid, self.a2.pid, self.b.pid}
        self.assertEqual(len(pids), 3)
        self.assertEqual(self.a.execute("select session_user||':'||current_user;"), RUNTIME_A + ":" + RUNTIME_A)
        self.assertEqual(self.b.execute("select session_user||':'||current_user;"), RUNTIME_B + ":" + RUNTIME_B)
        self.assertEqual(self.admin("select count(*) from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname like 'mip_shadow_%'"), "0")
        self.assertEqual(self.admin("select count(*) from pg_roles where rolname like 'mip_shadow_%' and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit)"), "0")
        self.assertEqual(self.admin("select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relnamespace='collector_shadow_private'::regnamespace and relkind='r'"), "t")
        self.assertEqual(self.admin("select count(*) from pg_class where relnamespace='collector_shadow_private'::regnamespace and relkind='r' and pg_get_userbyid(relowner)<>'mip_shadow_store_owner_v1'"), "0")
        self.assertEqual(self.admin("select count(*) from pg_class where relnamespace='collector_shadow_private'::regnamespace and relkind='S' and pg_get_userbyid(relowner)<>'mip_shadow_store_owner_v1'"), "0")
        self.assertEqual(self.admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='collector_shadow_api' and pg_get_userbyid(p.proowner)<>'mip_shadow_worker_fn_owner_v1'"), "0")
        self.assertEqual(self.admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='collector_shadow_control' and pg_get_userbyid(p.proowner)<>'mip_shadow_authority_fn_owner_v1'"), "0")
        self.assertEqual(self.admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='collector_shadow_private' and pg_get_userbyid(p.proowner)<>'mip_shadow_store_owner_v1'"), "0")
        self.assertEqual(self.admin("select (select count(*) from pg_proc where pronamespace='collector_shadow_api'::regnamespace)||':'||(select count(*) from pg_proc where pronamespace='collector_shadow_control'::regnamespace)||':'||(select count(*) from pg_proc where pronamespace='collector_shadow_private'::regnamespace)"), "3:11:4")
        self.assertEqual(self.admin("select count(*) from pg_proc where pronamespace in ('collector_shadow_api'::regnamespace,'collector_shadow_control'::regnamespace,'collector_shadow_private'::regnamespace) and (proconfig is null or not ('search_path=\"\"'=any(proconfig)) or has_function_privilege('public',oid,'execute'))"), "0")
        self.assertEqual(self.admin("select has_schema_privilege('mip_shadow_runtime_a_fixture','collector_shadow_private','usage')"), "f")
        self.assertEqual(self.admin("select has_any_column_privilege('mip_shadow_runtime_a_fixture','collector_shadow_private.jobs','select,insert,update,references')"), "f")
        self.assertEqual(self.admin("select has_table_privilege('mip_shadow_runtime_a_fixture','collector_shadow_private.jobs','delete,truncate')"), "f")
        self.assertEqual(self.admin("select coalesce(bool_or(has_sequence_privilege('mip_shadow_runtime_a_fixture',c.oid,'usage,select,update')),false) from pg_class c where c.relnamespace='collector_shadow_private'::regnamespace and c.relkind='S'"), "f")
        self.assertEqual(self.admin("select count(*) from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole in ('mip_shadow_store_owner_v1'::regrole,'mip_shadow_worker_fn_owner_v1'::regrole,'mip_shadow_authority_fn_owner_v1'::regrole) and a.grantee=0 and a.privilege_type='EXECUTE'"), "0")
        self.assertEqual(self.admin("select has_function_privilege('mip_shadow_runtime_a_fixture','collector_shadow_api.shadow_claim(uuid,uuid,uuid)','execute') and has_function_privilege('mip_shadow_runtime_a_fixture','collector_shadow_api.shadow_complete(uuid,uuid,uuid,uuid,uuid,text,text,jsonb)','execute') and has_function_privilege('mip_shadow_runtime_a_fixture','collector_shadow_api.shadow_fail(uuid,uuid,uuid,uuid,uuid,text,text,text)','execute')"), "t")
        self.assertEqual(self.admin("select has_function_privilege('mip_shadow_recovery_fixture','collector_shadow_control.requeue_expired(uuid,integer)','execute') and not has_function_privilege('mip_shadow_admitter_fixture','collector_shadow_control.requeue_expired(uuid,integer)','execute') and not has_function_privilege('mip_shadow_recovery_fixture','collector_shadow_control.admit_generation(uuid,uuid,uuid,text,uuid)','execute')"), "t")
        self.admin(";".join([
            "set role mip_shadow_store_owner_v1",
            "create function collector_shadow_private.default_acl_probe_store_v1() returns integer language sql set search_path='' as 'select 1'",
            "reset role",
            "set role mip_shadow_worker_fn_owner_v1",
            "create function collector_shadow_api.default_acl_probe_worker_v1() returns integer language sql set search_path='' as 'select 1'",
            "reset role",
            "set role mip_shadow_authority_fn_owner_v1",
            "create function collector_shadow_control.default_acl_probe_authority_v1() returns integer language sql set search_path='' as 'select 1'",
            "reset role",
        ]) + ";")
        probes = "(n.nspname,p.proname) in (('collector_shadow_private','default_acl_probe_store_v1'),('collector_shadow_api','default_acl_probe_worker_v1'),('collector_shadow_control','default_acl_probe_authority_v1'))"
        expected_owners = "(n.nspname='collector_shadow_private' and pg_get_userbyid(p.proowner)='mip_shadow_store_owner_v1') or (n.nspname='collector_shadow_api' and pg_get_userbyid(p.proowner)='mip_shadow_worker_fn_owner_v1') or (n.nspname='collector_shadow_control' and pg_get_userbyid(p.proowner)='mip_shadow_authority_fn_owner_v1')"
        self.assertEqual(self.admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where " + probes + " and not (" + expected_owners + ")"), "0")
        for role in ["public", RUNTIME_A, RUNTIME_B, ADMITTER, RECOVERY,
                     "anon", "authenticated", "service_role", "authenticator"]:
            self.assertEqual(self.admin("select coalesce(bool_or(has_function_privilege(" + sql_quote(role) + ",p.oid,'execute')),false) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where " + probes), "f")
        with self.assertRaisesRegex(RuntimeError, "permission denied"):
            run(self.database, "select collector_shadow_api.default_acl_probe_worker_v1();", RUNTIME_A)
        with self.assertRaisesRegex(RuntimeError, "permission denied"):
            run(self.database, "select collector_shadow_control.default_acl_probe_authority_v1();", ADMITTER)
        for role in ["anon", "authenticated", "service_role", "authenticator"]:
            with self.assertRaisesRegex(RuntimeError, "permission denied"):
                run(self.database, self.claim_sql(self.runtime_a, self.session_a, str(uuid.uuid4())), role)
        for target in ["postgres", RUNTIME_B, ADMITTER, RECOVERY,
                       "mip_shadow_store_owner_v1", "mip_shadow_worker_fn_owner_v1",
                       "mip_shadow_authority_fn_owner_v1"]:
            with self.assertRaisesRegex(RuntimeError, "permission denied"):
                run(self.database, "set role " + target + ";", RUNTIME_A)
        with self.assertRaisesRegex(RuntimeError, "permission denied"):
            run(self.database, "set session authorization postgres;", RUNTIME_A)
        for role, sql in [
            (RUNTIME_A, "select * from collector_shadow_private.jobs;"),
            (RUNTIME_A, "update collector_shadow_private.jobs set state='pending';"),
            (RUNTIME_A, "create function collector_shadow_api.forged() returns void language sql as 'select';"),
            (RUNTIME_A, "select collector_shadow_control.requeue_expired(" + sql_quote(self.generation) + ",0);"),
            (ADMITTER, "select collector_shadow_control.requeue_expired(" + sql_quote(self.generation) + ",0);"),
            (RECOVERY, "select collector_shadow_control.admit_generation(null,null,null,'new_relevant_evidence',null);"),
        ]:
            with self.assertRaisesRegex(RuntimeError, "permission denied"):
                run(self.database, sql, role)
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_read_committed_required"):
            run(self.database, "begin isolation level repeatable read;" + self.claim_sql(self.runtime_a, self.session_a, str(uuid.uuid4())), RUNTIME_A)

    def test_foreign_actual_login_cannot_use_valid_runtime_session_or_lease(self):
        claim = self.claim(self.a)
        before = self.admin("select state||':'||attempt||':'||(select count(*) from collector_shadow_private.request_runs)||':'||(select count(*) from collector_shadow_private.outputs)||':'||(select count(*) from collector_shadow_private.failure_reports) from collector_shadow_private.jobs")
        statements = [
            self.claim_sql(self.runtime_a, self.session_a, str(uuid.uuid4())),
            self.complete_sql(claim, str(uuid.uuid4())),
            self.fail_sql(claim, str(uuid.uuid4())),
        ]
        for statement in statements:
            with self.assertRaisesRegex(RuntimeError, "query returned no rows|mip_shadow_runtime_session_not_authorized"):
                run(self.database, statement, RUNTIME_B)
        after = self.admin("select state||':'||attempt||':'||(select count(*) from collector_shadow_private.request_runs)||':'||(select count(*) from collector_shadow_private.outputs)||':'||(select count(*) from collector_shadow_private.failure_reports) from collector_shadow_private.jobs")
        self.assertEqual(after, before)

    def test_skip_locked_claims_and_rollback_preserve_attempt_budget(self):
        second_refs = self.register_bundle("second", 2)
        second_generation = self.admit(second_refs)
        self.a.execute("begin;")
        held = self.claim(self.a)
        other = self.claim(self.b, self.runtime_b, self.session_b)
        self.assertEqual(held["generation_id"], self.generation)
        self.assertEqual(other["generation_id"], second_generation)
        self.assertEqual(self.admin("select attempt from collector_shadow_private.jobs where generation_id=" + sql_quote(self.generation)), "0")
        self.a.execute("rollback;")
        reclaimed = self.claim(self.a2)
        self.assertEqual(reclaimed["generation_id"], self.generation)
        self.assertNotEqual(reclaimed["lease_token"], held["lease_token"])
        self.assertEqual(reclaimed["attempt"], 1)

    def test_concurrent_claim_replay_never_reissues_token(self):
        request = str(uuid.uuid4())
        self.a.execute("begin;")
        first = self.claim(self.a, request=request)
        self.a2.start(self.claim_sql(self.runtime_a, self.session_a, request))
        self.blocked(self.a2, self.a)
        self.a.execute("commit;")
        replay = json.loads(self.a2.finish())
        self.assertEqual(replay["generation_id"], first["generation_id"])
        self.assertEqual(replay["attempt"], 1)
        self.assertTrue(replay["replay"])
        self.assertNotIn("lease_token", replay)
        self.assertNotIn("input_text", replay)
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.request_runs where request_id=" + sql_quote(request)), "1")

    def test_completion_is_atomic_and_exact_concurrent_retry_converges(self):
        claim = self.claim(self.a)
        request = str(uuid.uuid4())
        statement = self.complete_sql(claim, request)
        self.a.execute("begin;")
        self.assertEqual(self.a.execute(statement), "completed")
        self.assertEqual(self.admin("select state from collector_shadow_private.jobs"), "processing")
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "0")
        self.a2.start(statement)
        self.blocked(self.a2, self.a)
        self.a.execute("commit;")
        self.assertEqual(self.a2.finish(), "completed")
        self.assertEqual(self.admin("select state from collector_shadow_private.jobs"), "completed")
        self.assertEqual(self.admin("select (select count(*) from collector_shadow_private.outputs)||':'||(select count(*) from collector_shadow_private.request_runs where operation='shadow_complete')"), "1:1")

    def test_completion_and_failure_race_has_one_terminal_history(self):
        claim = self.claim(self.a)
        fail_request = str(uuid.uuid4())
        self.a.execute("begin;")
        self.assertEqual(self.a.execute(self.fail_sql(claim, fail_request)), "failed")
        loser = self.session(RUNTIME_A)
        loser.start(self.complete_sql(claim, str(uuid.uuid4())))
        self.blocked(loser, self.a)
        self.a.execute("commit;")
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_completion_not_authorized"):
            loser.finish()
        self.assertEqual(self.admin("select state||':'||(select count(*) from collector_shadow_private.outputs)||':'||(select count(*) from collector_shadow_private.failure_reports) from collector_shadow_private.jobs"), "failed:0:1")

    def test_committed_revocation_wins_waiting_completion(self):
        claim = self.claim(self.a)
        revoker = self.session(ADMITTER)
        revoker.execute("begin;")
        revoker.execute("select collector_shadow_control.revoke_rights(" + sql_quote(self.refs["rights_revision"]) + ");")
        waiter = self.session(RUNTIME_A)
        waiter.start(self.complete_sql(claim, str(uuid.uuid4())))
        self.blocked(waiter, revoker)
        revoker.execute("commit;")
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_completion_not_authorized|query returned no rows"):
            waiter.finish()
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "0")
        self.assertEqual(self.admin("select state from collector_shadow_private.jobs"), "processing")

    def test_rights_revocation_rollback_allows_waiting_completion(self):
        claim = self.claim(self.a)
        revoker = self.session(ADMITTER)
        revoker.execute("begin;")
        revoker.execute("select collector_shadow_control.revoke_rights(" + sql_quote(self.refs["rights_revision"]) + ");")
        waiter = self.session(RUNTIME_A)
        waiter.start(self.complete_sql(claim, str(uuid.uuid4())))
        self.blocked(waiter, revoker)
        revoker.execute("rollback;")
        self.assertEqual(waiter.finish(), "completed")
        self.assertEqual(self.admin("select revoked_at is null from collector_shadow_private.rights_revisions where id=" + sql_quote(self.refs["rights_revision"])), "t")
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "1")

    def test_worker_first_linearizes_before_revocation_and_replay_then_denies(self):
        claim = self.claim(self.a)
        request = str(uuid.uuid4())
        self.a.execute("begin;")
        self.assertEqual(self.a.execute(self.complete_sql(claim, request)), "completed")
        revoker = self.session(ADMITTER)
        revoker.start("select collector_shadow_control.revoke_rights(" + sql_quote(self.refs["rights_revision"]) + ");")
        self.blocked(revoker, self.a)
        self.a.execute("commit;")
        revoker.finish()
        replay = self.session(RUNTIME_A)
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_replay_not_authorized|query returned no rows"):
            replay.execute(self.complete_sql(claim, request))
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "1")

    def test_source_authority_rollback_and_authority_first_ordering(self):
        self.assert_authority_rollback_then_commit_denies("source")

    def test_source_worker_first_ordering(self):
        self.assert_worker_first_then_authority_denies_replay("source")

    def test_session_authority_rollback_and_authority_first_ordering(self):
        self.assert_authority_rollback_then_commit_denies("session")

    def test_session_worker_first_ordering(self):
        self.assert_worker_first_then_authority_denies_replay("session")

    def test_runtime_authority_rollback_and_authority_first_ordering(self):
        self.assert_authority_rollback_then_commit_denies("runtime")

    def test_runtime_worker_first_ordering(self):
        self.assert_worker_first_then_authority_denies_replay("runtime")

    def test_implementation_authority_rollback_and_authority_first_ordering(self):
        self.assert_authority_rollback_then_commit_denies("implementation")

    def test_implementation_worker_first_ordering(self):
        self.assert_worker_first_then_authority_denies_replay("implementation")

    def test_configuration_authority_rollback_and_authority_first_ordering(self):
        self.assert_authority_rollback_then_commit_denies("configuration")

    def test_configuration_worker_first_ordering(self):
        self.assert_worker_first_then_authority_denies_replay("configuration")

    def test_session_expiry_while_waiting_on_job_is_rechecked(self):
        holder = self.session("postgres")
        waiter = self.session(RUNTIME_A)
        short_session = self.issue_session(self.runtime_a, "5 seconds")
        claim = self.claim(self.a, session=short_session)
        holder.execute("begin;select generation_id from collector_shadow_private.jobs where generation_id=" + sql_quote(self.generation) + " for update;")
        waiter.start(self.complete_sql(claim, str(uuid.uuid4()), session=short_session))
        self.blocked(waiter, holder)
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if self.admin("select expires_at<=clock_timestamp() from collector_shadow_private.runtime_sessions where id=" + sql_quote(short_session)) == "t":
                break
            time.sleep(0.05)
        else:
            self.fail("short-lived session did not expire")
        holder.execute("commit;")
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_runtime_session_not_authorized"):
            waiter.finish()
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "0")

    def test_expired_requeue_rotates_token_and_rejects_stale_attempt(self):
        first = self.claim(self.a)
        self.admin("update collector_shadow_private.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id=" + sql_quote(self.generation))
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_recovery_precondition"):
            self.recovery("select collector_shadow_control.requeue_expired(" + sql_quote(self.generation) + ",null);")
        self.assertEqual(self.recovery("select collector_shadow_control.requeue_expired(" + sql_quote(self.generation) + ",1);"), "requeued")
        self.admin("update collector_shadow_private.jobs set available_at=clock_timestamp()-interval '1 second' where generation_id=" + sql_quote(self.generation))
        second = self.claim(self.a2)
        self.assertEqual(second["attempt"], 2)
        self.assertNotEqual(second["lease_token"], first["lease_token"])
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_failure_not_authorized"):
            run(self.database, self.fail_sql(first, str(uuid.uuid4())), RUNTIME_A)
        self.assertEqual(self.a2.execute(self.fail_sql(second, str(uuid.uuid4()))), "failed")
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.recovery_events"), "1")

    def test_recovery_contention_and_attempt_exhaustion_are_bounded(self):
        first = self.claim(self.a)
        self.admin("update collector_shadow_private.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id=" + sql_quote(self.generation))
        recovery_one = self.session(RECOVERY)
        recovery_two = self.session(RECOVERY)
        statement = "select collector_shadow_control.requeue_expired(" + sql_quote(self.generation) + ",1);"
        recovery_one.execute("begin;")
        self.assertEqual(recovery_one.execute(statement), "requeued")
        recovery_two.start(statement)
        self.blocked(recovery_two, recovery_one)
        recovery_one.execute("commit;")
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_recovery_precondition"):
            recovery_two.finish()
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.recovery_events"), "1")

        for expected_attempt in [2, 3]:
            self.admin("update collector_shadow_private.jobs set available_at=clock_timestamp()-interval '1 second' where generation_id=" + sql_quote(self.generation))
            claimed = self.claim(self.a2)
            self.assertEqual(claimed["attempt"], expected_attempt)
            self.assertNotEqual(claimed["lease_token"], first["lease_token"])
            self.admin("update collector_shadow_private.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id=" + sql_quote(self.generation))
            result = self.recovery("select collector_shadow_control.requeue_expired(" + sql_quote(self.generation) + "," + str(expected_attempt) + ");")
            self.assertEqual(result, "failed" if expected_attempt == 3 else "requeued")
        self.assertEqual(self.admin("select state||':'||attempt||':'||failure_code from collector_shadow_private.jobs"), "failed:3:mip_shadow_lease_attempts_exhausted")
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.recovery_events"), "3")
        with self.assertRaisesRegex(RuntimeError, "mip_shadow_recovery_precondition"):
            self.recovery("select collector_shadow_control.requeue_expired(" + sql_quote(self.generation) + ",3);")

    def test_backend_termination_before_commit_rolls_back_and_after_commit_replays(self):
        first = self.claim(self.a)
        before_request = str(uuid.uuid4())
        doomed = self.session(RUNTIME_A)
        doomed.start("begin;" + self.complete_sql(first, before_request) + "select pg_sleep(30);")
        self.wait_for_backend_sleep(doomed)
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "0")
        self.terminate_backend(doomed)
        survivor = self.session(RUNTIME_A)
        self.assertEqual(survivor.execute(self.complete_sql(first, before_request)), "completed")

        second_refs = self.register_bundle("after-commit", 3)
        second_generation = self.admit(second_refs)
        second = self.claim(survivor)
        self.assertEqual(second["generation_id"], second_generation)
        after_request = str(uuid.uuid4())
        committed = self.session(RUNTIME_A)
        committed.start("begin;" + self.complete_sql(second, after_request) + "commit;select pg_sleep(30);")
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self.admin("select count(*) from collector_shadow_private.outputs") == "2":
                break
            time.sleep(0.025)
        else:
            self.fail("committed output did not become visible")
        self.terminate_backend(committed)
        recovery_client = self.session(RUNTIME_A)
        self.assertEqual(recovery_client.execute(self.complete_sql(second, after_request)), "completed")
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.outputs"), "2")

    def test_logical_dump_restore_preserves_catalog_history_and_direct_login_behavior(self):
        # Keep one processing generation.
        processing = self.claim(self.a)
        self.assertEqual(processing["generation_id"], self.generation)

        # Preserve a completed generation and its exact durable replay record.
        completed_refs = self.register_bundle("restore-completed", 21)
        completed_generation = self.admit(completed_refs)
        completed = self.claim(self.a2)
        self.assertEqual(completed["generation_id"], completed_generation)
        completed_request = str(uuid.uuid4())
        completed_statement = self.complete_sql(completed, completed_request)
        self.assertEqual(self.a2.execute(completed_statement), "completed")
        self.assertEqual(self.a2.execute(completed_statement), "completed")

        # Preserve an explicit worker failure.
        failed_refs = self.register_bundle("restore-failed", 22)
        failed_generation = self.admit(failed_refs)
        failed = self.claim(self.a)
        self.assertEqual(failed["generation_id"], failed_generation)
        self.assertEqual(self.a.execute(self.fail_sql(failed, str(uuid.uuid4()))), "failed")

        # Preserve every bounded recovery transition and attempts-exhausted history.
        exhausted_refs = self.register_bundle("restore-exhausted", 23)
        exhausted_generation = self.admit(exhausted_refs)
        exhausted = self.claim(self.a2)
        for expected_attempt in [1, 2, 3]:
            self.assertEqual(exhausted["attempt"], expected_attempt)
            self.admin("update collector_shadow_private.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id=" + sql_quote(exhausted_generation))
            result = self.recovery("select collector_shadow_control.requeue_expired(" + sql_quote(exhausted_generation) + "," + str(expected_attempt) + ");")
            self.assertEqual(result, "failed" if expected_attempt == 3 else "requeued")
            if expected_attempt < 3:
                self.admin("update collector_shadow_private.jobs set available_at=clock_timestamp()-interval '1 second' where generation_id=" + sql_quote(exhausted_generation))
                exhausted = self.claim(self.a2)

        # Preserve a revoked authority revision and a separate active pending job.
        revoked_refs = self.register_bundle("restore-revoked", 24)
        self.admit(revoked_refs)
        self.admitter("select collector_shadow_control.revoke_rights(" + sql_quote(revoked_refs["rights_revision"]) + ");")
        pending_refs = self.register_bundle("restore-pending", 25)
        pending_generation = self.admit(pending_refs)
        self.assertEqual(
            self.admin("select state||':'||count(*) from collector_shadow_private.jobs group by state order by state"),
            "completed:1\nfailed:2\npending:2\nprocessing:1",
        )
        self.assertEqual(self.admin("select count(*) from collector_shadow_private.recovery_events"), "3")
        self.assertEqual(
            self.admin("select failure_code from collector_shadow_private.jobs where generation_id=" + sql_quote(exhausted_generation)),
            "mip_shadow_lease_attempts_exhausted",
        )
        self.assertEqual(
            self.admin("select operation||':'||count(*) from collector_shadow_private.request_runs group by operation order by operation"),
            "shadow_claim:6\nshadow_complete:1\nshadow_fail:1",
        )
        self.assertEqual(
            self.admin("select count(*) from collector_shadow_private.rights_revisions where revoked_at is not null"),
            "1",
        )

        source_fingerprint = logical_restore_fingerprint(self.database)
        restored_database = "mip_shadow_restore_" + uuid.uuid4().hex
        self.addCleanup(lambda: run("postgres", "drop database if exists " + restored_database + " with (force)"))
        dump_and_restore_database(self.database, restored_database)
        self.assertEqual(logical_restore_fingerprint(restored_database), source_fingerprint)

        restored_a = Session(restored_database, RUNTIME_A)
        restored_b = Session(restored_database, RUNTIME_B)
        restored_recovery = Session(restored_database, RECOVERY)
        self.sessions.extend([restored_a, restored_b, restored_recovery])
        self.assertEqual(restored_a.execute(completed_statement), "completed")
        with self.assertRaisesRegex(RuntimeError, "query returned no rows|mip_shadow_runtime_session_not_authorized"):
            restored_b.execute(self.claim_sql(self.runtime_a, self.session_a, str(uuid.uuid4())))
        with self.assertRaisesRegex(RuntimeError, "permission denied"):
            run(restored_database, "select * from collector_shadow_private.jobs;", "anon")
        restored_claim = self.claim(restored_a, request=str(uuid.uuid4()))
        self.assertEqual(restored_claim["generation_id"], pending_generation)
        self.assertEqual(
            run(restored_database, "select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relnamespace='collector_shadow_private'::regnamespace and relkind='r'"),
            "t",
        )
        prior_recovery_id = int(run(restored_database, "select max(id) from collector_shadow_private.recovery_events"))
        run(restored_database, "update collector_shadow_private.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id=" + sql_quote(processing["generation_id"]))
        self.assertEqual(
            restored_recovery.execute("select collector_shadow_control.requeue_expired(" + sql_quote(processing["generation_id"]) + ",1);"),
            "requeued",
        )
        self.assertEqual(run(restored_database, "select count(*) from collector_shadow_private.recovery_events"), "4")
        self.assertGreater(
            int(run(restored_database, "select max(id) from collector_shadow_private.recovery_events")),
            prior_recovery_id,
        )

    def test_zz_postgresql_restart_preserves_committed_history_and_acl(self):
        claim = self.claim(self.a)
        request = str(uuid.uuid4())
        self.assertEqual(self.a.execute(self.complete_sql(claim, request)), "completed")
        for client in self.sessions:
            client.close()
        self.sessions.clear()
        restart_postgres_service()
        replay = self.session(RUNTIME_A)
        self.assertEqual(replay.execute(self.complete_sql(claim, request)), "completed")
        self.assertEqual(self.admin("select state||':'||(select count(*) from collector_shadow_private.outputs) from collector_shadow_private.jobs"), "completed:1")
        self.assertEqual(self.admin("select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relnamespace='collector_shadow_private'::regnamespace and relkind='r'"), "t")


if __name__ == "__main__":
    create_cluster_roles()
    version = run("postgres", "show server_version;")
    if not version.startswith("17."):
        raise SystemExit("PostgreSQL 17 required, got " + version)
    print("MIP_SHADOW_PG_VERSION=" + version, flush=True)
    print("MIP_SHADOW_CONTRACT_SHA256=" + CONTRACT_SHA256, flush=True)
    print("MIP_SHADOW_FIXTURES=synthetic_only;no_live_access;former_demo_excluded", flush=True)
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(CollectorShadowPostgres)
    )
    raise SystemExit(0 if result.wasSuccessful() else 1)
