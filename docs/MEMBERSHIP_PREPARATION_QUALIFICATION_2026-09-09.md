# Complete prepared membership worker qualification

Package: supabase/runtime-snapshots/source-comparison-run-v13.
Base main: ac9941349462242c3fddce109287c9de7d25d097.
This combines PR #125 complete observed-input fingerprints with PR #126 per-event
feature preparation. The client is pinned to 2.110.0, also used by the isolated
qualifier. Historical snapshots, evidence, scoring arithmetic, release policy,
projection behavior and queue acknowledgement remain unchanged.

## Verified isolated runtime

Source worker remained ACTIVE v11 with JWT verification while membership-qualification
v1 was deployed independently with JWT verification and no schedules. The exact
four-file qualification package was read back byte for byte; bundle:
f01a914a31de7f85a7414e86b9763dc5f9947205bd69f329a12c1bb7a4b75d49.

At 2026-09-09T05:16:04.856152Z, net requests 9452/9453 returned 401 for anonymous
and public-JWT-only requests. Request 9454 rejected a write-shaped request with 400.
Authenticated request 9455 returned 200: 160 candidates, 1,034 memberships, largest
cluster 312, all 104,568 directed pairs; 88 rejected and 72 candidate clusters;
zero auto-approval candidates; policies disabled with null threshold. Prepared
scoring took 553.137279 ms wall time. Ordered complete-score digest:
8a6c8e0a1914f4702517e570383b5720318081676f5e7b7619133952ad597982.
The qualifier returns counts/digests, no article payload, member scores or secrets.

Current-head unit/build and complete preview checks, merge review, full-worker
deployment/dry-run equality and post-merge live checks are still required before
calling the integrated release complete. The isolated result demonstrates this
observed workload completed, not a universal CPU bound or an atomic retained read.

## Invariants and scope

All directed peer comparisons remain. Token sets/embeddings are prepared once per
member occurrence and never cached across calls. Complete-output differential tests
cover missing/malformed inputs, duplicate IDs, corrected data, frozen observations,
all existing scorer counterexamples and heterogeneous synthetic corpora. Full input
fingerprints distinguish changed event anchors, summaries, bodies, embeddings,
timestamps and release inputs while keeping historical rows untouched. Fingerprints
are digests of observed inputs, not retained captures or authenticity proofs.

The prior HTTP 546 was observed on the unchanged worker, not this package. Synthetic
speedups do not prove its sole root cause. The complete package still needs live
authenticated qualification and persistence remains governed by existing append-only
history/release contracts. No publication or auto-approval gate is enabled.

The known broad pending-queue acknowledgement race is separate and remains pending.
Collector cutover requires immutable generations, durable generation-bound outputs,
conditional acknowledgement, retry/interleaving tests and operational/history parity.
This scorer change neither fixes nor newly introduces that race.

Recorded-time lighting adapters, polar coverage, Markets trusted identity/rights/
publication integration, physical-device measurement and backend consolidation remain
pending. No legacy backend is safe to retire. No local files were created.
