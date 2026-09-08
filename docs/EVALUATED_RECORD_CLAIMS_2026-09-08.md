# Evaluation-gated record candidate claims

The six pending record-version candidate-search jobs require a retained, passing evaluation before claiming. No approvals are seeded. Capture retrieval and dependency lookup retain their existing contracts. This change starts no worker, scheduler, publication or ingestion.

The new server-only invoker RPC `mip_evaluated_record_claim_v1` requires an immutable evaluation ID, exact implementation SHA-256 and supported record kind (article, graph_node, temporal_assessment). The receipt records algorithm/version, implementation/dataset/report hashes, retained report reference, reviewer, case count, limitations and five required acceptance checks, including held-out evaluation and evidence fidelity. Qualification is an operator attestation backed by retained artifacts; SQL cannot establish semantic quality or verify a remotely asserted binary hash. This is not publication approval.

Both claim selection and expired-lease recovery filter the record kind through record_versions. One job per call, a two-minute lease, five attempts, bounded 100-row expiration recovery and SKIP LOCKED are retained. Claim events retain the evaluation and algorithm identity. No leases are returned to a browser.

The older producer claim rejects record-version candidate search. The legacy mixed-producer candidate claim rejects the route and directs callers to scoped APIs; dependency lookup remains available. A service-role holder remains trusted and has direct queue access under the existing design; this gate is the supported API contract, not protection against a compromised service key.

Revocations are append-only. The revoke RPC locks the evaluation row against claims; an already granted lease is not retroactively cancelled. Direct operator inserts must not bypass this serialization. Evaluation rows grant UPDATE only because PostgreSQL requires it for row locking; immutable triggers reject actual rewrites and truncation. No browser grants or RLS policies are introduced.

## Verification and release

Node 22/24 tests/build plus structural security regression checks are required before merge. After applying the single proposal, run verifier/evaluated_record_claim_rollback.sql, then compare complete queue/events/change/retrieval hashes before/after. Fixtures are explicitly synthetic and rolled back; they are not retained qualifications. Test both positive matching-kind selection and missing/mismatched/revoked gates and legacy bypass rejection. Concurrent revocation ordering follows PostgreSQL row locks; the rollback test is sequential, not a concurrent load test.

No qualified record-version adapter or nonempty supporting/disconfirming evidence result has been established. The six jobs must stay pending at attempt zero. NASA immutable version 2 and explicit reassessment/review receipt remain conditional on that actual evidence result; no semantic support is inferred from a candidate match or source count.
