# Continuous evidence discovery: evaluation contract v1

Authority: implementation and evaluation contract derived from the owner's
6 September algorithm strategy review and explicit first-step authorization.
Status: contract written; transport gates tested; semantic corpus, adjudication,
comparative baseline run, and full-surface acceptance not yet performed.

## Evaluation unit

Each case identifies exact retained capture/history versions, canonical endpoint
IDs and identity family, an as-of boundary, source observation times, supported
event/valid-time bounds, source excerpts, and the proposed relation type. Record
retrieval candidates separately from the verifier's decision. Comparison event
keys, graph UUIDs, issuer IDs, exchange listings, and token/network identities
must not be substituted for one another by title or ticker similarity.

Each evaluated assessment carries algorithm and input-set versions, raw source
dependencies, derived dependencies, separate uncertainty dimensions, remaining
questions, and a private release state. Keep previous assessments immutable and
link supersession. A current reconstruction can include newly discovered old
evidence; as-known-then results exclude evidence first observed later.

Reference labels need source-grounded rationale and independent adjudication.
Historical model audit labels are baseline outputs, not independent truth.
Automate routine organization and evaluation assistance without requiring the
owner to review every article. Unresolved adjudication remains explicit.

## Coverage matrix

| Dimension | Essential cases | Reported failure or abstention |
|---|---|---|
| Event membership | Shared actor in distinct episodes; true paraphrase; broad topic versus one occurrence | False merge, false split, retrieval miss, insufficient scope. |
| Claims | Negation; 12 versus 120; attribution; modality; changed date/unit; correction versus contradiction | Wrong equivalence/opposition, unbound excerpt, insufficient context. |
| Source lineage | Exact copy; appended paragraph; wire attribution; partial reuse of one claim | False independence, false shared origin, unknown lineage. |
| Arc continuity | Multi-year return; explicit case/policy identifier; unrelated same-name actor | Missed continuation, contaminated arc, unsupported typed link. |
| Causal binding | Nearby causal word; primary citation without asserted endpoint relation; disputed causal allegation | Wrong endpoint, allegation promoted to fact, sequence called cause. |
| Historical discovery | Late old document; new alias; reopened insufficient-evidence pair; dated supplier relation | Missed new pair, wrong valid interval, historical knowledge leakage. |
| Retractions | Corrected number; entity split; withdrawn support | Stale downstream result, erased old version, missing dependent invalidation. |
| Cooperation | Three outputs from one article; circular derived support | Independent-evidence inflation, endless reevaluation, hidden disagreement. |
| Surface consistency | Event-to-News identity; Graph/Timeline/World View/Comparison/Markets transitions | Incompatible assessment version, invented place, context lost. |
| Markets | Listing/share class; ticker collision; indirect dated exposure; unavailable quote | Unsupported relevance, current quote as historical price, price causation. |

## Measurement and splits

Separate candidate retrieval recall from verifier accuracy. Report false merges,
false splits, relation-type errors, source-lineage errors, abstention, useful
coverage, stale-result propagation, latency, and cost per processed change.
Unresolved cases count in coverage and uncertainty; do not remove them to improve
apparent accuracy. Repeated captures of one source are not independent trials.

Create development and frozen held-out partitions by event/arc, source family,
and time; prevent near-duplicate leakage. Store the partition manifest and
input hashes. Choose sample sizes from required coverage and error bounds;
do not invent a universal sample count or threshold here. Evaluate the complete
admission population above a proposed threshold. A model is not selected until
it improves measured quality and useful coverage at acceptable operating cost.

## Execution sequence

1. Preserve a varied bounded real-evidence collection privately, with manifests
   and source clocks. The one current v2 capture is insufficient. Do not publish
   legacy rows to obtain a test corpus. Do not invent excerpts for missing bodies.
2. Run recovered lexical comparison and Arc scorers as baselines. Include the
   review's synthetic negation, quantity, paraphrase and near-copy probes as
   regressions, separately from real-corpus accuracy measurements.
3. Compare structured claim verification and persisted lineage against those
   baselines. Deterministic quantity, date, polarity, and identity checks constrain
   semantic model proposals; ambiguous cases retain an explicit abstention.
4. Add long-history candidate retrieval and dependency invalidation. Search both
   existing consumers and absent pairs, using bounded resumable pages and coverage
   receipts. Candidate truncation is partial coverage, not a completed search.
5. Demonstrate an ordinary new connection and a late-historical connection from
   retained evidence through private assessment and all applicable projections.
   Verify correction/retraction, no circular support gain, and as-known-then mode.
6. Measure broader held-out quality before any release-policy proposal. Existing
   auto-approval gates remain disabled. Temporal models and price forecasting
   cannot close semantic or publication gates.

## Worker integration gates

Both routes must produce durable work that refers to the source change and
contract version. A worker may complete delivery only after result persistence;
lost responses/retries must reuse the same exact result. Current `work_ref`
acceptance checks shape only, so integration must bind it to a real stored
result/checkpoint. It is not an approval or an independent evidence item.

Before enabling a scheduler, test actual simultaneous workers, late commits with
lower allocated positions, crash before and after durable writes, stale completion,
lease expiration, bounded reconciliation, dead-letter inspection, and incomplete
retrieval pages. Do not claim semantic success because queue transport tests pass.

Markets must share the same mappings, lineage and historical relevance paths.
The accepted TradingView stock display and conditional CoinMarketCap crypto
route remain separate price adapters. Preserve the zero subscription-cost target,
attribution, account-rights gates, truthful ranges, and quote/history limitations
in `MIP_MARKETS_INTELLIGENCE_v0.1_2026-09-05.docx`.
