# Private investigation observations and change briefings

MIP needs to show what changed in an investigation without rewriting the evidence or pretending an invalidated decision has already been reassessed. This slice retains an exact private observation and compares it to an explicitly named previous observation of the same candidate scope.

## Deployment and registration

- Repository: `jkelsen13-tech/media-intelligence-platform-v2`.
- Base: merged PR #41, `37b4e5c695a509ed605fe8c33e17557ee30f2818`.
- Target: `qikvmopbtijoebdqosyq`.
- Migration **already applied and verified**: `20260906071525_investigation_change_briefings_v1`.
- The SQL file was initially created by `supabase migration new`; its filename now matches the actual migration version returned by the live database. SQL bytes are unchanged from the locally tested migration.
- This PR registers the already-applied additive private backend and its tests. Do not apply the SQL again on this target. Do not run blanket `supabase db push`, alter migration history, import the private corpus, start workers or loosen publication gates.
- The older staging discrepancy remains separate: repository `20260905203600_mip_legacy_graph_private_staging` versus live `20260906034920_mip_legacy_graph_private_staging`.

## Contract

`public.mip_investigation_briefings_v1(p_action text, p_input jsonb)` is a server-only, security-invoker RPC. `anon` and `authenticated` cannot execute it or read its private table. The trusted backend uses service-role access; never place its credentials in a browser. This is not yet a multi-user authorization boundary.

### Observe

```js
{
  p_action: 'observe',
  p_input: {
    observation_id: crypto.randomUUID(), // preserve for retries
    candidate_ids: [candidateId],       // 1..50 distinct target candidate UUIDs
    previous_observation_id: baselineId // omit to initialize a new baseline
  }
}
```

Candidate IDs are target `evidence_pipeline.evidence_candidates.id` values. They are not source article IDs, capture IDs, graph IDs, context-proposal identities or queue positions. Scope order is canonicalized. A previous observation must exist and have exactly the same scope. Changing scope starts a new baseline; it does not silently redefine the comparison.

The caller chooses and retains the observation UUID. The same UUID plus the same canonical scope and previous ID returns the exact stored observation, even after source corrections. Reusing it with different arguments fails. New UUIDs intentionally capture new observations; identical content is allowed. Concurrent retries of the same UUID are serialized by a transaction advisory lock. Treat returned observation IDs as durable only after the surrounding transaction commits. The PostgreSQL locking behavior is used by design; multi-connection retry contention was not exercised in PGlite.

### Read

```js
{ p_action: 'read', p_input: { observation_id: savedId } }
```

Read returns the saved observation; it never recomputes its freshness. Unknown IDs and unsupported keys/actions fail. There is no arbitrary `as_of`, model action, publication action or scheduled polling.

### Retained state

Each append-only `evidence_pipeline.investigation_observations` row contains:

- UUID, previous observation UUID and canonical scope candidate UUIDs.
- Observation statement start time, not commit order, event time or proof of user review.
- Snapshot contract `investigation-observation-1`.
- Full selected candidate records, exact assessment states, and supporting dependency candidate/assessment records.
- The selected assessment IDs, separating the investigation's decisions from external dependency context.
- Exact retained captures and record versions for all watched input histories and assessment context positions.
- Current-at-observation staleness causes and explicit assessment replacements.
- Deterministic change records and `publicly_eligible: false`.

A STABLE collector gathers all records and calls the existing STABLE assessment reader under one database query snapshot. The volatile RPC invokes that collector in one statement, computes deltas against the immutable stored baseline, then inserts the observation. Cause sets are sorted so query-plan ordering cannot invent a change. No allocation-position or timestamp high-water mark excludes late historical evidence. Bigint assessment ordinals and change positions are serialized as decimal strings.

The collector retains the transitive closure of assessment ancestors and their explicit replacements, including dependencies outside the selected candidate scope. Missing candidate capture notifications or watched identity history fail closed. Limits: 50 explicitly selected candidates, 200 assessments in the dependency/replacement closure, 2,000 retained input versions and 4 MiB snapshot JSON. Geography candidates fail explicitly because the prerequisite spatial dependency notifications are not implemented. Oversized or unsupported observations fail atomically; they are not truncated or labeled complete.

