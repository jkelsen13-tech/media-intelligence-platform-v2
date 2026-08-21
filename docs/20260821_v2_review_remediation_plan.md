# Version Two Read-Only Review — Risk-Tiered Remediation Plan

**Scope.** This plan applies only to `media-intelligence-platform-v2`. It is based on the supplied read-only review, repository inspection, and read-only Version Two database validation performed on 2026-08-21. It deliberately separates the **Source Comparison correctness gate** from product-quality and visual follow-on work.

> **Release rule:** Source Comparison is not a dependable reader-facing comparison surface until an event’s membership has been explicitly admitted by the semantic-membership gate. No outlet count, timing claim, shared/unique-claim label, omission label, or downstream presentation improvement constitutes a Source Comparison fix while this gate is closed.

## Validation summary

| Review finding | Validation result | Repository / data evidence | Handling |
| --- | --- | --- | --- |
| P0: Cross-topic Source Comparison cluster | **Confirmed; release-blocking.** | The Version Two database contains the candidate event `Pochettino agrees to new manager contract with US Soccer` with its two soccer articles combined with English FA/FIFA and Iran/Hormuz/Iran-Hamas articles. The projection runner selects every non-`timeline_only` multi-outlet event and treats its membership as fixed. | Implement a default-deny semantic-membership admission gate and quarantine candidate clusters from all comparison projection and public rendering. |
| P1: News Feed input quality | **Confirmed.** | The Version Two feed exposes raw article title, URL, source, and grouped event fields. No relevance policy, intake state, title normalization, duplicate/blocked-page exclusion, or promotional-content field is present in the read path. | Add a non-destructive public-read eligibility layer and a documented intake-policy contract. Do not claim that this retroactively classifies every existing article. |
| P1: Research collection presented as Story Arc | **Confirmed for the February 2026 collection.** | The seed explicitly calls `february-2026-source-mapped-policy-watch` a bounded organizing container across separate topics, while the UI labels every object as a Story Arc and describes a common longitudinal-consequence model. | Add an explicit display-object type; label that seed as a research collection / policy watch while leaving genuine story arcs unchanged. |
| P1: Graph coverage opacity | **Confirmed.** | The graph is intentionally focused and knows full-node versus shown-node counts, but exposes no corpus-resolution accounting for articles, review-pending candidates, reviewed relations, or unmodeled remainder. | Add a bounded coverage disclosure based only on stored, measurable link/review states; do not fabricate a single completeness score. |
| P2: Broad `Confirmed` badge for narrow procedural records | **Confirmed.** | The shared confidence map converts both `confirmed` and `corroborated` to the green `Confirmed` badge; the timeline uses that badge without a procedural-record scope label. | Use narrower copy in the timeline and record views. This is a presentation correction, not an outcome validation. |
| P2: Desktop system remains dark / dense | **Confirmed, but not a correctness fix.** | Dark tokens are the default. A light theme exists behind `track_b_light_theme`, but it is opt-in and does not address graph hierarchy or density by itself. | Keep as a separately scoped design migration. Do not enable or characterize it as part of the P0 repair. |
| P2: Mobile source filter wall | **Resolved in the current repository, pending deployment verification.** | At <=767px, source/status chip rows are hidden and the explicit `Filters` sheet contains them. The review may predate the responsive implementation or refer to a deployment not matching this revision. | Regression-test the current behavior; do not count it as a new P0/P1 implementation. |

## Gate A — Source Comparison semantic membership (P0)

The current Version Two projection is intentionally read-only over imported `events` and `event_articles`, but it equates **machine-created membership** with an approved comparison boundary. That is the defect. The remedy must not attempt to make the comparison projection infer truth from downstream claims; it must stop unreviewed or quarantined membership before the projection exists.

