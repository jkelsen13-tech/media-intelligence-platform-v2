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

## Residual projection-retraction candidate

Live application status: **UNAPPLIED — ISOLATED QUALIFICATION PENDING**.

The highest-risk independently understood residual function is
`public.mip_retract_arc_membership_projection(uuid)`. It directly marks a
projection run retracted and deletes associated edges, sources, arc events and
nodes. It has no caller-authorization or candidate-state check. The located
legitimate path is the postgres-owned state-change trigger; no supported
browser caller was found.

The successor candidate removes only explicit anon/authenticated EXECUTE and
preserves postgres/service_role plus the internal trigger chain. The exact
inverse reconstructs the freshly recorded direct ACL and is recovery evidence,
not automatic regrant authorization. Native-definition qualification uses
synthetic rows and records omitted dependencies.

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
