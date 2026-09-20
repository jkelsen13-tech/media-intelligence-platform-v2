-- DO NOT APPLY WITHOUT THE OWNER'S PRODUCTION-SECURITY AUTHORIZATION.
-- Target: qikvmopbtijoebdqosyq only.
-- Purpose: remove unnecessary browser/PUBLIC execution from private predicates.
-- This candidate changes grants only. It contains no row DML and no object drop.

BEGIN;

DO $$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'mip_private.arc_event_candidate_is_approved(uuid)',
    'mip_private.arc_has_approved_membership(uuid)'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NULL THEN
      RAISE EXCEPTION 'preflight failed: missing function %', signature;
    END IF;
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION
  mip_private.arc_event_candidate_is_approved(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  mip_private.arc_event_candidate_is_approved(uuid)
TO service_role;

REVOKE EXECUTE ON FUNCTION
  mip_private.arc_has_approved_membership(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  mip_private.arc_has_approved_membership(uuid)
TO service_role;

COMMIT;

-- Exact rollback, if a verified required caller fails:
-- GRANT EXECUTE ON FUNCTION mip_private.arc_event_candidate_is_approved(uuid)
--   TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION mip_private.arc_has_approved_membership(uuid)
--   TO PUBLIC, anon, authenticated;
