# Legacy extractor: preserve the currently public source

Date: 2026-10-02. Source-only defensive follow-on to `e3b0897`; no deployment, activation, migration or publication-rule change.

## Requirement, foundation and reproduced delta

The complete workflow 04/07 contracts separate source retention, extraction, candidate review and audience eligibility. `EVIDENCE_PIPELINE_FOUNDATION_2026-09-05.md` already preserves corrections as separate pending captures: native `finish_job` compares an existing article, records `revision_pending`, inserts a pending capture and leaves the prior article unchanged. This implementation remains intact.

The remaining source writer was `backfill-legacy`'s `extractBatch`. It selected all unextracted rows, including eligible active sources, sanitized title/summary/body, and updated article content without rechecking audience state. Entity resolution and citation deletions/inserts occurred before the source UPDATE. This could rewrite an already public source under its prior verified claim label when a mutation-capable writer ran, or mutate derived provenance even when its source write was denied.

The isolated reproduction uses the actual frozen extraction function, the installed Supabase SDK, parameterized SQL in the existing PGlite foundation, a fictional retained source, and explicit synthetic fixture admission. A reviewed excerpt includes `<b>arrived</b>`; sanitization changes the corresponding displayed summary/body. The fixture exercises the SDK's exact `or=(reader_state.neq.eligible,source_status.neq.active)` request and the equivalent SQL predicate, including a row promoted between selection and PATCH. It is a bounded SDK-to-SQL transport, not deployed PostgREST authentication or full concurrency.

The coordinator supplied the decisive deployed `zz_factual_source_change` clause: unchanged source_status, or a new status outside corrected/withdrawn, returns NEW without invalidation. The probe installs that exact early-return clause with a fixture audit-only branch. It **does not replay the full deployed function**. Source-status-preserving edits therefore do not enter that branch in this qualification. The existing public claim projection joins current eligible active article/claim identities without an approved capture/hash pointer; native history retains changes but is not an approval binding.

## Repair

Existing foundation → missing writer guard → **EXTEND**, preserving predecessor and current policy:

- `supabase/functions/backfill-legacy/index.ts:1381` defines the exact complement of the existing public article predicate, `NOT (reader_state = eligible AND source_status = active)`.
- The scan applies it at `:1394`. The shared UPDATE helper at `:1382` applies it atomically in every source/marker write and requests RETURNING id. This protects a selected pending row that becomes eligible before its UPDATE.
- Metadata sentinel (`:1428`) and regular extraction (`:1447`) perform this guarded source write **before** resolving/upserting entities or deleting/inserting citations. A denied UPDATE or zero returned rows skips those derived mutations. Zero-row outcomes record reviewedSourceSkipped rather than reporting completed extraction.
- Completion writes remain after the derived phase (`:1433`, `:1461`) and use the same guard. The error marker (`:1468`) is guarded too. The existing digest calculation is preserved, with its final metadata update separated from the early source-acceptance write.

No pending correction is automatically published or routed elsewhere. No new RPC/schema, public capture fields, numerical threshold, owner review rule or Breaking/update semantics is introduced. The native queue/capture producer and public read predicates are unchanged.

## Regression evidence

The original-source core run reproduced five failures across six cases: already public content changed; regular/sentinel selection-to-eligibility races changed source bytes; the catch path changed an extraction marker; denied source UPDATE still performed derived mutations. The pending extraction control passed before repair (`legacy-reviewed-source-red-final.log`). The final test also asserts source acceptance before derived writes and completion afterward; replaying those exact final test bytes against unchanged predecessor source produces **six expected failures**, with the pending case failing that added ordering assertion after its extraction-success assertions pass. Exact final reproduction: `/workspace/mip-lane-evidence-receipts/legacy-reviewed-source-red-exact-final.log` (predecessor source SHA-256 `8ffa1eadcf353302571b94a2411607bfd1f506aae258e1b3eeedf167df4ae763`).

Final focused serial qualification: **17 Node tests passed**, including six executable guard cases, existing metadata/candidate/pagination regressions, and the existing eleven-check native intake-to-reader journey. Source UPDATE denial uses the actual restored service_role privileges; the mutation-capable counterexample and racing promotion use explicit isolated postgres fixture authority. Pending control reaches actual entity-resolution logic; zero/denied source writes perform no derived HTTP mutation and never invoke the resolver. The normal control also proves source acceptance precedes derived writes and completion follows them.

Run:

```bash
MIP_LEGACY_SOURCE_RECEIPT=/tmp/legacy-source-guard.json node --test --test-concurrency=1 tests/legacyReviewedSourceGuard.test.mjs
```

Receipts: `legacy-reviewed-source-green.log`, `legacy-reviewed-source-guard.json`, and `legacy-reviewed-source-commit.json` under `/workspace/mip-lane-evidence-receipts`. The actual TypeScript extraction function is compiled by esbuild during the regression. This changes no browser product source, so no new browser build is claimed.

## Fresh deployment disposition and residual gate

The coordinator's fresh read-only catalog report at 08:35 UTC says qik service_role and qik_ingest_fn_owner have no UPDATE authority on existing article columns; browser roles have no writes. Collection authorization/publication release/membership autoapproval are false, all nine intake sources are disabled, runtime credentials/comparison bindings are absent, and scheduled intent is inactive. Current deployment listings do not establish a callable legacy backfill writer. This is a defensive source repair, **not a demonstrated live exploit or a substitute live writer**. No live operation was executed in this lane.

There remains a concrete concurrency window: after an accepted pending source UPDATE returns, independent entity/citation requests and later completion writes run without a shared database lock with an approval transition. If publication occurs in that interval, later child provenance writes could affect the now-public row. The guarded completion cannot undo prior child requests. Source guards protect the source bytes and the pre-write promotion/denial cases; they do not make the entire derived phase atomic with approval.

The smallest remaining contract for future legacy reactivation is a shared server transaction/locking boundary that validates the pending source and writes its derived results atomically with respect to approval. That separate boundary is not implemented here; no broad new transaction RPC or schema was invented. Capture-version binding, publication of changes, live collector/worker activation and whole-platform publication qualification remain separate gates.
