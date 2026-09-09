# Recorded dynamic atmosphere lighting — qualification candidate

This batch adds an optional calculated atmosphere-lighting choice. It uses the
public Cesium 1.145 Globe.dynamicAtmosphereLighting boolean and the existing
frozen recorded clock. The SDK documents that this property takes effect only
when globe lighting is enabled:
https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Scene/Globe.js

The profile additionally requires either Ground atmosphere or Distance haze.
Selecting the choice never enables a dependency. The checkbox remembers the
choice while the description and applied state disclose a masked effect.
Master/category/renderer gates preserve memory; every preset keeps it off.
Sun-directed atmosphere remains deferred and false.

The clock controller tracks its own expected dynamic-property state. A foreign
property state cannot qualify lighting; rejected writes latch unavailable and
disable lighting. Applying a timestamp resets the effect before the current
profile replays. Invalid/date-only time disables it without exposing a substitute
instant. Source timestamp text and precision remain unchanged; the renderer's
millisecond clock is display-only. Camera, terrain source/refinement policy,
fog culling/density, evidence and publication contracts are outside this change.

Unit counterexamples cover dependency loss, unchanged source/camera/frozen clock,
strict boolean inputs, idempotence, rejected writes, invalid-time reset, remembered
profile gates and neutral presets. The focused real-browser verifier compares
off/on pixels at a fixed planetary pose, requires zero settled terrain/imagery
requests, preserves camera/canvas/clock/fog/refinement, checks dependencies,
remount and presets in Chromium/WebKit at desktop and phone widths.

The focused verifier follows terrain refinement in the existing independent
qualification job. The full previous regression job and its timeout remain
intact. Actual qualification, final-head checks, merged-tree/deployment and live
results must be recorded on PR #130; this candidate document does not pre-claim
success or physical-device performance. No new provider, fee, evidence claim or
local file is introduced.

## Collector reconciliation checkpoint — 9 September 2026

At 13:08–13:09 UTC all four Supabase projects were ACTIVE_HEALTHY. Manus
source-comparison-run remains ACTIVE v12, verify_jwt=true, bundle
32a5a6dc412dca5c020b3dcc66f737771cf98f74a50ee017143c363f2a01f9ba.
All four files exactly match supabase/runtime-snapshots/source-comparison-run-v13/.
The directory name is package lineage, not the deployed version.

The producer mip_queue_source_comparison_enrichment still upserts one row per
event and replaces enqueued_at with transaction now(), resetting processing
fields. Its pg_get_functiondef SHA-256 is
88679e25721009ea4893870e2e3848957d8a1c99b4b456e0d110aaf69164ccb5.
The worker's broad pending-state acknowledgement remains unchanged. IDs or
timestamps alone cannot certify immutable processed generations.

Both Manus schedules remain active at */5. Both membership policy versions
sc-v2-membership-2026-08-23.4 and .5 retain auto_approval_enabled=false and
auto_approval_threshold=null. The five legacy operational tables are present
with RLS on Manus and absent on the survivor. Survivor has RLS-enabled immutable
record/assessment/change-job/retrieval and private collector-history tables;
those are not drop-in equivalents for legacy workers.

The prior 9,135-row bounded history parity receipt remains historical evidence.
It does not prove ongoing replication, complete overwritten history, operational
equivalence or retirement readiness. Next integration still needs a version-bound
comparison input/output contract, durable semantic output and transactional
conditional acknowledgement before schedule cutover. This checkpoint changed no
database, schedule, runtime, queue, policy or credential. No legacy backend is
safe to retire.

## Executable legacy timestamp counterexample

The isolated collectorLegacyGenerationCounterexample test loads the exact
recovered producer definition from a test-only fixture and a narrowed compatible
schema. Two validation-state revisions in one transaction produce identical
queue metadata because now() is transaction-stable. An event-ID plus enqueued_at
conditional update then demonstrably acknowledges the newer revision using the
older observation. This asserts an unsafe counterexample, not desired worker
behavior. The fixture does not emulate the full publication/schema contract or
execute the production worker. It rolls back and never contacts Supabase.

Together with the existing survivor generation-isolation test, this distinguishes
a demonstrated inadequate legacy fence from the immutable survivor transport
foundation. It does not implement durable comparison output or certify cutover.
