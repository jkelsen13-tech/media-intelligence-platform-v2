# Candidate-Path Repair — Final Validation Notes

## Live News check

On the deployed build at commit `bf4ad33`, the public News view loaded successfully from the isolated live dataset. It displayed **12,558 articles**, the expected evidence-base filters, and source-volume controls. The page retained the explicit statement that missing evidence is recorded rather than treated as contradiction.

The post-repair change affects evidence-gated candidate assessment and removes unsupported metadata-only reference-derived Arc and Graph inferences; it does not remove the corresponding News or chronological Timeline records.

## Candidate-path operational result

The repaired candidate pass completed without errors for the two large scoped batches. The final-deterministic batch assessed 1,510 articles and materialized no cross-surface candidates because its records lacked a qualifying combination of literal stored claim, primary-citation classification, and primary-record URL. The redistricting-exclusion batch recorded owner-review withholding for 10,000 articles and materialized none. The reference-manifest batch recorded metadata-only withholding for 752 articles and materialized none.

The original reviewed candidate ledger remains unchanged: 18 rejected and 3 owner-held, with no approvals because none satisfied the required resolvable primary-evidence-link standard.

## Live Graph and Timeline checks

The public **Knowledge Graph** loaded successfully with **76 nodes** in the post-repair corpus. The selected view showed 15 focused nodes, 14 documented relationships, and four confirmed city-level location markers. The interactive location overlay remained present and source-backed after unsupported metadata-only reference-derived Graph records were removed.

The public **Causal Timeline** loaded with its evidence caveat intact. The selected source-mapped process Arc presented a dated, chronological sequence with explicit `Sequence only` labels and no unsupported causal claim. It continued to show News records alongside accountability records, demonstrating that the metadata-only cleanup did not remove chronological article access.

## Live Story Arcs check

The public **Story Arcs** surface loaded successfully and presented the remaining source-mapped, directly reviewed arcs. The selected Arc showed its coverage proxy, dated lifecycle records, evidence-state caveats, and an explicit warning that Arc membership organizes access and chronology rather than establishing causation, completeness, editorial lineage, or a shared outcome. The deprecated metadata-only reference-derived Arc set was not shown.

## Live Source Comparison check

The public **Source Comparison** view loaded promptly after the bounded eligible-event read repair. It displayed a genuine three-outlet event, its one reviewed claim, a linked primary document, per-outlet framing, timing, provenance caveats, and explicit lineage uncertainty. The view did not remain in a loading state and did not expose the materialized Timeline-only corpus as comparison events.
