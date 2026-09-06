# Investigation workspace backend batch

MIP organizes an ongoing investigation around a question and shows what the evidence supports, what changed, and what remains unresolved. This batch gives five frontend sections one versioned data contract: Overview, What Changed, Hypotheses, Commitments, and Evidence Gaps. Each section refers to the same retained observation and exact source excerpts.

## Delivery state

- Repository: `jkelsen13-tech/media-intelligence-platform-v2`; base: merged PR #42, `2d46c7120704ebefa1c8662bf725029be7779695`.
- Project: `qikvmopbtijoebdqosyq`.
- Migration **already applied**: `20260906075718_investigation_workspace_batch_v1`.
- Edge Function **already deployed**: `investigation-workspace`, version 1, ACTIVE, `verify_jwt: true`.
- Local SQL was created using `supabase migration new`, then its timestamp was renamed to match the version actually recorded by the deployment tool. Tested SQL bytes are unchanged.
- Repository registration must preserve these exact files. Do not reapply this migration, redeploy this function, run blanket `supabase db push`, repair migration history, execute the live canary, or modify publication gates as part of frontend integration.
- Existing unrelated discrepancy remains: repository `20260905203600_mip_legacy_graph_private_staging`, live `20260906034920_mip_legacy_graph_private_staging`.
- Backend and browser data client are implemented. The five visual sections still require the coordinated Cursor frontend PR described in the companion integration guide.

## Shared architecture

| Layer | Responsibility |
|---|---|
| Existing capture, candidate, assessment and PR #42 observation records | Retain exact inputs, dependency state and explicit evidence scope |
| `evidence_pipeline.investigations` | Stable identity and current version pointer |
| `evidence_pipeline.investigation_versions` | Immutable question, scope, hypotheses, commitments and collection declarations, linked to one observation |
| `evidence_pipeline.investigation_memberships` | Explicit viewer/reviewer/revoked assignment and each user's current review pointer |
| `evidence_pipeline.investigation_review_receipts` | Immutable record of the exact version a user explicitly marked reviewed |
| `evidence_pipeline.investigation_access_events` | Immutable assignment-change audit |
| `public.mip_investigation_workspace_v1` | Service-only write, assignment, list, read and review contract |
| `supabase/functions/investigation-workspace` | Authenticated user transport for list/read/mark_review only |
| `src/lib/investigationWorkspaceClient.js` | Browser request adapter, section mapping and exact Unicode excerpt resolver |

All five new tables have RLS enabled and no browser grants or policies. History cannot be updated, deleted or truncated. Only head and membership pointers have the required service-role column update grants. All new SQL functions are SECURITY INVOKER with fixed empty search paths. Service-role access remains a trusted backend capability; it is not an untrusted-user sandbox.

The function validates the user with Auth, injects that verified UUID into the service RPC, and the database checks the user's assignment again. Caller-supplied `user_id`, access roles and administrative actions are rejected at the HTTP boundary. Signing in does not create an assignment. The frontend never receives a service credential.

## Administrative RPC contract

Call `public.mip_investigation_workspace_v1(p_action, p_input)` from an authorized server environment. The Edge Function deliberately does not expose these two administrative actions.

### `put`

Exact input keys:

```js
{
  investigation_id: investigationId,
  version_id: versionId,                 // retain across retries
  previous_version_id: previousId,       // null for the first version
  observation_id: retainedObservationId,
  state: stateDocument,
  change_reason: 'Why this version was recorded.'
}
```

The response is the new immutable version row. Writes serialize per investigation. `previous_version_id` must equal its current head, preventing lost updates. Identical retries of a version UUID return the original row even after a newer head exists; conflicting reuse fails. A changed question or annotation can reuse the same observation. A new observation of the same candidate scope must directly extend the current version's observation. A changed candidate scope requires a fresh observation with no previous observation. The first version also requires a fresh baseline. Old versions remain readable to assigned users.

### `set_access`

