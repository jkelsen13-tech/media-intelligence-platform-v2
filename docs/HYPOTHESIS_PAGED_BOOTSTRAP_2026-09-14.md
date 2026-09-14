# Paged hypothesis revision bootstrap — September 14, 2026

## Contract

Capture continues across ordered metadata pages within one imported read-only repeatable-read snapshot. The existing disposable replication exporter stays open until capture completes. Keyset selection reads every revision with a left join to transaction metadata, retaining unknown and foreign transaction provenance. It never takes a fresh snapshot per page or filters missing transaction metadata out of the inventory.

The production-facing protocol seam is recordPagedBootstrap with an explicitly supplied snapshot reader and encrypted journal. snapshotReader.mjs is its executable GitHub-disposable PostgreSQL adapter, guarded against other environments; it provisions no production connection. Reader completion requires an empty terminal fetch and successful completion of that same read transaction.

Every immutable page binds source/stream/observation epoch, exported snapshot/consistent LSN, ordered rows, page index and predecessor hash. Exact committed journal readback precedes the next page. The manifest is written only after exhaustion and confirmed read-transaction completion; it binds page size/count, exact row count and terminal hash. Interrupted prefixes are retained but cannot qualify a stream.

The stream gate accepts the earlier single-envelope form and the new manifest. For a manifest it validates every page, exact chain, global ordering, counts and absence of an extra page beyond the terminal count. It keeps only a bounded page and the incoming transaction IDs during verification. The source-captured consumer independently pins the manifest hash in its existing source configuration before acknowledgement. A missing page never becomes permission to skip baseline validation.

An interrupted export cannot be silently reopened as the same snapshot. Retained prefix pages are not deleted or declared complete. A genuinely new source/stream/bootstrap requires the existing explicit recovery and authorization process.

[PostgreSQL 17 SET TRANSACTION](https://www.postgresql.org/docs/17/sql-set-transaction.html) requires importing the snapshot before queries in a repeatable-read or serializable transaction. The adapter imports before its first metadata read and retains that transaction for every page.

## Evidence to verify

Ordinary synthetic fixtures exercise 100001 distinct revision IDs across eleven pages, beyond the earlier single-envelope bound; exact replay; unknown/foreign provenance; empty inventory; interrupted/unconfirmed/wrong-snapshot reads; duplicate/reordered/overlapping pages; missing/changed/reordered/truncated chains; and page/manifest durability denial. Fixture numbers test operational pagination, not semantic thresholds or qualification counts.

The native case pages the complete current disposable revision inventory. Another actual synthetic worker completion commits between page reads. Exact IDs must partition between the imported snapshot and subsequent native stream, and their union must equal the full bounded inventory. A missing retained page must prevent native advancement; intact pages/manifest must permit the existing source-covered acknowledgement. Reimporting the closed snapshot fails.

Files: supabase/qualification/hypothesis-assessments/temporalBootstrap.mjs; verifier/hypothesis-worker/snapshotReader.mjs and continuityCases.mjs; tests/hypothesisPagedBootstrap.test.mjs. Execution evidence belongs to the candidate and is recorded separately after CI.

## Limits and remaining work

The journal and source reader are trusted, narrowly scoped protocol components, not worker self-attestation. This is isolated metadata handling. It does not prove production permissions/custody, cluster/slot incarnation or restore attestation, arbitrary historical-time availability, or completion of all temporal requirements. Validating an entire bootstrap on each incoming transaction is correct but has linear read cost; authenticated indexing may optimize it later without weakening completeness. The protocol has explicit per-page and total-page resource bounds and fails instead of truncating.

No source material retrieval, public publication, production writes/identities/deployments or local project-file storage. CC remains closed3/3; all existing safeguards and frozen evidence remain. Historical-time qualification stays false. The queued addendum remains behind current feature completion, verification and freeze.
