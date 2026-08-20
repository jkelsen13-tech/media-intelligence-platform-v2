# V2 Public Comparison Projection: Route Data Inventory

## `pipeline_config` finding

`pipeline_config` is read only as the `source_comparison_beta` feature flag. It does not provide any content rendered on the comparison card. The public flag read is therefore incidental operational configuration and will be removed from the Source Comparison navigation and loader rather than exposed through the projection.

## Rendered public contract

| Existing source | Fields consumed by the route | Projection treatment |
|---|---|---|
| `claims` | `canonical_text`, `thin_extraction`, active V2 projection membership | Expose only canonical text, thin-extraction state, and an opaque public claim key. Filter to `status = 'active'` and `rule_version = 'sc-v2-event-projection'`. |
| `article_claims` | `surface_text`, `loaded_language`, current state, article association | Expose only the rendered surface text, loaded-language markers, and opaque public article key. Filter to current rows. |
| `claim_evidence_links` | `evidence_url`, `evidence_type` | Expose only the displayed URL and type as nested public evidence links. |
| `events` / `event_articles` / `articles` | Event title/dates, outlet coverage, article count, external article URL, publication timing, extraction presence, canonical URL for duplicate collapse | Keep existing public data but return only the fields needed for the card, using opaque keys rather than base-table identifiers. |
| `story_arcs` / `nodes` | Arc title/slug and public Timeline key | Expose only public navigation values; no UUIDs. |
| `explanations` | Supporting passage, rule version, provenance, review date/status, state, uncertainty | Expose only the existing disclosure fields shown in the card; omit source IDs, roles, evidence arrays, history, and other pipeline metadata. |
| `claim_corrections` | Correction text and date | Expose only those displayed values as nested correction records. |

The public card does **not** need article bodies, embeddings, publisher/author IDs, source-run information, raw claim/evidence IDs, review-pipeline records, or any `pipeline_config` row.