```js
{
  investigation_id: investigationId,
  user_id: verifiedProfileId,
  access_role: 'reviewer', // viewer | reviewer | revoked
  reason: 'Verified assignment reason.'
}
```

The user must already have a `public.mip_profiles` row. Verify the intended person's identity; do not infer ownership from the first or only profile. Every changed role is audited. Repeating the same role is a no-op. Revocation denies subsequent reads and reviews; restoring access retains that person's review history. Revocation cannot retract data already delivered to a browser.

### User-bound database actions

`list`, `read`, and `mark_review` also exist on the service RPC. Their SQL inputs include `user_id`; browser HTTP inputs do not. The Edge Function supplies it after Auth verification. See the frontend guide for exact wire shapes.

## Versioned state schema

Every listed field is required. Extra fields fail validation. UUIDs use canonical lowercase strings. Timestamps are ISO strings with timezone or explicit null where allowed. Arrays may be empty unless a stronger rule is listed. Generic text is nonblank and bounded; state JSON is limited to 128 KiB, administrative request JSON to 144 KiB.

| Field | Type and meaning |
|---|---|
| `question` | Text, maximum 1,000 characters |
| `scope_note` | Text, maximum 4,000 characters |
| `canonical_subject` | `null` or `{type:'graph_node', id:UUID}`; ID must occur as a retained candidate's event or related graph identity |
| `time_range` | `{from:timestamp\|null, to:timestamp\|null, meaning:text}`; source/event context, not a database historical query |
| `unresolved_questions` | Up to 30 nonblank texts |
| `coverage` | Up to 20 collection declarations |
| `hypotheses` | Up to 20 alternative explanations |
| `commitments` | Up to 20 commitments with branching stages |

### Exact retained evidence references

Hypothesis and stage `evidence` arrays contain up to 32 objects with exactly:

```js
{
  position: '9007199254740993', // positive bigint represented as decimal text
  source_field: 'summary',    // title | summary | body_text | label
  span_start: 2,              // half-open Unicode code-point offsets
  span_end: 11,
  excerpt: 'A report.',
  relation: 'context',        // supports | contradicts | context
  note: 'Why the analyst linked this excerpt.'
}
```

This illustrates the shape, not live evidence. The position must exist in the saved observation. The excerpt must exactly equal the stated span in the retained capture or record-version field, including Unicode and whitespace. The source is never rewritten. Duplicate position/field/span/relation references fail. Structural binding is verified; the analyst's interpretation of support or contradiction is not automatically proven by a matching quotation.

### Hypotheses

Exact fields: `id`, `statement`, `assessment_ids`, `evidence`, `assumptions`, `would_strengthen`, `would_weaken`, `remaining_uncertainty`.

`assessment_ids` contains up to 32 IDs from the observation's `selected_assessment_ids`, not unrelated dependency assessments. Evidence uses the references above. Assumptions and discriminating evidence are arrays of text. Both `would_strengthen` and `would_weaken` require at least one entry. Statement and uncertainty are limited to 4,000 characters. Alternatives may coexist. This contract does not calculate confidence percentages, rank a winning hypothesis or run disconfirming retrieval.

### Commitments

Exact fields: `id`, `actor`, `statement`, `scope`, `conditions`, `deadline_text`, `success_criterion`, `remaining_uncertainty`, `stages`.

`conditions` is an array of text. `stages` has up to 30 objects, each with exactly `id`, `kind`, `status`, `depends_on`, `coverage_ids`, `evidence`, `note`.

- Kinds: `commitment`, `prerequisite`, `action`, `implementation`, `outcome`.
- Statuses: `unknown`, `reported`, `observed`, `no_followup_found`, `not_applicable`, `cancelled`.
- Dependencies reference earlier stage IDs in the same commitment. This permits branching and rejects missing dependencies and cycles; it does not infer stage completion.
- `reported`, `observed` and `cancelled` require retained evidence references.
- `coverage_ids` must reference this version's coverage objects. `no_followup_found` requires at least one linked declaration whose search status is `completed_for_declared_scope`.
- A completed bounded search is still an analyst declaration. No follow-up found is not proof that nothing occurred. An observed outcome is not proof the commitment caused it.

