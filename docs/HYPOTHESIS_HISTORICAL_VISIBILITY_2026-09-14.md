# Historical visibility boundary — isolated continuation, 2026-09-14

Production cutover remains ON HOLD. No live migration, timestamp configuration, source retrieval or new review is authorized by this implementation.

## Identified gap and correction

The history UI and database already report retained_versions_only and historical_commit_visibility_qualified=false. However, selectHypothesisVersion previously selected as_known_then using completed_at alone. That shared helper could mislabel a transaction-local completion timestamp as committed historical availability even though the current UI did not invoke that mode.

The helper now denies that mode with historical_commit_visibility_unqualified. Invalid times remain invalid_history_time. Caller-supplied committed_at or qualification booleans cannot enable it. Selection of the latest retained reconstruction and immutable chain validation are preserved. No saved assessment or earlier evidence is rewritten.

Native tests hold an actual acceptance transaction open, observe that its completed_at is already before an independently observed boundary while the row remains invisible to another connection, then commit and verify that the saved history still refuses a historical visibility claim. A separate rollback case proves the transaction-local record never enters committed history. These cases are synthetic hosted PostgreSQL tests, not production clock qualification.

## Remaining implementation requirement

A trustworthy arbitrary historical-time view needs authoritative committed-visibility evidence and a completeness boundary for all relevant revisions, not only a timestamp on the selected row. It must address rollback, concurrent commit order, delayed observation, clock discontinuity, retention of transaction metadata, recovery/restore provenance, unavailable history and current disclosure permissions. Source acquisition and assessment visibility remain separate clocks. Reconstructed now must remain a saved assessment, never silently substitute later evidence into a prior version.

An observed snapshot can prove the set visible at that snapshot; it cannot establish an exact earlier wall-clock commit time. PostgreSQL transaction timestamps may be an input to a separately qualified design, but enabling or reading them alone would not demonstrate all these properties. No production setting is selected here.

## Finite current work register

| Area | Current status | Evidence or next action |
| --- | --- | --- |
| Immutable assessment and retained permission binding | Implemented and tested; new hypothesis package not independently reviewed | 001–008 qualification SQL; candidate 375408e native 69/69 includes authority/revocation and own-user review |
| Evaluated immutable generation, durable recovery and explicit lineage | Implemented and tested in isolation | 009–013; worker 34/34 at 375408e; current credentials and exact arguments required for retry |
| Private authoring and explicit review acknowledgement | Implemented and tested in isolation | Browser run 34807697952, Golden 1801/1801 Node22/24 at 375408e; browser receipt mechanism explicitly synthetic |
| Historical wall-clock visibility | Not implemented; unsafe shared selector now fails closed | New counterexample/rollback regressions require exact-candidate CI; complete committed-visibility design remains engineering |
| Configured frontend/transport/native store integration | Incomplete | Build a synthetic end-to-end integration without calling production Auth or permitting identity from request JSON |
| Production runtime/Auth and custody verification | Blocked on separately authorized deployment/identity only when production-shaped trial is prepared | No new credential needed for present isolated tests; preserve existing owner proposals rather than invent principals or rotation periods |
| Qualified assessment methods and F2 | Blocked on owner-approved methodology | No thresholds, labels, corpus or qualification results invented; synthetic computation remains mechanism evidence |
| Independent review | Material package not yet ready | Preserve existing controller handoff; no new broad review for this correction |
| Production release/retirement | ON HOLD, separate gates | Feature completion is not an independent retirement prerequisite without an actual backend dependency |

Prior failures and frozen manifests remain preserved. The CC batch remains closed 3/3, with no activation subject. Current change requires its own CI; previous passing results do not verify this new candidate.
