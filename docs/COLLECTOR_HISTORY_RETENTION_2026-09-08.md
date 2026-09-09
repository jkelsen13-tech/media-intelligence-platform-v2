# Collector history retention — verified bounded transfer

PR #109 installs `20260908180013_collector_history_retention` on
`qikvmopbtijoebdqosyq`. It retains 8,699 operational row versions from
`yhbwnrtlqbjtcrrlpbge` in `mip_private.collector_row_versions`.
This is not a collector cutover or a public evidence projection.

## Transfer and verification

The source scope is ingestion runs started before 2026-09-08T17:50:00Z,
source runs referring to those run IDs, and all seven source-register rows at
observation. Reads used batches of at most 250 rows, keyset pagination ordered
by the original key with PostgreSQL COLLATE "C". Each source query returned its
database observation time and `to_jsonb(row)::text` as a string.

The tool orchestration concatenated those raw JSON strings without parsing
their payload numbers through JavaScript. The source payloads were sent directly
to the survivor's importer in a transaction as service_role; no payload file was
created locally or committed to GitHub. A failed/unconfirmed batch was retained
in session memory for idempotent retry, with its cursor advanced only after the
successful receipt. No source rows were modified.

The importer rejects empty, oversized, duplicate-key, invalid-project/relation
and invalid-observation batches. Its exception semantics roll back the statement
if any later row fails. It preserves changed payloads as new hash-qualified
versions, checks an existing conflict payload exactly, and never updates a
previous retained version.

| Source relation | Retained rows | Ordered payload digest |
| --- | ---: | --- |
| ingestion_runs | 4,356 | 03ea6cf62700f698ec3f66f9ecb7a9db68332cb0aa15ebaf9d04b373c77b5b0c |
| ingestion_source_runs | 4,336 | 6ea597db718feaa4a4a28f7908759c5119b13c57d7288a04323755c68aae6857 |
| ingest_sources | 7 | f95f234cf5197a1f3e826323ad24196d96dcdd62a2b302e1b90180aa535649e9 |

Digests are SHA-256 of the concatenated hex SHA-256 values of each complete
PostgreSQL JSONB payload, sorted by source key with COLLATE "C".
Source pre-transfer, destination and source post-transfer results match exactly
in this scope. These are independently timed observations, not a cross-database
atomic snapshot. The equal before/after digests support the bounded parity claim;
they cannot rule out intermediate changes that reverted before the second read.
No previous overwritten source states can be recovered from a current snapshot.

Zero source runs lack their retained parent run or source-register row.
A production service_role replay of the seven source-register payloads returned
received=7, inserted=0, already_retained=7. Live role checks returned RLS=true,
anon/authenticated SELECT=false, anon importer EXECUTE=false, and worker
UPDATE/DELETE/TRUNCATE=false. Advisor categories did not change.

See [machine-readable receipt](../verifier/backend-collector-retention-2026-09-08.json)
and [read-only source query](../supabase/tests/collector_history_source_inventory.sql).
The destination digest can be recomputed with:

```sql
select source_relation, count(*) as rows,
 encode(sha256(convert_to(string_agg(payload_hash,''
   order by source_key collate "C"),'UTF8')),'hex') as digest
from mip_private.collector_row_versions
where source_project='yhbwnrtlqbjtcrrlpbge'
group by source_relation;
```

That aggregate reproduces this initial one-version-per-key transfer only.
After retaining later versions, verify the exact manifest/version subset rather
than comparing all historical versions with a current-source snapshot.

## Boundaries and regression coverage

This ledger deliberately does not emulate legacy worker tables, copy browser
access policies, migrate credentials or acknowledge work. Source identifiers and
payloads remain intact under source-qualified keys. The recorded source/observation
fields are claims by the trusted importing principal, not signed source attestations.
Database owners retain DDL authority. A later authorized migration may evolve
the schema; ordinary UPDATE/DELETE/TRUNCATE is blocked.

The three regression scenarios in tests/collectorHistoryRetention.test.mjs
exercise the installed migration in isolated PostgreSQL-compatible PGlite.
They cover exact numeric/time preservation and immutable revisions, batch
validation/rollback, and role/hash/key/immutability boundaries. Existing tests
cover queue generations separately; these retention tests do not claim to
validate a collector's algorithm or durable semantic completion receipt.

Manus still has active ingestion/comparison schedules, so records after this
cutoff and future changes require additional capture and operational migration.
Keep the [ten-part final gate](BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md)
OPEN until runtime, history, security and end-to-end dependency closure passes.

## Bounded subsequent delta — 9 September 2026 UTC

Retained 208 further immutable versions through the existing reviewed importer:
104 ingestion runs started at or after 2026-09-08T17:50:00Z and before
2026-09-09T02:45:00Z, plus 104 linked source-run records. The seven source-register
rows were unchanged and already retained. The private archive now contains 8,907
versions. Source observations were made at 03:04:37–03:04:40 UTC; the final source
digest recheck was at 03:07:35 UTC.

Captured, destination and source-after counts and ordered hashes match:
ingestion_runs 8c64258f00b1e773dab4c4cba027eb8705af985aba1373e62a277394741803a0;
ingestion_source_runs f6d3bf990c7e481dd00cfbacaba906ed488b2c8eb078183bb407a7ab58c322f5;
ingest_sources f95f234cf5197a1f3e826323ad24196d96dcdd62a2b302e1b90180aa535649e9.

Exact destination comparison used the manifest's relation/key/hash triples,
not an aggregate over all historical versions. No retained source-run parent or
source-register link was missing. Replaying 52 captured runs inserted zero rows.
RLS, browser read/import denial, worker mutation denial and both immutable-history
triggers remained in place. The deployed importer body matched the reviewed SQL.

See [delta manifest and receipt](../verifier/backend-collector-delta-2026-09-09.json).
It contains identifiers and hashes, not retained payloads. Payload JSON text was
passed directly between connected databases without parsing payload numbers in
JavaScript or writing local files. This is a bounded independently observed
retention pass, not continuous replication or operational cutover. Later deltas,
pre-window corrections, complete corpus/history parity and all final gate
requirements remain pending. No worker, schedule, queue state, publication policy,
credential or schema was changed; no legacy backend is SAFE TO RETIRE.

## Second bounded delta — 9 September 2026 UTC

Retained 228 additional versions: 114 completed ingestion runs started at or
after 02:45 UTC and before 12:15 UTC, and their 114 succeeded source-run rows.
All had completion timestamps. Seven unchanged register rows were already
retained. The archive now contains 9,135 versions. Import batches contained
at most 57 rows, with original PostgreSQL JSONB text passed directly between
connectors; no payload numbers were reserialized and no local files were made.

The exact 235-entry relation/key/hash manifest matches the source-before and
source-after counts and digests. Missing retained parent/source links: zero.
A 57-run service-role replay inserted zero. The importer body matches the
reviewed migration; RLS, browser denial and both immutability triggers passed
again. See [second delta receipt](../verifier/backend-collector-delta-2026-09-09-1215.json)
for observation times, exact hashes and limitations.

This is independently timed retention, not continuous replication, complete
history parity or worker cutover. Later runs and pre-window corrections remain
pending. Queue acknowledgement, schedules, publication decisions and legacy
retirement were not changed.
