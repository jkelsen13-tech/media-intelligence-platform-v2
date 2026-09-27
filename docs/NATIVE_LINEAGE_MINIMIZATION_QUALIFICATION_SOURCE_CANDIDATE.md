# Native lineage minimization source candidate

UNAPPROVED — SOURCE CANDIDATE ONLY — NOT AUTHORIZED FOR EXECUTION OR TRANSMISSION

Every test and SQL assertion: AUTHORED — NOT RUN. No installation, PostgreSQL17.6 compatibility, runtime/hosted success, transmission approval or historical acceptance is claimed.

Base commit cc8f1b19171917351548362f82f03fa2b1684831; tree 86a7df4a95894217e4a228e9eb918985a7e99cd9. Candidate identity is the complete uncommitted patch and per-file SHA256 inventory in the remote identity envelope, not a fabricated commit/tree. Existing Cursor remote /workspace, agent bc-90defac4-4fad-51ad-b88c-98825fd99f3a, is the only source-package location. Session lifetime/persistence is not guaranteed. No project files were placed on the physical device.

## Stage retention and concrete consumers

| Stage | Retained fields and purpose | Source bytes and replay/validation |
|---|---|---|
| Native evidence | evidence_pipeline.article_captures and evidence_candidates unchanged, including original history | Authoritative bytes remain. No fresh fetch/latest article/different capture substitution. |
| Snapshot | Historical event/article/membership/config/lexicon/implementation inputs unchanged; v2 capture identity/hash/pending state, selected source metadata, candidate identity/field/span/excerpt/field hash/extractor/predecessor/state | Restricted STABLE SQL reads full native payload transiently for original JSONB content digest and exact Unicode span. New snapshot retains no native capture payload. MVCC pins the calling statement. Source metadata is string/null only. |
| Worker | Deterministic projection, generation/input/implementation/time/snapshot binding, pending state, explicit native lineage | Projection uses historical article input, not capture payload. Candidate excerpt is retained for exact review and citation. Nested worker schema fixes allowed keys/types; immutable input chooses version. |
| Optional journal | Existing version/operation/request/runtime/generation/input/implementation envelope and exact minimized p_output; native token hash | Concrete need: same completion after ambiguous acknowledgement. No session/lease token copy. Existing restricted kernel resolves saved input transiently for the v2 guard before INSERT. |
| Review/staging | Exact 11-field evidence, canonical 12-field factual explanations, existing historical relationship context and generation/output hashes; native identity/field/span/excerpt/digest binding | Restricted validator rejects missing/corrupt/stale/superseded evidence. Current native comparison is a refusal check, not replacement. Earlier factual/rights/privacy gates remain. |
| Approved payload | Existing immutable reviewed output, review revision, explanations, historical relation-derived evidence links/corrections, dependencies and hash | Concrete consumer: exact private release, retry, reconciliation/invalidation. No new native payload enters from v2 output or extra review fields. Historical relation copies and existing stored reviews remain outside scope. |
| Accepted private reader | Existing event/claim/explanation/membership view; selected publisher metadata and exact citation IDs/content+field hashes/Unicode spans/excerpt/review-policy-generation-release binding | Rechecks all existing eligibility/source/policy gates and native binding. Pending source evidence never gains publication eligibility. |

The successor JSON enumerates exact native fields. source-snapshot.sql fixes nested v2 worker projection fields too. Candidate excerpts and selected source attribution are deliberate copies with concrete review/reader consumers. The distinctive sentinel is an UNSELECTED native-only field; no claim is made to minimize every historical public article store. Original identities/hashes bind replay and validation; inaccessible evidence fails closed.

Legacy v1 generations/outputs remain immutable. Restricted original snapshot functions serve only bound legacy validation, not producer creation. Worker preserves original v1 output/retry bytes; new producer emits v2. Historical manifest, acceptance evidence and expected blob assertions remain unchanged and separate from the UNAPPROVED successor.

## Native changes and effective installation

New native source_changes retain original key/source/relation/kind/transaction/time, explicit operation/version, full original before/after digests and identity metadata. Digests use argument_digest(to_jsonb(OLD/NEW)) before discarding images: same PostgreSQL JSONB-text canonicalization, never minimized metadata hashed as an old row. INSERT-before and DELETE-after are SQL NULL, not empty-object/JSON-null digests. Capture identity is id/article_id; candidate identity is id/capture_id/predecessor_candidate_id. Full row equality identifies no-ops; excluded-field edits still create deltas and invalidate. Generation links and retained_at,id ordering stay intact. Historical/public rows use original retained-image reconciliation; no backfill/rewrite. Public recorder is unchanged.

