# Historical commit-stream feasibility — native isolated evidence

The arbitrary-time selector remains closed. This batch tests PostgreSQL logical decoding as one input to a complete temporal model; it does not enable history queries or declare that commit timestamps equal global read visibility.

## Executable experiment

The existing hypothesis-native workflow uses its same disposable PostgreSQL17 service. A guarded preflight verifies the single expected test container, changes only that service's wal_level to logical and restarts it before fixture setup. No production setting, slot, grant or replication credential is touched.

Four native cases use actual hypothesis acceptance and its existing revision_transactions metadata:
- an open transaction and a rolled-back assessment emit no committed revision metadata; committed acceptance emits matching transaction metadata and a commit record;
- two different investigations commit in the reverse order of transaction allocation, proving transaction-ID order is not commit order;
- a killed consumer before acknowledgement can read the same stream again, then explicit consumption advances it;
- a slot created after an existing assessment does not reconstruct that assessment's earlier commit evidence.

All decoded contents are synthetic and remain in remote process memory. Tests print names/results, never decoding output. Slots are dropped by cleanup. The test_decoding plugin is a feasibility fixture, not the proposed production export format. It can decode other synthetic test tables; a production design must select only allowed non-content metadata and qualify that boundary independently.

## Design consequences

A complete implementation needs an initial snapshot tied to a stream start point, a durable metadata consumer with exact duplicate/conflict handling before acknowledgement, an independently retained origin/restore epoch, detection of missing or invalidated continuity, and current permission checks at delivery. Any legacy range without authoritative commit evidence remains explicitly unavailable; no present-day slot invents its past.

The time model must separately bind commit order, recorded commit-clock information and observed availability intervals. Commit metadata alone does not prove a complete history at every arbitrary wall-clock cutoff. Ambiguous intervals, clock discontinuities, missing bootstrap, lost continuity and unqualified restores must deny a historical qualification. The existing external epoch pin requires prepared-restore configuration and is not automatic rollback detection.

The next implementation dependency is the minimal non-content stream/checkpoint contract and bootstrap/coverage proof. The experiment does not authorize production replication access, a new consumer deployment, a retention/clock policy, or a broader material disclosure. Such intended-host choices remain in the existing owner-gated trial/custody proposal.

## Primary technical references

PostgreSQL documents logical decoding, duplicate delivery after crash, receiver responsibility and the consistent exported-snapshot starting point. [Logical decoding concepts](https://www.postgresql.org/docs/17/logicaldecoding-explanation.html). Commit callbacks provide transaction information to output plugins; the consumer still needs its own durable coverage evidence. [Output plugins](https://www.postgresql.org/docs/17/logicaldecoding-output-plugin.html).

Exact-candidate CI must establish whether these native cases pass. No prior result is reused as proof of the new experiment. Cutover ON HOLD; CC closed3/3; all prior failures, frozen reviews and local-storage restrictions preserved.
