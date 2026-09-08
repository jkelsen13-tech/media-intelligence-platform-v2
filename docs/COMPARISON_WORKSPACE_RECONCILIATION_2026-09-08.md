# Comparison workspace and collector reconciliation

## Frontend batch

The large secondary introduction is replaced by a compact view title and scope.
The longer method explanation is a native, initially closed disclosure.
Collection limits remain visible outside it, including in a confirmed empty
scope. Search, records and source navigation remain in the existing scope.

Event-card start/end dates now use the same retained-date formatter as the
workspace header and publication/review rows. Previously raw date-only values
had no precision label, missing starts were blank and invalid dates were printed
as if usable. The formatter preserves qualified microseconds/offsets and labels
missing or invalid values. No new event ordering or elapsed-time claim is made.

Two focused renderer regressions cover disclosure placement and event bounds.
The existing comparison browser verifier adds keyboard disclosure round trips,
visible scope/limits, compact desktop height and date-bound checks, alongside
its existing public-read recovery and temporal cases. Populated comparison cases
use browser-only fixtures; production data is never seeded.

## Backend reconciliation, read-only

The catalog query in supabase/tests/comparison_worker_table_inventory.sql was
run on Manus yhbwnrtlqbjtcrrlpbge and survivor qikvmopbtijoebdqosyq. The JSON
receipt in verifier/comparison-worker-table-audit-2026-09-08.json records the
13 direct table dependencies identified in the recovered live v9 worker.

Eight tables exist on both projects. Five are absent on the survivor:
original_source_import_credentials, source_comparison_enrichment_queue,
source_comparison_membership_release_policy, source_comparison_membership_scores
and source_comparison_membership_audits. RLS is enabled on all inspected tables.

Shared names do not establish equivalent write contracts. Manus has the
article-claim auditability, event-membership approval invalidation, event queue
producer and explanation publication triggers on the inspected tables. Those
table triggers are absent on the survivor. Its article/configuration tables have
retained-history triggers that differ from Manus. This is a migration contract
gap, not proof of browser exposure: policies/grants and the public projection's
own release gates must be evaluated independently.

The recovered worker also performs multiple destructive projection cleanup
requests before inserting replacement claims/surfaces/explanations. No such
cleanup was executed. A survivor adapter must preserve exact prior outputs and
commit replacement output with generation-bound acknowledgement atomically;
copying table definitions or redeploying that worker is insufficient.

This batch changes no database schema, grants, policies, worker or schedule.
The read-only metadata inventory does not establish complete function/trigger
closure, history parity, positive authenticated writes or collector cutover.
The existing queue race and remaining collector/runtime migration are still open.
The [final consolidation gate](BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md)
remains INCOMPLETE. No legacy project is SAFE TO RETIRE.
