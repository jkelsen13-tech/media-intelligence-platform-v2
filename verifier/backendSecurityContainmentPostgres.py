"""Executable ACL qualification for the backend-containment candidates.

This harness is deliberately pinned to the disposable GitHub Actions PostgreSQL
service. It never accepts a supplied DSN and cannot target a live database.
"""
import os
import re
import subprocess
import uuid
from pathlib import Path

if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("MIP_DISPOSABLE_POSTGRES") != "comparison-qualification":
    raise SystemExit("Only the explicit disposable GitHub Actions PostgreSQL service is allowed")

ENV = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
ENV.update(PGPASSWORD="mip-disposable-ci-only", PGCONNECT_TIMEOUT="5",
           PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=5000")
BASE = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
        "-h", "127.0.0.1", "-p", "5432", "-U", "postgres"]
ROOT = Path("supabase/production-candidates/backend-consolidation-security")
YHB = (ROOT / "yhb_browser_authority_containment.sql").read_text()
QIK = (ROOT / "qik_private_predicate_revoke.sql").read_text()
ROLLBACK = (ROOT / "yhb_browser_authority_containment_rollback.sql").read_text()
PUBLIC_SIGNATURES = set(re.findall(
    r"GRANT EXECUTE ON FUNCTION (public\.[a-z0-9_]+\([^;]*\)) TO PUBLIC;",
    ROLLBACK,
))
TRIGGERS = {
    "articles_source_status_propagate", "handle_new_mip_user",
    "mip_arc_membership_projection_state_change", "mip_intercept_direct_arc_attachment",
    "mip_invalidate_arc_membership_approvals", "mip_queue_source_comparison_enrichment",
    "mip_touch_arc_membership_candidate", "mip_v2_apply_article_claim_auditability",
    "mip_v2_promote_deterministic_article_claims_after_insert",
}

def invoke(database, sql):
    return subprocess.run(BASE + ["-d", database], input=sql, text=True,
                          capture_output=True, timeout=30, env=ENV)

def run(database, sql):
    result = invoke(database, sql)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()

def expect_denied(database, sql, object_name):
    result = invoke(database, sql)
    assert result.returncode != 0, f"{object_name}: operation unexpectedly succeeded"
    assert "permission denied" in result.stderr.lower(), result.stderr

def ensure_roles():
    run("postgres", r"""
SELECT format('CREATE ROLE %I', role_name)
FROM (VALUES ('anon'), ('authenticated'), ('service_role'), ('authenticator')) AS wanted(role_name)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
\gexec
ALTER ROLE service_role BYPASSRLS;
ALTER ROLE authenticator NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;
""")

def yhb_fixture(database):
    signatures = re.findall(r"'(public\.[a-z0-9_]+\([^']*\))'", YHB)
    assert len(signatures) == 27, signatures
    statements = [
        "CREATE TABLE public.trigger_probe(id integer, touched boolean NOT NULL DEFAULT false)",
        "CREATE TABLE public.owner_rows(id integer PRIMARY KEY)",
        "CREATE VIEW public.authors_public WITH (security_barrier=true) AS SELECT id FROM public.owner_rows",
        "CREATE VIEW public.comparison_public WITH (security_barrier=true) AS SELECT id FROM public.owner_rows",
        "CREATE VIEW public.news_detail_public WITH (security_barrier=true) AS SELECT id FROM public.owner_rows",
        "CREATE VIEW public.graph_coverage_public WITH (security_barrier=true) AS SELECT count(*)::bigint AS total FROM public.owner_rows",
    ]
    for signature in signatures:
        name = signature.split(".", 1)[1].split("(", 1)[0]
        if name in TRIGGERS:
            statements.append(
                f"CREATE FUNCTION {signature} RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER "
                "SET search_path='' AS $$ BEGIN NEW.touched := true; RETURN NEW; END $$")
        else:
            statements.append(
                f"CREATE FUNCTION {signature} RETURNS boolean LANGUAGE sql SECURITY DEFINER "
                "SET search_path='' AS $$ SELECT true $$")
        statements.append(f"REVOKE EXECUTE ON FUNCTION {signature} FROM PUBLIC, anon, authenticated, service_role")
        statements.append(f"GRANT EXECUTE ON FUNCTION {signature} TO anon, authenticated, service_role")
        if signature in PUBLIC_SIGNATURES:
            statements.append(f"GRANT EXECUTE ON FUNCTION {signature} TO PUBLIC")
    statements.extend([
        "CREATE TRIGGER containment_trigger BEFORE INSERT ON public.trigger_probe "
        "FOR EACH ROW EXECUTE FUNCTION public.handle_new_mip_user()",
        "GRANT INSERT, SELECT ON public.trigger_probe TO authenticated",
        "GRANT ALL PRIVILEGES ON public.authors_public, public.comparison_public, "
        "public.graph_coverage_public, public.news_detail_public TO anon, authenticated, service_role",
        "CREATE FUNCTION public.untouched() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$",
        "CREATE VIEW public.unrelated_view AS SELECT 1 AS value",
        "GRANT EXECUTE ON FUNCTION public.untouched() TO anon",
        "GRANT SELECT ON public.unrelated_view TO anon",
    ])
    run(database, ";\n".join(statements) + ";")
    return signatures

