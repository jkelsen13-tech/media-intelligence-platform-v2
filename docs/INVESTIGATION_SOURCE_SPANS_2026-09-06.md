# Exact changed text in Source History

Source History previously identified fields with different retained values but did not locate the changed wording. This batch adds an explicit **Highlight changed text** lookup for title, summary and body text. A reader can compare the exact interval and open either side in the shared inspector, including an empty insertion/deletion boundary. The original full retained field comparison remains available.

## Contract and invariants

- `investigation-source-spans` accepts only `action: "read"` with `investigation_id`, `version_id`, `left_position`, and `right_position`. Both positions are canonical positive bigint strings. Both captures must belong to the same retained article identity in the exact requested observation. Matching text, URLs, publication dates, or outlet names never merge identities.
- It uses the existing fixed-project Auth/RPC transport and the read-only assignment/version boundary factored from `investigation-input-impact`. Server configuration selects the projection and allowed input keys; browser payloads cannot supply either. The original input-reference endpoint retains its original request/response behavior.
- The algorithm finds the longest equal prefix, then the non-overlapping equal suffix, using Unicode code points without normalization. The remaining interval encloses all differences; it may include equal words between separated edits. This is intentionally not a minimal edit script or a semantic comparison. Counts and offsets are not confidence scores.
- The result binds investigation, version, observation, article identity, ordered input pair, method, offset unit and limit. It returns offsets, not a rewritten source. The browser validates that all text outside the returned intervals is identical and the intervals bind to the retained values. It does not run another diff algorithm.
- Missing/non-string text is unavailable, an empty retained string is known empty, and unequal fields over 200,000 UTF-16 units on either side are not span-compared. The limit is checked before code-point allocation. Complete equal strings can be recognized without allocating code-point arrays. Long changed-interval previews are shortened to 1,200 code points and can be explicitly expanded; surrounding context is bounded to 80 code points per side. Disclosures render lazily.
- No text difference establishes a correction, contradiction, altered support, derivation direction, source independence, or changed conclusion. The inspector describes the selection as a text comparison, not a persisted analyst evidence judgment. No assessment, source, report, or review receipt is written.
- Changed pair/version, component closure and superseding requests invalidate pending results. Current access denial clears private workspace state through the same existing lifecycle used by input-reference reads; responses from departed bundles cannot clear a newly selected investigation. Requests are explicit button actions only.

## Verification

Tests cover qualifiers such as `Up to 17%` versus `17%`, polarity/date/unit examples, whitespace, empty text, combining marks and astral Unicode, repeated strings, and a fixed allocation limit. Exhaustive short Unicode/repetition cases reconstruct the entire right-hand field from the left field and changed interval. Adversarial browser results cannot invent offsets, swap the pair, use a different saved identity, mislabel missing text, or claim a semantic reassessment.

The real SQL migration harness exercises both read-only projections against retained captures, late corrections, earlier versions, and revoked access. React tests cover explicit lookup, deferred disclosure, empty boundaries, exact inspector binding, missing/oversized fields, retries, and stale results. Original input-reference tests continue to exercise the factored HTTP boundary.

Local browser verification used explicitly synthetic data with the actual frontend, HTTP handlers and projection; the preview RPC is a fixture. Desktop and 390/320px layouts, capture selection, highlights, empty boundaries and inspector navigation passed, with no horizontal overflow or browser errors. The previous PR #54 endpoint was deployed with JWT verification, its files matched the approved repository, its unauthenticated request returned 401, and its Pages release and signed-out investigation boundary were checked. A populated assigned-user production path remains unverified in the current signed-out browser.

## Release recipe

After explicit approval, deploy the new `investigation-source-spans` function to `qikvmopbtijoebdqosyq` with `verify_jwt: true` and entrypoint `investigation-source-spans/index.ts`. Include these six files, preserving their sibling paths relative to the functions directory:

- `investigation-source-spans/index.ts`, `handler.mjs`, `spans.mjs`
- `investigation-input-impact/handler.mjs`, `impact.mjs`
- `investigation-workspace/handler.mjs`

No import map or new secrets are required. Reuse the existing Supabase URL, anon-key and service-role environment secrets; never expose service credentials to the browser. No SQL migration or data mutation is part of the release. The previously deployed input-reference function need not be redeployed: its wire behavior is unchanged, and the new function bundles its own copy of the factored shared handler.

Verify deployed files, JWT setting, active status and unauthenticated rejection before merging the frontend. Then check the Pages deployment and actual page, distinguishing signed-out verification from a populated assigned-user run. If the endpoint is unavailable, the new control shows a retryable error and existing field comparisons remain available. Frontend rollback removes the new control; the read-only function can be rolled back independently.

Remaining work: reviewed semantic interpretation of qualifier changes, evidence-backed derivation chains, source-origin sensitivity and completed reassessment are separate prerequisites. This batch supplies inspectable exact spans rather than claiming those capabilities.
