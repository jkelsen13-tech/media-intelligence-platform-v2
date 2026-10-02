# MIP convergence: evidence and public reader boundary — 2026-10-02

Implementation lane: `codex/mip-convergence-evidence-20261002`, frozen base `b8ac166`. Source implementation and isolated qualification only. The coordinator owns integration and fresh independent review.

## Foundation reuse

| Requirement | Existing foundation | Missing delta | Disposition and validation |
|---|---|---|---|
| Bounded retained intake without publication authority | `scripts/evidencePipeline.mjs`, September 5 retained-capture/candidate RPC | Mutable manifest could grow or change after validation while enqueue awaited an earlier RPC | EXTEND: snapshot validated records before the first RPC. Reproduced three writes from an initially two-record manifest; regression verifies exactly two original validated submissions. |
| Default-deny explanation presentation | D4/D5 eligibility and recorded nested public projection | Browser accepted legacy object/null/string archives although the SQL contract requires an array; pure flag accepted truthy non-booleans | EXTEND: array gate and exact boolean flag; preserve existing published/ok, explicit failure, current-row and falsification rules. Empty archive arrays remain allowed by the recorded SQL contract. |
| Excluded evidence stays a failure diagnostic | `relationshipProvenance.js`, bound evidence backend and mounted RelationshipPanel | Panel consumes excluded explanations, then marked their passage as recorded grounding and exposed their sources/authentication classification | EXTEND: retain review/failure/uncertainty/correction diagnostics; withhold excluded grounding, named evidence, authentication claims, explanation relationship classification and falsification. Mounted negative and published positive controls pass. |
| Reader analytical claims use admitted evidence | `news_detail_public`, nested claim publication gates, bound News backend | Detail concatenated raw article extraction JSON with admitted claims | EXTEND: request no raw claims, use verified-retained-source public claim rows and their evidence records only. Both raw substantive/framing text and unverified projected rows are withheld. Publisher article text remains a source record, separate from analytical acceptance. |
| Source change propagation reaches readers | Existing `eligible` plus `active` SQL/RLS boundary | Several browser article reads requested only eligible rows, or requested neither field | EXTEND: News list/detail/count/outlets/metrics/URL resolution and node/edge backing-article reads explicitly require eligible plus active. Missing backing sources remain unresolved rather than fabricated. |
| Public relationships resolve published endpoint identity | Bound `loadGraph` and article Graph-link loaders | Relationships and citation links could carry endpoints absent from public node reads | EXTEND: intersect relationships with the public node set and suppress unresolved Graph destinations. No label-derived node identity or replacement endpoint is created. |
| Separate recorded quality dimensions | Existing node/relationship evidence axes | Numeric coercion converted `true` and `[1]` into the highest reliability tier | EXTEND: accept recorded scalar number/string tiers only; preserve distinct axes and ignore aggregate confidence. |
| Published comparison grounding | Narrow `comparison_public` read contract | Browser exposed under-review passage in a malformed or older projection response | EXTEND: allow passage only for published/ok/nonblank projected explanations; keep review/state/uncertainty diagnostics and omit uncontracted extra fields. This partial payload is not treated as a complete private explanation row. |
| Honest News coverage and source links | Existing NewsView, shared backend, auth lane URL/key helpers | Loaded-page outlet count read as general reporting coverage; unsafe locator hrefs were active | EXTEND: label outlets “on this page”; safe absolute HTTP(S) links only, retaining unsafe recorded locators as plain text. Auth lane supplies helper implementations; evidence lane applies its browser-key construction guard. |

Predecessors remain in place. No duplicate evidence, admission, publication, coverage or ingestion engine was created. Existing candidate review/promotion gates and scorer release thresholds are unchanged. Intake/candidates do not acquire publication authority.

## Reproduction and qualification

Raw receipts are in `/workspace/mip-lane-evidence-receipts`:

