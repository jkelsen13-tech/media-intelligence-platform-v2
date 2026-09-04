# Verifier v1 — Stage D visual-continuity repair (2026-09-05)

Measures whether the owner-visible terrain defect around Cleveland is diagnosed and repaired per the pasted authorization.

## Acceptance criteria
1. PREFLIGHT-EVIDENCE: live WebGL session at canonical Cleveland URL records terrain status, accepted/rejected tile counts, exact source headers, and same-camera screenshots (terrain on vs forced ellipsoid). City camera floor verified exactly 34641.016151377546 m.
2. DIAGNOSIS: root cause classified into one of the prompt's enumerated causes, evidenced (not asserted).
3. REPAIR-CONSTRAINTS: no invented heights; no zero-fill of missing/failed/unapproved tiles; no change to precision_class/event geometry/canonical state/deep links; city floor unchanged; no ion/paid/Supabase/global-source expansion; no unlabeled exaggeration.
4. PROCESS: narrow repair branch, PR (no direct push to main), merge only after all checks pass. If PR unavailable -> stop and report blocker.
5. TESTS: full suite green; new tests for the actual defect (fail-closed unknown headers, camera-floor no-regression, terrain-vs-ellipsoid renderer assertion where reliable); CI green.
6. LIVE-ACCEPTANCE: post-deploy walk captures the 10 labeled evidence items from the prompt; plain statement whether before/after difference is visible to an ordinary user.
7. DOCS: Stage D closeout addendum updated only after code+CI+deploy+live evidence pass; prior defect history preserved.
8. SCOPE: no Stage E, navigation polish, assets, buildings, glTF, Supabase work, R5/R6, geoid re-encoding, object-storage mirroring, global-terrain expansion, Cesium ion, paid providers. CDEM only if all licensing conditions verified from primary sources.