Compatible existing EFTA trigger names are retargeted, never duplicated. Ambiguous/disabled/malformed topology fails. Native TRUNCATE refuses because it has no OLD row image. This narrow refusal does not remove source records or unrelated privileges.

## Exact dependencies and authored tests

The successor JSON lists ALL installation files in order. Full chain: contract → selection → capability → source-fixture → source-snapshot; complete synthetic auth/native/public substrate; authority001–006; explicit synthetic collector source + capture_backlog;007 + install_survivor_fences;008–012; optional journal/recovery013–016; native017; reader018; effective final019. No smaller helper installation qualifies this full path.

001 roles,002 interfaces,003 scoped queue,004 approved payload/dependencies,005 broker and owner reassignment,006 collector/reconciliation,007 survivor/private release,008 operation decisions,009 factual review requiring dblink,010 actual permission reader with synthetic fallback,011 unchanged schema/logic and scoped native policies with digest-bound empty historical seed in this synthetic fixture,012 authentication,013–016 journal/native token/broker recovery,017 preserved earlier gates,018 exact private read,019 final effective owners/role attrs/memberships/SET ROLE/schema/direct+wrapper ACL/native RLS and forced retention RLS. Existing unrelated service_role/native rights are preserved. Catalog checks and actual positive/negative calls complement each other.

The new Python file copies only historical synthetic schema constructor SOURCE and adds necessary native candidate fields. It does not import the historical harness/manifest or seed historical captured payloads; 011 schema and logic remain prerequisites with an empty scope catalog under the digest-bound synthetic transform described below. Synthetic mappings, policy/factual/operation decisions are mechanism fixtures, never real approvals. Mutable synthetic native tables exercise OLD/NEW algebra without disabling production immutable guards.

All groups below are NOT RUN:

- tests/nativeLineageMinimization.test.mjs: Node ESM/PGlite, contract + source-fixture + synthetic native tables + source-snapshot. Covers deterministic v1/v2 projection, exact retries, strict fields/types/sentinel, identity/span/hash, supersession and denied helper calls. PGlite does not prove server/auth/ACL compatibility.
- tests/comparisonNativeCaptureReview.test.mjs: existing actual native regression. qikIngestTestKit → qik-ingest/fixture_substrate.sql → migration20260905082406_evidence_pipeline_reliability.sql, PGlite pgcrypto; qik installer LOAD_ORDER05_operation_ledger,010_collection_gate,020_run_ledger,030_retain_upsert,035_native_caller,040_watermarks,050_schedule_disabled; comparison contract/source-snapshot; nativeHandoff retain/extract. This fixture alone does not qualify authority009–018.
- verifier/nativeLineageMinimizationPostgres.py plus verifier/nativeLineageWorkerFixture.mjs: complete install order above, PostgreSQL17.6/dblink, Python3/psql/Node and already available lockfile dependencies. Actual journal→completion→factual+operation review→staging→accepted reader, digests/SQL NULL/transactions/order/generation/invalidation/excluded changes/fresh+reused triggers/final owner+ACL+RLS/direct-wrapper calls/concurrent snapshot consistency. Failures stop qualification, never weaken gates or historical hashes.

Future invocations from repository root, ONLY after explicit authorization:

    node --test tests/nativeLineageMinimization.test.mjs tests/comparisonNativeCaptureReview.test.mjs
    MIP_NATIVE_LINEAGE_DISPOSABLE_CONTEXT=approved-existing-private-remote MIP_NATIVE_LINEAGE_QUALIFICATION=separately-approved-disposable-only python3 -B verifier/nativeLineageMinimizationPostgres.py

The harness ignores inherited PG variables. It uses only fixed127.0.0.1:5432/postgres and the known historical synthetic disposable fixture password. Before mutations it requires PostgreSQL17.6, no non-template database except postgres, and no existing reserved fixture roles. Missing/mismatched service fails: no provisioning/auth change/endpoint fallback/credential discovery. A marker is not approval.

## Availability and one bounded future qualification request

Historical route: pinned .github/workflows/efta-postgres-qualification.yml defines PostgreSQL17.6 and15-minute timeout, but also old hash-bound suites/full tests/build/audit/install. That workflow is NOT reusable unchanged; no workflow/ref change is made as a workaround.

Observed now: existing remote terminal responds; /exec-daemon/node,/usr/bin/psql,/usr/bin/python3 resolve and a PGlite package file exists. These are file-availability observations only. No versions/running database/server capacity/authentication/compatibility or CI authorization is proved. Connector workflow metadata read was unavailable. No database connection was attempted.

