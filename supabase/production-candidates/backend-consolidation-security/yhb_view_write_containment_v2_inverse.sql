-- PROPOSED INVERSE FOR INSPECTION/ISOLATED TESTS ONLY.
-- Not authorization to restore unsafe browser writes.
-- Restores only explicit INSERT/UPDATE/DELETE to anon/authenticated, grantor
-- postgres, without grant option. No PUBLIC or service_role change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog;
DO $preflight$
DECLARE item record; target oid; actual_hash text; expected_count integer; role_name text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Expected recorded grantor postgres'; END IF;
  FOR item IN SELECT * FROM (VALUES
      ('authors_public','85b594b03bd556c44c0efa7c27db2f39baf1b298800a1519c2a9e3329301dbc4'),
      ('comparison_public','4621f3b62f3d06669a230720b6a0d1cde13afeaff1f606cea589eb589ef86208'),
      ('graph_coverage_public','3022b89c6cb0f50ee4028b16521677b1605d3f511202794e8eb1d189dd19278e'),
      ('news_detail_public','3ec939e813ba2032314d795bcaac410544d6cb16c925dd95010c6ce1ba0d2f00')
    ) AS expected(name,sha256)
  LOOP
    target := to_regclass('public.' || item.name);
    IF target IS NULL THEN RAISE EXCEPTION 'Missing view %', item.name; END IF;
    SELECT encode(sha256(convert_to(pg_get_viewdef(target,true),'UTF8')),'hex') INTO actual_hash;
    IF actual_hash <> item.sha256 THEN RAISE EXCEPTION 'Definition drift: %', item.name; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=target AND relkind='v'
      AND relowner='postgres'::regrole
      AND reloptions @> ARRAY['security_barrier=true','security_invoker=false']
      AND cardinality(reloptions)=2)
    THEN RAISE EXCEPTION 'Owner/options drift: %', item.name; END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target AND coalesce(cardinality(attacl),0)>0)
    THEN RAISE EXCEPTION 'Unexpected column grants: %', item.name; END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=target AND NOT tgisinternal)
      OR EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class=target AND rulename <> '_RETURN')
    THEN RAISE EXCEPTION 'Unexpected view write rule/trigger: %', item.name; END IF;
    -- Exact normalized ACL: four explicit roles, postgres grantor, no PUBLIC/options.
    IF (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=target) <> (CASE WHEN item.name='graph_coverage_public' THEN 32 ELSE 26 END)
      OR EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
        WHERE c.oid=target AND (a.grantee NOT IN ('postgres'::regrole,'anon'::regrole,
          'authenticated'::regrole,'service_role'::regrole) OR a.grantor <> 'postgres'::regrole
          OR (item.name <> 'graph_coverage_public' AND a.grantee IN ('anon'::regrole,'authenticated'::regrole) AND a.privilege_type IN ('INSERT','UPDATE','DELETE')) OR a.is_grantable OR a.privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')))
    THEN RAISE EXCEPTION 'ACL drift: %', item.name; END IF;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name AND (rolsuper OR rolbypassrls))
      OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname <> role_name AND pg_has_role(role_name,oid,'MEMBER'))
    THEN RAISE EXCEPTION 'Unexpected browser inherited authority: %', role_name; END IF;
  END LOOP;
END
$preflight$;
GRANT INSERT, UPDATE, DELETE ON TABLE
 public.authors_public, public.comparison_public, public.news_detail_public
TO anon, authenticated;
COMMIT;