| Decision | Implementation | Acceptance criterion | What it does **not** claim |
| --- | --- | --- | --- |
| Default-deny public admission | Add `comparison_validation_state` to `events`, with `pending_review` as the default. Restrict both the projection runner and `comparison_public` to `approved` events. | A multi-outlet `candidate` event produces no derived comparison rows and appears nowhere in the public comparison read path. | That any pending or approved cluster is comprehensive. |
| Quarantine preservation | Preserve all event and member rows; do not delete or rewrite the faulty Pochettino cluster. Make `quarantined` explicit for reviewed failures. | Quarantined events remain auditable in private data but cannot re-enter the projection. | That a rejected cluster proves its member articles are invalid News records. |
| Membership-change invalidation | A database trigger returns any event touched by an `event_articles` insert, deletion, or reassignment to `pending_review`; imports also initialize new events pending. | No membership mutation can silently retain comparison approval. | That imports have been editorially reviewed. |
| Regression scenario | Add a Pochettino-like fixture with soccer, FA/FIFA, and Iran-related articles. Test that only an explicitly approved, semantically coherent event is projected. | The mixed event produces zero comparison claims and zero public rows; approved control produces comparison claims. | That lexical or embedding similarity alone proves a same-world-event relationship. |

**Gate status after code implementation:** **closed until a human reviewer marks an event `approved` following article-level semantic membership review.** This is intentionally stricter than the prior candidate/status convention. It will withhold existing candidate comparisons rather than allow a known false comparison to survive.

## Separate product-integrity work (P1)

These items can improve reader honesty and usability but cannot reopen Source Comparison.

| Track | Implementation boundary | Acceptance criterion | Relationship to Gate A |
| --- | --- | --- | --- |
| News Feed intake quality | Introduce an `article_publication_state` with safe defaults and a public projection/read filter. Add a deterministic rejection reason vocabulary for malformed titles, blocked/unavailable pages, duplicates, promotional material, and off-mission content. | Only `eligible` article rows appear in the reader feed; withheld records stay preserved and queryable to authorized review workflows. | Independent. It does not validate event membership. |
| Research collections | Add a `display_kind` to story containers and supply `research_collection` for the February policy watch. Adapt list, heading, and detail copy to distinguish it from `story_arc`. | The February object is visibly a research collection/watchlist and no longer inherits consequence-arc claims. | Independent. |
| Graph coverage transparency | Add counts for total corpus articles, articles with an approved graph link, review-pending graph candidates, documented edges, and remaining unmapped article records. State that categories overlap only where necessary; do not calculate a completeness score. | Readers can see what the focused subgraph represents and what remains outside it. | Independent. |

## Presentation refinements (P2, explicitly non-gating)

| Track | Proposed action | Risk posture |
| --- | --- | --- |
| Procedural record vocabulary | Replace broad green `Confirmed` language on narrow process records with `Documented record` / `Verified procedural record`, retaining the stored confidence and source scope. | Low-risk wording correction; it neither validates an outcome nor changes source data. |
| Mobile News filters | Retain the current mobile filter-sheet behavior and add a regression test at the mobile breakpoint. | Already implemented in the repository; deploy verification only. |
| Light desktop visual migration | Treat the existing light-theme flag as a starting point. Scope graph hierarchy, legend compression, card density, and reading order as a separate design pass after P0/P1 validation. | Requires visual acceptance testing; deliberately not bundled with correctness work. |

## Implementation order and reporting contract

1. **Implement and test Gate A first.** The comparison surface will contain zero existing candidate events after the gate because the current database has 19 eligible candidate events and one active curated event. This withholding is a correctness outcome, not a feature regression.
2. **Implement the small, isolated P1 data-model/display corrections.** Each will have its own test and explicit limitation.
3. **Apply only safe P2 wording and regression coverage.** Do not enable the light-theme flag or claim desktop design alignment without a separate visual review.
4. **Report separately.** The final status must distinguish: (a) P0 gate implemented, (b) P0 gate operationally closed pending human approvals, (c) P1 corrections shipped or deferred, and (d) P2 presentation follow-on work. Source Comparison must not be described as “fixed” or “improved” beyond **unsafe candidate clusters are now withheld**.

## References

