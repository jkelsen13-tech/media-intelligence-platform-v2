# Evidence change queue — first implementation slice

## Applied state

Applied and verified on v2 `qikvmopbtijoebdqosyq` on 6 September 2026.
Migration: `20260906042413_evidence_change_queue_v1`.
Repository base: `0b92f06d833300cdb9fbeaa3e9a2d89c10cb0f21` (PR #35).
The file was created with the Supabase CLI and renamed to the version actually
recorded by the live migration service. **Do not reapply it to v2.**

This implements durable change capture and delivery. It does not implement
semantic discovery, assessment dependency storage, canonical asset mapping,
automatic public updates, or an algorithm quality benchmark. Those require the
next worker integration. No scheduler or model was enabled.

## Behavior

The existing private `evidence_pipeline` now contains three additional tables:

| Table | Meaning |
|---|---|
| `evidence_changes` | Immutable reference to one exact retained capture or history version. |
| `change_jobs` | Separate leased jobs for dependency lookup and new candidate search. |
| `change_job_events` | Append-only processing attempts, failures, and successful delivery receipts. |

After-insert triggers on `article_captures` and `record_versions` create the
change and both jobs in the source transaction. Failed transactions leave none
of these rows committed. Existing source/history rows are not copied or edited.
An initial bounded reconciliation represents the one existing capture and six
history versions: seven changes and fourteen pending jobs. No job is completed.

Repeated reconciliation is idempotent, scans for missing references with an
anti-join, and inserts at most 100 changes per call. It does not reset retry
budgets. A newly observed old publication is eligible regardless of its date.
This transport requires no publisher fetching or market-data subscription.

`position` is a monotonic allocation sequence, **not commit order**. A transaction
with a lower position can commit after one with a higher position. Consumers
must use pending job state, never `position > last_seen` as their only progress
rule. Sequence gaps caused by rolled-back canaries are expected.

`queued_at` means the time the queue learned about that retained version.
The source's capture/recorded timestamp remains in its referenced row. Neither
timestamp proves a publication's occurrence time or an earlier observation
that MIP did not actually retain. Installation baselines remain baselines.

Claims use `FOR UPDATE SKIP LOCKED`, two-minute UUID-fenced leases, and five
attempts maximum. Explicit retry failures and expired leases use exponential
backoff. A claim handles at most 100 expired leases before choosing ready work.
Expired fifth attempts become dead letters. There is no automatic reset or
infinite loop. Each attempt is recorded. The two routes run independently.

Completion requires a `work_ref` and `coverage: complete`. Repeating the same
successful token and receipt returns success without an additional completion
event. A different receipt conflicts. Partial coverage cannot complete a job.
**The receipt is a trusted server transport assertion, not proof of semantic
correctness.** The next integration must verify its durable result reference
and persist resumable search progress before it uses completion. An empty
placeholder result must never drain the queue.

## Private RPC

`public.mip_evidence_changes_v1(p_action text, p_input jsonb)` uses SECURITY
INVOKER and an empty search path. Only the existing server service role receives
EXECUTE. All three tables have RLS, no browser policies, and no anon or
authenticated grants. The existing service-role trust boundary is preserved:
this is not a sandbox for untrusted third-party workers. It has table write
privileges required by the existing invoker pattern. No browser key belongs here.

| Action | Input | Output |
|---|---|---|
| `status` | `{}` | Job counts by route and state. |
| `reconcile` | `{"limit":100}` | Number of missing retained inputs enqueued, not jobs completed. |
| `claim` | `{"route":"dependency_lookup"}` or `new_candidate_search` | Leased job plus exact change reference; null when none ready. |
| `input` | `{"job_id":"<returned UUID>"}` | Change plus retained capture or history version. Server-only source material. |
| `finish` | Job ID, lease token, `receipt` with durable `work_ref` and complete coverage | `completed`; exact retry safe. |
| `fail` | Job ID, lease token, bounded `code`, optional `retryable` | `retry_wait` or `dead_letter`. |

The next worker must call `status` for monitoring; this migration intentionally
does not add a browser inspector. A production HTTP/PostgREST worker has not
been deployed or tested. Live verification called the RPC under actual SQL
roles. Jobs lasting over two minutes need bounded work pages and durable
checkpoints; there is no heartbeat API in this slice.

## Verification and practical limits

- 33 targeted tests passed across the new database queue, existing database
  intake, operator intake, and evidence adapter. The full application suite and
  frontend build were not rerun for this additive backend-only slice.
- Isolated PostgreSQL tests exercise old arrivals, corrections, tombstones,
  exact completion retry, lease reclaim/fencing, five-attempt exhaustion,
  rolled-back source transactions, bounded missed-notification repair, and
  server/browser role behavior. They exercise sequential competing claims;
  real simultaneous multi-connection contention remains a worker integration gate.
- Live rollback-only canaries verify full service-role intake into capture and
  change dispatch, history dispatch, token rejection, completion retry,
  terminal failure, and anon/authenticated denial.
- After rollback, seven changes and fourteen pending jobs remain; zero job
  events; reconciliation finds zero missing retained inputs.
- All seven before/after content hashes match: articles, nodes, edges,
  pipeline configuration, source captures, history, and spatial projection.
- Security-advisor delta is three informational RLS-without-policy entries for
  intentionally private tables, with no new WARN/ERROR findings. Existing
  advisor findings remain outside this change. [Advisor definition](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

This is transport coverage of seven v2 retained inputs, not coverage of Manus's
corpus or proof of fourteen useful connections. No retained evidence or public
state was changed. Private graph staging remains installed with zero staged
records. Direct writes to entities, source lineage, edges, claims, mappings,
staging payloads, and algorithm registries are not captured by these two source
triggers unless a later explicit adapter records a supported change. Extending
those producer types requires a versioned contract and appropriate tests.

## Repository reconciliation and next step

Cursor must first commit these exact files and reconcile current main. There
is a pre-existing staging timestamp discrepancy: repository
`20260905203600_mip_legacy_graph_private_staging.sql` versus live migration
`20260906034920_mip_legacy_graph_private_staging`. This report records the
discrepancy but does not repair migration history or authorize replay. Do not
run blanket `db push` across the mixed historical migration directory.

After repository integration, implement the shared candidate/assessment and
dependency store, bounded retrieval worker, canonical entity/asset adapters,
and private evaluation corpus described in the evaluation contract. Use one
durable result per exact input version, algorithm version, and canonical
candidate/endpoints. Add notifications for new producer families deliberately.
The complete continuous-discovery requirement is open until one ordinary
connection and one late-historical connection work end to end, with corrections
and compatible projections across every applicable surface including Markets.

## Operational recovery

No worker or cron was activated, so no worker needs stopping now. After a worker
exists, stop its invocations on a regression; retain pending jobs, receipts and
input history. Do not drop the schema, delete history, or manufacture completion
to clear backlog. Source writes and notification inserts are atomic: a broken
notification trigger can block its source write. Repair that cause with an
additive reviewed fix. Trigger removal or audit deletion is not routine rollback.

The reproducible smoke SQL rolls back all fixture records, but advances identity
sequences. It refuses to run its intake canary when intake has active jobs.
Queue positions are never evidence that an omitted integer represents lost work.
