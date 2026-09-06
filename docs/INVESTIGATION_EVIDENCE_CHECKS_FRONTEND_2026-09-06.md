# Cursor frontend implementation: three connected evidence sections

Start from the latest `main` containing PR #43 (`c52c4c8`) and preserve all three of its commits' behavior, especially stable request dependencies and rejection of stale history/inspector updates. Create one draft PR for this batch. Register the supplied exact backend files and implement these three connected sections within the existing Private Investigation Workspace.

## User experience

1. **Source Links:** show possible shared-source pairs with the basis in plain language. Display both retained source references and offer the existing inspector for each. State that source independence and transmission direction are unresolved. Same article/URL indicates related captures, not necessarily syndication. Exact repeated text may be boilerplate or a common quotation. Do not draw directional lineage arrows or label an outlet independent.
2. **Evidence Checks:** show correction/withdrawal language and separately label recorded source-status notices. Open exact saved references in the inspector. Explain that the cues need contextual review. Do not turn a word match into a contradiction, retraction verdict, confidence change, or changed commitment outcome.
3. **Search Coverage:** show how many saved inputs and text fields were checked, pair inputs/pairs compared, missing bodies, unsupported record types, explicit exclusions, and results found versus shown. State that external retrieval was not run and the vocabulary is English only. Keep this measured report distinct from the existing analyst-declared Coverage records.

Use the existing visual language, readable narrow layouts, progressive disclosure and accessible controls. Put one shared **Run evidence checks** action above the three sections. It is available only to reviewers when this version has no report. Run is explicit; reads, tab changes, refreshes, inspector opens and renders must never trigger it. Do not re-enable it to imply another search when a report is already saved. A reviewer may inspect or run checks for an explicitly displayed historical version; label it clearly. Do not mark the investigation reviewed as a side effect.

The signed-out/unassigned states remain calm and empty. A saved report with zero cues is distinct from **Checks have not been run for this saved version**. Loading, unavailable, denied, partially scanned, and result-truncated states must be distinct. Do not render a green “evidence verified” state. Never populate an empty live workspace with fixture data.

## Data wiring and request lifecycle

Use `createInvestigationEvidenceChecksClient(supabase)` from `src/lib/investigationEvidenceChecksClient.js`; memoize the client. Both `.read(investigationId, versionId)` and `.run(investigationId, versionId)` return `{data, error}`. Require an explicit version from the displayed workspace bundle. The adapter targets the already-live `investigation-evidence-checks` function; no browser-side service credentials or direct RPC/table reads.

Keep a request generation for the selected Auth session, investigation, version and observation. Only load checks after the workspace bundle for that exact selection is accepted. `investigationEvidenceCheckPanels(workspace, checks)` returns null for a mismatched investigation/version/observation. Use that guard **before publishing any response to a section or inspector**, and retain the request-generation guard too: the pure mapper cannot by itself detect an abandoned request for the same version/session.

On logout, account change, selection change, access denial or disposal, invalidate reads and writes and clear private check results/inspector content immediately. A delayed read/run from an abandoned selection must not repopulate panels, open an inspector, or display an error for the new selection. If an explicit run completed on a now-hidden version, it may remain safely saved on the server; its response must still be discarded locally. Subsequent selection of that version can read it. This is not a failed database rollback.

Avoid effect dependencies on fresh objects/function instances. One selection change should produce one bounded read. A user-triggered retry is allowed; no continuous effect loop, blind automatic write retry, or duplicate run button submissions. Preserve PR #43's conflict recovery, current review baseline, history request guards and selection ownership.

Use exact text references with the existing Unicode resolver against the matching snapshot. A metadata cue has no text excerpt: verify its position and source-status value against the retained article record version and render a metadata view. Do not fabricate offsets or fetch current source text as its historical witness. A stale or unresolved witness should show an unavailable message. Technical IDs/offsets belong in details rather than dominating the primary user flow. Resolve source titles/outlets from saved inputs. Any source URL rendered as a link must pass the application's existing HTTP(S) URL safety checks; render all source text as text, not HTML.

## Required acceptance evidence

- Preserve the existing Golden suite and build. Include the supplied backend tests unchanged.
- Exercise actual React mounting and request completion: reviewer run -> one report feeds all three sections; viewer read -> no run control; not-run and zero-result reports remain distinct.
- Demonstrate session/logout, investigation/version switch, and a delayed history/run response after an inspector selection changed. Neither panels nor inspector may accept the discarded response.
- Verify exact Unicode cue highlighting, metadata notices, two-sided source witnesses, partial pair scope, truncated result counts, no auto-review, no auto-run and no fabricated independence/contradiction labels.
- Inspect desktop and narrow layouts, keyboard navigation and error/empty states. Report which signed-in populated behaviors used isolated fixtures and which were actually exercised against an assigned real investigation.
- Report the exact final commit SHA, test totals, build result, changed files and any live limitation. Open a draft PR for review; do not merge it.

## File handling

The handoff ZIP is deliberately flat. `MANIFEST.json` maps each upload filename to its exact repo path and SHA-256. SQL upload names end `.sql.txt`; restore `.sql`. The Edge entrypoint is `index.ts.txt`; restore `supabase/functions/investigation-evidence-checks/index.ts`. `.mjs`, `.js`, `.md`, and `.json` already have their correct types. Preserve the file bytes when restoring names. Do not implement `.txt` copies as source files. Handoff/prompt/manifest files are instructions, not application code.