def fingerprint(database):
    return run(database, r"""
SELECT md5(string_agg(item, E'\n' ORDER BY item))
FROM (
  SELECT p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) || ':' ||
         coalesce(array_to_string(p.proacl, ','), '<default>') AS item
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='untouched'
  UNION ALL
  SELECT c.oid::regclass::text || ':' || md5(pg_get_viewdef(c.oid, true)) || ':' ||
         coalesce(array_to_string(c.relacl, ','), '<default>')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='unrelated_view'
) AS preserved;
""")

def qualify_yhb(database):
    signatures = yhb_fixture(database)
    untouched_before = fingerprint(database)
    definitions_before = run(database, r"""
SELECT count(*)::text || ':' ||
       md5(string_agg(n.nspname || '.' || p.oid::regprocedure::text || ':' ||
                      pg_get_functiondef(p.oid), E'\n'
                      ORDER BY n.nspname, p.oid::regprocedure::text))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef;
""")
    assert definitions_before.split(':', 1)[0] == "27", definitions_before
    assert len(PUBLIC_SIGNATURES) == 14, PUBLIC_SIGNATURES
    run(database, YHB)
    for signature in signatures:
        for role in ("anon", "authenticated"):
            assert run(database, f"SELECT has_function_privilege('{role}', '{signature}', 'EXECUTE')") == "f"
        assert run(database, f"SELECT has_function_privilege('service_role', '{signature}', 'EXECUTE')") == "t"
    run(database, "SET ROLE authenticated; INSERT INTO public.trigger_probe(id) VALUES (1); RESET ROLE")
    assert run(database, "SELECT touched FROM public.trigger_probe WHERE id=1") == "t"
    for view in ("authors_public", "comparison_public", "graph_coverage_public", "news_detail_public"):
        expect_denied(database, f"SET ROLE anon; SELECT * FROM public.{view};", view)
        assert run(database, f"SELECT has_table_privilege('service_role','public.{view}','SELECT')") == "t"
    run(database, "SET ROLE anon; INSERT INTO public.authors_public(id) VALUES (7); RESET ROLE")
    assert run(database, "SELECT count(*) FROM public.owner_rows WHERE id=7") == "1"
    assert run(database, "SELECT has_table_privilege('anon','public.authors_public','INSERT')") == "t"
    definitions_after = run(database, r"""
SELECT count(*)::text || ':' ||
       md5(string_agg(n.nspname || '.' || p.oid::regprocedure::text || ':' ||
                      pg_get_functiondef(p.oid), E'\n'
                      ORDER BY n.nspname, p.oid::regprocedure::text))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef;
""")
    assert definitions_after.split(':', 1)[0] == "27", definitions_after
    assert definitions_before == definitions_after
    assert untouched_before == fingerprint(database)
    print("MIP_YHB_EXACT_CANDIDATE_EXECUTED=pass", flush=True)
    print("MIP_YHB_BROWSER_EXECUTE_REVOKED_SERVICE_ROLE_RETAINED=pass", flush=True)
    print("MIP_YHB_GENERIC_TRIGGER_EXECUTION_AFTER_REVOKE=pass", flush=True)
    print("MIP_YHB_RESIDUAL_UPDATABLE_VIEW_INSERT=confirmed", flush=True)

