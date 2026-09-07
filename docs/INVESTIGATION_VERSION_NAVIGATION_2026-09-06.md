# Saved investigation version navigation

This batch follows merged and deployed PR #56. The workspace now has controls for the recorded predecessor, the personal review-baseline version, and the latest saved version. This makes older wording and deadlines reachable even when they predate the current review baseline.

## Behavior and data contract

- Previous follows `version.predecessor_id`, not a guessed revision ID or date. Revision 1 with an explicit null predecessor is labeled the first saved version. Missing, malformed or self-referencing links are unavailable, not treated as proof of an empty history.
- Latest uses a fresh existing workspace `read` without a version ID. The backend resolves the current head at that read; a stale catalog or previously delivered head ID does not pin the return target. The displayed latest label is explicitly qualified as latest at last read.
- The review-baseline control uses the delivered review receipt's exact version ID. Browsing before that baseline retains the backend's `historical_before_review` mode without reversed change counts or moving the marker backward.
- Selection uses the existing authenticated client, HTTP handler and workspace hook. Every section, evidence report and inspector shares the selected saved version. Old inspector selection and comparison caches are cleared when switching; no background traversal or prefetch occurs.
- New navigation controls are disabled while a review/check write is pending or unresolved, or the version is loading. They do not discard a retry payload to navigate elsewhere.
- The details disclosure shows the saved reason, exact version/observation identities and UTC recording timestamp. Recording times are distinct from source publication or event dates. Later versions do not imply stronger evidence or completed reassessment.
- A mismatched displayed-version response now ends loading, hides the response and exposes the existing retry state. The requested version ID remains selected, so retry asks for that same version. Existing stale-response and access-revocation guards remain in force.

## Verification

Seven new tests cover navigation identities, missing links, write guards, and the real client/HTTP handler/workspace hook integration. They verify exact predecessor/baseline requests, fresh-head resolution after a newer revision appears, section and inspector switching, failed/mismatched reads with exact retry, revoked access, and late completion after sign-out.

The PGlite test applies the existing migrations, writes four immutable versions against one retained observation, explicitly reviews revision 2, and traverses backward and forward through existing reads. It proves the first version is unchanged, the review receipt count remains one, observation count remains one, and no assessments are created. Viewer reads work; outsiders, unrelated investigation IDs and revoked memberships cannot read the saved versions.

A synthetic browser preview uses the actual workspace, hook, client and HTTP handler with fixture-backed RPC responses. Desktop and mobile (390px and 320px) checks cover previous/reviewed/latest navigation, details disclosure, pending-review disabling, a failed read and successful retry. Narrow layouts have no horizontal overflow and the browser reported no console errors. Preview artifacts remain ignored. The five preceding definition-comparison frontend tests also pass locally; full repository tests and the production build are checked in Linux CI because local full builds previously reached Windows virtual-memory limits.

PR #56's Pages deployment succeeded and its live signed-out private-workspace boundary was verified without console errors. Populated signed-in production navigation has not been visually verified for this batch.

## Release

No new endpoint, database migration, credentials or assignment change is required. After approval and current-head CI, merge the frontend change and let Pages deploy. No Supabase deployment is needed. This provides explicit one-version navigation; it does not claim a complete loaded history index or automatic interpretation of intermediate edits.
