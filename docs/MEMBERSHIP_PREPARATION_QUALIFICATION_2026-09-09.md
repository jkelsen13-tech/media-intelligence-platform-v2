# Membership preparation qualification — not deployed

The unchanged production v11 worker returned HTTP 546 in the authenticated
membership dry run recorded on PR #125. This isolated candidate reduces repeated
feature preparation without changing peer coverage, scoring weights, thresholds,
anchor checks or approval decisions. It has no runtime caller or deployment entrypoint.

Base: ac9941349462242c3fddce109287c9de7d25d097.
The qualification lib starts from the exact live v11 lib retained in
supabase/runtime-snapshots/source-comparison-run-v10/lib.js. The old snapshot remains
unchanged. Changes are limited to per-invocation article feature preparation,
prepared pair inputs and the scorer's local preparation map.

Each observed member retains its position, including duplicate IDs. Token sets and
parsed embeddings are prepared once per occurrence, then discarded with the call.
No cache keyed by article ID can survive a correction. All directed peer comparisons
remain; no member, large cluster or signal is truncated. Canonical anchor scoring
remains unchanged. No confidence recalibration or semantic accuracy claim is made.

Tests compare complete outputs against the exact baseline: existing counterexamples,
invalid/missing thresholds, malformed/missing evidence, duplicate IDs, corrected
objects, frozen inputs, seeded heterogeneous corpora and a synthetic 312-member
cluster. Instrumentation checks 40 embedding preparations instead of 3,120 with
all 1,560 directed pairs preserved. CI timing is diagnostic, not an Edge-runtime SLA.

Read-only preflight on 2026-09-09 confirms ACTIVE v11, verify_jwt=true,
bundle 0c393ce15730271e158d204b060ecbdd072d28d4aeee48fcb81ad85bf7b2e5a6.
At 05:01:22.072574Z both membership release policies still had fixture_passed=true,
auto_approval_enabled=false and null threshold.

## Remaining release gate

This is an isolated qualification library, not a complete worker package. Before
production use, combine with the exact reviewed current worker and PR #125 input
fingerprint contract; qualify a bounded authenticated execution path on complete
observed inputs. Node synthetic timings do not prove the HTTP 546 cause or resolution.
The worker still needs a generation-bound durable output/acknowledgement contract;
retries and overlapping producers must not mark unseen changes successful.

Supabase documents a 2-second CPU limit per request:
https://supabase.com/docs/guides/functions/limits (checked 2026-09-09).
No paid capacity, schedule, deployment, migration, retained payload, publication,
credentials or browser access changes are part of this candidate.

Independent work remains pending: recorded-time renderer adapter before sunlight,
polar terrain qualification, Markets canonical identity and trusted publication/
rights integration, physical-device measurement and full backend consolidation.
No legacy backend is safe to retire. No files were created on the owner's device.