def qik_fixture(database):
    run(database, r"""
CREATE SCHEMA mip_private;
CREATE FUNCTION mip_private.arc_event_candidate_is_approved(uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT $1 = '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION mip_private.arc_has_approved_membership(uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT $1 = '00000000-0000-0000-0000-000000000001'::uuid $$;
REVOKE ALL ON FUNCTION mip_private.arc_event_candidate_is_approved(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION mip_private.arc_has_approved_membership(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA mip_private TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mip_private.arc_event_candidate_is_approved(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mip_private.arc_has_approved_membership(uuid) TO anon, authenticated, service_role;
CREATE TABLE public.arc_events(id uuid PRIMARY KEY);
ALTER TABLE public.arc_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY arc_events_public_algorithmic_read ON public.arc_events
FOR SELECT TO anon, authenticated USING (mip_private.arc_event_candidate_is_approved(id));
GRANT SELECT ON public.arc_events TO anon, authenticated;
CREATE TABLE public.arc_milestones(id uuid PRIMARY KEY);
ALTER TABLE public.arc_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY arc_milestones_public_algorithmic_read ON public.arc_milestones
FOR SELECT TO authenticated USING (mip_private.arc_has_approved_membership(id));
GRANT SELECT ON public.arc_milestones TO authenticated;
CREATE VIEW public.arc_milestones_public WITH (security_barrier=true)
AS SELECT id FROM public.arc_milestones WHERE mip_private.arc_has_approved_membership(id);
GRANT SELECT ON public.arc_milestones_public TO anon, authenticated;
INSERT INTO public.arc_events VALUES
('00000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000002');
INSERT INTO public.arc_milestones VALUES
('00000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000002');
""")

def qualify_qik(database):
    qik_fixture(database)
    assert run(database, "SET ROLE anon; SELECT count(*) FROM public.arc_events; RESET ROLE") == "1"
    assert run(database, "SET ROLE authenticated; SELECT count(*) FROM public.arc_milestones; RESET ROLE") == "1"
    before = run(database, r"""
SELECT md5(string_agg(p.oid::regprocedure::text || ':' || pg_get_functiondef(p.oid), E'\n'
                      ORDER BY p.oid::regprocedure::text))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='mip_private';
""")
    run(database, QIK)
    assert run(database, "SELECT has_function_privilege('service_role','mip_private.arc_event_candidate_is_approved(uuid)','EXECUTE')") == "t"
    assert run(database, "SELECT has_function_privilege('service_role','mip_private.arc_has_approved_membership(uuid)','EXECUTE')") == "t"
    expect_denied(database, "SET ROLE anon; SELECT count(*) FROM public.arc_events;", "arc_events RLS")
    expect_denied(database, "SET ROLE authenticated; SELECT count(*) FROM public.arc_milestones;", "arc_milestones RLS")
    expect_denied(database, "SET ROLE anon; SELECT count(*) FROM public.arc_milestones_public;", "arc_milestones_public")
    after = run(database, r"""
SELECT md5(string_agg(p.oid::regprocedure::text || ':' || pg_get_functiondef(p.oid), E'\n'
                      ORDER BY p.oid::regprocedure::text))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='mip_private';
""")
    assert before == after
    print("MIP_QIK_EXACT_CANDIDATE_EXECUTED=pass", flush=True)
    print("MIP_QIK_POPULATED_PUBLIC_READ_REGRESSION=confirmed", flush=True)

def main():
    from backendSecuritySuccessorPostgres import qualify_yhb_successor
    ensure_roles()
    for label, qualifier in (("yhb", qualify_yhb), ("qik", qualify_qik), ("yhb_successor", qualify_yhb_successor)):
        database = f"mip_containment_{label}_{uuid.uuid4().hex}"
        run("postgres", f"CREATE DATABASE {database}")
        try:
            qualifier(database)
        finally:
            run("postgres", f"DROP DATABASE {database}")

if __name__ == "__main__":
    main()
