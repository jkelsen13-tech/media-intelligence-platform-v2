# Immutable private native/comparison binding

Source-authored, NOT RUN. This component links two independently accepted private generations. It does not stage a substitute comparison output, publish, attach, alter public rows, or change eligibility.

## Installation and exact dependencies

Install after the current selected full compiled comparison backend001–020 and its audit, existing native reliability/ingest, mentions001/native003/candidate004/qik001/canonical005/qik002/native001+002/attachment003, and private projection `001_native_private_projection.sql` blob `bc58ef8143fdea209bdf91ad9edfb6e96a089657`. The parent selected installer owns the complete pinned order. Do not substitute the reduced standalone lineage fixture schema. PostgreSQL17.6, pgvector0.8.2, pgcrypto and dblink are existing fixture prerequisites; this component adds no extension/service.

The accepted reader is unchanged018 blob `f55f7da3b22e992c20f6c968a37ae0af75dd2a47`; unchanged019 permission matrix is `df829634068d4b113862da3f4ba877ccc6cc72b7`. The actual compiler mapping `cd87eb0a0bc758315246e74675339f3ea2972a19` places comparison storage in `mip_comparison_kernel_v1`. No raw qualification schema is assumed.

The new installer temporarily SETs the two existing protected owners. It requires the authorized selected installer to be able to grant/revoke those temporary memberships, as for preceding stages. It creates a fresh `mip_native_comparison` schema; collisions refuse. No new role. New functions/tables have provider-default grants removed only on these newly created objects. Existing comparison EXEC/table/RLS permissions are not widened. Existing publication owner owns two protected new helpers; only it and native owner may execute them. Temporary publication-owner CREATE on the new schema is revoked; it retains USAGE only. Gateway has USAGE plus only admit/read/revoke; worker/browser roles have none.

Run the complete `native_comparison_final` assertion after actual installer creator-membership cleanup. It embeds the exact preceding private/native final assertion, then checks new schema, seven function signatures/owners/definer/configuration/effective EXEC, two tables/columns/RLS/policies/effective ACL, immutable triggers and unchanged existing authorize/accepted-reader ACL. The main selected backend still runs its unchanged019 matrix; this component does not relax it.

## Actual APIs

All names below are in `mip_native_comparison`.

- `admit(scope,id,projection_id,dependency_hash,display_hash,private_review_id,session_uuid,runtime,release_request,event_id)`: current native can_decide review plus current broker publisher authorization. Both unchanged current readers must pass. Returns metadata receipt.
- `read_current(scope,id,manifest_hash,session_uuid,runtime)`: current native membership plus broker authorization; reconstructs the exact manifest and refuses any drift.
- `revoke_binding(scope,id)`: native can_decide, append-only irreversible local revocation. It cannot approve/publicize either generation.
- Protected `authorize_session`, `comparison_metadata`, `collect`, `receipt` are not gateway-callable.

The session UUID and runtime are transient arguments. Only a hash of the runtime is retained, so refreshed valid sessions can read the same binding. Broker mapping/scope/evaluation/expiry/revocation checks remain in existing authorize/018. Scope members do not gain a publisher session. Admission records the native reviewer principal; an exact retry requires that same principal.

Lock order is identity authority first, then existing native policy/scope and collector/publication fences, then unchanged current readers. Native context enforces READ COMMITTED; fences prevent relevant source/review changes between the two readers. The accepted reader performs its own source-snapshot/operation/factual/native-lineage/current-selection checks and return authorization. This is a current-authority receipt, not an immutable historical read that bypasses revocation.

## Exact binding and retention

One explicitly named, real accepted event must contain exactly the complete native candidate+member article set:2–32 unique articles. Every article's original capture and content hash must match; native original job IDs remain recorded. Missing/inaccessible/superseded captures fail through existing current readers. Extra/missing event sources refuse rather than silently narrowing the cohort. Every event source must have actual accepted claim evidence. Binding does not create events, claim candidates, canonical entity admission, spans, comparisons or approvals.

Claim evidence retains candidate/article/capture IDs, original content/field hashes, source-field enum, exact start/end and `unicode_code_points`, plus hash of the actual claim key. Native citation UTF8 byte spans remain governed by the original projection dependency hash; they are never relabeled as claim spans. Membership provenance is represented by its exact JSONB hash. Both generation IDs, reviews, hashes and the comparison release/event identities remain separate.

Two durable tables only:
- `bindings(scope,id,manifest,manifest_hash,principal)`: one canonical metadata JSON representation, its digest, retry identity.
- `revocations(scope,binding_id,principal)`: explicit local revocation consumed by admission/readback.

`contract.json` lists every nested manifest/receipt key. No display, URL, body, excerpt, arbitrary claim text, session UUID, token or runtime plaintext is retained. Authoritative original resolvers remain the existing capture/native reader and accepted comparison reader. Original snapshots/scores are never overwritten. Receipts expose only scope/binding ID/digest/two generation IDs plus fixed private/false flags.

## Bounds and honest limits

Preflight selected comparison input/output/review evidence/explanations/context total<=128KiB before calling018; accepted response<=256KiB, <=32 events, selected event<=32 sources/128 evidence entries. Comparison metadata<=96KiB; final manifest<=112KiB. Native selection is explicitly limited to4MiB/120MiB for this composed branch, preserving original native8MiB/128MiB ceilings and private2MiB reserve. Larger profiles refuse without modifying global policies.

