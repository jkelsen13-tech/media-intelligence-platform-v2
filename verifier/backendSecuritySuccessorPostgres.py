"""Native view definitions with skeletal dependency tables and synthetic rows.
No live constraints, triggers, workers or production rows are reproduced.
Runs only through the existing disposable CI harness and its fixed loopback DSN.
"""
import json
from backendSecurityContainmentPostgres import run, invoke, expect_denied, ROOT

VIEWS = ("authors_public", "comparison_public", "news_detail_public")
ALL_VIEWS = VIEWS + ("graph_coverage_public",)

def catalog(database):
    return run(database, """
SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',r.rolname,
 'definition',pg_get_viewdef(c.oid,true),'options',c.reloptions,
 'acl',(SELECT jsonb_agg(jsonb_build_array(g.rolname,h.rolname,a.privilege_type,a.is_grantable)
   ORDER BY g.rolname,h.rolname,a.privilege_type)
   FROM aclexplode(c.relacl) a LEFT JOIN pg_roles g ON g.oid=a.grantee
   LEFT JOIN pg_roles h ON h.oid=a.grantor)) ORDER BY c.relname)::text
FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
WHERE c.relnamespace='public'::regnamespace AND c.relkind='v';
""")

def qualify_yhb_successor(database):
    fixture = json.loads((ROOT / "qualification/yhb_native_views.json").read_text())
    grouped = {}
    for col in fixture["columns"]:
        grouped.setdefault(col["relname"], []).append('"' + col["attname"] + '" ' + col["type"])
    for name, cols in grouped.items():
        run(database, f'CREATE TABLE public."{name}" (' + ",".join(cols) + ")")
    for view in fixture["views"]:
        name = view["relname"]
        run(database, f"CREATE VIEW public.{name} WITH (security_barrier=true,security_invoker=false) AS " + view["definition"])
        actual = run(database, f"SELECT encode(sha256(convert_to(pg_get_viewdef('public.{name}'::regclass,true),'UTF8')),'hex')")
        assert actual == view["sha256"], (name, actual)
        run(database, f"GRANT ALL PRIVILEGES ON public.{name} TO anon,authenticated,service_role")
    run(database, """
CREATE VIEW public.unrelated_probe AS SELECT 17 AS value;
GRANT SELECT ON public.unrelated_probe TO anon;
INSERT INTO public.authors(id,name) VALUES ('00000000-0000-0000-0000-000000000001','Synthetic author');
INSERT INTO public.articles(id,outlet) VALUES
 ('00000000-0000-0000-0000-000000000001','Synthetic one'),
 ('00000000-0000-0000-0000-000000000002','Synthetic two');
INSERT INTO public.events(id,canonical_title,status,comparison_validation_state) VALUES
 ('00000000-0000-0000-0000-000000000001','Synthetic event','active','approved');
INSERT INTO public.event_articles(event_id,article_id) VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
""")
    before = catalog(database)
    read_before = {(role,view):run(database,f"SET ROLE {role}; SELECT row_to_json(v) FROM public.{view} v; RESET ROLE")
                   for role in ("anon","authenticated","service_role") for view in ALL_VIEWS}
    # Prove actual native-view write paths on disposable synthetic rows.
    operations = {
      "authors_public": ["INSERT INTO public.authors_public(id,name) VALUES ('00000000-0000-0000-0000-000000000003','probe')",
                         "UPDATE public.authors_public SET name='probe' WHERE id='00000000-0000-0000-0000-000000000001'",
                         "DELETE FROM public.authors_public WHERE id='00000000-0000-0000-0000-000000000001'"],
      "comparison_public": ["INSERT INTO public.comparison_public(canonical_title) VALUES ('probe')",
                            "UPDATE public.comparison_public SET canonical_title='probe'",
                            "DELETE FROM public.comparison_public"],
      "news_detail_public": ["INSERT INTO public.news_detail_public(article_id) VALUES ('00000000-0000-0000-0000-000000000003')",
                             "UPDATE public.news_detail_public SET article_id='00000000-0000-0000-0000-000000000003' WHERE article_id='00000000-0000-0000-0000-000000000001'",
                             "DELETE FROM public.news_detail_public WHERE article_id='00000000-0000-0000-0000-000000000001'"],
    }
    for role in ("anon","authenticated"):
        for view, queries in operations.items():
            for sql in queries:
                run(database, f"BEGIN; SET ROLE {role}; {sql}; ROLLBACK")
    candidate = (ROOT / "yhb_view_write_containment_v2.sql").read_text()
    inverse = (ROOT / "yhb_view_write_containment_v2_inverse.sql").read_text()
    # Fail closed on independent column ACL and PUBLIC drift, without consuming them.
    run(database,"GRANT UPDATE(name) ON public.authors_public TO anon")
    assert invoke(database,candidate).returncode != 0
    run(database,"REVOKE UPDATE(name) ON public.authors_public FROM anon")
    run(database,"GRANT UPDATE ON public.authors_public TO PUBLIC")
    assert invoke(database,candidate).returncode != 0
    run(database,"REVOKE UPDATE ON public.authors_public FROM PUBLIC")
    run(database,candidate)  # Exact unchanged candidate with native fingerprint preflight.
    for role in ("anon","authenticated"):
        for view,queries in operations.items():
            for sql in queries:
                expect_denied(database,f"BEGIN; SET ROLE {role}; {sql}; ROLLBACK",view)
    for view,queries in operations.items():
        for sql in queries:
            run(database,f"BEGIN; SET ROLE service_role; {sql}; ROLLBACK")
    read_after = {(role,view):run(database,f"SET ROLE {role}; SELECT row_to_json(v) FROM public.{view} v; RESET ROLE")
                  for role in ("anon","authenticated","service_role") for view in ALL_VIEWS}
    assert read_before == read_after
    for role in ("anon","authenticated","service_role"):
        for view in ALL_VIEWS:
            for privilege in ("SELECT","TRUNCATE","REFERENCES","TRIGGER","MAINTAIN"):
                assert run(database,f"SELECT has_table_privilege('{role}','public.{view}','{privilege}')") == "t"
    after=json.loads(catalog(database)); original=json.loads(before)
    assert [x for x in original if x["name"] not in VIEWS] == [x for x in after if x["name"] not in VIEWS]
    run(database,inverse)
    assert json.loads(before) == json.loads(catalog(database))
    print("MIP_YHB_NATIVE_VIEW_DEFINITION_HASHES=pass",flush=True)
    print("MIP_YHB_SUCCESSOR_BROWSER_DML_DENIED=pass",flush=True)
    print("MIP_YHB_SUCCESSOR_READS_SERVICE_ROLE_UNCHANGED=pass",flush=True)
    print("MIP_YHB_SUCCESSOR_EXACT_NORMALIZED_ACL_INVERSE=pass",flush=True)
    print("MIP_YHB_NATIVE_CONSTRAINT_TRIGGER_WORKER_COMPATIBILITY=not_reproduced",flush=True)
