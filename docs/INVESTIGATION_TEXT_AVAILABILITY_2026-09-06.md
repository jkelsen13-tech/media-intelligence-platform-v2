# Evidence gaps and retained text availability

This batch follows merged and deployed PR #58. Evidence Gaps previously returned early when no collection declaration existed, hiding unresolved questions that were still recorded in the saved state. Collection declarations, unresolved questions and retained-text availability now render independently.

## Behavior and boundaries

- The inventory describes only the selected observation's retained input fields. Mutually exclusive groups show body text, summary without body, title/label only, and no retained title/label/summary/body. Whitespace-only and non-string fields are missing for this purpose. URL, outlet and source-status metadata do not stand in for evidence text. Original payloads are unchanged.
- Body presence does not establish full publisher text. Counts include captures and record versions separately; they do not measure source independence, truth, confidence or collection completeness. Analyst declarations remain separate from these observable field counts. Missing declarations never suppress unresolved questions.
- Reuse the saved-input identity validation and exact decimal positions, including bigint values. Duplicate positions or ambiguous/missing capture/record identities are excluded explicitly. An unavailable bundle differs from a valid snapshot with no usable inputs.
- Each nonempty group opens on request, initially showing ten records. Inspection uses the existing retained-input inspector and binds investigation, version, observation and exact position. No live record is substituted. Unsafe URLs retain the existing plain-text treatment.
- Opening groups and inspecting records run locally and write no review or assessment. Disclosure, paging and inspector state reset on version changes; sign-out and revoked access use the existing workspace teardown. No new endpoint, migration or backend deployment is required.

## Verification

Six new tests cover field partitioning, Unicode/whitespace preservation, display-label fallback, ambiguous identities, empty/unavailable distinctions, historical isolation, lazy paging, exact selection and actual workspace lifecycle. The frontend regression verifies the previously hidden unresolved question inside Evidence Gaps with an empty coverage array.

The existing real PGlite integration test now corrects an article and removes its summary. It verifies that the new record version is title-only while the original capture and earlier article revision retain their summaries. Historical snapshots remain unchanged; outsider and revoked access are denied, and no review or assessment is written. Thirteen focused tests and nine adjacent linked-reasoning/version-navigation tests pass locally. Three older workspace test files fail to load on Windows because they import bare drive-letter paths; they are included in Linux CI. Full regression and production build are checked there because prior full local builds reached Windows virtual-memory limits.

Synthetic browser verification exercises the actual workspace, client and authenticated handler with fixture Auth/RPC responses: desktop, 390px and 320px layouts; keyboard disclosure; ten-to-twenty paging; exact missing-text input inspection; unsafe URL handling; no-declaration/unresolved-question presentation; and reset from thirty current inputs to seven historical inputs. No browser console errors were observed. Preview files remain ignored and are not production data.

PR #58's Pages deployment and live signed-out private boundary were verified. A populated signed-in production view remains unverified; no sample analyst records or assignments were inserted into production for this batch.

## Release

After explicit approval and successful current-head CI, merge and verify Pages and the actual live access boundary. This batch makes collection limits inspectable; it does not run external retrieval, measure real-world coverage or evaluate claim correctness.
