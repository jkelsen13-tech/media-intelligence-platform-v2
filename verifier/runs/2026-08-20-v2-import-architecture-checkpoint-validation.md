# V2 importer architecture checkpoint validation

**Scope:** isolated Supabase sandbox `yhbwnrtlqbjtcrrlpbge` only. The original project was read solely through its public read API; no V1 write was performed.

## Implemented alignment

The updated importer now derives a deterministic, hashed manifest from the read-only source tables before any V2 projection work. The private import ledger stores the manifest identifier, a SHA-256 checksum, the checksum method, current stage, and append-only stage checkpoint records. The source-to-target mapping ledger is flushed after every completed import stage rather than only at the end of the run.

| Architecture element | V2 implementation | Verification |
|---|---|---|
| Read-only source snapshot | Canonical JSON-table manifest, SHA-256 hashed, with row counts and per-table checksums | Run checksum `116ca49ba55abb5abf10eec10a9a1074a49009d78ffe6965b7975ed4af537608` persisted. |
| Per-run private ledger | `original_source_import_runs` carries snapshot metadata, `current_stage`, and `stage_checkpoints` | Completed run persisted 20 checkpoints. |
| Source-to-target mapping durability | `original_source_import_mappings` is flushed after every successful import stage | Guard test asserts checkpoint follows each mapping flush. |
| Provenance and conflict boundary | Existing `original_source` metadata and insert-only URL-conflict logging are unchanged | Re-run inserted 0 articles and logged 752 existing-URL conflicts. |
| Review-gated public comparison handoff | The secured source-comparison projector runs after all import stage checkpoints | Projection processed 20 eligible multi-outlet events; 789 claims were projected. |
| Private operational data | Import ledger retains no anonymous SELECT privilege | Catalog verification returned `anon_select = false`. |

## End-to-end validation result

The deployed authenticated importer completed successfully. It read 752 source articles and made no article-field update or duplicate insertion: `articlesInserted = 0`, `articlesSkippedExisting = 752`. The run retained the established protected-case rule and excluded one source legal record; no new legal record or evidence row was inserted. The public comparison projection completed without fabricated primary-evidence links.

The checkpoint ledger begins with `source_snapshot_loaded` and ends with `source_comparison_projection`; after the final status update the current stage is `completed`. The ledger therefore records both the source material fingerprint and every durable import-to-projection handoff without exposing source data or operational metadata publicly.
