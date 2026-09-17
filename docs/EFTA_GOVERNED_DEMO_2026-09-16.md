# EFTA governed private review — opt-in qualification

This branch descends from frozen PR175 commit 4d69243cd2de91d7588e4eb263cc05b48e8fd0ef. It contains only seven retained disclosure-accounting/oversight candidates. PR175 and PR176 are unchanged.

## What is implemented

The immutable scope in eftaReviewContract.mjs rejects substitutions of candidate, capture, article, URL, capture hash, field, exact excerpt, Unicode-code-point span, origin, dependency and semantic kind. It requires explicit review metadata, uncertainty, reviewed event-time basis and a uniquely resolved institutional identity revision. The result remains a proposal; no authority is granted. The January 30 pair is dependent and never counted as corroboration. World View is absent.

The manifest contains source_date proposals, not inferred publication timestamps. All published_at fields are null. The Federal Register notice distinguishes signed August 21, filed August 26 and published August 27. Exact excerpt/field/span verification was supplied by a read-only live qik query in the parent task on September 16; every admission must repeat this verification.

## Existing authority that must be reused

The native integration must extend 001..010 in this directory, especially 007_survivor_release.sql. Keep mip_identity.validate_review, stage_review and release_isolated as the sole staging/release path and release_public disabled. Preserve 008 operation authorization and 009 factual enforcement. No production migration or source admission is performed here.

The seven pending candidates do not currently meet 007's eligible-source, approved-event, two-outlet and factual-explanation predicates. The DOJ January 30 pair cannot satisfy independent corroboration merely because the publishing office labels differ. Do not weaken those predicates or manufacture an approved comparison event.

## Native bounded slice

011_efta_governed_review.sql adds append-only reviewer decisions, admission receipts and private-reader receipts in mip_identity. Approve/correct/reverse actions bind the predecessor and reject conflicting or retired request replays. An approval explicitly binds institutional namespace/id/label/resolution reference, event-time date/evidence basis/uncertainty, privacy/rights references and owner authorization reference. The review decision itself retains the institutional identity resolution; a conflicting identity relabel is denied.

The publisher must present an active 005 broker session for admission and every private read. The native reader rechecks exact capture payload hash using PostgreSQL JSONB serialization, exact candidate/field/span/excerpt, latest capture, absence of successor candidates and current article payload. Evidence mutations take the collector fence and receipt writes take the publication fence. No action edits pending pipeline rows or writes public graph/event/claim tables. Reversal is visible through new immutable decisions; old receipts remain.

The private route is ?workspace=efta. A host-supplied eftaReviewClient feeds the native contract to Sources, attributed claims, evidence graph, reviewed Timeline and an Arc research collection. Shared capture/candidate/entity/event/claim IDs preserve navigation context. Comparison honestly stays unavailable under 007's gates; World View is absent. The server-only eftaReviewHandler adapter accepts only GET, resolves assignment and broker scope through its supplied authenticator, and calls only efta_private_read. It rejects browser write attempts and emits no-store responses. The browser client has no database credentials, publication RPC or admission control.

## Deployment boundary and verification limits

Nothing is auto-installed: the extension is under qualification, not migrations; the private client defaults to null. Owner deployment must install 001..010 plus 011 in the intended isolated host and provide the existing verified private-gateway authenticator, broker-bound SQL transport and assigned-user reader client. Reviewer-controlled institutional identities and the seven decisions/admissions require explicit owner authorization. This commit performs none of those operations.

The native tests install actual 001..007 in disposable PGlite, seed exact sanitized seven-source payloads and independently reproduce all seven capture hashes. The 009 reviewer role is fixture-created; 008..010 are not reinstalled by this test. Existing factual/operation gates are unchanged and comparison publication is not qualified by this suite. Tests exercise receipt replay, corrections/reversal, body mutation, newer captures, broker revocation, broad-role denial and continuity through the presentation adapter. Multi-connection PostgreSQL races and a live browser screenshot run are still separate qualification gaps.

Hosted CI runs proposal checks, the full unit suite including native/handler/presentation tests, and the production build. Inspect the final commit's result before claiming success. Static UI assertions do not establish screenshot or browser interaction coverage.

No production deploy, migration, admission, public release, geographical inference, or operational source mutation is authorized by these files.
