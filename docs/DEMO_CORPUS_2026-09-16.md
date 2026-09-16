# Bounded demonstration investigations — work in progress

## Isolation and external authority

Starting application main: `1dc317200b7a928fad85d06b43351b60e2a50d92`, verified with `git ls-remote` before writes. Dedicated branch: `codex/mip-bounded-demo-corpus-20260916`. This work has no implementation relation to draft PR #175; no commits are cherry-picked from it. No merge or deployment is authorized.

Frozen external gatekeeper: [qualification packet](https://github.com/jkelsen13-tech/mip-production-qualification/blob/c66e2d9c98070774128893c15bb2945bca7414ef/review-packets/lane-a-5f7a3df-pg17.md). Runs 26, 27 and 28 were read at this exact head. Frozen verifier FAIL (184 method-artifact failures and invalid PUBLIC probe) remains distinct from the Run 28 supplementary PASS. Comparison runtime write exposure, investigation excess grants with dependency denial, and three additional exposed views remain unresolved production boundaries. All qualification changes were disposable and rolled back. This branch neither reproduces nor deploys that remediation. No ACL, RLS, ownership, function authority or publication eligibility is changed.

## Architecture at the starting main

1. Source registration is metadata and rights review, not evidence or publication. Manus `articles`/`story_arcs` are source candidates; their UUIDs and eligible flags have no destination authority.
2. `scripts/evidencePipeline.mjs` delegates to server-only `operatorBackend.mjs` and `public.mip_pipeline_v1`. Live definition and ACL were inspected: SECURITY INVOKER, empty search path, postgres/service_role EXECUTE only. `enqueue` permits exactly URL/title/outlet/summary/body_text/published_at. URL plus normalized payload SHA-256 deduplicates; receipts retain run identity. `claim` operates across the queue, so a bounded invocation must reject unrelated work and roll back on a mismatched claim.
3. `finish` atomically creates/adopts the canonical article, immutable private capture and completion receipt. New articles default to `pending_review`; corrections retain a new pending capture without overwriting the published article. Captures use `pending`, not the article state's spelling. Existing article triggers were inspected before use; no graph insertion or publication operation is invoked.
4. `candidate` validates exact Unicode-code-point spans against retained text. All candidates are immutable pending records. Graph relationships need two exact canonical nodes; timeline needs an exact event node; geography also needs a matching released spatial revision. Similar labels, publication dates, datelines and agency names cannot invent these identities.
5. `evidence_pipeline` retains version history, evidence changes, assessments, retrieval pairs and investigation inputs. Private investigation review decisions concern relevance and saved observations; they are not factual verdicts or publication receipts. `investigationBackend` routes workspace/checks/reviews/input-impact/source-spans through the authenticated investigation API.
6. Source Comparison has a separate event identity family and dependency closure. Its generation, explanation and selection contracts do not create publication authority. Graph node UUIDs must not be substituted for comparison event UUIDs. `legacy_graph_staging` is private and rejects publish; public graph tables would expose inserted nodes and are excluded from this work.
7. The app's public backend reads the current authorized projections: eligible News and source details, comparison, graph, timeline, arcs and released spatial context. Private-to-public handoff resolves an already-loaded exact public node and stays empty without one. None of this exposes new pending captures. Provenance inspectors must retain exact capture/hash/field/span and distinguish source statements, assessments and reviews.

Reference implementations: `supabase/migrations/20260905082406_evidence_pipeline_reliability.sql`, `scripts/evidencePipeline.mjs`, `supabase/functions/_shared/operatorBackend.mjs`, `src/lib/investigationBackend.js`, and the PUBLIC_BACKEND_COMPOSITION, PRIVATE_PUBLIC_HANDOFF, MIP_LEGACY_GRAPH_STAGING, INVESTIGATION_REVIEW_INTEGRITY and COMPARISON_SELECTION documents.

## Read-only source inventory

The five Manus arcs contain exactly 36 Iran escalation, 6 Iran funding, 60 Project 2025, 6 Epstein disclosure and 3 Epstein fallout records (111 total). The metadata-only manifest preserves each UUID, URL, recorded title/outlet/time/state, body length/hash and prior run identity. Outlet strings are not an independent-origin count.

All 60 Project 2025 bodies are curation placeholders (56 publisher metadata, 3 DOJ release pointers, 1 DOJ memorandum pointer). All 6 Epstein disclosure bodies are process-only pointers. These are excluded as retained source evidence even though Manus marks the articles eligible. Of 42 Iran records only 3 have non-null short bodies; summaries and source availability still require verification. None of the old eligible flags, arc links, claims or placeholder text is transferred.

## Topic safeguards

- Iran: retain attributed event reports, statements, claims, disputes and corrections separately. A combatant's release is evidence of its statement, not independent confirmation. Never infer causality or precise geography from chronology or datelines.
- Epstein: disclosure/oversight process is the bounded topic. No underlying files, victim identities, private contacts, images or travel lists are collected. Document mention, contact and travel never imply misconduct. Public-official identity must be exact before any canonical link.
- Project 2025: separate proposal, agency action, implementation and observed outcome. A DOJ action alone does not prove correspondence with or causation by Project 2025. A motion is not a granted order. Source provenance and political attribution stay visible.

## Initial governed receipts

Live qik before-state: 5 articles, 2 captures, 3 candidates, 1 node, 1 event, 0 arcs. Three freshly verified bounded excerpts were admitted through `mip_pipeline_v1` under `SET LOCAL ROLE service_role`; no direct table writes were used. One candidate per excerpt preserves exact span and uncertainty. Repeating the transaction returned the same three jobs/captures/candidates. Anonymous readback sees zero demo articles and cannot execute the pipeline.

`verifier/demo-corpus-20260916/retained-source-receipts.json` contains durable metadata and exact IDs/hashes only. The source text stays in qik. Two source URLs were rediscovered from Manus but their placeholder bodies were not reused; one IAEA source is new. Publication date has day precision; `published_at` is null rather than fabricating a timestamp.

This initial receipt is **not completion**: one retained excerpt per corpus is below the required 30–60. No graph, timeline, arc, geographic or public-demo admission is claimed. Source expansion, private processing/preview, adversarial tests and Golden/build evidence are still in progress.
