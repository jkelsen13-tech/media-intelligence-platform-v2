# Saved investigation evidence checks

This batch adds a private, usable first slice of source-lineage review, deliberate correction/withdrawal cue retrieval, and measured search coverage. It builds on the immutable investigation workspace merged in PR #43 (`c52c4c8369cbda47363363d4be8a8fedfe8603c4`). It does not claim to complete semantic adversarial retrieval or establish independent confirmation.

## Behavior and integration

An assigned reviewer explicitly runs checks for one investigation **version**. The database reads that version's saved observation, computes all results itself, and appends one immutable report for that version and algorithm. Assigned viewers may read reports. Reading the workspace or opening a section never creates a run. Repeated runs return the same report and timestamp. An annotation-only new version also starts with no report, even if it reuses the same observation.

All three sections consume one report:

| Section | Actual implemented check | Interpretation |
|---|---|---|
| Source Links | Same saved article identity; exactly equal retained URL; exactly equal selected retained text of at least 80 Unicode code points | Possible relationship requiring review. Independence stays unknown; transmission direction is undetermined. |
| Evidence Checks | First whole-word correction/withdrawal vocabulary match in each title, summary and body; retained article record status `corrected` or `withdrawn` | Review cue. It may be negated, concern another event, or describe a different claim. It is not a verdict. |
| Search Coverage | Exact visited positions, actual string fields searched, metadata positions, unsupported records, missing bodies, pair counts, omitted inputs and result counts | A measured receipt for these bounded checks. It does not certify region/language/source-class coverage or the whole source corpus. |

No report changes investigation heads, review receipts, assessments, confidence dimensions, hypotheses, commitment statuses, source publication gates, or live source records. It does not call an external search, model, scheduler, or importer. Source text is never normalized or rewritten.

## Algorithm contract

Contract: `investigation-evidence-checks-1`. Algorithm: `retained-evidence-checks-1`.

Inputs are exclusively the dependency inputs in a saved `investigation-observation-1` snapshot (maximum 2,000 inputs / 4 MiB). There is no arbitrary `as_of` reconstruction. Old source clocks retain their original meanings; report `recorded_at` is execution time, not historical knowledge time.

Pair checks use the first 100 capture inputs ordered by numeric durable position, at most 4,950 pairs. Text selection is nonblank `body_text`, otherwise `summary`; titles never establish a shared-text match. Compare the full selected raw field, without trimming or case/Unicode normalization. Full raw strings are ranked once with bytewise `C` collation, so pair comparison uses exact equality groups without relying on hash equality. Excerpts display only the first 160 code points; equality was checked against the entire field.

Cue checks visit every capture and every article record version in the saved observation. They search each string-valued title, summary and body independently, including summary when body is present. Vocabulary (case-insensitive, whole words): correction, corrections, corrected, erratum; retraction, retractions, retracted, withdrawn. The first match per field per vocabulary group is returned. A substring inside another word does not count. English-only vocabulary is disclosed; language detection is not performed. Metadata status cues are separate from text excerpts. Deletion alone is not classified as withdrawal.

Each section returns at most 200 results. `*_found` counts all detected results in the scanned scope; `*_returned` counts the displayed subset. Truncation does not imply the rest of the fields were not scanned. The report is `partial` if capture-pair scope exceeds 100 or either result list is truncated. Otherwise `completed_bounded_checks` means these supported checks completed, with any unsupported record kinds still listed. Zero results are not evidence that nothing happened. Presence of a body does not establish full publisher text retention.

## API

New function: `investigation-evidence-checks`, JWT verification enabled. POST JSON only:

```json
{"action":"read","input":{"investigation_id":"UUID","version_id":"UUID"}}
```

Replace `read` with `run` for an explicit reviewer action. Version is always required. Request maximum 8,192 bytes. The Auth service verifies the bearer session; anonymous Auth users are refused. The handler injects Auth's UUID into the service-only RPC `public.mip_investigation_evidence_checks_v1`. Caller-supplied user IDs, roles, report data, administrative actions, and extra input keys are refused. Fixed Supabase target: `qikvmopbtijoebdqosyq`. Allowed browser origin: `https://jkelsen13-tech.github.io`. Responses are `private, no-store`; raw database errors are not returned.

Successful transport envelope is `{data: checksBundle}`. The client unwraps it into `{data, error}`:

```js
{
  contract_version: 'investigation-evidence-checks-1',
  investigation_id, version_id, observation_id,
  access_role: 'viewer' | 'reviewer',
  status: 'not_run' | 'saved',
  report: null | {
    id, investigation_id, version_id, algorithm_version, recorded_at,
    result: { contract_version, algorithm_version, completion,
      lineage_candidates, challenge_cues, coverage, limits, limitations,
      publicly_eligible: false }
  },
  publicly_eligible: false
}
```

`recorded_by` remains private audit data and is omitted from responses. Reports are uniquely keyed by version + algorithm, belong to the version's investigation, and are immutable. Run serialization uses a transaction advisory lock. Membership is checked before looking up any report; a run locks the membership row, serializing it with revocation. A revoked user cannot read or retry a run, including an existing report. Users cannot mix one investigation with another version. Browser database roles have no table, helper, or RPC privileges. All functions are security invoker with empty search paths.

Text references use `{position, source_field, span_start, span_end, excerpt}` with zero-based, half-open Unicode code-point offsets. Use the existing `resolveWorkspaceExcerpt` against the **matching saved observation**. Never convert positions through JavaScript Number. Metadata references use `{position, source_field:'source_status', value}` and must be resolved against the retained record version, not a live article. Pair IDs and cue IDs are stable within the saved scope; they are not global claim identities.

## Deployment and verification

The migration, exact Edge files, rollback canary, client adapter and tests are shipped in the handoff. The verifier JSON records the actual live migration timestamp, file hashes, checks and limitations. This handoff records already-applied backend changes; Cursor must not replay the migration, run blanket `supabase db push`, repair unrelated migration history, or redeploy the function.

Tests cover historical immutability, idempotence, access denial/revocation, no auto-review, exact and nonmatching text, summaries alongside bodies, Unicode/large positions, source-status cues, unsupported inputs, both result limits, the maximum input count, a near-4-MiB fixture, rollback, Auth transport, and version mismatch rejection. The live canary uses only temporary fixtures and assignments inside one rollback transaction.

Remaining product validation needs an actual assigned investigation and signed-in session. The target contained zero investigations at preflight; test fixtures must not remain live to make the UI look populated. Full claim lineage review/adjudication, primary-source attribution paths, identity/date/quantity/polarity reconciliation, multilingual retrieval and externally measured collection coverage remain later slices. Keep them in the roadmap without representing this first detector as those completed capabilities.