Proposed single request: authorize the exact patch/file-digest candidate identity and this UNAPPROVED successor allowlist for synthetic-only targeted qualification in the EXISTING private remote workspace, conditional on independent confirmation of a compatible existing pristine disposable service. Proposed ceiling: one sequential run of the listed invocations,15 wall-clock minutes,zero paid resources/no new infrastructure. No rerun allowance is assumed. Retain only case-level outcomes, source identity, expected metadata counts/hashes and cleanup evidence in the same private workspace; no raw payload dumps/verbose logs. Missing prerequisites stop qualification. No live qik SQL/install, captured material, feeds, publication, CI dispatch, dependency installs, uploads, production credentials, collector activation, approval bypass or retirement is included.

Cleanup registers database removal immediately after creation and closes concurrent sessions. Only newly created explicit fixture-role allowlist names may be dropped with RESTRICT; never DROP OWNED/CASCADE. Unexpected roles/dependencies stop cleanup. Exact original role/membership baselines must return. PGlite databases close in-memory. Existing qik090_cleanup.sql pertains only to a separately approved disposable qik fixture, not historical/native source deletion. No qualification environment or cleanup was executed in this source-only session.

## Synthetic011 installation boundary — Authored; NOT RUN

The disposable loader requires the pinned011 Git blob and SHA256 recorded in the successor, exactly one documented INSERT prefix/suffix and two dollar delimiters, substitutes only the enclosed JSON literal with [], then checks the transformed-SQL SHA256. Schema and logic remain intact. Transformed bytes exist only in memory; historical011 and evidence remain unchanged. After loading011 and before seeding, efta_scope must be empty. Boundary/digest changes or scope rows fail closed. No material values are printed or added to this successor.

Fixture-only SELECT policies restrict public.articles visibility to the two synthetic UUIDs: kernel/collector after006 before backlog, publication-owner after007 before survivor capture. Production/native policies are unchanged.

## Versioned review storage boundary — Authored; NOT RUN

For v2 only, publication_reviews BEFORE INSERT validates the exact evidence keys listed in the successor and selects 12 explanation fields: assertion identity/type, version/current flag, source IDs, archived source identity/hash/status, supporting passage, rule version, provenance class, review status/state and falsification condition. These support007 publication binding,009 factual record comparison, reader explanation display and explicit provenance. Candidate excerpts/supporting passages remain deliberate copies for those consumers. Full public.explanations rows may be supplied transiently; unconsumed IDs/timestamps/diagnostics/relationship collections are omitted from the new review row. Unknown explanation/evidence/archive keys and nested objects in retained scalar fields are refused. Public factual records/history remain unchanged. The canonicalizer repeats before staging/approved payload construction; legacy generations retain their historical contract.

Additional synthetic cases attempt review/evidence/archive extra fields, nested scalar objects and an unused diagnostic sentinel. They check rejected inserts leave no row and permitted omitted diagnostics never reach reviews/approved output. Journal coverage now reads through final mip_identity.worker_journal_get, reconstructs exact completion args, repeats completion and checks one output; direct cutover access remains denied by016. Authorized-reader evidence-inaccessibility mutates the restricted resolver SELECT policy in a rollback transaction, expects refusal, then checks restored policy and unchanged accepted read. All cases NOT RUN.

## Complete final retention permissions — Authored; NOT RUN

Final019 asserts exact owners, definer/configuration, function ACLs and effective owner/runtime paths after001–018, including final identity journal wrappers and denied direct cutover journal access. It checks table/column ACLs, forced RLS and exact policy matrices for generations, outputs, requests, jobs, failures, lease ownership, journal, reviews, stages, releases, approved payloads and selections. The first-retention trigger must be unique, enabled and unconditional. Exact role attributes/membership checks distinguish the source-declared NOINHERIT EFTA roles from default-INHERIT roles; unrelated predefined/global administrator privileges are not rewritten or treated as runtime roles. Native service permissions remain unchanged.

The authored rollback mutation group changes function/table owner, SECURITY DEFINER, configuration, execute grant/option, inheritance/membership, RLS/FORCE/policy/ACL and review trigger state/filter one at a time. Each must fail with the final-chain assertion prefix and abort its transaction; an independent connection must pass the unchanged matrix afterward. It reads only the assertion block, avoiding the019 grant-normalization prologue so drift cannot be repaired before detection. Journal column drift targets the existing entry column. All NOT RUN.
