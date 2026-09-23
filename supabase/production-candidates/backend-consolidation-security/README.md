# Backend containment readiness — active record

Status: **completed live units preserved; residual authorization findings remain partitioned**.

This file records current state. Superseded candidates and failing reproductions
remain preserved in Git history but are not readiness authority.

## Completed units — do not repeat or reopen

- Yhb three-view browser-write containment was separately authorized, applied,
  and verified. It removed anon/authenticated INSERT, UPDATE and DELETE from
  `authors_public`, `comparison_public` and `news_detail_public` while
  preserving intended reads and service-role access.
- Yhb `backfill-legacy` v10 and nie `policy-ingest` v17 use the separately
  authorized, unchanged deny-all handler and were read back and verified with
  `verify_jwt=true`. Source-forward recovery remains the accepted standard;
  the vulnerable handlers must not be restored automatically.
- The five-function yhb staged-GDELT EXECUTE containment was separately authorized, applied as migration `20260921162451_contain_yhb_gdelt_browser_execute_20260921`, and verified. Current direct EXECUTE is postgres/service_role only; anon, authenticated and PUBLIC are denied. Its earlier qualification evidence is historical.
- The yhb `public.mip_retract_arc_membership_projection(uuid)` browser EXECUTE containment was separately authorized, applied once as migration `20260921175457_contain_yhb_arc_projection_retract_browser_execute_20260921`, and verified. Anon/authenticated/PUBLIC are denied; postgres/service_role and the enabled internal trigger remain intact. The earlier count of 22 browser-executable SECURITY DEFINER functions per browser role is historical; the immediate postflight count was 21.
- Qik private predicates remain `KEEP_WITH_JUSTIFICATION`.

These completed operations do not authorize any further live change.

## Held historical candidates

- `qik_private_predicate_revoke.sql` is incompatible with populated public-read
  dependencies and remains held.
- The combined 27-function yhb candidate is over-broad and remains held.
- Its SELECT-only view quarantine was incomplete; the successor three-view
  containment above superseded that portion.
- The bundled historical rollback definitions are inaccurate and remain held.

## Five-function staged-GDELT containment

Live application status: **APPLIED AND VERIFIED** as one coupled ACL unit under separate owner authorization.

Exact targets:

- `public.mip_v2_gdelt_stage_batch(text,jsonb)`
- `public.mip_v2_gdelt_materialize_batch(text,integer)`
- `public.mip_v2_gdelt_attach_batch(text,integer)`
- `public.mip_v2_gdelt_originate_batch(text,integer)`
- `public.mip_v2_gdelt_close_staging(text)`

The applied successor removed only the ten explicit EXECUTE entries for `anon` and
`authenticated`. PUBLIC remains absent. It preserved `postgres`, `service_role`,
owners, function definitions, memberships, and every non-target privilege.

- Candidate blob: `7690dfb43bf0ef67eb354935724bcfbd3b19a4b2`
- Candidate SHA-256: `b9eee98c2cc00957a77b1f730fa482fc6051effe092bac25b0dbcd8f9ea997ac`
- Candidate length: 714 UTF-8 bytes
- Inverse blob: `3069a090ba0c7f27cf0156ddece7b0d8834d1d91`
- Inverse SHA-256: `d0d8a2259400e1f80278e3aefc8b971e397f6c91b19b1072b819ab49140b89eb`
- Inverse length: 704 UTF-8 bytes

The exact native definitions contain no writer-key, JWT, user-ownership, or
`current_user` authorization check. Fresh catalog evidence records postgres
ownership, `SECURITY DEFINER`, `search_path=public, pg_temp`, direct
postgres/anon/authenticated/service_role EXECUTE grants without grant options,
and no PUBLIC grant.

Retained `pg_stat_statements` evidence observed at
`2026-09-21T07:59:14.404737Z` (statistics reset
`2026-08-18T08:45:50.769278Z`) shows top-level postgres calls for all five:
stage 15, materialize 28, attach 28, originate 7, close 1. The repository
operator generator also produces control-plane SQL. No current cron, inspected
Edge package, workflow, or stored function refers to the five targets. This
supports the known postgres operator path; it does not prove permanent absence
of external callers.

## Isolated qualification

Passing run `35575699417`, job `106256969001`, tested exact head
`bacf8d737bf93e648a117c24411d5afb74abfa5d`.

The disposable PostgreSQL 17.6 harness:

- installs the exact current native target bodies captured from yhb;
- verifies live native body hashes plus full definition, result,
  arguments/defaults, language, owner, definer mode and search path;
- reproduces anon and authenticated writes before the candidate;
- denies every target to both browser roles after the candidate;
- preserves postgres and service-role execution, PUBLIC absence, memberships,
  target definitions and non-target function ACLs;
- exercises state ordering through stage, close, materialize, attach, originate
  and completion on synthetic empty-selection data;
- proves row-idempotent duplicate staging (the requested counter intentionally
  increments) and forced-transaction rollback of rows/counters;
- executes the exact inverse, restores normalized explicit ACL entries,
  grantors and grant-option state, then reapplies the candidate.

