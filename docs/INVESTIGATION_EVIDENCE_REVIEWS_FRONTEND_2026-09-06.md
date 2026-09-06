# Cursor: integrate evidence decisions, review progress and history together

Base: PR #44 on main, `be206d7c18f9f669ce42476401b4e41f50864150`. Preserve its read-retry, accepted-bundle, request-generation and inspector protections. This batch supplies an already-live backend and a client adapter. Build one connected frontend slice with three capabilities:

1. Review controls in Source Links and Evidence Checks.
2. A shared review-progress summary in the workspace, retaining Search Coverage's actual limitations.
3. On-demand decision history and exact evidence drilldown in the existing inspector.

Use the existing private workspace. Do not add another public page or substitute fixtures for real assignments. Read the backend contract and verifier before editing. Restore `.sql.txt`, `.mjs.txt`, `.ts.txt` and `.js.txt` files to the exact paths in MANIFEST.json; contents are unchanged. Backend registration only: do not apply migrations, deploy functions or repair migration history.

## Data flow

After accepting a matching workspace bundle and a matching saved evidence-check report, call `createInvestigationEvidenceReviewsClient(supabase).read(investigationId, versionId, reportId)`. Keep this client stable. No review read is needed while checks are not run. Read failure must be visibly distinct from an empty/unreviewed ledger and expose an explicit retry for viewers as well as reviewers.

Validate responses with `investigationEvidenceReviewPanels(workspace, checks, reviews)` before showing any state. This is in addition to session/request-generation guards: matching identities alone cannot reject an older response from the same selection. All capabilities share one accepted overview and revision. Clear private reviews/history/forms on logout, 401, access denial and selection changes.

Show labels from `EVIDENCE_REVIEW_LABELS`:
- Needs review
- Retained for follow-up
- Dismissed for this investigation
- Disputed

Keep every original target visible or discoverable through an explicit filter. Default to needs-review/disputed only if the counts and a clear All filter remain available. Show the original machine cue separately from the human decision. Never relabel these decisions as verified relationships, independent sources, resolved contradictions or confidence changes.

## Explicit reviewer action

Only reviewers get decision controls; viewers read state/history. An editor starts from an accepted target in the current report. It collects a decision, nonblank rationale and retained references. Require a deliberate Save decision action. Do not save on opening, focusing, navigating, checking a box, or marking the whole workspace reviewed.

The supplied `client.decide(input)` accepts only the exact API input object. Generate one `event_id` with `crypto.randomUUID()` when a submission is created, and retain the entire frozen payload during that request and any ambiguous-result retry. Include `previous_event_id` from the accepted target's latest event, or explicit null. A retry after timeout/503 must reuse that exact payload and UUID. Do not let edits silently change a pending submission. A definitively rejected 400/409 can return to editing after the appropriate recovery.

A success response is a **receipt**, not a current-state replacement. Verify its session, request generation, investigation/version/observation/report, event ID, target, and submitted decision before accepting it. Then re-read the overview. An old receipt can legitimately be replayed after another reviewer changed the target; do not overwrite the current UI from it. If refresh fails after a confirmed save, show “Decision saved; refresh to load current review state” and offer read retry. Avoid a second Save submission.

On 409 show that the review changed, fetch the latest overview, retain the user's draft for comparison within the same valid selection, and require another explicit save with a new UUID and accepted predecessor. Do not automatically replay a stale decision against a newly fetched predecessor. On a response that mismatches the still-current request, reject it, clear busy state and offer recovery; superseded requests must have no visible effects.

## Evidence selection

Use exact references from the matching saved observation. Source links need references covering both left and right input positions. Cues need their own position; more context from the same observation can be selected. Prefill machine references as suggestions only, and let the reviewer inspect the surrounding retained text before saving. Text references require `relation` and `note` in addition to the detector's span fields; the note is supplied/confirmed by the reviewer. Do not fabricate passages or derive offsets using UTF-16 string length. Use `Array.from(text)` for code points and the existing `resolveWorkspaceExcerpt` to validate display.

A metadata cue can use its exact saved `source_status` reference. Resolve it through the matching observation's article record version. Never look up today's article status to render an old review. References that cannot be resolved are errors, not blank supporting evidence. For targets with no usable retained references, show why a decision cannot be submitted yet; do not invent a citation to unlock the form.

## Review progress and coverage

Overview counts are about returned report targets. Show needs-review, retained, dismissed and disputed counts with a clear scope label. `never_reviewed` is already included in `needs_review`. A previously reviewed item reopened with `needs_review` is distinguishable by its latest event.

Keep the PR #44 distinction between omitted pair inputs and capped result lists. Reviewing all returned targets does not mean all retained evidence, the source corpus or the web was reviewed. Empty results still mean no targets from those bounded checks. Human decisions do not remove limitations, increase confidence or mark the workspace review baseline.

## Decision history and inspector lifecycle

Load history only on explicit target selection using `client.history({investigation_id,version_id,report_id,target_kind,target_id,at_revision: acceptedOverview.revision,before_revision:null})`. The server returns at most 20 events. Pass `next_before_revision` unchanged for Load older decisions and preserve the same `at_revision` for every page. Compare revisions with BigInt when needed; do not convert them to Number.

History request identity includes the target, report, pinned revision, page cursor and current inspector generation. A late first page or older-page response must not replace a different target, newer history, source-detail selection or closed inspector. Deduplicate events by UUID. Render full rationale and references progressively. `authored_by_you` may display “You”; other principals display “Assigned reviewer.” Do not guess names.

Opening a source excerpt must use the **same saved observation** and existing inspector lifecycle guards. Browsing history must not advance workspace review receipts or switch the selected investigation version. A separate Refresh history action can adopt the latest overview revision; disclose that refreshed view rather than quietly mixing history snapshots.

## Acceptance checks

Use meaningful React lifecycle tests and isolated DEV fixtures for these scenarios:
- Reviewer explicit save updates the shared summary and target states after a read; viewer has no Save action.
- Read/history failure has an explicit retry and never masquerades as zero reviews.
- Timeout retry preserves UUID/payload; a saved decision with failed refresh offers read recovery.
- Two reviewer submissions based on the same predecessor produce a visible conflict, with no automatic overwrite.
- A replayed older receipt cannot replace a newer target decision.
- Delayed reads/saves/history pages after logout, selection changes, refreshed history or a new inspector selection have no stale effects.
- Current-response identity mismatch clears loading/busy and remains recoverable.
- Pair citations cover both inputs; cue/status citations resolve exactly; Unicode offsets are correct.
- New/archived versions remain separate, including annotation-only versions reusing observations.
- Capped results, omitted pairs, zero targets and unavailable reports keep their distinct explanations.
- History pagination does not duplicate or mix pages; initial/older-page loading and failure states are usable.

Run the supplied backend tests unchanged, the full Golden suite and production build. Inspect actual desktop and narrow layouts with the isolated DEV fixtures. Label fixture evidence honestly; populated live testing is pending a real assigned investigation. Do not enable DEV fixture routes in production. Return a draft PR, exact commit SHA, checks, and screenshots/remaining visual limitations. Do not merge until review.
