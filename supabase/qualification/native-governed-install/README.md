# Native governed joint installation contract

Status: revised fixture source **NOT RUN**. The preceding integrated candidate `75fd79281ea688ebca7f868a15e47ce718780e36` failed installer qualification in run `36407492905` (106 PASS, 3 FAIL, 0 SKIP overall); it is not installer qualification evidence. The prior assertion-helper schema-access failure is resolved; this fixture revision enables RLS on synthetic pipeline_config to match the catalog-observed shape required by unchanged storage001. No hosted qualification or installed claim. The fixed v2 program selects unchanged C6 source from base `79f25d3519d26fd0dbda37fd0728e5783c04834a` plus exact revised complete-cohort/private-attachment C9 blobs. The base identifies provenance, not a claim that the new blob set existed at that commit. Every current checkout source file must match its selected Git blob hash. There is no caller-provided SQL or callback hook.

## Why this must be joint

The observed hosted installation principal is NOSUPERUSER, CREATEROLE, CREATEDB, BYPASSRLS, INHERIT, LOGIN. Those attributes do not confer ownership of isolated backend roles or tables. The five required public source tables (articles, entities, story_arcs, pipeline_config and arc_membership_candidates) are ordinary tables owned by that principal, with RLS enabled and FORCE RLS disabled. The synthetic qualification checks all five shapes from its restricted installer session before installation. The existing atomic backend transfers private objects to isolated roles and removes every temporary membership. C9 needs owner authority to create policies on source_changes and both fences. A standalone installer after atomic finalization cannot recreate that authority.

PostgreSQL 17 also creates an automatic ADMIN-only membership for a nonsuper role creator. Existing native SQL assumes superuser ability to SET ROLE and to perform owner DDL after earlier no-membership assertions. A simple grant/install/revoke wrapper fails.

## Fixed implementation

The existing atomic installer has a separately selected `native-governed-v2` mode. It prepares the exact revised native001/002 plus native003 combined-closure program as part of its complete manifest and invokes it after source/DOJ/final-permission setup and before existing backend creator cleanup. It retains the old default program and assertions. It creates no connection, runtime role login, service, migration-history entry, activation or publication.

The native program uses one temporary NOLOGIN/NOINHERIT/NOBYPASSRLS CREATEROLE creator. It creates only the nine fixed native roles and grants the installer temporary SET/INHERIT rights, with ADMIN false. The creator's automatic ADMIN edges remain isolated. This does not change the existing mentions owner/gateway/admin INHERIT attribute; native validator, qik owner, canonical writer and native owner/worker and attachment owner stay NOINHERIT.

Every historical final assertion is extracted byte for byte and SHA256-bound in the prepared program and receipt. Native-fields003 uses the existing `mip_mentions_native_validator` as its temporary assertion-helper owner: that role already has USAGE on both `mip_mentions` and `evidence_pipeline`, which the assertion's regclass casts require. The earlier mentions-owner helper lacked evidence_pipeline USAGE; the observed 42501 internal position 52 exactly matches its first evidence_pipeline regclass literal. Only this helper execution context changes; the assertion itself and all runtime grants remain unchanged. At each original source stage:

1. Create a private installer-owned assertion schema and a zero-argument, void-returning owner-owned SECURITY DEFINER helper with empty search_path. Its literal body contains only that pinned assertion; there is no arbitrary SQL argument or source byte return. PUBLIC EXECUTE is revoked, installer EXECUTE is explicit, and effective helper ACL/owner/configuration are checked.
2. Start a savepoint **after** source DDL and helper creation. Revoke exactly the creator-issued installer memberships, drop the creator to eliminate its automatic ADMIN memberships, and run the original assertion with all native owner/grantee edges absent.
3. Roll back only that cleanup savepoint, restoring installation-only authority for the next source stage. Drop the assertion schema and its helper. These intermediate checks are precommit stage checks, not claims of final installation.

After the last stage, creator removal is real, with no rollback of cleanup. Replay the exact combined v2 C6/C9/private-attachment final assertion from native003 through the native-owner-owned fixed helper, drop its schema, and check all native roles, memberships, schema ownership, RLS and absence of scaffolding. The parent atomic installer then removes its own backend creator and executes its unchanged final backend/DOJ/compatibility assertions, plus native final closure, before the single COMMIT. Source SQL files and their historical assertions are not edited.