The harness cannot install production pgvector and does not exercise
data-bearing materialization/attachment/origination or the native
membership/comparison trigger graph. Those omissions prevent worker-semantic,
pipeline-validation and operational claims. They do not expand authority or
change this ACL-only candidate.

## Projection-retraction containment — completed

Live application status: **APPLIED AND VERIFIED** under separate owner authorization.

The exact qualified candidate removed only explicit anon/authenticated EXECUTE
from `public.mip_retract_arc_membership_projection(uuid)`. PUBLIC remains
absent. Postgres/service_role execution, the enabled postgres-owned
state-change trigger, definitions, search paths, role memberships and every
non-target ACL fingerprint were preserved.

- Migration: `20260921175457_contain_yhb_arc_projection_retract_browser_execute_20260921`
- Candidate blob: `cdc7e531c7490c37417780027dba7bdcd1f315a6`
- Candidate SHA-256: `a1b5f940fd7a45666c7aac544b1c275c1b6b28d33e0f58db598cf2d1e86abf98`
- Target definition SHA-256: `232c921ca5c157da976cd25b70f59fa0fa6364a0fe437092d5c4a55ba87d3023`
- Trigger definition SHA-256: `ddeb2f97ad70b568c66770782f9fc7a724c7feebb0c9d810e409ab52ff9d0569`
- Negative role checks: anon/authenticated received PostgreSQL `42501`
  without executing the function body.
- Fresh postflight advisors reduced the relevant count from 22 to 21 per
  browser role and excluded the target.
- Private receipt commit: `287514de511ea01c281e9cafd5bf01ea0c9b40c4`;
  blob `8eae3d8581bb18e0e56ef72eb452bda6d5c8d4ca`.

The inverse remains unapplied recovery evidence and is not permission to
restore browser access.

## Bounded native canonical-path qualification

Status: **PASS for the bounded portable synthetic segment; not a complete
canonical or hosted-pipeline qualification**.

At code head `e1816b8d49d961888b9017ea3b6552cc2cb8ec0b`, tree
`93f8d10d71988d6f3ae3428d335b2dc61b8b23bd`, integrated run
`35648523721`, native job `106494809370` passed. The existing deterministic
literal extractor generated two pending literal claims from 216 original
synthetic UTF-8 bytes, then the unchanged native `mip_pipeline_v1` migration
persisted capture, identity, candidates, job events and version history.

The lane verified duplicate/retry/rollback/reconnect/stale-lease/correction
behavior, exact Unicode spans, pending-only review state and private/public
denials. A checksummed plain dump was restored into a separate isolated
database; eight row hashes and the native function-definition fingerprint
matched after scoped current-authority revocation.

- Input SHA-256: `fd357bc7ff7646368600db86a009133b51ba99d9bb22e2b6157592455a8dec81`
- Migration SHA-256: `e4c5a47f57788b1ff73daf05d62f060eb1adeebdcba391f4384f72c0e70bdedd`
- Dump SHA-256: `55b75e1e10ef3b823cc0f9151fdb8374b159f58a007abb89964cf8b6b1083bc7`
- PostgreSQL image digest:
  `00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`
- Private receipt/input custody commit:
  `90bc84f3fedf7736274714c1d1a203a95c85601d`.

For that historical synthetic run, the dump was deleted after the rehearsal, global roles were shared across the
two databases, and durable dump custody remains unproved. Real retained input,
semantic evaluation, downstream reconsideration, comparison/graph/temporal/
investigation stages, hosted Auth/pooler/gateway/Edge/Storage/Realtime and
predecessor recovery remain unqualified.

## Successor bounded real-material restore receipt

The later sanitized [restore-only follow-up](https://github.com/jkelsen13-tech/mip-production-qualification/blob/e543e2b3577257662730a6a25f357edb74970c05/real-material/restore-only/restore-followup-20260922.md)
records bounded D PASS at code `c3efcd6262f2df623298abd44576321d67fc2081`,
run `35756083004`, job `106842090223`. It supersedes the absence of
real-material restore evidence for that bounded segment, not the historical
synthetic run's own limits. The original D failure remains historical; a
different diagnostic failure is not retrospectively classified as passing.

This section read only the sanitized receipt. It did not retrieve the retained
artifact, reacquire input, repeat the canary or restore, extend retention, or
reopen completed containment. Bounded restore success does not establish full
pipeline operation, hosted Supabase behavior, or predecessor retirement readiness.

## Recovery and live gate

Recovery status: **VERIFIED_IN_ISOLATION** for the freshly recorded normalized
ACL state. The inverse is evidence, not permission to restore browser access.

Historical staged-GDELT live authorization required a fresh check of project, signatures,
definitions, ACLs, memberships and caller state and executed the unchanged candidate
as the recorded grantor `postgres`; and verify browser denial plus preserved
postgres/service-role authority without invoking live mutators. If an unexpected
required caller fails, preserve containment and request the smallest secure
repair. Do not automatically run the inverse, regrant browser access, substitute
service-role credentials, or alter any unrelated object.

This unit does not establish system-wide security, authority consolidation,
pipeline validation, live pipeline operation, cutover readiness or retirement
readiness.