- `publication-boundary-red.log`: four concrete public-boundary failures before repairs.
- `news-raw-claim-red.log`: raw article substantive/framing claims bypassing the admitted projection.
- `intake-snapshot-red.log`: initially two records became three writes, including unvalidated publication-bearing input.
- `reliability-red.log`: non-scalar values rendered as recorded reliability.
- `unsupported-edge-red.log`: relationships to an endpoint absent from the public node set.
- `final-public-read-qualification.log`: **109/109** serial tests, including installed Supabase SDK synthetic HTTP reads, mounted News/Relationship/Source Comparison components, session binding, stale response cancellation, source eligibility, pagination and failure states.
- `foundation-qualification.log`: **34/34** serial tests against the existing foundation and isolated PGlite. Covers retained capture/candidate/history, default-deny adapters, public source retraction, nested claims and both ordinary reader roles, including own-event explanation binding. Existing historical upgrade tests are inherited regressions, not reopened production audits.
- `build.log`: production build passed in **21.87 seconds**; existing Vite large-chunk warning remains.

Node `v24.19.0`, npm `11.9.0`. Dependencies are a symlink to the coordinator's installed `/workspace/mip-convergence/node_modules`; this lane did not install or change dependencies. The tests use explicitly synthetic fixtures and isolated databases. They establish contracts, not real source admission, provider rights, imagery, credentials, deployed grants or factual corpus quality. No synthetic fixtures were written to a live backend.

Commands for the main qualification receipts:

```bash
node --test --test-concurrency=1 tests/evidencePublicationBoundary.test.mjs tests/evidencePipeline.test.mjs tests/evidenceBackend.test.mjs tests/evidenceBackendFrontend.test.mjs tests/golden/read_path_eligibility.test.mjs tests/relationshipProvenance.test.mjs tests/nodeEvidence.test.mjs tests/newsBackend.test.mjs tests/newsBackendFrontend.test.mjs tests/newsFeedModel.test.mjs tests/publicDataBackend.test.mjs tests/comparisonBackend.test.mjs tests/sourceComparisonPagination.test.mjs tests/comparisonBackendFrontend.test.mjs tests/identityHandoffs.test.mjs tests/frontendPagination13.test.mjs
node --test --test-concurrency=1 tests/evidencePipelineDatabase.test.mjs tests/mipPublicSurfacePublicationGates.test.mjs tests/mipNestedClaimPublication.test.mjs tests/comparisonExplanationEventBinding.test.mjs tests/algorithmEvidenceAdapter.test.mjs
npm run build
```

## Boundaries and remaining integration

No `supabase/` file changed. Existing migrations were inspected and exercised only in isolated PGlite. No production query/write, migration, grant, ingestion, cron, candidate admission, publication, account creation, provider call, credential read, spending, push, merge, deployment or release occurred. World View geography continues through its existing released spatial projection; provider context/basemaps and test fixtures do not become graph or geographic evidence through these changes. This lane adds no geographic publication path.

The live/public table and projection contracts remain the publication authority. This browser hardening does not prove or alter live SQL policies, add a new Arc publication status, or admit unpublished Arc candidates. The shipped private staging/candidate foundations remain separate from public canonical tables. Independent public reads remain independent requests, not an atomic shared snapshot.

`loadEventGrouping` still has its existing optional private join and can be unavailable to ordinary readers. Replacing it with a persistent coverage-group contract is outside this repair; page grouping is not a full-story total, a canonical analytical event, or longitudinal Arc identity. New fetches do not establish Breaking status, and a pin does not establish durable following. Source-only fast visibility remains an unresolved owner policy; no metadata bypass was added.

The coordinator identified newer workflow v3 inner documents `04_CONSULTATION_RECONCILIATION_AND_IMPLEMENTATION_PLAN.md` and `07_NEWS_READER_CONTRACTS_AND_ACCEPTANCE.md`, but their complete bytes were not available in this lane. No expanded reader/workflow policy is claimed as implemented from excerpts. Existing September 5 foundation, repository Index/D4/D5 contracts, current extracted handoff/plans and Master Plan v2.1.3 were used for these bounded repairs. Fresh independent review and integrated full-suite qualification remain coordinator work.