`complete_for_explicit_scope` describes the selected database records and their retained dependencies at that observation. It does not claim complete media collection, independent source coverage, verified claim truth or exhaustive contradiction search. A large individual history can exceed the cap even with a single selected candidate; pagination/segmented observation manifests are future work.

## Delta meanings

| Kind | Meaning | Exact evidence route |
|---|---|---|
| `evidence_entered_observation` | A retained input is present in the new observation but absent from the baseline. It may be old evidence newly included through expanded dependencies. | `position` in the new snapshot's `inputs` |
| `assessment_added` | A selected decision record was not present in the baseline. | `assessment_id` in the new snapshot |
| `assessment_dependency_change` | A selected assessment's stale-cause set changed, including additional causes when already stale. Its outcome is preserved. | Same assessment ID in both snapshots; full before/after cause sets point to retained inputs or replacement assessments |
| `assessment_replaced` | An explicit successor now supersedes a decision observed in the baseline. | Before/after assessment IDs and outcomes, plus the retained full decision records |

The first observation has `baseline_initialized: true` and no deltas. A later unchanged observation has an empty change list. A new assessment can also be a replacement; these are two descriptions of one transition, not two independent pieces of evidence. External dependency-only decisions are retained for explanation but not emitted as selected investigation decisions.

No delta asserts strengthened support, a contradiction, recalculation, causation or publication eligibility merely because evidence arrived. Semantic analysis must explicitly establish those meanings. "Needs reconsideration" is the correct state until a completed assessment exists. Saved machine observations do not establish "since your last review"; a future review marker must name the observation actually reviewed.

## Verification

- `node --test tests/investigationBriefings.test.mjs`: 15/15 tests pass against PGlite with the real prerequisite SQL migrations.
- `npm test`: 944/944 pass, zero skipped/failed.
- `npm run build`: passes; existing large-chunk warning remains.
- Tests cover unassessed evidence, external dependency closure, late corrections, graph-context edits, additional stale causes, explicit replacement, immutable baseline/retry, scope validation, rollback, int64 precision, browser denial, server access, missing history, unsupported geography, all output caps and the unchanged deployment canary.
- `supabase/tests/investigation_briefings_smoke.sql` passed locally and on the target. All synthetic imports, assessments and observations rolled back.
- Post-canary live state: 3 existing candidates, 0 assessments, 7 changes, 0 saved observations. No synthetic semantic decisions remain.
- Read-only live collection of the 2 supported non-geography candidates returned 3 retained input versions, 0 assessments and private eligibility. The third candidate is geography and is explicitly unsupported in this slice.
- Deployed function-body hashes exactly match the registered SQL (see verifier JSON).
- Security advisor comparison: no new WARN/ERROR. One expected INFO reports RLS enabled without browser policies on the new private table. This is intentional denial, verified by direct privilege checks. Existing project findings are not fixed or declared resolved by this slice. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The live canary proves PostgreSQL contract behavior, not real-world semantic accuracy. There are still zero live assessments. No new visible UI has shipped and no live UI improvement is claimed.

## Next integration and refined product direction

MIP should organize an ongoing investigation around a question and show what the evidence supports, what changed and what remains unresolved.

Attach these observations to a minimal versioned Investigation State that references existing records: question and scope, entity/event/place and time boundaries, assessment versions, evidence references, unresolved issues, collection limits and a review baseline. Reuse existing Investigation Context for navigation. Shared identity and versions coordinate surfaces; one mutable answer must not erase dissent or prior reasoning.

Deliver one complete question → change briefing → exact evidence experience before broadening the feature catalog. Put source-origin, temporal and collection-scope metadata in the foundation. Strengthen disconfirming retrieval before confidence promotion. Commitment tracking must support conditions, prerequisites, branching implementation and changed deadlines. Observed outcomes do not establish causal attribution. Hypotheses should name discriminating evidence and allow abstention; they need not be exhaustive, mutually exclusive or equally weighted.

Question authoring, review markers, semantic reassessment, source-independence scoring, spatial notification support, user-scoped private access and an eligible UI projection remain separate next steps. No evidence or assessment data is duplicated into a new competing graph.

## Implementation references

The STABLE query-snapshot design follows [PostgreSQL function volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html). The invoker and explicit privilege approach follows [Supabase database functions](https://supabase.com/docs/guides/database/functions). These references support database mechanics, not MIP's semantic correctness claims.
