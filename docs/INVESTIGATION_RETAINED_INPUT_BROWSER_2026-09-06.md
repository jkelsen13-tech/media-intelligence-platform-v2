# Retained input browser

This batch follows merged and deployed PR #57. Source History now contains a collapsed browser for all usable retained inputs, including record versions and captures without an article identity that cannot participate in grouped capture comparisons. The existing comparisons remain visible without opening the browser.

## Scope and behavior

- Search runs locally only after form submission, over the selected observation's retained title, summary, body text, label, outlet, URL and source-status strings. It uses a literal case-insensitive substring after NFC normalization, with a 200-character query limit. Stored source text remains unchanged. It does not search notes, assessment rationale, identifiers, other observations, current database rows or the web.
- Input-type filtering separates source captures and record versions. Clear resets both the phrase and filter. Results initially show ten rows, with explicit expansion. Counts describe matching input records, not occurrences, independent sources or claim strength.
- Sort positions as positive decimal strings, preserving values above JavaScript's safe-integer limit. Never merge inputs by source URL, title or text. Entries with duplicate positions, missing identifiers, or ambiguous capture/record identity are excluded with an explicit count. Missing searchable fields stay distinct from a no-match result and can be browsed after clearing the filters.
- Inspection binds investigation, version, observation and position. It resolves only the selected bundle, shows retained metadata and dates, and reuses the exact-record/context display. Unsafe retained URLs remain plain text. No current-record fallback is permitted.
- Query, filter, expansion and inspector state remain in memory. Changing the saved version resets the browser and inspector; sign-out/revocation uses the existing workspace teardown. Search and inspection do not send requests, create observations, run checks, reassess claims or write review receipts.
- The signed-in workspace continues to load the data through its existing authenticated handler and service-only RPC. There is no new endpoint or schema change.

## Verification

Seven new tests cover literal/Unicode matching without source mutation, exact bigint positions, input kinds, missing and ambiguous records, paging, clear/filter behavior, bounded selection, unsafe URLs and actual workspace lifecycle integration. A real PGlite test uses existing migrations to retain an original capture and a later article record version. It proves the later title is absent from the earlier saved observation, both record types remain searchable in the later version, old snapshots stay unchanged, and no review or assessment is written. Viewer access works; outsiders and revoked assignments are denied.

The 16 adjacent Source History, input-reference and changed-span tests also pass locally. Full regression and production builds are checked in Linux CI; prior full local builds reached Windows virtual-memory limits.

Synthetic browser checks cover desktop and 390px/320px mobile layouts, Enter-key submission, type filtering, no-match feedback, exact record-version/capture inspection, Unicode input, a 200-character unbroken query, clearing filters and query reset after historical navigation. There was no horizontal overflow or browser console error. Preview files are ignored and excluded from production.

PR #57's Pages deployment and signed-out live private boundary were verified. Populated signed-in production search remains unverified for this batch; no example analyst records were inserted into production.

## Release

After approval and successful current-head CI, merge and verify the Pages deployment. No Supabase function or migration deployment is required. This is a saved-input finder, not an external retrieval engine or an evidence-quality assessment.
