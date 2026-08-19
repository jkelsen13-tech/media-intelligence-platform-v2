-- Explicit owner holds distinguish scope-sensitive exclusions from ordinary unreviewed candidates.
-- This applies only to the isolated v2 sandbox review ledger.

ALTER TABLE public.cross_surface_candidates
  DROP CONSTRAINT IF EXISTS cross_surface_candidates_review_state_check;

ALTER TABLE public.cross_surface_candidates
  ADD CONSTRAINT cross_surface_candidates_review_state_check
  CHECK (review_state IN ('pending', 'approved', 'rejected', 'owner_hold'));

COMMENT ON COLUMN public.cross_surface_candidates.review_state IS
  'Review-gated candidate state. owner_hold is reserved for an owner decision when Callais/redistricting classification remains uncertain; it never propagates to live surfaces.';
