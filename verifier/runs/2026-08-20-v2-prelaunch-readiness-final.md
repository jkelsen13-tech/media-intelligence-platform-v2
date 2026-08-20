# V2 pre-launch readiness — final per-track results

**Completed on:** 2026-08-20  
**Scope:** Media Intelligence Platform **V2** only. All database writes were limited to isolated sandbox `yhbwnrtlqbjtcrrlpbge`; the retained original was read only for a documented source-to-V2 mapping comparison. Legal/Policy workflow changes, automatic promotion, grant restoration, and Document 07, Callais, and redistricting-adjacent changes were excluded.

The final repository state is committed and deployed through `04b900d`. The V2 regression suite passed **462 tests**, the Vite production build completed successfully, the GitHub Pages deployment succeeded, and a post-deployment browser replay passed on the live site. The outcomes below remain **separate by track**; this document intentionally does not collapse them into a single aggregate launch declaration.

## Track 1 — Knowledge Graph quality

**Disposition: Ready for the current public graph, with two explicitly retained pipeline-quality follow-ups.** The graph’s bounded default rendered as a legible 20-node, 22-relationship view and exposes expansion, reset, geography, time, reliability, and zoom controls. Its full 805-node mode remains opt-in rather than a default density burden.[1]

| Required measure | Result | Disposition |
|---|---:|---|
| Edge precision sample | 20 sampled citation/shared-entity edges; **0/20 false connections** observed (**0%**) | Pass |
| Claim grounding sample | 24 literal-retained claim surfaces; **0/24 hallucinated or misattributed** claims observed (**0%**) | Pass |
| Entity extraction literal match rate | 3,274 / 3,388 links (**96.6%**) | Pass with artifact follow-up |
| Boilerplate artifacts | 2 clear CTA/UI fragments extracted as entities | Flagged for a systematic extraction rule; not edited ad hoc |
| Claim retention auditability | 287 / 865 active public claim surfaces lack an exact retained-field match | Flagged as a durable evidence-span/retention gap, not labeled hallucination |
| Imported shared-entity provenance | Article references resolve **293 / 293**; entity references resolve 266 / 293, with 27 original unmapped values retained | Repair verified |

The completed V2 repair rewrites imported edge metadata through the source-to-target mapping ledger while preserving source identifiers under private provenance metadata. It created, deleted, or reclassified **no** graph edge.[1]

> **Track 1 owner follow-up:** Add a systematic entity-extraction rule for boilerplate fragments and define a durable evidence-span contract for legacy claim surfaces. Neither task was silently substituted with one-off data edits.

## Track 2 — public interactivity

**Disposition: Ready.** Every checked control on News, Knowledge Graph, Geography, Causal Timeline, Story Arcs, and Source Comparison has a recorded pass. The one reproducible defect—full-text News search timeout—was repaired with V2-only trigram indexes on the existing title, summary, and article-text substring fields. No public base-table grant was restored.[2]

| Page and control set | Final outcome |
|---|---|
| News search and article expansion | **Pass.** The final live replay of `Michigan Looks Left` returned one New York Times card with stored summary and no timeout. Article expansion retained publisher/provenance and truthful empty states. |
| Knowledge Graph default, controls, geography, and time | **Pass.** Focused graph, legend, threshold, zoom, fit/reset, Geography, and Time controls rendered. Live `Expand` changed the graph from 20 nodes / 22 relationships to 26 / 28. |
| Causal Timeline selector, filters, detail, evidence, and connections | **Pass.** A selected arc rendered 13 ordered records, sequence-only labels, date/type filters, details, and attached evidence. |
| Story Arc directory, status, coverage, Overview/Timeline/Evidence | **Pass.** Imported arcs render with status, coverage disclosure, lifecycle, source-attributed developments, and working tab navigation. |
| Source Comparison cards, search, links, explanations, and destinations | **Pass.** Projection-backed cards render claim groups, review/lineage disclosures, source framing, timing, and Arc/Timeline/News actions. |

## Track 3 — ingestion propagation and withholding

**Disposition: Ready for the audited original-source batch, with transparent source-coverage exclusions and a standing regression gate.** The selected completed import batch contains 752 active public News records and 20 durable checkpoints. The full-corpus check confirms propagation through each surface only where its documented eligibility rule is met; it does not force unsupported links.[3]

| Surface or boundary | Full-batch evidence | Result |
|---|---:|---|
| News | 752 / 752 batch articles active | Pass |
| Knowledge Graph | 118 articles reach a documented arc root and 1 reaches a resolved citation; **119** supported graph routes | Pass |
| Causal Timeline | 189 valid arc-linked articles and 746 event-membership articles; 0 event-membership orphans | Pass |
| Story Arcs | 189 valid attached articles; 0 orphaned `arc_id` references | Pass |
| Source Comparison | 19 eligible multi-outlet events / **19** projected; 382 eligible members / **382** projected; 789 claim groups | Pass |
| Rejected and owner-held derivative candidates | 18 rejected + 3 owner-held; all **21** have null `target_id` | Pass |
| Protected legal exclusion | 0 protected V2 cases; importer reports 1 excluded source case | Pass |
| Held-run tag and non-active source statuses | No live examples retained in V2 | Not observed live; explicit failure branches are fixture-tested and enforced by the standing checker |

The Track 3 audit found and repaired one V2 propagation defect: **45 source-documented story-arc roots were omitted during import.** A V2-only idempotent migration restored all 45 after verifying each source arc and root node exists locally. The V2 importer now restores documented roots after durable node mappings and records restoration/skip counts, preventing recurrence. Post-repair graph reachability increased from 1 to 119 supported imported-article routes.[3]

Four retained-source arcs have no source root at all, leaving 71 article records correctly excluded from direct graph reachability. No fallback connection was invented. The permanent `npm run verify:track3` command performs the same read-only full-corpus propagation and withholding assertions for future V2 batches, with deterministic failure fixtures and no stored credential.[3]

## Diff and deployment record

| Commit / deployed component | Change relative to prior V2 or retained source |
|---|---|
| `12337e2` — News search repair | Added three V2 trigram indexes. Search semantics and all public read restrictions remain unchanged. |
| `8a57274` — Track 3 repair | Restored 45 source-backed V2 arc roots only when null; added future importer stage, 4 verifier fixtures, standing read-only checker, and Track 3 audit. The active importer is V2 function version 12. |
| `04b900d` — local/global answers | Added answer-only backlog response and schema census; no profile, outlet, topic, ranking, or location feature was implemented. |
| Final live deployment | GitHub Pages deployment completed successfully. Live News, Graph, Timeline, Story Arcs, and Source Comparison replay passed. |

## Local/global relevance questions — answer-only record

The five captured questions are answered in the decision-ready record: recommend an optional declared **city/region/country** location; treat outlet locality metadata as **absent** today; start owner-reviewed global salience with trade/tariffs, climate, AI policy, and nuclear energy; provide a neutral primary feed with a separately labeled global module when no home is declared; and sequence a metadata-readiness workstream independently from this completed V2 audit.[4]

## References

[1]: ./2026-08-20-v2-track1-graph-quality-audit.md "Track 1 — Knowledge Graph quality audit"
[2]: ./2026-08-20-v2-track2-interactivity-audit.md "Track 2 — public interactivity audit"
[3]: ./2026-08-20-v2-track3-propagation-audit.md "Track 3 — ingestion propagation and withholding audit"
[4]: ./2026-08-20-v2-local-global-relevance-response.md "Local/global relevance backlog — decision-ready response"