### Collection declarations / Evidence Gaps

Exact fields: `id`, `label`, `status`, `source_classes`, `languages`, `regions`, `from`, `to`, `retained_text`, `search_status`, `searched_at`, `method`, `limitations`.

- `status`: `not_assessed`, `limited`, `documented_scope`.
- `retained_text`: `full_text`, `summary_only`, `mixed`, `unknown`.
- `search_status`: `not_run`, `partial`, `completed_for_declared_scope`.
- Source classes, languages, regions and limitations are arrays of text; `from`, `to` and `searched_at` are timezone timestamps or null.
- A partial/completed search declaration requires a search timestamp, at least one source class and at least one limitation. Time ranges cannot run backwards.
- These are bounded analyst records, not independently measured global coverage. Display what was searched and its limits. Do not turn them into numeric confidence or imply an automated search ran.

## Observation and review semantics

`workspace_read` is STABLE: assignment, selected version, observation and review comparison use a coherent query snapshot. The response references the exact retained PR #42 observation, not a newly computed assessment. Repeated reads do not collect evidence or mark anything reviewed.

What Changed compares the displayed observation against the user's explicitly reviewed version. It separately returns evidence/dependency changes and changes to question, scope, hypotheses, commitments and collection declarations. These are record comparisons. Added evidence does not inherently strengthen or contradict a claim; a stale dependency does not mean reassessment has finished.

Review writes serialize on the membership row. An explicit review uses a caller-generated receipt UUID plus the expected previous receipt. Retrying identical input returns the same receipt. Conflicting changes return a version conflict. A user can acknowledge the displayed version while a newer head exists, keeping unseen changes pending. Their baseline cannot move backward. A historical view older than the reviewed version is labelled historical and does not generate a reversed briefing.

## Operator sequence for the first real investigation

1. Choose the real question and bounded candidate UUID scope. Retain source provenance and uncertainty; geography candidates remain unsupported by the current observation contract.
2. Use the existing PR #42 server RPC to create an observation with a retained caller UUID and no previous observation. This observes existing evidence; it does not fabricate assessments.
3. Prepare the versioned state against the returned exact snapshot. Empty hypotheses or commitments are valid when the retained evidence does not support populating them.
4. Call `put` with a stable investigation UUID, new version UUID and null previous version. Retain the response.
5. Verify the intended existing MIP profile and explicitly assign viewer or reviewer access. A profile count is not identity verification.
6. Use the actual person's signed-in browser to validate list/read and, for a reviewer, explicit review. The user performs sign-in; do not mint or impersonate their session.
7. For later evidence, create a new observation extending the current version's observation, then `put` a new state version with the expected current head. Handle a head conflict by reading and reconciling; never silently overwrite.

No persistent real investigations, versions, memberships, review receipts or assessments were created by this deployment. The transaction-only live canary created temporary fixtures and rolled them all back. A first real populated experience requires the above editorial and assignment inputs.

## Validation and remaining work

The verifier JSON records test counts, exact deployed function-body checks, real HTTP checks, live rollback verification, unchanged data counts and advisor delta. Positive user HTTP access was tested locally through the same handler/client and real PGlite SQL with a controlled Auth stub. Live SQL tested assigned access and denial. A real signed-in user's positive live HTTP round-trip and frontend visual integration have not yet been exercised.

These foundations support the next multi-day batches: source origin/lineage and disconfirming retrieval; richer institutional temporal records; then measured collection coverage and evaluated confidence. Do not add those workers or claim their algorithms are complete in this frontend batch. Parallel frontend sections are appropriate once this shared contract is fixed; keep one integration owner for navigation, request lifecycle and review state.

Official implementation references: [Edge Function authentication](https://supabase.com/docs/guides/functions/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL function volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html). JWT verification remains enabled; the handler additionally verifies Auth identity. Private tables intentionally have no browser RLS policies; see the [RLS-without-policies advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
