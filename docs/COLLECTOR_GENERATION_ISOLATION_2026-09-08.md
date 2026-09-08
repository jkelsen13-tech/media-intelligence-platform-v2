# Collector generation isolation — survivor transport qualification

The existing survivor queue already references immutable capture/record versions
and creates a separate job for each input, route and contract version. Completion
addresses one job ID with its lease token and appends history. Reuse this transport
where its producer and route semantics fit; do not copy the legacy mutable
one-row-per-event acknowledgement design into the survivor.

A new adversarial regression reproduces the relevant producer/consumer
interleaving against the repository's actual intake, queue, producer-scoped claim
and evaluation-gate migrations:

- Retain and claim an original capture, then read its exact input.
- Retain a correction at the same URL and a different new source.
- Finish the older job; both later capture jobs must remain pending.
- Reject the older token against either later job.
- Claim a later job, then replay the old completion; the newer lease and pending
  sibling must remain untouched, with only one old completion history entry.
- Confirm the original input payload remains exactly retrievable.

This extends existing lease, retry and history tests with the late-generation
counterexample rather than duplicating their ordinary cases. It runs in isolated
PGlite with service-role privileges and current producer/evaluation gates.
Explicit interleaving is tested; simultaneous multi-connection transactions,
external worker deployment and production semantic receipts are not certified.
Fixture receipt references are test-only and do not establish completed real work.

A read-only survivor snapshot at 09:43 UTC found nine retained changes and
18 jobs: eight completed and ten pending. No orphan jobs, duplicate job keys,
completed jobs without history or processing jobs without leases were found.
See verifier/collector-generation-audit-2026-09-08.json and the reproducible
read-only query in supabase/tests/collector_generation_inventory.sql.
No production job was claimed, completed, failed or otherwise changed.

## Migration implication and limits

The immutable-input transport can be used as a tested foundation when a collector
change is represented by a retained capture or record version. This does not
prove that the legacy comparison worker consumes these inputs or that its
projection writes preserve immutable assessments. Do not relabel comparison
projection work as candidate retrieval merely to fit an existing route.

The existing finish API checks receipt shape and lease ownership; it does not
itself establish that work_ref names durable, semantically complete output.
Adapters must retain and validate the exact completed work before acknowledging.
Successful transport completion is never a publication or algorithmic approval.

The next integration must reconcile collector schemas and history, qualify a
version-bound comparison worker/output contract, preserve membership/publication
and evaluation gates, and verify transactional output plus acknowledgement
before schedule cutover. Legacy pending jobs and ongoing deltas must be transferred
without silently acknowledging newer work. The live legacy queue race is still
unfixed by this qualification batch.

The [final consolidation gate](BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md)
remains INCOMPLETE. No frontend code or production schema/runtime changes are
made here. Post-merge live checks verify that earlier UI work remains deployed.
No legacy project is SAFE TO RETIRE.
