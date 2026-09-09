# Scheduled collector reconciliation — cutover blocked

Read-only inspection on 8 September 2026 narrowed the live Manus collector
dependencies. The accompanying collector-contract-inventory-2026-09-08.json
records schema, constraints, selected browser grants and policy metadata.
No credential values, user identities or evidence payloads were read or copied.

## Confirmed contract gaps

Five operational tables used by the live collectors exist on
yhbwnrtlqbjtcrrlpbge and are absent on qikvmopbtijoebdqosyq:
ingestion_runs, ingestion_source_runs, author_profile_queue,
original_source_import_credentials and source_comparison_enrichment_queue.

The constraints matter to transfer order: source runs reference retained run IDs
and ingest source IDs; the author queue references authors; comparison queue rows
reference events with one row per event. Run mode/state and nonnegative counters
are constrained. Import credentials contain hashes and active/rotation metadata;
credential contents were not queried and must not be copied into repository reports.

RLS is enabled on all five source tables. Browser grants alone do not establish
row access: source runs and enrichment queue have grants but no policies, while
the author queue and ingestion runs have SELECT policies and authenticated SELECT
grants. Anonymous SELECT is revoked on those two tables. The credential table
has no inspected browser SELECT/INSERT grants or policies. Survivor equivalents
must define required worker/owner access explicitly; cloning historical grants
is not a reviewed access design. No noninternal triggers exist on these five
tables in the inspected source catalog.

## Confirmed acknowledgement race

The current live source-comparison-run, version 9, exactly matches the recovered
index.ts snapshot under verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge.
Its scheduled path counts pending jobs, rebuilds the projection, then updates
EVERY row whose state is pending to succeeded. It does not bind acknowledgement
to the jobs or input versions included in that rebuild.

Concrete execution permitted by the code:

1. Job A is pending; the worker checks the count and reads its projection inputs.
2. Job B is enqueued after those reads, or A is re-enqueued for a newer change.
3. The earlier rebuild completes without those newer inputs.
4. The broad pending-state update marks B or the newer A succeeded.

This is a demonstrated code-level race, not a claim that historical data loss was
observed. The producer mip_queue_source_comparison_enrichment upserts one row per
event, replacing enqueued_at with transaction-time now() and clearing completion
fields when validation state changes. A fixed list of IDs alone cannot distinguish
a re-enqueued A. Timestamp-only matching is also not a proven revision fence.

The survivor contract needs an immutable job generation or monotonic revision,
a bounded claim/lease and acknowledgement conditional on the exact processed
generation. New or revised jobs must remain pending; worker retries must be
idempotent. Enqueue, claim, projection persistence and acknowledgement must be
tested under interleaved producers, overlapping workers, failures and late commits.
Publication approval is separate from successful processing.

## Repository/live divergence

The deployable supabase/functions/source-comparison-run/index.ts is older than
the live recovered source: it lacks the current scheduled queue path and
membership-scoring integration. Redeploying that directory would remove live
behavior. The recovered snapshot remains evidence, not a reviewed survivor
deployment package. Its misleading authorization comment is contradicted by
the actual guard, which rejects when neither owner nor scheduler is authorized;
the comment is not treated as executable behavior.

## Required next migration sequence

Recover the complete live worker and dependency closure, including current
membership/release policies and authorization RPCs. Design the survivor's private
operational tables and generation-fenced queue contract. Transfer retained IDs,
run history, input versions and ongoing deltas with parity checks; preserve source
provenance and all prior assessments. Verify the equivalent worker against
isolated contracts before activating production schedules. Cutover must have
idempotency, rollback and end-to-end evidence, without prematurely acknowledging
legacy work or weakening eligibility gates.

This audit does not authorize or perform legacy project deletion, scheduler
disablement, credential rotation or worker redeployment. Neither backend
consolidation nor collector cutover is complete. No legacy project is SAFE TO RETIRE.
See the [final gate](BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md).

## Follow-up: active version 11, 9 September 2026 UTC

A subsequent read-only retrieval found source-comparison-run version 11 active
with verify_jwt=true and bundle identifier
0c393ce15730271e158d204b060ecbdd072d28d4aeee48fcb81ad85bf7b2e5a6.
The earlier version-9 observation above remains historical evidence, not the
current deployment identifier. The retrieved bundle contains index.ts, lib.js
and loadedLanguageLexicon.json. Its external client import is
https://esm.sh/@supabase/supabase-js@2; the complete deployment dependency contract
must be qualified before survivor deployment.

The active version still counts pending comparison queue rows, performs projection
work and acknowledges every row currently pending. It does not fence that
acknowledgement to the input generation processed. The newer deployed version
therefore does not close the documented race. No historical loss is inferred.
Membership release/approval behavior remains a separate constraint and must not be
replaced by transport completion or caller-supplied approval flags.

No source payloads, credential values, queue rows, schedules, functions or database
schemas were changed by this recheck. The retrieved source was inspected in memory;
no local files were created. The generation-bound durable output and conditional
acknowledgement requirement, operational/history parity and final consolidation
gate remain pending. No legacy backend is SAFE TO RETIRE.
