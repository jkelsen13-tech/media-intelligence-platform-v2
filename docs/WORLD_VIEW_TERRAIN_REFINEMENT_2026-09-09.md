# Bounded terrain refinement — PR #129

World View now offers Coarse, Neutral and Fine terrain refinement as an explicit
custom display choice. The adapter writes only the public Cesium 1.145
Globe.maximumScreenSpaceError property: 4, 2 and 1 respectively. The engine
default is 2. This drives globe level of detail, including associated imagery;
it does not improve evidence precision or add source detail.

Source reference: https://github.com/CesiumGS/cesium/blob/1.145/packages/engine/Source/Scene/Globe.js
The existing terrain provider retains fully-contained approved Ohio coverage,
network zoom levels 8–15, provenance-header validation and honest ellipsoid
fallback. No provider, dependency, camera, clock, evidence or publication
contract changed. Unknown values are rejected without coercion; property-write
failure latches unavailable and attempts neutral cleanup.

Master/category off and unsupported fallback mask the remembered custom choice
to Neutral. All presets retain Neutral. A supported terrain category can be
mixed when relief is on and refinement is Neutral. Defaults preserve the
existing relief-on presentation. The UI discloses increased request/memory/render
cost; it does not present Fine as a source-quality upgrade.

## Qualification evidence

Candidate 60e1573714f07ddfc55da8ddb0bbe9678d54e7cf passed all 1,546 tests
and builds on Node 22/24 in run 34351324050. Browser job 102465050444 in run
34351324309 passed real approved terrain in Chromium/WebKit at 1280/390 pixels.
The exact request URLs, provider statuses, screenshots and backend boundary
receipts are in that job's logs. No source payload or screenshot file is stored
locally.

| Browser / width | Coarse terrain / imagery | Fine terrain / imagery | Fine elapsed ms |
| --- | ---: | ---: | ---: |
| Chromium / 1280 | 1 / 5 | 54 / 57 | 14629 |
| Chromium / 390 | 2 / 7 | 15 / 27 | 7131 |
| WebKit / 1280 | 1 / 5 | 54 / 42 | 9648 |
| WebKit / 390 | 2 / 7 | 15 / 27 | 3442 |

Measurements are sequential Neutral→Coarse→Fine→Neutral on a warm scene in a
shared CI runner. Elapsed time includes settling and screenshot work. These are
observations, not cold-cache benchmarks, frame rates, memory measurements,
physical-device qualification or general performance guarantees. Neutral after
Fine made no additional requests in this sequence. All observed terrain fetches
succeeded with no source rejection, transport failure or page error.

Screenshots show visible level-of-detail/imagery-label differences at the same
camera; pixel inequality alone is not a quality score. Desktop and phone controls
fit their viewport, and remounted maps retain Fine. Assertions cover the same
camera/canvas/route, frozen recorded-lighting state, request-render mode, gate
memory, Graph masking, remount and every preset. The final verifier additionally
asserts successful terrain HTTP responses, zero transport failures and zero
provider failures/rejections. Separate preview/live jobs preserve the existing
full regression job and its 12-minute timeout.

Initial qualification failures are retained in run 34350911844 / Golden
34350911868. The architecture test needed this exact renderer module registered;
provider/token bans remain active. The WebKit remount assertion sampled an
in-flight subject camera. Waiting for the existing 1.8-second flight before
comparison passed; no product camera behavior or comparison tolerance changed.

The final commit still requires complete preview regression before merge, then
exact merged-tree/build/deployment verification and both full live jobs. PR
closeout records those later results; this document does not pre-claim them.

## Independent backend reconciliation and pending work

The existing private importer retained 228 further collector row versions.
See [retention note](COLLECTOR_HISTORY_RETENTION_2026-09-08.md) and
[exact manifest receipt](../verifier/backend-collector-delta-2026-09-09-1215.json).
No source worker, schedule, queue acknowledgement or publication state changed.

The earlier intermittent WebKit terrain-worker import error remains unproven.
Recorded-timestamp verification now emits document time-origin and lifecycle
diagnostics around worker creation/errors and page transitions. It does not
suppress errors, filter failures or change engine workers. This diagnostic
addition is not a claim that the error is fixed.

Physical-device performance, remaining deferred visual effects, trusted Markets
readers/assets, complete historical parity and generation-fenced collector
cutover remain pending. No legacy backend is safe to retire.
