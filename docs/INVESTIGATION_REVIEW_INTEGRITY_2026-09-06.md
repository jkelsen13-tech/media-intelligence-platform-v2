# Investigation review integrity follow-up

Base: merged PR #45, `5ccabe5d22cbb0076fae453d3d87ed7c1fd6670b`.
Branch: `codex/investigation-review-integrity`.

## Confirmed findings and changes

1. History validation previously checked the response envelope but accepted an event from another report or target, a revision beyond the pinned observation, a repeated cursor boundary, and unresolved retained evidence. Each event now has to match the requested report/target and saved observation, have a positive decimal revision within the pinned/exclusive bounds, and appear once in descending order. A continuation cursor requires a full page and equals the last returned revision.
2. Save receipt validation previously accepted altered rationale, evidence or predecessor under an otherwise matching event identity. Confirmation now requires the exact submitted decision, predecessor, rationale and evidence, the expected contract, and the submitting principal's author flag. JSONB object-key ordering is immaterial; evidence array order and values are preserved. A superseded idempotent receipt remains valid without becoming the current decision.
3. Pending retry payloads previously froze only their outer object. Evidence is now copied and frozen so subsequent caller edits cannot change the payload under the same event UUID.

Malformed history pages retain the already accepted history and expose the existing read-retry state. A mismatched save receipt retains the exact pending submission for retry and does not display a confirmed save. Relevance decisions remain separate from factual verdicts, confidence, publication and investigation review receipts.

The development fixture's cursor was inclusive, unlike the SQL contract. It now uses the SQL's exclusive comparison. Earlier lifecycle tests retain their race assertions but use valid full pages instead of empty pages with continuation cursors. No deployed SQL, Edge function or registered backend checksum fixture was changed.

## Verification

- The initial 22-counterexample suite against the original helper: 1 passed, 21 failed (including parent test failures). The patched helper passed all 22; two positive pagination/replay tests were subsequently added.
- Final focused suite: **72 passed, 0 failed**. This includes original backend tests, frontend rendering tests, React lifecycle and PR #45 recovery tests, new adversarial tests, and a new real SQL-to-handler-to-client contract test.
- The new SQL test runs the actual migrations in isolated PGlite, retains Unicode evidence, records 23 decisions, validates an older replay, and reads a pinned 22-event history across two pages. Investigation state and review receipts remain unchanged. Auth is a controlled local stub; this is not a signed-in live-user test.
- Production Vite build: **passed**, 7,133 modules transformed, existing chunk-size/dynamic-import warnings retained.
- Full Windows run: **1,091 passed, 9 failed**. Failures include POSIX permission expectations, Windows URL-to-path assumptions, a CLI child invocation, and PGlite memory allocation/initialization failures. Some file-level failures prevented their nested tests from running. Do not report this as a green full suite; the repository's Linux CI still needs to run.
- Windows-only test support was kept outside the repository: a Node 24 import shim converted drive-letter module specifiers to file URLs. Checkout text was restored to LF so the existing byte-preservation tests could run. No checksum expectations were weakened.
- Browser verification is incomplete. Local Vite preview encountered memory exhaustion, then insufficient disk space and connection failures. No visual completion or live UI improvement is claimed.

Reproduce the focused suite on a supported Node environment:

```sh
node --test --test-concurrency=1 tests/investigationReviewIntegrity.test.mjs tests/investigationReviewSqlContract.test.mjs tests/investigationEvidenceReviews.test.mjs tests/investigationEvidenceReviewsFrontend.test.mjs tests/investigationEvidenceReviewsLifecycle.test.mjs tests/pr45ReviewRecovery.test.mjs
npm test
npm run build
```

## Live state and delivery limits

Read-only Supabase preflight confirmed the three private investigation Edge functions ACTIVE at version 1 with JWT verification enabled, and the recorded migrations through `20260906121130_investigation_evidence_reviews_v1`. The target has 3 candidates and zero investigations, versions, memberships or saved observations. No live data, assignments, schema or functions were changed.

GitHub repository metadata reports push permission, but the connector's create-tree request returned HTTP 403, `Resource not accessible by integration`. Local Git has no usable credentials when interactive prompting is disabled. No remote branch, PR, Linux CI run, merge or deployment was created by this run.

Two attempts to remove this task's generated dependencies after disk exhaustion were rejected by automatic approval policy, without a specific reason. No recursive cleanup was performed.

## Next step

Restore authenticated GitHub write access, push this branch, open a draft PR, run the full Linux suite and complete browser verification before requesting merge authorization. For the first real investigation, the owner still needs to identify the question/scope and intended existing MIP account. Do not infer assignment from the only available profile or populate synthetic records in the live project.

Suggested continuation prompt:

> Continue `codex/investigation-review-integrity` in `jkelsen13-tech/media-intelligence-platform-v2` from this report. Preserve the current patch and the original deployed backend. Verify restored GitHub write access, publish the branch as a draft PR, run the full Linux tests and production build, and exercise saved decision, pinned history, read recovery and signed-out states in a browser. Do not merge or deploy without authorization. Do not replay existing SQL or create live assignments without an identified question and account.