1. Supplied read-only review: `MIPV2—Read-OnlyWebsiteReview.pdf`.
2. Source Comparison Version Two projection: `supabase/functions/source-comparison-run/index.ts` and `lib.js`.
3. Public comparison contract: `supabase/migrations/20260820_v2_public_comparison_projection.sql`.
4. Current public comparison read path: `src/lib/sourceComparisonReadPath.js` and `src/views/SourceComparisonView.jsx`.
5. February policy-watch seed: `supabase/seeds/v2_february_2026_general_news_cross_surface.sql`.
6. Responsive News Feed controls: `src/views/NewsView.jsx` and `src/styles/news.css`.
7. Theme tokens and opt-in behavior: `src/styles/tokens.css` and `src/lib/themeFlag.js`.

## Implementation and live verification record

**Implementation status: completed in Version Two only.** The application and migration changes were committed in `73a9c30` (`fix(v2): gate comparisons and improve review findings`) and the membership-mutation hardening in `ce2075d` (`fix(v2): invalidate comparison approval on membership change`). Both commits were pushed to `jkelsen13-tech/media-intelligence-platform-v2` on `main`. No Version One repository, schema, or service was modified.

| Verification area | Measured Version Two result | Interpretation |
| --- | --- | --- |
| Comparison membership state | All 12,868 stored events are `pending_review`; zero are `approved`. The Pochettino-title event records are also `pending_review`. | The gate is intentionally closed until article-level semantic review approves a precise membership set. |
| Public Source Comparison | `comparison_public` contains 0 events. | Readers cannot receive outlet, timing, shared/unique claim, or omission metrics from an unvalidated event cluster. |
| Previously derived comparison rows | 789 projected claims, 844 projected article-claim rows, and 844 projected explanations were removed after the public gate took effect; final verification returned zero for each projection category. | Old downstream calculations no longer remain stored as apparently current evidence while their membership boundary is unapproved. Source events and event-article rows were preserved. |
| Mutation invalidation | The deployed trigger resets an approved event to `pending_review` on any `event_articles` insert, deletion, or reassignment. | A subsequent import or edit cannot silently retain prior comparison approval after changing the member set. |
| Research collection taxonomy | `february-2026-source-mapped-policy-watch` now has display kind `research_collection`. | The reader UI can distinguish a bounded source-mapped collection from a longitudinal story arc without changing its underlying joins. |
| Graph coverage disclosure | The aggregate projection reports 12,558 corpus articles, 805 published nodes, 447 documented relationships, 9 article records linked to a published node, 0 pending graph candidates, and 12,549 article records not yet node-linked. | These are explicit stored-state counts, not a graph completeness, reliability, causal, or outcome score. |
| News Feed intake | 10,485 records remain reader-eligible; 1,990 malformed-title records and 83 exact canonical-URL duplicates were withheld. | The deterministic gate removed the verified malformed/duplicate cases while retaining all rows for review. Promotional and off-mission classification remains intentionally human-reviewed rather than inferred. |
| Automated validation | The complete Node suite passed 478/478 tests. The production bundle completed successfully. The first implementation commit’s Golden regression and GitHub Pages deployment workflows completed successfully. | Code-level and repository deployment checks passed; the Source Comparison gate remains intentionally closed by policy, not due to a failed deployment. |

> **Current reader-facing status:** Source Comparison is correctly **withheld pending semantic event-membership review**. This is the intended safety posture. It is not accurate to say that comparison quality metrics have been fixed, improved, or validated; only their unapproved publication path has been closed.

## Controlled next step for Source Comparison

A reviewer may approve an event only after confirming that every member article describes the same discrete world event and that the title, date, actors, and event action are coherent across the set. Approval should be recorded as an explicit update from `pending_review` to `approved`; after membership changes, the database trigger will require this review again. The safe operating sequence is therefore **review member set → approve exact membership → rebuild projection → inspect reader output**.

The light-theme and broader desktop visual-system work remains a separate P2 design pass. It was not enabled or reported as part of the correctness repair.
