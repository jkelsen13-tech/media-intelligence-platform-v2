# Retained relevance declaration events: source-only omission repair

This additive candidate repairs the existing saved-observation diff. It is a nondeployed change to `supabase/source-proposals/assessment_relevant_inputs_v1.sql`, based on frozen parent `76a5ef6`. No historical migration, public reader, gateway, UI, Following file, backend connection or live database is changed. Parent integration and independent review remain required before any installation.

## Reproduced omission

The original relevance proposal retains immutable `snapshot.relevance_declarations`, but the native `diff_investigation_snapshots` only checks newly entered input positions and assessment changes. Declaring a candidate's relevance to an input that was already watched leaves `snapshot.inputs` identical. The native saved-observation RPC consequently returned `changes: []`, losing the explicit new declaration provenance from the comparison.

The new focused test first ran against the unchanged source and reproduced this omission through actual PGlite retained captures/candidates, `declare_relevance` and `mip_investigation_briefings_v1('observe', ...)`. Unwatched and high-bigint declaration events were also absent. The RED receipt is `/workspace/mip-relevance-events-receipts/red-native-omission.log`.

## Authoritative additive event

The existing diff owner preserves its native body and appends a private immutable JSON delta helper. It keeps the same function identity and signature, scope mismatch refusal and native event ordering. No second observation engine or event table is introduced.

```json
{
  "kind": "relevant_input_declared",
  "candidate_id": "<retained canonical candidate UUID>",
  "position": "<exact positive decimal bigint string>",
  "selection_method": "<retained declaration method>",
  "selection_ref": "<retained declaration reference>",
  "rationale": "<retained declaration rationale>",
  "declared_at": "<retained after-snapshot timestamp string>"
}
```

Every field is a string. `position` deliberately maps the retained declaration's `change_position` to the native diff's decimal-string position convention; it must never be converted to JavaScript `Number`. The tuple's candidate/position is its immutable identity. The event is emitted only when that identity is retained after and absent before. Already watched evidence gets this event without `evidence_entered_observation`. An unwatched newly relevant input preserves native source-arrival events and adds this distinct declaration event.

Method, reference, rationale and time are retained declaration provenance. They are not new source material, a reassessment, proof of truth/support, independent reporting, completed search, automatic materiality, notification dispatch or public eligibility. Existing snapshot/RPC privacy boundaries remain authoritative. Source-only consumers must label the event as an explicit relevance declaration rather than a new report or changed assessment outcome. The shape was coordinated with the diagnostics consumer before binding.

## Integrity and compatibility

The additive helper is `IMMUTABLE`, `SECURITY INVOKER`, empty search path, and service-role executable only. It consumes saved snapshot JSON without reading current tables or synthesizing a snapshot. Native scope refusal remains; the helper also rejects mismatched scope when invoked directly.

For a nonnull before snapshot, the helper checks declaration array/object shape, exact six retained columns, bounded nonblank method/reference/rationale, canonical candidate UUID, exact bigint position range and explicit-offset timestamp. Each declaration must belong to that snapshot's explicit candidate scope and retained input positions. Duplicate identities, changed immutable tuples, disappearing tuples and malformed arrays fail closed instead of creating replacement/deletion events. Database primary key and append-only history controls are unchanged.

A pre-proposal snapshot without the `relevance_declarations` field means an empty declaration set; the collector prior to this proposal did not retain declarations. A present null/malformed field is refused. A null SQL before snapshot keeps native initialization behavior (`changes: []`), since it supplies no before/after comparison. Exact declaration retries and fresh unchanged observations do not reannounce events; stored historical observations/retries return their original data.

Timestamp equality compares the exact retained instant, not its serialized timezone offset. PGlite reproduced a false tuple conflict when the same immutable row was observed under UTC and Asia/Kathmandu; this was repaired by validating explicit-offset timestamps and comparing their `timestamptz` values. The emitted event still copies the after-snapshot timestamp string unchanged. No timestamp is invented, rounded by JavaScript or read from a mutable live row. RED receipt: `/workspace/mip-relevance-events-receipts/red-timezone-tuple.log`.

## Qualification

The focused suite passes 9 tests including the enclosing database test: actual already-watched and unwatched observations, unchanged retries, immutable conflict/malformed declaration requests, malformed retained tuples, duplicate/removal/missing-input refusal, legacy snapshot compatibility, scope refusal, browser-role denial, timezone representation safety and positions above JavaScript's safe integer range. The existing relevance/briefings owner suites run separately and pass 25 tests, including native assessment dependency/replacement and rollback smoke checks.

Receipts reside in `/workspace/mip-relevance-events-receipts`: RED omission, RED timezone, GREEN native events, existing owner qualification and hash/commit summary. No frontend source changed, so no frontend build is claimed or required for this SQL/test/document delta. The Following candidate stays frozen separately at `bf808772c467070cef30bf6d606fce964d8eb4c9`.

This qualification proves bounded source behavior with synthetic retained evidence. It does not prove deployment, current live policies, semantic retrieval quality or public reader admission. The `new_candidate_search` semantic-search external dependency remains unresolved; an explicit declaration event does not drain that queue or complete search.
