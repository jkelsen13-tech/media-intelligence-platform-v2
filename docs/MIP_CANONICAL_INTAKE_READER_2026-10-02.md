# Canonical intake → eligible reader: isolated joined qualification

Date: 2026-10-02. Follow-on to evidence implementation `871c37e57f7401436195a2a7917a6899aa9cccea`. This deliverable adds executable qualification, not production policy or activation.

Read requirements: the parent's full convergence register `libfile_953c9013cec08191be2e9bef847b753f.txt`, complete workflow v3 `04_CONSULTATION_RECONCILIATION_AND_IMPLEMENTATION_PLAN.md`, and complete `07_NEWS_READER_CONTRACTS_AND_ACCEPTANCE.md` supplied in `/workspace/mip-convergence-inputs`. This corrects the earlier lane's then-current statement that the complete 04/07 contracts were unavailable. C1/PC-07 requires an actual isolated adapter-to-native-boundary-to-reader path; PC-12 and the reader acceptance cases require separate evidence/review/currentness meanings.

## Architecture before, delta, and disposition

Requirement → existing foundation → missing delta → **EXTEND** → retain predecessor → validation:

- Durable source intake already exists in `scripts/evidencePipeline.mjs` and its `createPipelineRpc`/`enqueueManifest`/`runWorker` calls. Native `mip_pipeline_v1` owns jobs, receipts, exact captures, pending candidates and history.
- `scripts/mipConsolidationRestore.mjs` already restores production-shaped SQL/RLS and recorded public projection corrections in isolated PGlite. Existing database tests independently exercise this foundation.
- `createPublicDataBackend` and `createNewsBackend` already bind an installed Supabase browser SDK to the actual News/public loaders.
- The missing evidence was their **joined execution**, with the same generated native article/capture IDs flowing into the ordinary-reader API rather than unrelated in-memory fixture tables.
- `verifier/runCanonicalIntakeReaderJourney.mjs` supplies a narrowly scoped local HTTP transport. Real operator/SDK requests execute parameterized native SQL under actual restored role grants/RLS in PGlite. It contains no intake, publication, extraction or deduplication business logic. The existing RPC and public views decide those outcomes.
- `tests/canonicalIntakeReaderJourney.test.mjs` runs that same verifier as one ordered regression journey. No existing source implementation was changed in this follow-on and no second engine was created.

## Executed cases

**11/11 joined checks pass**, both through the executable verifier and its Node test:

| Case | Actual isolated observation |
|---|---|
| Dry run and malformed bounds | Dry-run, empty/101-record manifests, publication-bearing intake and invalid worker budgets create no jobs. |
| Repeated delivery | Tracking URL variants and repeated same-run delivery reuse one native job; separate run receipts retain provenance. Replay after completion creates no second capture. |
| Worker completion | Actual adapter completes one native capture, with SHA-256 matching native `jsonb::text` bytes. Article remains pending_review and private; capture stays pending. |
| Exact-source candidate | Real exact-span adapter and native candidate RPC retain Unicode code-point offsets, excerpt, capture/hash and pending state. Invented/bad-span/published-state inputs fail. No canonical claim is created. |
| Explicit fixture source eligibility | Only a deliberately recorded **synthetic administrator** transition to eligible makes the source article visible. Raw article extraction JSON remains absent from reader claims. This is not an automatic or new source-only rule. |
| Publication/retention clocks | Publisher publication time, article fetched time and capture-retained time are distinct native values. Public revision/fetch/material-change gaps are explicitly recorded rather than inferred. No event time or Breaking label is manufactured. |
| Reviewed nested projection | A second synthetic publisher is ingested through the same adapter. Explicit fixture admission creates an approved comparison and exact verified source surface; actual `news_detail_public` admits that surface and its evidence URL. Unverified surface/raw extraction stay withheld. Multiple outlets do not establish source independence. |
| Pending correction | A changed publisher payload creates a different capture ID/hash at the same article ID, outcome revision_pending, review_state pending. Original capture survives. Public article title/summary/eligibility remain the previous eligible, active record. New bytes do not inherit approval. |
| Explicit withdrawal | Setting the existing article's source_status to withdrawn removes its reader detail/URL resolution and its comparison admission. Both retained captures and article history remain. |
| Partial/delayed jobs | A two-item run with maxJobs=1 reports one completion and one still-pending job. A pre-finish transient failure records retry_wait; the next invocation returns no ready work. Pending work does not increase public article counts. |
| Lost committed response | Finish commits in native SQL, then the synthetic transport loses its response. The worker reports indeterminate, no success/compensation. Native status later establishes completed; the pending article remains private. |

The standalone run records **107 intercepted operator/SDK HTTP requests**, **195 executed SQL statements** and hashes for **21 implementation/foundation artifacts**, including all restored migration files. External network requests and live operations are **zero**.

Run:

```bash
node --test --test-concurrency=1 tests/canonicalIntakeReaderJourney.test.mjs
node verifier/runCanonicalIntakeReaderJourney.mjs --receipt /tmp/canonical-intake-reader-journey.json
```

