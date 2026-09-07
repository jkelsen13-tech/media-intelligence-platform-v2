# Saved investigation definition revisions

This batch follows merged PR #55. What Changed can now expand the backend's declared definition edits into exact before/after fields. For example, a saved commitment deadline changing from August 31 to September 30 keeps both wordings visible, with the revision that recorded each.

## Data and interpretation

- Reuse `investigation-workspace` read and the existing service-only `mip_investigation_workspace_v1` RPC. Loading the comparison explicitly requests the review baseline's version ID. There is no new endpoint, migration, semantic worker, or review write.
- Require matching investigation, version, observation and review-baseline identities. Historical-before-review and unreviewed modes do not create a comparison. Candidate scope changes allow the server-declared definition comparison with an evidence-comparison limitation.
- Expand only records in the backend's `definition_changes`. Compare JSON values with object-key order ignored and array order preserved, consistent with the saved JSONB definitions. This is field presentation, not an assessment of meaning.
- Cover hypotheses, commitments, nested stages, collection declarations, the question, scope and unresolved questions. Match records and stages by their saved IDs. Added and removed records retain absent-side labels; removed stages do not imply cancellation or successful completion.
- Preserve deadline wording, assumptions, criteria, conditions, prerequisite links and stage order. Keep remaining uncertainty and collection limits visible when a record is expanded, labeled as saved context when unchanged.
- Resolve excerpts and linked assessments against each side's own saved observation. Before-side references never fall back to the displayed observation. Existing inspector routing receives the selected side's bundle.
- Show both revision numbers and recording dates. These dates are MIP recording times, not dates of institutional action. The displayed version's recorded reason describes that saved version. The comparison is between two named endpoints and does not enumerate intervening edits.
- Keep the full compared record available in a disclosure. Field values render on expansion; record and stage groups initially show at most ten entries with explicit expansion controls.
- Reuse the authenticated workspace lifecycle. Failed reads show retry feedback, stale completions cannot populate another comparison, and revoked access clears the private bundle and cached before versions. Reading does not mark reviewed, infer confidence, complete reassessment, or infer causation.

## Verification

Ten focused tests cover the pure comparison, React disclosures and request lifecycle, plus actual SQL behavior using PGlite and the existing migrations. The SQL test creates two immutable versions with a revised deadline, hypothesis and stages; proves exact capture binding across versions; checks the original version remains unchanged; and verifies outsider/revoked reads fail. It records only the explicitly requested review receipt and creates no assessments.

A local synthetic browser preview uses the actual workspace component, hook, API client and HTTP handler, with fixture-backed authentication/RPC responses. Verified explicit baseline loading, deadline/status comparisons, exact excerpt inspection, simulated baseline failure and successful retry. Desktop (1280px) and mobile (390px and 320px) layouts were inspected; mobile values stack without horizontal overflow. The browser reported no console errors. Preview files are ignored and excluded from the production build.

The focused tests and 19 adjacent Source History / Evidence Checks / input-reference frontend tests pass locally. The complete repository suite and production build are release checks in Linux CI; local full builds previously hit Windows virtual-memory limits. A populated signed-in production comparison has not been visually verified. PR #55's completed Pages deployment and signed-out live boundary were separately verified before this batch.

## Release and continuation

Merge only after approval of this PR and successful current-head CI. Pages rebuilds the frontend after merge. Existing Supabase functions and database migrations require no deployment for this batch.

Subsequent work can extend revision navigation or collection-backed investigations. This batch does not add automatic interpretation of changed wording, establish source origin/independence, or claim that an observed later outcome was caused by a commitment.
