# V2 Track 3 — propagation and withholding regression check

This V2-only verifier is the durable evidence check for the ingestion-propagation track. It is intentionally **read-only**: it queries the isolated V2 database with a service-role credential supplied at runtime, writes no database row, restores no grant, and contains no credential. It is not an approval or Legal/Policy workflow and it does not contact the retained original project.

## Run command

Set the isolated V2 URL and a service-role key only in the executing environment, then run the project command. The command fails with a nonzero exit code when any verified condition fails. A result can be written to a local JSON artifact by setting `MIP_V2_TRACK3_OUTPUT`.

```bash
export MIP_V2_SUPABASE_URL='https://yhbwnrtlqbjtcrrlpbge.supabase.co'
export MIP_V2_SUPABASE_SERVICE_ROLE_KEY='<isolated-v2-service-role-key>'
export MIP_V2_TRACK3_RUN_ID='original-readonly-cross-surface-import-20260820' # optional
export MIP_V2_TRACK3_OUTPUT='verifier/runs/track3-latest.json'                # optional
npm run verify:track3
```

> The service-role key must remain outside the repository and browser bundle. The public site continues to use its anonymous browser contract; the verifier’s elevated read is used only to inspect private operational and withheld-state tables.

## Verified outcomes

| Group | Surface or condition | Pass condition |
|---|---|---|
| Propagation | News | Every selected-batch article has `source_status = active`. |
| Propagation | Knowledge Graph | The verifier counts only articles reachable through a documented `story_arcs.root_node_id` or a resolved citation. Extracted entities alone never manufacture a graph link. |
| Propagation | Causal Timeline | Every arc-linked selected-batch article points to an existing arc; event memberships are separately reported. |
| Propagation | Story Arcs | No selected-batch article has an orphaned `arc_id`. |
| Propagation | Source Comparison | Every event that is non-`timeline_only` and spans at least two distinct outlets appears in `comparison_public`, with all qualifying selected-batch member articles present. |
| Withholding | Non-active source records | The script fails if any non-active article exists because the current News route has no `source_status` filter; this is a deliberate early-warning guard. |
| Withholding | Held ingestion tags | Any configured held-run article is itself a News-surface leak because the public feed reads `articles` directly; retained held records therefore fail immediately, with derivative rows reported as diagnostic detail. If no held record is retained in V2, the result is `NOT_OBSERVED`, not a false pass. |
| Withholding | Rejected, owner-held, and pending candidates | No gated candidate may have a non-null materialized target identifier. |
| Withholding | Metadata-only references | A metadata-only article may remain a News/chronology record but must have no arc, citation, article-entity, or candidate derivative row. |
| Withholding | Protected legal records | The V2 import must contain no protected legal row and the importer report must record at least one protected-case exclusion. |

## Result semantics

`PASS` means the explicit condition was exercised and met. `FAIL` means the command exits nonzero and the detailed JSON identifies the broken surface or withholding boundary. `NOT_OBSERVED` means V2 currently retains no live example for a destructive-status or held-run scenario; this is a coverage signal, not an assertion that the behavior is correct. The existing fixture tests cover these branches deterministically, while each real run records live full-corpus results.

## Scope discipline

The default selected batch is `original-readonly-cross-surface-import-20260820`, which has completed import checkpoints and cross-surface material. The command accepts a different `MIP_V2_TRACK3_RUN_ID` for any future V2 ingestion batch. It neither promotes candidates nor changes Legal/Policy data. In particular, configured held run tags are inspected only for withholding, and no Document 07, Callais, or redistricting-adjacent record is processed or changed by this verifier.