Raw receipts: `/workspace/mip-lane-evidence-receipts/canonical-intake-reader-final-test.log`, `canonical-intake-reader-cli.log`, and `canonical-intake-reader-journey.json`. The JSON includes all checks, exact synthetic source, native identities/hashes/clocks, requests, SQL/parameters, artifact hashes and limits. Test: **1 Node test passed**, containing the eleven ordered checks. This follow-on adds no application source changes, so the preceding application build is not represented as a new build of changed product code.

## Reader envelope: reliable existing fields and exact missing boundary

| Field | Existing owner/path | Current visibility and possible bounded next proposal |
|---|---|---|
| Source/article identity and permitted display | `public.articles.id/title/url/summary/published_at`; `src/lib/supabase.js:1182` loadArticles and `:1224` loadArticleDetail; `src/lib/newsBackend.js:22`/`:24`, composed by publicDataBackend | Returned now through eligible plus active reads. Article ID is the stable source-record identity; it is **not** a capture revision or story-group identity. |
| Per-article fetched/observed clock | `public.articles.fetched_at`, present in `scripts/mipConsolidationRestore.mjs:13`; currently queried by corpus metadata and new-since count at `src/lib/supabase.js:968`/`:996` | Existing table SELECT/RLS already admits this field for eligible active articles in the restored contract. List/detail omit it. A bounded additive SELECT/DTO proposal could expose **fetched_at labeled as the article's original fetched clock**, without inventing update/material-change or event time. A correction capture does not update this article clock. Current live column/grant compatibility still requires preflight before deployment. |
| Reader eligibility/source status | `public.articles.reader_state/source_status`; existing article RLS and explicit loader filters | Could disclose the existing eligible/active values on eligible rows, with their existing meaning. These fields supply neither a human-review identity/time nor a new policy-version identifier. |
| Exact capture version | `evidence_pipeline.article_captures.id/article_id/content_hash/payload/captured_at/job_id`, migration `20260905082406_evidence_pipeline_reliability.sql:143` | Reliable private version identity/digest and observation clock. Ordinary reader roles are denied by the actual restored SQL. **Cannot simply expose these private fields.** No approved-current-capture reference exists in the tested source contract. |
| Captured revision decision | `article_captures.review_state`, same migration `:150`; import_jobs outcome `:264` | Captures have a CHECK restricting review_state to pending. Article eligibility is separate. Selecting the newest capture would expose unapproved correction bytes; neither latest time nor article_id proves approval inheritance. |
| Article history ordinal | Private record_versions and service-only history RPC at migration `:343` | Reliable append-only article versions but includes private/source status changes. No ordinary public history/version contract was introduced. Cannot treat its private ordinal as a reader projection version without an explicit publication mapping. |
| Admitted claim/provenance | `public.news_detail_public`, migration `20260905182355_mip_nested_claim_publication_gates.sql:34`–`:77`; `src/lib/supabase.js:1243`/`:1262` | Existing public JSON supplies verified surfaces, exact evidence_source_field/excerpt and admitted source links. It has no capture-version identity or projection-version field. Browser uses this contract, withholding article-local raw extraction. |
| Source/story update envelope | Existing private captures/history plus public articles/detail projection | **Not complete.** Public DTO lacks capture/revision binding, projection version and material-change ownership. Current-page groups cannot fill that gap and independently fetched projection rows are not one snapshot. |

The smallest no-new-policy implementation proposal is therefore additive public article DTO fields for **fetched_at** and, if useful, the already enforced **reader_state/source_status**. It must retain the source-record identity, explicit independent-read limits and exact clock labels. Capture revision and correction/material-change visibility need a separate reviewed mapping/projection contract; they cannot be fabricated from a hash of whatever a browser happens to receive. This follow-on does not implement that proposal.

## Correction truth and remaining gates

The qualification proves retention and **noninheritance**, not full reader correction propagation. After the new payload finishes with revision_pending, the **old article is still eligible and active**, its old title/summary and approved nested claim remain public, and the new capture is pending/private. The worker does not mark that old article corrected or add a public pending-correction/staleness notice. Only the later explicit fixture withdrawal changes public source eligibility. That absence of a public correction/update envelope is a consequential integration gap, not a successful material-change feature.

This verdict is **PIPELINE VALIDATED IN ISOLATION for the bounded tested path**. It is not PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND, a complete eligible-reader envelope, source acquisition/rights qualification, actual human review, deployed PostgREST/TLS/JWT validation, real collector/scheduler operation, production concurrency, persistent story coverage, Following, breaking policy, dependency/retrieval invalidation or whole-platform release readiness. Fixture HTTP chooses predefined roles and then proves SQL authorization; it does not authenticate real user/service credentials. PGlite role transactions are serialized and do not prove live concurrent throughput.

No new numerical publication threshold, new coverage engine, faster source visibility rule, provider call, credential read, collector activation, live database action, migration, ACL change, push, merge, deployment or release occurred. Current dependencies and historical qualified gates remain untouched. The coordinator owns subsequent additive proposal authorization, integrated qualification and the fresh independent review.
