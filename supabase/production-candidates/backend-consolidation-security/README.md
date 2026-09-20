# Backend-consolidation security containment candidates

Status: **prepared, reviewed, not applied, not deployed**

These files are an owner-gated response to live authorization findings. They do
not authorize themselves. They contain no row DML, source/scheduler change,
credential value, project pause, deletion, retirement, or billing action.

## Live evidence

- yhb `backfill-legacy` v9 package SHA-256:
  `5cd76641e068fb512c9d0815f9d35325a9806be11593829df1daf62f87de8f68`.
  A gateway-valid anon JWT reaches a service-role implementation; `?reset=1`
  can destroy/rebuild analytical state.
- yhb exposes the 27 exact SECURITY DEFINER signatures in
  `yhb_browser_authority_containment.sql` to browser roles.
- yhb owner-executed `news_detail_public` exposes noneligible rows and claim
  surfaces; the same candidate quarantines all four reviewed owner views
  pending caller verification.
- nie `policy-ingest` v16 package SHA-256:
  `f18ec228daf35dd5001a436c1299a1229bab32fcc1657179bf44d0ef5c6143ef`.
  A gateway-valid anon JWT reaches service-role external-fetch/write behavior.
- qik's two private arc predicates do not require browser/PUBLIC execution.

## Application order after explicit authorization

1. Capture current Edge definitions, function/view ACLs, row counts, hashes,
   active jobs, and negative/positive auth baselines.
2. Deploy temporary deny-all versions of yhb `backfill-legacy` and nie
   `policy-ingest`; do not merely rely on `verify_jwt`.
3. Apply the yhb grant/view candidate. Its preflight aborts the whole
   transaction if a signature/relation drifted or a function is no longer
   SECURITY DEFINER.
4. Apply the qik predicate candidate.
5. Verify anon/auth Edge requests fail; browser RPCs are permission denied;
   dedicated workers still pass; qik public projections retain intended reads;
   and row counts/hashes are unchanged.
6. Rerun security advisors and complete external caller verification before
   retaining the narrowed grants.
7. Roll back only the exact failed grant if a verified required caller breaks.

## Later Edge re-enable contract

A later owner-secret re-enable is separate from immediate containment. The
function must reject non-POST requests and compare a dedicated secret header
before creating a service-role client, reading configuration, fetching any
external source, or starting work. See `edge_function_auth_gates.md`.

Do not activate a scheduler, source, provider, publication path, or new paid
service in this change.