No broad service_role or native ACL revocation is introduced. No persistent helper, owner login, native membership, privileged installer function or extra native EXECUTE grant remains. Existing closed C3 and publication controls remain closed. The last selected native003 boundary covers all 39 functions, 13 tables, sequence, nine roles, schema/effective permissions and source authority; the installer does not substitute an old v1 assertion as final proof.

## Selection and invocation

Prepare:

```js
const plan = await prepareAtomicInstall(readPinnedSource, {
  nativeMode: 'native-governed-v2'
})
```

Use the existing atomic installer configuration plus:

```js
{
  authorization: 'owner-authorized-disabled-comparison-native-install',
  nativeMode: 'native-governed-v2',
  expectedManifestSha256: plan.manifest_sha256,
  expectedNativeProgramSha256: plan.native.program_sha256
}
```

The old authorization cannot select the new mode. The native receipt binds operation ID, mode, native program hash and exact stage assertion hashes. Safe responses identify the selected native mode and program hash; default-mode responses remain unchanged. Reconciliation requires the corresponding mode and native program hash and checks native cleanup. An ambiguous COMMIT must be reconciled; never replay automatically. A failed/unverified rollback in native mode returns `rollback_unverified` and requires reconciliation.

The module deliberately refuses standalone/autocommit use, role/schema collisions, mismatched source blobs, wrong role attributes, unexpected membership topology and missing actual existing-owner authority. It does not adopt or repair an already installed native package.

## Actual qualification source

`tests/nativeGovernedInstallerPostgres17.test.mjs` is authored for PostgreSQL **17.6**, loopback SCRAM, vector **0.8.2**, pgcrypto and dblink. It requires a pristine dedicated cluster and uses the real existing fixture substrate, C3 disabled ordered program and receipt, full compiled atomic comparison/DOJ backend and autonomous rejection-audit flow. No stub replaces a dependency.

The fixture bootstrap administrator only provisions the synthetic substrate/extensions/principals and performs independent inspection/cleanup. The complete joint installation is called through a separately authenticated installer with the observed nonsuper attributes. The test covers wrong-password rejection, distinct authorization/manifest, wrong program/hash refusal, exact pins, actual late source-authority failure/whole-transaction rollback, successful complete order, original assertions, real autonomous audit, preserved disabled C3, denied residual SET ROLE, no helpers/role edges and no native browser/service direct-table expansion.

Parent-owned runner invocation:

```text
MIP_NATIVE_GOVERNED_INSTALL_DISPOSABLE=synthetic-pg17-only
MIP_QIK_COMPARISON_DISPOSABLE=synthetic-pg17-only
MIP_DISPOSABLE_POSTGRES=qik-persistent-install
node --test tests/nativeGovernedInstallerPostgres17.test.mjs
```

All three environment guards and pinned engine are required. Missing native opt-in skips; a qualification run must require zero skips. The runner must use the established isolated PG17.6 image and destroy its container and volumes in an unconditional final step, then verify absence. This source does not create infrastructure.

Cleanup first closes each owned connection independently, refuses unexpected roles, drops/recreates only the armed pristine disposable postgres database, removes only the fixed created-role allowlist, and compares the initial role-name baseline. Primary and cleanup failures fail qualification. The negative source-authority case requires SQLSTATE P0001, the exact `arc_native_source_authority` name and the native001 checkpoint-assertion stage; a generic earlier install failure cannot pass it. Missing acknowledgement injection returns the real safe installation refusal before the test asserts that COMMIT was reached. Native diagnostics retain only fixed stage/source/object names, allowlisted static exception names and numeric SQL positions; they exclude SQL text, arguments, detail, hint, raw context, payload and arbitrary server messages. An internal query is represented by a SHA256, source-area/offset/line/length and at most two fixed PL/pgSQL frame labels only when it is a byte-for-byte static fragment of the exact pinned source; unmatched queries produce no query hash or frames. Separate fault cases deliberately discard the caller acknowledgement after an actual PostgreSQL ROLLBACK or COMMIT has completed, then require a fresh authenticated reconciliation without replay. SQL is never stubbed; these are acknowledgement-loss fault injections, not claims that a physical network outage was reproduced. No live project SQL, material, secrets, hosted credential or physical Windows project file is used by this source authoring task.

## References

- [PostgreSQL 17 role membership](https://www.postgresql.org/docs/17/role-membership.html)
- [PostgreSQL 17 CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html)
- Existing actual creator-isolation source: `verifier/qikRoleCreatorIsolationPostgres17.sql`, blob `dc37a5c7b81dc109d4cee7cda0f3df55147ae30a`.
