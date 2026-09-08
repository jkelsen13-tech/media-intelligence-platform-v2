# Comparison recovery and authoritative read boundary

A failed comparison read previously displayed an unavailable notice alongside
an absence claim and offered no retry. Rejected reads used the same default
availability heading as verified empty coverage.

The view now separates loading, unavailable, unconfigured and confirmed empty
states. An accessible Retry comparison button reissues the shared public read;
obsolete requests cannot replace a newer backend. A changed investigation is
respected when a pending retry completes. Partial records accompanying an error
never render. Errors without a message remain failures at the backend adapter.

Only comparison_public is read. No fallback to legacy hosts, operational
configuration or private claims is added. Membership/publication gates, opaque
identities, provenance, explanation objects and scoring semantics are unchanged.
No database, worker, schedule or security policy is modified by this batch.

Regression tests cover failed/partial reads, retry, changed scope, obsolete
responses, synchronous rejection, missing error text and unconfigured service.
The preview and post-deployment browser verifier injects HTTP failure only,
then restores a real public read on the surviving project. Both Chromium and
WebKit check keyboard retry, subject preservation and four responsive widths.
No synthetic comparison records are published. Test and live outcomes are
recorded in the pull request after execution.

The final backend consolidation gate remains INCOMPLETE. See
[the ten-part report](BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md).
Active legacy collectors and the remaining data/history, Auth, spatial and
external-service dependencies still prevent a single-backend completion claim.
