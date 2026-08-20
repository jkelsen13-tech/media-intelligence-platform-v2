# V2 pre-launch Track 3 — ingestion propagation and withholding audit

**Scope.** This audit covers the isolated V2 sandbox only (`yhbwnrtlqbjtcrrlpbge`). It evaluates the completed read-only original-source import batch `original-readonly-cross-surface-import-20260820` against the public News, Knowledge Graph, Causal Timeline, Story Arcs, and Source Comparison contracts. The retained original was queried only to compare already-stored arc-root relationships; no V1/original record was written. Legal/Policy rendering and approval workflow changes, Document 07, Callais, and redistricting-adjacent records were excluded.

## Standing regression coverage

The durable command is `npm run verify:track3`, documented in [`verifier/TRACK3_PROPAGATION_CHECK.md`](../TRACK3_PROPAGATION_CHECK.md). It accepts a runtime-only isolated-V2 service-role credential, records JSON output, performs no mutation, and returns a nonzero exit status for a failed propagation or withholding condition. Its deterministic fixture coverage is in [`tests/track3PropagationVerifier.test.mjs`](../../tests/track3PropagationVerifier.test.mjs).

> The checker measures eligibility rather than forcing every article onto every surface. An article reaches the graph only with a documented arc root or a resolved citation; it reaches Story Arcs and the Timeline only with a valid arc relationship; and it reaches Source Comparison only through a non-`timeline_only`, multi-outlet event. Unsupported relations remain excluded rather than inferred.

## Repair made during this audit

The batch census exposed a V2 importer omission: source story-arc root relationships were not copied into `story_arcs.root_node_id`. Before repair, 49 of V2’s 53 arcs had no root; 37 of those were article-bearing. The retained original had 45 documented arc roots and four intentionally rootless arcs. A read-only precheck confirmed that all 45 corresponding V2 arcs and root nodes existed, and the title review found no Callais or redistricting-adjacent arc in the repair scope.

The V2-only migration [`20260820_v2_restore_imported_arc_roots.sql`](../../supabase/migrations/20260820_v2_restore_imported_arc_roots.sql) restored those 45 documented values only where V2’s root was null. The import function now performs the same source-mapped, non-inferential restoration after node mappings are durable, records `arcRootsRestored` and `arcRootsSkippedUnmapped`, and is deployed as V2 importer version 12. The importer regression guard prevents removal of that sequence.

| Repair verification | Before | After | Result |
|---|---:|---:|---|
| Source-documented V2 arc/root pairs that existed locally | 45 | 45 | **Pass** — every repair pair was source-backed and locally present. |
| Imported article graph reachability via arc root | 0 | 118 | **Repaired** — documented arc roots now anchor article-bearing arcs in the graph. |
| Imported article graph reachability via resolved citation | 1 | 1 | **Pass** — preserved. |
| Total imported article graph reachability | 1 | 119 | **Repaired** — no fabricated link was introduced. |
| Imported arc-linked articles without a documented root | 189 | 71 | **Honest exclusion** — four retained source arcs are rootless; no substitute root was invented. |

The remaining 71 graph-excluded arc articles belong to four original-source arcs with no source root: **US–Iran — military escalation** (36), **US–Saudi — nuclear deal** (20), **France & Spain wildfires — disaster response** (9), and **DR Congo — Ebola outbreak** (6). This is a retained-source coverage gap, not a V2 mapping failure; the public graph correctly omits a direct link where no recorded root exists.

## Full-batch propagation results

The selected real batch contains **752 active News records**. Its import ledger is marked `completed` with 20 durable checkpoints, and it recorded 789 projected Source Comparison claim groups. The surface census below is full-batch, not a hand-picked sample.

| Public surface | Eligibility population and evidence | Result |
|---|---|---|
| **News** | 752/752 batch articles have `source_status = active`; all are public feed records. | **Pass** |
| **Knowledge Graph** | 624 batch articles have extracted entities, but entity extraction alone does not create a graph claim. After the repair, 118 articles are graph-reachable via documented arc roots and one via a resolved citation; 119 total have a supported graph route. | **Pass** — only documented links are displayed. |
| **Causal Timeline** | 189 articles have a valid arc and therefore a direct News-record timeline entry; 746 have event membership for chronology. No event-membership orphan was found. | **Pass** |
| **Story Arcs** | 189 articles are attached to valid existing arcs; there are zero `articles.arc_id` orphans. | **Pass** |
| **Source Comparison** | 19 non-`timeline_only`, multi-outlet events are eligible; all 19 exist in `comparison_public`. All 382 eligible batch members appear in the public projection, with 789 claim groups. | **Pass** |

Source Comparison eligibility is deliberately conditional. The check requires both the database event rule and the final `comparison_public` projection, so a successful lower-level `event_articles` write is not mistaken for a visible comparison card.

## Withholding results and examples

| Withholding category | Real V2 evidence | Result |
|---|---|---|
| **Rejected / owner-held candidate targets** | 21 gated candidates were present: 18 rejected and 3 owner-held. All 21 had `target_id = NULL`, including the rejected graph-node candidate and all geography-mention candidates. | **Pass** — no gated target was materialized. |
| **Protected legal records** | V2 contains zero protected `p3_legal_case` rows. The completed original-source import ledger records `p3LegalCasesExcluded = 1`. | **Pass** — protected case was withheld from import. Legal/Policy UI was not changed or audited. |
| **Document 07 / held run tag** | `held_run_tags` contains `doc07-canary-2026-08-08`; no article carrying that tag exists in V2. | **Not observed live, guarded** — the standing checker treats any future retained held article as an immediate News-surface failure and also reports derivative rows. |
| **Non-active source status** | All 12,558 V2 article records are currently `active`; no corrected or withdrawn record exists to exercise the inverse path. | **Not observed live, guarded** — the standing checker fails immediately if any non-active article appears because the News route has no `source_status` filter. |
| **Metadata-only reference rows** | The standing checker verifies that such rows retain no arc, citation, article-entity, or candidate derivatives while allowing the intended News/chronology record. Its failure path is fixture-tested. | **Regression-guarded** |

The `NOT_OBSERVED` outcomes are deliberate coverage disclosures, not false passes. The repository tests exercise the held-run and non-active failure branches with deterministic fixtures, while every future V2 batch can be run through the same full-corpus checker.

## Diff against retained originals

| Changed V2 artifact | Difference from retained original / prior V2 state |
|---|---|
| `story_arcs.root_node_id` | Restored 45 values from the retained original’s documented arc-root map; only V2 null roots were updated. |
| `import-original-source` V2 function | Adds one post-node-mapping `arc_root_mapping` stage. It maps source IDs through durable V2 mappings, preserves existing roots, and skips unmapped records without inference. |
| `runV2Track3Propagation.mjs` and tests | Adds a read-only full-corpus audit of the public-surface eligibility and withholding rules; no browser grant, RLS policy, or Legal/Policy route changes. |
| `20260820_v2_restore_imported_arc_roots.sql` | Idempotent V2 data repair for the 45 prechecked source-backed roots; no V1 write and no Callais/redistricting-adjacent record included. |

## Track 3 disposition

**Track 3 is ready for the audited original-source batch.** The only propagation defect found was the omitted documented arc-root mapping; it was repaired in V2, deployed in the future importer, and rechecked. Four original arcs remain rootless because the retained source itself supplies no root relationship, so their 71 articles are correctly excluded from direct graph reachability rather than linked by assumption. The standing checker converts the assessed conditions into a repeatable regression gate while preserving all existing withholding boundaries.
