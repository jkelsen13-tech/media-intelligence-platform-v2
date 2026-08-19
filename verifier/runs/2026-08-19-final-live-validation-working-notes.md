# Final Live Validation — Working Notes (2026-08-19)

The GitHub Pages deployment for commit `7b174c5` loaded successfully from the isolated sandbox and reported a 12,558-article live corpus.

| Surface | Observation | Result |
|---|---|---|
| News | Loaded the full article corpus with date, region, evidence, topic, source-order, outlet, and state controls. Missing extraction fields remained explicit rather than inferred. | Pass |
| Knowledge Graph | Loaded with 181 total nodes. The focused view showed 15 nodes and 14 documented relationships; the source-backed location overlay remained available. | Pass |
| Geography mode | Earlier public validation of commit `230f05f` selected Louisville from the Geography panel and returned to Relationships with the breadcrumb `Location: Louisville, Kentucky, United States` and a three-node, two-edge focused graph. | Pass |
| Global Timeline | Loaded after its asynchronous fetch with 248 timeline records, 94 graph events, 154 News records, and 32 duplicate mirrors suppressed. Chronology remained marked as sequence unless source support established causality. | Pass |
| Story Arcs | Loaded 31 arcs, including the reference-news-derived arcs created by the scoped isolated backfill; the selected arc rendered overview, evidence state, milestones, coverage, and chronology boundary. | Pass |
| Source Comparison | The initial load anomaly was traced to a full scan of Timeline-only event memberships. Commit `0b78803` bounds member reads to eligible event IDs; the repaired public view loaded one genuine comparison event, **Court granted DOJ motion regarding Norfolk decree**, with three ingested outlets. The display excludes one-outlet and Timeline-only records and retains lineage-unverified wording. | Pass |

## Final outcome

The public build at commit `0b78803` passed all five named surfaces. The isolated database contains the restored atomic-attachment compatibility field, and the completed reference-news scoped run produced 31 arcs, 181 graph nodes, 94 graph edges, and 12,524 event/article links. Two larger scoped runs remain resumable at their documented extraction checkpoints; no reset, production write, candidate auto-promotion, or review-hold override was performed.

No production project was accessed or modified. Candidate-review state remains 18 rejected, 3 owner-held, and 0 approved.
