# GDELT BigQuery Feasibility Research — 2026-08-19

## Primary-Source Findings

Google documents that BigQuery public datasets are hosted for public access, while the querying project bears query-processing cost. Its documentation states that the first **1 TB per month** of query processing is free and that a project is required to run the queries; billing is required only beyond the free tier.[1]

Google’s BigQuery Sandbox documentation states that a sandbox can query public datasets without a credit card or billing account and has the same free-use limits as the free tier: **1 TB of processed query data per month** and **10 GB of active storage**. Sandbox-created tables and related resources expire after 60 days.[2]

GDELT’s own data documentation states that its datasets are available in Google BigQuery, update every 15 minutes, and support SQL querying and export. It describes GDELT 2.0 as retaining an event core and adding a mentions table, with 15-minute updates. It also describes the Global Knowledge Graph (GKG) as a news-derived data stream that includes source information and contextual entities.[3]

GDELT’s DOC 2.0 announcement describes DOC as a full-text search API over monitored online-news coverage and says it returns article-list records in its ArtList mode. The API provides a discovery layer; it is not itself the publisher record.[4]

## Provisional Equivalence Assessment

The authorized BigQuery path is **source-family equivalent for discovery metadata only** if the selected public GDELT table exposes original article URLs, source/domain metadata, and date/timestamp fields. GDELT’s own materials establish common provenance at the GDELT dataset level, but exact field-level equivalence must still be confirmed by a BigQuery schema inspection before any extraction. The pipeline must continue to hydrate only publisher URLs, never treat GDELT metadata as article body or evidence.

## Cost Assessment Before Query Planning

The expected direct cost is **$0** only if the isolated BigQuery project remains within the 1-TB monthly free processing allowance and requires no persisted storage beyond the 10-GB sandbox allowance. A dry-run byte estimate is required before executing the 10,000-record discovery query. The query should select only required metadata fields, constrain dates, avoid `SELECT *`, and use partition/date filters where the table supports them. No billing account or paid project may be enabled under the current owner instruction.

## References

[1]: https://cloud.google.com/bigquery/public-data "Google Cloud: BigQuery public datasets"
[2]: https://cloud.google.com/bigquery/docs/sandbox "Google Cloud: Try BigQuery using the sandbox"
[3]: https://www.gdeltproject.org/data.html "The GDELT Project: Data"
[4]: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ "GDELT: DOC 2.0 API Debuts"

## Read-Only Account Inspection

The signed-in Google Cloud account opened BigQuery with **`mop-extraction`** as the current project. This project is explicitly excluded by the owner and was not queried, modified, or selected for this work. The project selector also lists two legacy projects with non-descriptive names: **`perceptive-seat-322116`** and **`spry-pipe-295718`**. Their connection, if any, to MIP infrastructure cannot be inferred from their labels. No existing project was selected and no resource, credential, API, billing setting, or query was created.

## Project-Creation Capacity Check

The standalone Google Cloud **New Project** page was opened without submitting its Create action. It displays **17 projects remaining in the account quota**, so the account has sufficient project-creation capacity and does not appear limited to a single remaining project. The form defaults to **No organization**, which provides the required separate resource hierarchy for a new isolated sandbox project. No billing account was selected, no project name or generated ID was changed, and no project was created.

Google’s Resource Manager documentation confirms that a project is an isolation and billing boundary by default, and that the New Project page displays remaining quota when fewer than 30 projects remain.[5] The current capacity finding therefore supports, but does not itself execute, creation of a separate BigQuery Sandbox project.

[5]: https://cloud.google.com/resource-manager/docs/creating-managing-projects#managing_project_quotas "Google Cloud: Creating and managing projects"

## Isolated Sandbox Created

With explicit owner confirmation, a new standalone project was created and selected:

| Property | Recorded value |
|---|---|
| Project name | MIP V2 GDELT BigQuery Sandbox |
| Project ID | `mip-v2-gdelt-bigquery-sandbox` |
| Parent resource | No organization |
| Dashboard displayed charges | USD $0.00 |
| Production/MIP connection configured | None |

The console now explicitly reports the new sandbox project as the active project in the **No organization** hierarchy. `mop-extraction` was not queried, configured, or modified; the new project has no configured connection to Supabase or either MIP repository.

## Metadata-Only BigQuery Check

