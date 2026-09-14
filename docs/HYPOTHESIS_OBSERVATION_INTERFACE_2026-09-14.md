# Personal committed-observation interface — isolated candidate, 2026-09-14

Production cutover remains ON HOLD. Observation epochs install disabled. This package does not activate the CC batch, publication, real material disclosure, provider access, production Auth or any live database change.

## Behavior and dependency

The existing 015 committed-observation protocol is extended by 016_observation_delivery.sql. A personal list returns committed receipts for the authenticated reader, investigation and enabled current epoch. The gateway receives verified identity; callers cannot supply a database principal. The worker has no list, capture, read or table privilege. Current membership is checked before listing. The read v2 response includes the exact retained non-content reference serialization so the interface verifies its SHA-256 and revision membership before showing a confirmed view.

The interface performs no capture or list on mount. Recording requires explicit action. A lost acknowledgement retains the exact request in memory for explicit retry; a fresh server read and hash validation are required before success. After browser/process restart, the personal server list recovers committed observations without browser persistence or a replacement capture. The native list test kills the client process after commit. The browser test recreates its component and HTTP transport against a labelled synthetic remote-store simulation; it is not provider restart certification.

The recorded prefix never absorbs later revisions. The current permission reader still governs each open. Newly withheld content clears the view and propagates access failure to the history container. Originally withheld content remains unavailable. This is a saved observation interval, not arbitrary-time history, restored-history qualification or proof of continuous historical coverage. No missing estimate is converted to a score.

## Verification sources

- tests/hypothesisObservations.test.mjs: exact bytes, malformed and foreign receipts, committed readback, reference membership, no automatic calls, exact retry after lost acknowledgement, restart lookup, duplicate click, late account response, current withholding and original withholding.
- tests/hypothesisObservationFixture.mjs: explicitly synthetic contract-only records.
- verifier/hypothesisPostgresConcurrency.py: existing 82 native cases plus three list/restart/privacy/isolation cases.
- verifier/hypothesis-worker/worker.test.mjs: actual isolated HTTP-handler-parameterized-store-worker integration now validates v2 readback hash and list; worker escalation denied.
- verifier/hypothesis-browser/run.mjs: Chromium and WebKit, 1280/768/390/320 widths; reserved in-process synthetic HTTP, lost acknowledgement, same-request retry, fresh committed readback, component/transport recreation, list recovery and current denial clearing; no external network.

CI results must be reported against the exact commit; this document does not predeclare them successful. Preserve the earlier 81/82 fixture failure and corrected 82/82 checkpoint 8fc52cd5f6d75db76ca443f6b1ebc3e19b7cd617.

## Remaining gates and classification

Implemented here for isolated candidate review: personal committed-observation delivery and UI. Independent review remains outstanding; this batch alone does not establish the coherent boundary.

Engineering still open: restore/clone/import epoch handling and legacy provenance qualification; explicit configured application Auth lifecycle/provider boundary; bounded-scale delivery where limits require pagination; complete candidate manifest and targeted review after the material package is coherent.

Owner-gated production decisions remain the previously recorded exact runtime/identity/custody and trial configuration choices. No new credential is needed for these remote synthetic regressions. No production secret or principal is invented. F2 methodology and actual material permissions remain separate.

This interface does not independently block backend retirement without an established migration dependency. Whole-backend data, Auth, storage, caller/job, recovery and billing reconciliation remain separate from the 11-material inventory and this feature. October 3 is a target, not a demonstrated retirement date.
