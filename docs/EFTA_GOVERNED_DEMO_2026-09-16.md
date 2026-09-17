# EFTA bounded review proposal — incomplete integration

This branch descends from frozen PR175 commit 4d69243cd2de91d7588e4eb263cc05b48e8fd0ef. It contains only seven retained disclosure-accounting/oversight candidates. PR175 and PR176 are unchanged.

## What is implemented

The immutable scope in eftaReviewContract.mjs rejects substitutions of candidate, capture, article, URL, capture hash, field, exact excerpt, Unicode-code-point span, origin, dependency and semantic kind. It requires explicit review metadata, uncertainty, reviewed event-time basis and a uniquely resolved institutional identity revision. The result remains a proposal; no authority is granted. The January 30 pair is dependent and never counted as corroboration. World View is absent.

The manifest contains source_date proposals, not inferred publication timestamps. All published_at fields are null. The Federal Register notice distinguishes signed August 21, filed August 26 and published August 27. Exact excerpt/field/span verification was supplied by a read-only live qik query in the parent task on September 16; every admission must repeat this verification.

## Existing authority that must be reused

The native integration must extend 001..010 in this directory, especially 007_survivor_release.sql. Keep mip_identity.validate_review, stage_review and release_isolated as the sole staging/release path and release_public disabled. Preserve 008 operation authorization and 009 factual enforcement. No production migration or source admission is performed here.

The seven pending candidates do not currently meet 007's eligible-source, approved-event, two-outlet and factual-explanation predicates. The DOJ January 30 pair cannot satisfy independent corroboration merely because the publishing office labels differ. Do not weaken those predicates or manufacture an approved comparison event.

## Gaps — do not treat this branch as a completed showcase

There is no durable native admission decision/reversal API, append-only receipt integration, or live reader integration in this change. The JavaScript validator is a preflight only; caller-supplied retained status, hash and registry are not authority. It does not recompute capture hashes. The native validator must hash the exact canonical import payload using Postgres jsonb::text (url/title/outlet/summary/body_text/published_at), check it against the current capture and reviewed decision, lock current heads, reject stale evidence and conflicting replays, and preserve corrections/reversal lineage. Raw excerpt hashing is not equivalent.

No canonical IDs are invented in the manifest. Explicit identity resolutions must be loaded and bound at admission. Graph, Timeline, Source Comparison, claim evidence, Arc and investigation identity continuity still need native integration and adversarial transaction/browser tests. The added tests exercise proposal rejection only; they do not prove replay, concurrency, durable receipts, native authorization or UI continuity. The workflow runs focused tests, full unit suite and build on this dedicated branch; inspect the exact commit's hosted result before claiming success.

No production deploy, migration, admission, public release, geographical inference, or operational source mutation is authorized by these files.