These are bounds on additional adapter data and selected persisted inputs. They do NOT prove total CPU/hash/memory work inside unchanged018, whose source_snapshot/survivor_context recomputation has no operation-budget receipt. No such total claim is made. The existing native limits are not weakened. Operational capacity and actual material/public eligibility remain unqualified.

## Real fixture helper and invocation

Import `assertNativeComparisonBinding` from `tests/nativeComparisonBindingAssertions.mjs` into the parent's full PostgreSQL fixture. Call only after all source/event/review setup and both real accepted generations exist, before any destructive source/role cleanup. Constructor mutations must precede native generation/context snapshots, so source-change invalidation is not evaded.

Required object:
```js
{
 syntheticFixture:true, db, reviewer, sameReviewer, gateway, outsider, worker,
 scope, id,
 native:{projection_id,generation_id,dependency_hash,display_hash,review_id},
 comparison:{session,runtime,release_request,event_id,generation_id},
 otherComparison:{session,runtime,release_request,event_id,generation_id},
 nativeSources:[{article_id,capture_id,content_hash,job_id}],
 bindingIds:[/* two reserved UUIDs */], sentinels:[/* nonempty original payload strings */],
 finalAssertion,
 withRevokedComparisonSession, withRevokedNativeAccess, withInvalidatedComparison,
 withFinalBoundary
}
```
`sameReviewer` is a second real connection with the same login as reviewer. Gateway is a current scope member without can_decide. `otherComparison` is an actual accepted event with a different full source set; it may be another event in the same accepted generation. It is never a random UUID or mocked acceptance.

Each mutation callback opens a real rollback transaction, changes the relevant source/session/selection, and invokes `body(client)` on a real connection whose current session_user is the intended reviewer. This ensures the reader observes the mutation. It restores by rollback before returning; committing and restoring scalar access would advance its revision and correctly leave the original projection stale. `withFinalBoundary` uses the existing exact fixture worker-membership cleanup transaction, validates baseline, runs the provided body and rolls back to restore memberships. It must not weaken production closure.

Six helper checks exercise real dual authorization, exact/lost-ack retry, different accepted event mismatch, exact nested metadata identities/no sentinel/session retention, both-side current refusal and rollback recovery, direct protected-helper/storage denial, final ACL drift rejection, and append-only revocation. Diagnostics are static stage/SQLSTATE plus restricted source frames, never raw driver messages/payloads.

Reuse actual enqueue/finish/extract and workerV2 completion construction from `tests/comparisonNativeCaptureReview.test.mjs` `d54d7c242af7f653208059b734e11c93d09374fa` lines25–71. Reuse actual journal/factual review/operation evidence/release/read sequence from `verifier/nativeLineageMinimizationPostgres.py` `edd73216702e047f7f5e12ae2844ced6844299c5` lines117–171, NOT its reduced tables/direct capture inserts. Two distinct-outlet synthetic sources must share exact captures with the C9 setup. Use compiled kernel names. Synthetic fixture authorizations remain explicitly synthetic and isolated.

Parent command remains the full `node --test tests/nativeArcCohortPostgres17.test.mjs` with `MIP_NATIVE_ARC_COHORT_DISPOSABLE=synthetic-pg17-only`, `MIP_QIK_COMPARISON_DISPOSABLE=synthetic-pg17-only`, `MIP_DISPOSABLE_POSTGRES=qik-persistent-install`, Node22.14.0, the dedicated existing PG17.6 service and selected actual installer/audit prerequisites. This helper neither starts a service nor installs dependencies. Parent owns guarded pristine-cluster teardown; add only the new schema's objects to any explicit object allowlist. No additional roles need cleanup.

Actual qualification and fresh consequential source review must follow integration. Source authors have not run SQL, tests, material access or public release.

## Protected source-row visibility successor

The full actual worker fixture exposed a pre-existing integration gap: unchanged005 grants the kernel owner SELECT on events, articles, event_articles and pipeline_config, but does not add row visibility when those source tables use RLS. An empty snapshot cannot stand in for inaccessible evidence. This additive stage checks the existing SELECT grants and adds exact-role SELECT-only permissive TRUE policies only where an RLS-enabled required table lacks equivalent direct protected-owner coverage. The publication owner similarly needs complete source visibility for the exact unchanged fifteen-relation survivor_context contract. Existing009 publication_rows on explanations is reused, as is all factual-owner coverage. No table/column grant, DML, public/worker/browser right, source-row mutation or RLS/FORCE setting changes.

The installer must actually hold CREATE POLICY ownership authority on each affected source table. Both install and final/reconciliation closure assert the fixed original survivor_relations constant source/owner/settings and complete effective protected-owner visibility, rejecting applicable restrictive SELECT/ALL policies (including PUBLIC and inherited rights). Existing empty/subset generations stay immutable and become stale through the unchanged current-snapshot comparison; they are not reaccepted or rewritten. Synthetic qualification adds lost protected-policy and restrictive-policy refusal on fresh reconciliation. These are authored checks; actual receipts identify the tested exact candidate separately.
