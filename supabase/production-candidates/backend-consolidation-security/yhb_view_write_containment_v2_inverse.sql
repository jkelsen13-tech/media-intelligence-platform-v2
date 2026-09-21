-- PROPOSED INVERSE FOR INSPECTION/ISOLATED TESTS ONLY.
-- Not authorization to restore unsafe browser writes.
-- Restores only explicit INSERT/UPDATE/DELETE to anon/authenticated, grantor
-- postgres, without grant option. No PUBLIC or service_role change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=public,pg_catalog;
DO $preflight$
DECLARE item record; target oid; actual_hash text; expected_count integer; role_name text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Expected recorded grantor postgres'; END IF;
  FOR item IN SELECT * FROM (VALUES
      ('authors_public','85a0b484707e6381578d1320733138ac354c8e4f6666107f535d9c0286d6b707'),
      ('comparison_public','8b00f4d68b6d99f5f9815189cbbd744a78febac403fa4c5208a341325f5191ee'),
      ('graph_coverage_public','d44945be5f15bb88a06a0480d61c3f2f91b2c951ab30bac4c70d458ee669c348'),
      ('news_detail_public','3d6087c8d6680cbaa387397ec19e8ca1f14dfa0f585378a4e295db2c31a87ed4')
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
