# Backend containment readiness — active record

Status: **held originals; isolated successors require fresh review and explicit live authorization**.

The earlier README and PR wording are historical evidence, not readiness authority.
The diagnostic PostgreSQL tests deliberately reproduce two failures: qik's
original predicate revoke breaks populated public reads, and yhb's SELECT-only
quarantine leaves browser writes through updatable views. Successful diagnostic
execution does not approve either candidate for production.

## Current units

- Edge `backfill-legacy` and `policy-ingest`: reuse the qualified deny-all source,
  blob `4d32d8438993cd3fca187e6e1ecd181906873af1`, SHA-256
  `0d44074b2fc0ed8c02d7f5bf0d2e170a07fb81eace3ba6920936f795e625012c`.
  Each endpoint is independent. Exact private before-state custody, fresh package
  identity/gateway preflight and review are required before requesting deployment.
  This continuation does not authorize deployment.
- qik original `qik_private_predicate_revoke.sql`: **incompatible and held**.
  Keep the limited helper interface; see `qik_private_predicate_review.md`.
- yhb original combined `yhb_browser_authority_containment.sql`: **incomplete and
  held**. SELECT revocation does not remove INSERT/UPDATE/DELETE. Function grants
  require separate caller classification; no all-27 readiness claim is made.
- yhb successor `yhb_view_write_containment_v2.sql`: isolates the demonstrated DML
  route on three updatable views, retaining SELECT and service-role privileges.
  It does not cure any existing read-disclosure issue or change graph_coverage.
- Both original rollback definitions are inaccurate. The yhb original omits
  explicit browser grants for functions also granted to PUBLIC; qik adds PUBLIC
  where the recorded pre-state had none. Preserve these bytes as failing evidence.
  The successor inverse is proposed for inspection and isolated qualification,
  never automatic restoration.

## Scope and qualification

The original SQL files and failing diagnostic tests remain preserved.
The successor pins native view definitions, owners, options, normalized ACL shape,
absence of column/PUBLIC grants and browser role memberships, plus bounded
timeouts. Its executable test uses those native view definitions against skeletal
dependency tables and synthetic rows. Native constraints, triggers and actual
worker runs are not reproduced by that test. Test output must retain this limit.

Do not invoke vulnerable live mutators. No production SQL, Edge deployment,
credential/source/scheduler change, cutover, retirement or merge is authorized.
On required-caller failure preserve containment and propose a secure repair;
do not restore unsafe code or grants to obtain passing tests.

The authoritative readiness receipt must name the tested commit and CI result,
fresh security review, custody evidence, caller limitations and exact unit scope.
Security containment does not establish authority consolidation, isolated
pipeline validation or operation of the authorized live pipeline.
