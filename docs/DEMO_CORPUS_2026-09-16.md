# Bounded demonstration investigations — retained corpus and isolated preview

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

## Final retained corpus

The initial three proofs were expanded to **93 distinct retained source documents: Iran 30, Epstein 30, Project 2025 33**. Each has one immutable pending capture and one pending exact-span claim candidate. These are bounded excerpts, not full-text articles or an assertion that every candidate is analytically substantive. Several deliberately narrow procedural passages establish only a review scope, directive, or attributed statement. Their limitations are preserved per record; they must not support broader claims through their titles.

`retained-source-receipts.json` and `expanded-source-receipts.json` in `verifier/demo-corpus-20260916/` are metadata-only durable manifests. They preserve URL, title, issuer/outlet, source date precision, type, origin/dependency cluster, rights, Manus lineage where matched, rationale/statement, remaining uncertainty, capture/article/candidate IDs, hash, and exact code-point range. Retained text is in private qik captures. Full copyrighted bodies, personal-data disclosure files, and media are excluded from GitHub and intake.

Three source URLs match Manus metadata (initial DOJ OIG audit, initial Seattle DOJ release, and expanded DOJ January 30 production release). **Zero Manus bodies were reused**: all 93 retained excerpts were freshly verified against public sources. Ninety source URLs are new relative to the inventoried Manus records. Publisher aliases, distributed government releases, and CRS mirrors do not create extra independent origins. The 111-row Manus discovery inventory remains separate and is not counted as retained evidence.

Iran combines IAEA assessments, US military/White House/Treasury statements, CRS analysis, UK/E3/joint diplomatic statements, and Commons Library research. Belligerent accounts and institutional perspectives remain attributed; this is not a balanced comprehensive account of all parties, and no direct Iranian statement passed the body/rights verification used for retention. Epstein covers statutory/proposed law, oversight, review protocol, disclosure accounting and process milestones from DOJ, OIG, House and Senate sources; underlying personal files are excluded. Project 2025 includes an original 19-word proposal excerpt, proponent/opposition statements, executive directives, agency guidance, rescission, interim/final rules, GAO/IG oversight, and court stays. Similarity does not establish Project 2025 causality or implementation.

## Dedupe, dependence and evidence verification

There are 93 distinct canonical source URLs and 93 captures; 90 expanded records were re-enqueued and candidate-appended with identical payloads, returning the same job/capture/candidate IDs. Initial three idempotence was separately verified in the first checkpoint. No duplicate records were created on repeat. Same-origin or same-process documents retain explicit dependency groups: examples include DOJ's January 30 letter/release, received versus published page counts, OMB pause/rescission, Schedule Policy/Career directive/guidance, and CEQ interim/final rules.

All 4,278 capture pairs were considered for bounded-text near-duplicate review using NFKC lowercase Unicode-token Jaccard similarity >=0.8, with at least eight distinct tokens on each side. No qualifying pair was found. This **does not rule out full-document syndication or semantic paraphrase**: retained excerpts are deliberately short. Source-origin clusters are institutional provenance, not counts of independent factual confirmations. Where a dependency spans several named agencies, the preview withholds those origins from its conservative count rather than silently counting them as independent.

Live readback recomputed SHA-256 over canonical job payloads and verified all 93 capture hashes; all 93 exact candidate spans match retained fields using PostgreSQL code-point offsets. Every article remains `pending_review`, every capture/candidate `pending`, and all candidate public graph/spatial references remain null. Independent read-only review cross-checked every metadata receipt against live IDs/hashes/spans. `qik-after.json` records the exact totals and verification results.

| Retained object | Before | After |
| --- | ---: | ---: |
| Articles | 5 | 98 |
| Private captures | 2 | 95 |
| Private candidates | 3 | 96 |
| Public nodes | 1 | 1 |
| Public events | 1 | 1 |
| Public arcs | 0 | 0 |

After-state additionally has 3 eligible articles, 0 edges, 1 comparison row and 1 spatial row. Those four counts were absent from the durable before artifact, so their unchanged status is **not proved by this artifact pair alone**. No operations in this run wrote them. Anonymous readback sees zero demo articles, and both anon/authenticated lack pipeline EXECUTE. Independent review found article policies and pipeline ACL unchanged. These narrow checks do not resolve Lane A or establish that all public views are secure.

## Isolated frontend and synthetic structures

The separate `scripts/demo-corpus-preview.html` entry imports React, local metadata, pure projection helpers and CSS only; it does not import App, auth, the Supabase client, operator credentials, or a live backend. It is excluded from the normal production build entry and is not deployed. News shows retained metadata; Source Comparison exposes declared dependence without inventing a comparison event; Graph connects private captures and pending statements to declared source origins; Timeline uses source publication dates, not inferred event dates; Arcs shows research collection membership; World View withholds unreviewed geographic joins.

An explicitly labeled invented fixture exercises namespace-qualified actor/event/place identities, separate comparison-versus-graph identities, sequence without causality, timeline membership and arc membership. This is a limited synthetic identity/provenance exercise, **not validation against the production event, arc, comparison or released-spatial contracts**. Real canonical public actor/event joins and geography remain unresolved; no private research object has been silently mapped into a public node. No publication/promotion implementation was added.

Desktop and phone visual inspection by the coordinating agent confirmed rendering, topic/surface controls, provenance, dependency grouping, attribution-only graph, publication-date labels, research-collection disclosure and geographic withholding. Screenshots and browser evidence are reported by that agent. The original separate preview build passed; current preview was served as an in-memory esbuild bundle on loopback after local disk exhaustion prevented Vite cache writes. No preview credentials or live writes were used.

## Tests and remaining gates

Eleven focused tests pass: exact Unicode spans and ambiguity, tracking URL/version distinctions, origin/dependency conflicts, canonical namespace ambiguity, cross-surface capture identity, pending default-deny, corrections, near-duplicate review suggestions, rejection of causal/misconduct/proposal-to-outcome relations, and synthetic identity continuity. Independent reviewer ran the Golden subset: **95/95 pass**. Full suite was attempted on Windows: default parallelism exhausted memory; bounded concurrency ran but hit existing Windows ESM URL, symlink, timezone and CRLF-byte-hash issues. Production build initially failed on missing local dependencies. A pinned npm bootstrap with system certificates reached `npm ci`, which failed with `ENOSPC`; disk is full. These are reported as incomplete verification, not a green production build. Branch CI is the authoritative clean Linux follow-up; final check status belongs in the PR report.

No live admission mechanism was found: qik has pending-only intake/candidates and its legacy graph publisher explicitly rejects publication. After Lane A passes, the owner must separately authorize a reviewed deployment/admission design. That design must bind exact reviewed capture revisions to appropriately authorized article/claim projections, resolve canonical actor/event and comparison identities independently, validate relationship evidence and event times, review arc membership and event/place/released-spatial identity, and emit auditable admission receipts through an approved mechanism. Until that exists and is authorized, retain pending data and use the isolated preview. Lane A PASS alone would not automatically publish this corpus.