In the isolated project, a metadata-only `INFORMATION_SCHEMA.TABLES` query against `gdelt-bq.gdeltv2` completed successfully. It returned **62 public table names** without requesting article rows. The visible results include `events`, `events_partitioned`, `eventmentions`, `eventmentions_partitioned`, `gkg_partitioned`, and `gdg_partitioned`, confirming that the GDELT v2 public dataset is accessible from the new sandbox and contains partitioned event/GKG tables suitable for a field-level feasibility inspection. This query did not hydrate publishers, insert local data, or invoke extraction.

A subsequent attempt to replace the metadata query through the browser editor appended text instead of replacing it, producing a parser error before execution. No second BigQuery query completed, no article records were read, and no extraction or data-write action occurred. The editor will be corrected using its native model before retrying the metadata-only schema check.

The BigQuery SQL editor is a Monaco editor. Its hidden text area confirms the malformed statement contains the prior metadata query plus the schema-query fragment. The native global Monaco object is unavailable to page-console code, so the statement will be corrected through the editor’s standard focus/select-all input path before any retry. No data query has executed since the metadata-only table listing.

## Completed Field-Equivalence and Cost Checks

The required feasibility checks are now complete. Both checks ran in the owner-approved, no-organization project **`mip-v2-gdelt-bigquery-sandbox`**. They did not access `mop-extraction`, production Supabase, or either production MIP repository.

| Requirement | Verified result | Implementation consequence |
| --- | --- | --- |
| Article URL | `DocumentIdentifier` (`STRING`) | Map directly to the immutable discovery `url`; hydrate only this publisher URL. |
| Publisher / source metadata | `SourceCommonName` (`STRING`) | Map to discovery `outlet`; it is metadata, not a verified ownership or independence claim. |
| Publication date identifier | `DATE` (`INT64`) | Parse defensively as a GDELT timestamp candidate before mapping to `published_at`; do not use BigQuery `DATE` arithmetic on this field. |
| Topic / person / location metadata | `Themes`, `Persons`, and `Locations` (`STRING`), with corresponding V2 fields | Retain solely as discovery enrichment; do not use them as article body, evidence, or an automatic graph/timeline/geographic update. |
| Physical partition | `_PARTITIONTIME` (`TIMESTAMP`) | Require a physical partition predicate for all discovery queries and cost controls. |

The metadata-only `INFORMATION_SCHEMA.COLUMNS` query returned **28 fields** for `gdelt-bq.gdeltv2.gkg_partitioned`, including all required URL, source, timestamp-identifier, theme, person, and location fields. The documented mapping establishes GDELT BigQuery as an equivalent **GDELT discovery-metadata access path**, not a substitute publisher record. That distinction preserves the source-of-record and publisher-hydration model required by the ingestion policy.[3] [4]

> **Schema correction:** The field named `DATE` has the BigQuery type `INT64`; it is not a native `DATE`. The discovery implementation must parse it through a strict GDELT timestamp conversion and must skip and log malformed identifiers rather than fabricating a publication timestamp.

The BigQuery editor also validated the intended six-column, 365-day, partition-bounded, 10,000-row discovery query **without executing it**. Its measured scan estimate was **82.4 GB**. This is approximately **8.05%** of the documented 1 TB/month sandbox/free-tier processing allowance, leaving approximately **941.6 GB** of that allowance before other queries. The query’s `LIMIT 10000` limits returned records but does not reduce columnar scan volume, so the implementation must not infer a lower cost from the limit alone. The estimate is well below the free-tier allowance, no billing account was enabled, and the documented expected direct cost for the approved first run remains **$0** if subsequent queries keep the same partition-bounded shape and the project remains within the 1 TB monthly limit.[1] [2]

```sql
SELECT DocumentIdentifier, SourceCommonName, DATE, Themes, Persons, Locations
FROM `gdelt-bq.gdeltv2.gkg_partitioned`
WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
  AND DocumentIdentifier IS NOT NULL
  AND DocumentIdentifier != ''
LIMIT 10000;
```

### Feasibility Decision

The authorized BigQuery path is **feasible** for implementation and the constrained 10,000-article review-gated backfill. It is separate from MIP production infrastructure, uses the documented GDELT public dataset, and has a measured initial query estimate safely under the sandbox monthly allowance. The next step is to add the discovery adapter while preserving the immutable-URL check, deterministic Document 07 exclusion, 10-item manifest ceiling, item-level logging, rolling 100-item failure circuit breaker, and pending-only candidate writer.

### Verification Artifact

The exact schema result and editor estimate are retained locally in `verifier/tmp_bigquery_schema_browser_checkpoint_2026-08-19.md` for the implementation and audit trail.
