# Retained-text diagnostic evaluation

Base: `5db5c8a3ed101498f3840138946bf471c70bd8d5` (PR #39).
Status: isolated evaluation completed. No live database migration, ingestion,
publication, model call, scheduler or frontend change was performed in this slice.

## Findings and limits

A read-only census of the existing source database returned 29,848 article rows.
Of these, 24,493 belonged to two GDELT feeds. Their records require a separate
metadata adapter: inspected examples explicitly said their summaries were event
metadata rather than publisher text. In the six selected named RSS feeds, 3,855
of 4,626 body fields repeated the summary. A populated body_text field is therefore
not proof of a complete article. Source timestamps are retained as recorded;
this evaluation does not independently verify publisher dates or source claims.

A purposive diagnostic sample admitted 20 existing RSS records and rejected two
GDELT records. It covers reports about distinct events, broad recurring topics,
different countries, changing casualty counts, health, markets, and unrelated
controls. Seventeen of the admitted body fields exactly repeat their summaries;
the other three have unverified completeness. Neither origin independence nor
full article coverage is established by outlet count or a non-empty body field.

The deployed capture-lexical-1 SQL was replayed unchanged in isolated PGlite.
Ten more recently published records were ingested first, followed by ten earlier
records. Original published_at and fetched_at values were preserved separately
from replay order. This demonstrates late replay of older retained material;
it is not a reconstruction of historical system knowledge and does not provide
a real multi-year article benchmark. The oldest rows inspected were metadata,
so they were not promoted to publisher evidence just to fill that test dimension.

| Diagnostic | Result |
|---|---:|
| Admitted retained records | 20 |
| Rejected metadata-feed records | 2 |
| Initial ten-record unordered pairs | 45 |
| Final unordered pairs, all stored dispositions | 190 of 190 |
| Lexical retrieval proposals | 42 |
| No lexical match | 148 |
| Cross-wave pairs | 100 |
| Cross-wave lexical proposals | 17 |
| Proposals after terminal display-suffix experiment | 33 |

The source collection and its pair results stay private. A sanitized numerical
summary and synthetic reproducibility tests are suitable for repository review.

## Concrete failure cases

- Repeated terminal “Continue reading...” produced unrelated cross-topic pairs.
  An isolated experiment removes only that exact terminal display phrase on an
  analysis copy, then calls the same SQL tokenizer and overlap rule. It removes
  nine proposals in this set. Raw source text and quote offsets are preserved.
- Generic “killed” and “people” can connect reports in different countries.
  A semantic or structured verifier needs bound entities, location and episode
  context before treating the proposal as an event relationship.
- A seed bank and a central bank can share a token without sharing an entity.
  Removing display text does not disambiguate names or establish identity.
- Different casualty numbers may be evolving reports, different attribution,
  different victim categories, or distinct events. A blanket number-mismatch
  veto would lose legitimate follow-up evidence. Bind quantity, unit, subject,
  attribution and observation time before deciding.
- Health and housing reports shared generic words such as “head” and “drop”.
  More raw overlap does not establish a meaningful relationship.

The 42 and 33 figures are proposal counts, not validated connections. Precision,
recall and semantic accuracy are deliberately null. The sample was selected and
inspected for diagnostic value, has no independent adjudication or held-out split,
and cannot justify release or model selection. The suffix experiment has not
changed the live capture-lexical-1 contract; changing it in place would corrupt
versioned result semantics. A deployable successor must use a new contract and
preserve earlier results.

## Backend architecture blueprint

| Repository path | Change and purpose |
|---|---|
| scripts/evaluateCaptureCollection.mjs | New offline admission, exact-content fingerprints, two-wave SQL replay, pair enumeration and isolated suffix experiment. |
| tests/captureCollectionEvaluation.test.mjs | New synthetic metadata rejection, raw-text preservation, clock retention and actual SQL boilerplate regression tests. |
| docs/CAPTURE_COLLECTION_EVALUATION_2026-09-06.md | This architecture, findings, integration and security guide. |
| verifier/capture_collection_diagnostic_2026-09-06.json | Sanitized counts and limitations; no source text, URLs or real article IDs. |

The runner reuses scripts/evidencePipeline.mjs for input shape validation,
tests/changeQueueFixture.sql for an isolated database harness, and the existing
reliability, queue, assessment and capture-retrieval migrations by unique suffix.
It has no network client, live connection string, service-role key or environment
configuration. Test fixtures are an intentional dependency of this offline runner,
not a deployed production endpoint.

## Operator contract and frontend integration guide

Run from the repository with installed dependencies:

    node scripts/evaluateCaptureCollection.mjs private-source-snapshot.json private-result.json

Input is a JSON array of 2..100 records with id, feed, source_status, fetched_at,
optional exported_at, and the retained article fields url, title, outlet, summary,
body_text and published_at. The selected feed allowlist is an explicit diagnostic
scope, not a claim that every other feed is illegitimate. Duplicate source IDs,
invalid article shape and fingerprint changes fail. Rejected feeds/status/text
remain recorded. Duplicate source rows collapsing to the same retained capture
fail with an explicit request to deduplicate the evaluation collection.

Output contains collection and evaluation objects: immutable source fingerprints,
original clocks, admitted/rejected rows, replay waves, pair dispositions, shared
terms, numeric diagnostics and the separately named suffix experiment. The output
file is private and written with mode 0600 when newly created. Store input/output
outside the public repository. Standard output prints aggregate counts only.
No HTTP request, headers, browser hook or environment variables are required.

| Frontend component | Integration in this slice |
|---|---|
| src/panels/ArticlePanel.jsx | No call or change. Do not display diagnostic pairs as verified evidence. |
| src/graph/GraphView.jsx | No call or change. This runner does not create graph edges. |
| src/views/WorldView.jsx | No call or change. No location or spatial assertion is generated. |
| src/components/InvestigationContextBar.jsx | No call or change. No released assessment/context is created. |

The existing private mip_capture_retrieval_v1 and mip_assessments_v1 RPCs remain
server-only. No service-role credential belongs in a React component, VITE
variable or browser request. A future frontend integration requires a separately
reviewed public projection backed by verified, eligible results. No such endpoint
is invented or enabled by this evaluation.

## Database and security rules

No new schema, table, function, RLS policy, grant or migration is created here;
there is no new deployment SQL to apply. The runner loads the exact repository
SQL into an isolated ephemeral database and closes it when finished. Existing
live private grants and publication gates remain unchanged. The source database
was queried read-only; the target database received no corpus imports or fixture
writes. Raw source snapshots/results must not be committed to GitHub or attached
to the registration PR. Synthetic tests reproduce the identified display-text
failure without publishing the real corpus.

## Next implementation gates

1. Qualify retained publisher text separately from structured metadata and record
   unknown text completeness and source lineage explicitly during consolidation.
2. Build a versioned successor with display-text filtering and bound entity/event
   context; retain capture-lexical-1 as a measured baseline.
3. Compare semantic retrieval/verification against that baseline with preserved
   quantities, negation, attribution, chronology and source independence.
4. Freeze a separately grouped event/source/time hold-out collection with
   independent labels before reporting accuracy or choosing release thresholds.
5. Only then expand live ingestion/retrieval, test concurrent workers, and connect
   eligible shared assessments to the app's investigation surfaces.
