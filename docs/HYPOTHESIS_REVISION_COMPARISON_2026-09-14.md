# Saved hypothesis revision comparison — isolated implementation

The owner’s versioned assessment specification requires users to inspect how a saved assessment differs from its predecessor. The current history selector could show each record separately but did not provide a field-by-field comparison.

The private history now offers an explicit expandable comparison between the selected completed revision and its exact predecessor. It reuses the existing permission-checked backend history and backlog response; no additional source body, material retrieval, external model request or permission record is created.

## Meaning and authority

- The recorded revision trigger, reason and outcome are shown as saved statements, not inferred or recomputed by a diff.
- Comparison/rationale/limitations, method/model, knowledge boundary, hypothesis definitions and separate likelihood/confidence, evidence versions/spans/quality/origins/clocks, argument relations/relevance/links, assumptions, gaps and change tests are compared separately.
- Omitted evidence means absent from the selected assessment, not deleted from the backend. Changed references do not establish source-content changes, and reordered IDs are not additional independent corroboration.
- Missing estimates stay missing. No averaged score, probability, calibration, semantic threshold or label is created.
- Both revisions must be available, valid, linked and within the same investigation. A withheld record or pending permission change on either side suppresses all comparison content. Existing parent account/scope/refresh/access guards apply. This is presentation of a permission-checked response, not a browser rights authority or a guarantee of instantaneous notification of future revocation.
- A pending non-permission change remains pending. Comparing completed revisions does not complete reassessment, acknowledge review, authorize restoration or approve publication.
- The expanded view renders literal saved text; it does not activate links, fetch URLs or interpret HTML. Previous reasoning is not rendered into the collapsed disclosure.

The existing panel historyMode property also now rejects as_known_then rather than allowing a caller property to assert historical committed availability. This complements the shared-selector correction at 2bb961b. Actual historical visibility remains unimplemented.

## Verification

New helper/UI regressions cover exact values without mutation; separate method/reason changes; omitted evidence; likelihood/confidence separation; invalid/duplicate/cross-investigation/predecessor failures; permissions on both sides; pending changes; key/array order; initial versions; lazy disclosure; revoked expanded comparison; inert saved markup; parent refresh/logout clearing and direct historical-property rejection.

The hosted Chromium/WebKit test exercises the actual history/comparison UI at 1280, 768, 390 and 320 pixels, keyboard disclosure, responsive bounds, omission wording, a pending-permission race and denied refresh. Synthetic screenshots stay in existing sanitized hosted test evidence. The new comparison fixture is explicitly a display mechanism, not a newly accepted native reassessment, source-rights finding or semantic qualification.

Exact-candidate CI results must be observed before these changes are reported verified. Existing authority, worker/recovery, D4/D5, permission and World View assertions remain required. No independent review is commissioned for this component alone.

## Remaining full-feature requirements

Trustworthy historical commit visibility and production-shaped provider/runtime/Auth verification remain open. The internal client-handler-store-worker path passed synthetically at 18a0a0c; actual provider identity, custody and live deployment remain separately gated. F2/approved assessment methodology remains owner-gated. A saved diff is not the full semantic engine or the coherent independent-review boundary.

PR153 remains draft/unmerged. Production cutover remains ON HOLD. No production changes, credentials, schedules, publication, CC retrieval, source admission, external disclosure, local project-file storage or history rewriting.
