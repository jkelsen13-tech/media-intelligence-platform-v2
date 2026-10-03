# Protected launch install source package — 3 October 2026

**SOURCE/SYNTHETIC QUALIFIED; UNAPPLIED.** This bounded successor advances the existing new-feature compiler and readback package from frozen `ca72a6df511bbb26c6b9e0a193a3e0baf01aa428`, tree `cbcfc510a117101fd163f83b3c574dd979085b02`. Its exact source inventory is [the dated manifest](MIP_LAUNCH_INSTALL_PACKAGES_SOURCE_2026-10-03.json). The existing eight owner proposals, native migrations, role/grant changes and recovery SQL remain unchanged. No protected target connection, SQL execution, live rehearsal, grant, population, provider activation, deployment or release occurred.

The complete current Library read manifest was supplied by the parent at `/workspace/mip-oct03-launch-readiness/requirements/current-library-read-manifest.json`: handoff/review v19; whole-platform requirements v6; World View plans v7; original-qik scope/smallest-step v4; support draft v2; owner decisions and source/rights research. The parent's additional Master Plan v2.1.5 reading corrects the older register's v2.1.4 latest-version label. Accepted immutable reviewed source/capture/hash versions, public Story Following over private personal state, private selective intake, canonical Markets identity and the existing Legacy completion owner remain the implementation contract. This package creates no second owner or intake engine. External Following push/email remains post-launch.

## Exact changes and byte readback

The existing [compiler](../scripts/compileLaunchInstallationStage.mjs) now refuses missing security fields, duplicate object/column/ACL/membership identities and impossible missing public-schema/role readback. It binds both the exact accepted catalog file bytes and the parsed JSON representation, all compiler/imported-helper/proposal/recovery/installed-catalog/helper source hashes, and compiled SQL bytes. Recovery artifacts additionally bind the exact original installation receipt file. A receipt records caller-supplied input integrity; it does not prove that a genuine target catalog was independently accepted or that the supplied installation receipt has trusted provenance.

Both SQL and receipt names are reserved with exclusive creation before content is written. Existing SQL/receipt bytes survive a collision. An ordinary failure removes only files opened by that call; concurrent writers produce one accepted pair. The two-file publication is not an atomic filesystem transaction: interruption or storage failure may leave an incomplete pair. Mandatory local readback refuses missing, truncated, altered or stale inputs before any approval. No verification call writes files or executes SQL.

The existing [transaction guard](../scripts/launchInstallationSequence.mjs) now establishes `lock_timeout=5s` and `statement_timeout=30s` before its full catalog query, rather than waiting for later owner-proposal statements. It also establishes `idle_in_transaction_session_timeout=30s` before that query. The idle bound is an explicit source-package operational containment choice, matching the supplied owner's 30-second statement duration to avoid leaving a paused or failed preflight session holding transaction authority indefinitely. It is not an ingestion/materiality/product-policy threshold. The changed compiled bytes and that inactivity limit require exact later execution approval.

A lock limit applies to each lock acquisition, a statement limit to each statement, and an idle limit to transaction inactivity. None is a total transaction deadline or a measured hosted cancellation guarantee. The owner proposal's later timeout statements remain unchanged. Genuine native/hosted timeout, connection-loss and recovery windows must be qualified before execution. See [PostgreSQL 17 timeout semantics](https://www.postgresql.org/docs/17/runtime-config-client.html) and [Supabase API privilege/RLS separation](https://supabase.com/docs/guides/api/securing-your-api). The [25 September provider release notice](https://supabase.com/changelog) describes a 17.6-to-17.11 rollout; the actual target version must therefore be freshly read, never inferred from historical metadata.

## Existing stage order and exact owner SQL

| Order | Stage | Unchanged source proposal | SHA256 |
|---|---|---|---|
| 1 | reviewed-public-versions | `supabase/source-proposals/public-reviewed-versions-v1.sql` | `8e7895c435125779a145fa42ab6e5579a8bc70f4db4bc0fbd38f7eed52b5ea49` |
| 2 | public-story-following | `supabase/source-proposals/story_following_v1.sql` | `bf61df7baf65a467f3e73c63b4d7789c72cf06fbe9c71e7523761f12b0f49ad7` |
| 3 | private-relevant-inputs | `supabase/source-proposals/assessment_relevant_inputs_v1.sql` | `155874498004715014c8eb4b776daf8dc512bf4c60b6ffc1311b218a38f35e19` |
| 4 | private-postcapture-receipts | `supabase/source-proposals/investigation_selective_intake_v1.sql` | `77fe363ce52794455779e8cbd79934e5f8c28be583de869c28f46e48d5691703` |
| 5 | selective-execution | `supabase/source-proposals/selective_intake_execution_v1.sql` | `c0ffa6adf1997b44cdbfd301030c0a20690b86abcb4cdc446ef77c6caa54a471` |
| 6 | legacy-atomic-completion | `supabase/source-proposals/legacy-atomic-completion-v1.sql` | `be9c66b512ec141ed3107b07285767ac4c68a929eecf14385681697608de7161` |
| 7 | markets-directory | `supabase/source-proposals/markets-directory-v2.sql` | `e8cbc68c61f68975f613dafcec8c9f3a54fa5da0b50ff8176309b0958d13019b` |
| 8 | reviewed-comparison | `supabase/source-proposals/comparison-reviewed-versions-v1.sql` | `5ba7f54fb58cac6291b6ce7af9f939d7daadba3763232643fcded7df30a711f7` |

Each stage has its own fresh, complete, separately accepted post-dependency catalog. A first-stage or global baseline cannot approve later stages. The source manifest records actual fixture object/function/owner/ACL deltas and hashes, plus supplied recovery/helper SQL. The four historical native migrations are fixture foundation only; they are never a protected replay plan. A native prerequisite or reserved-name mismatch is HOLD. Selective's new same-RPC completion proposal is a separately qualified future follow-on; it is not inserted into this historical eight-stage sequence. The parent must bind its exact qualified proposal/recovery source and its fresh post-dependency catalog independently when integrating that follow-on.

## Fresh read-only preflight and before/during/after state

Before an execution approval, the existing operator must establish target project/database/current role/session identity, current server version, existing native owner/prerequisite definitions, all named role memberships/grantors/options, relation/column/schema/function ACLs, RLS/FORCE RLS and policy definitions, dependency identities, and affected consumer availability. The read-only [full catalog query](../scripts/launchInstallSequenceCatalog.sql) runs in `pg_catalog` context through the approved existing evidence channel. Genuine catalogs and operator receipts remain in their approved private custody; only synthetic catalogs/receipts belong in this source repository. Capture the full exact baseline after each dependency and accept those bytes independently. No compiler call fetches, approves or weakens a target baseline.

Before stage 1, absent immutable readers are unavailable and the modern client does not fall back to mutable article/detail tables. During each later separately approved stage, the existing supplied single `BEGIN` transaction first applies the timeout controls, compares the full fresh catalog with the independently accepted one, captures it transaction-locally, sets that owner's native guard settings, and retains the owner's exact locks, signatures and DDL. The fixture records the source/compiled/baseline hashes and transaction ID. A failed equality or namespace guard aborts before installation; no global baseline or automatic retry substitutes for diagnosis.

After an approved stage, independently capture and compare its complete installed catalog and exact delta, definitions, schema/column/function effective privileges, role/member/grantor options, RLS policies and retained-history heads. Ordinary `anon`/`authenticated` readers must fail private Following/profile/raw article/publication authority attempts; required exact public immutable reader paths must return their declared empty/available/unavailable state. Legacy service article UPDATE, publication completion and narrow-owner membership remain denied. Selective's criteria, rights and operation registries remain empty until explicitly enabled. A successful SQL install alone does not admit any source/capture/rights/policy or activate a reader/gateway/account.

Following reader/gateway installation requires distinct current-session authentication, assigned-account authorization, cross-account refusal, CAS, expiry/revocation, private saved preference and displayed-version acknowledgment readback. Public immutable version and withdrawn/source-report behavior remain distinct. Those hosted Auth/JWT/PostgREST/account checks have not been executed by this source package.

## Source-only compilation and mandatory artifact verification

Run only against an independently accepted catalog file in the approved custody location. These commands read/write local files; they contact no target and grant no later authority.

```sh
node scripts/compileLaunchInstallationStage.mjs <exact-stage> <accepted-catalog.json> <new-output.sql>
node scripts/compileLaunchInstallationStage.mjs <exact-stage> <accepted-catalog.json> <new-output.sql> --verify
```

A separately approved future B artifact can be compiled with `--rollback-only`; its exact SQL contains one `ROLLBACK` and no `COMMIT`. Creating that artifact is not a protected rehearsal. Never execute an install artifact inside an outer rollback and assume its own `COMMIT` is contained. Verify the pair with `--verify`, which reuses the receipt's exact artifact mode, current source hashes and accepted file bytes.

The existing recovery compiler is now exposed without changing any owner recovery SQL:

```sh
node scripts/compileLaunchInstallationStage.mjs <exact-stage> <fresh-accepted-recovery-catalog.json> <new-recovery.sql> --recovery <original-install-receipt.json>
node scripts/compileLaunchInstallationStage.mjs <exact-stage> <fresh-accepted-recovery-catalog.json> <new-stop.sql> --containment <original-install-receipt.json>
node scripts/compileLaunchInstallationStage.mjs <exact-stage> <fresh-accepted-recovery-catalog.json> <existing-recovery-or-stop.sql> --verify <original-install-receipt.json>
```

The original receipt must identify the exact stage/proposal hash and retained native original snapshot where supplied; the fresh recovery catalog is a separate accepted file. Missing supplied recovery, mismatched original stage/hash/snapshot, changed source inputs or changed original receipt bytes refuse. A compiler receipt cannot authorize recovery and cannot establish genuine original-installation provenance.

## Failure, recovery and restart

On catalog/namespace/privilege drift, timeout or transaction error, stop the exact stage, retain the failure evidence, acknowledge rollback through the original channel, and independently reread the catalog/security/history scope before diagnosing. Missing rollback acknowledgment or lost connection remains UNKNOWN; matching rows alone do not prove acknowledged recovery. No automatic live retry, weakened guard, baseline replacement or registry-emptying is authorized.

Comparison and Markets supplied empty checkpoint recovery restore their exact predecessor catalog. Following/public-version recovery is permitted only at its supplied empty checkpoint. Selective empty extension restore requires the exact permitted dependency checkpoint; its supplied preserve-and-revoke stop retains native/criteria/rights/permit/execution history. Legacy supplies preserve-and-revoke only, retaining its role, policies, captures, private/public versions and receipts. The managed-owner temporary SET/schema CREATE windows preserve provider ADMIN-only grantor/options and are independently restored after success or failure.

Whole empty reverse recovery restores Comparison then Markets and contains Legacy then Selective. It retains earlier dependency owners and does not restore one global pre-install catalog. Populated destructive rollback refuses and retains all history; recovery after population requires a separately reviewed exact preservation proposal. Public-version empty rollback can restore predecessor raw-column exposure: all affected readers must be held and that exposure independently approved/read back before a separate restart decision. Re-enablement requires exact retained-state and privilege/head/permit/receipt readback, not a migration replay or auto-resume.

The original qik audit-route package at `675654be5a778c3173e682c4013031cb7796ed36` and its later client/verifier/controller at `a9ce6b29f46cc965fd45c9edefcb7428f3493c69` are separate high-risk lineage. Their trust registry remains unbound; a9ce's two failed fresh review startups provide no verdict. This installer does not import their executable artifacts, connection route, dblink or trust authority. Parent Supabase Support outreach was sent at 03:42 UTC under existing ticket `SU-488436` and awaits a reply; no duplicate outreach occurred here.

## Qualification and remaining gates

The dated [Node 22 receipt](../verifier/launch-install-packages-node22-2026-10-03.json) and [Node 24 receipt](../verifier/launch-install-packages-node24-2026-10-03.json) each report **35/35 passing tests**, zero failures/cancellations/skips/todo: 13 existing whole-sequence cases; 8 new artifact/catalog/timeout/recovery cases; 14 existing distinct non-superuser managed-owner success/failure cases. Source inputs were byte-identical before/after each run. The actual engine reports PostgreSQL 18.3 PGlite/WASM, not target/native PostgreSQL 17 or local native PostgreSQL 15.

Actual disposable SQL proves fresh catalog refusal, pre-guard timeout settings, rollback/session restoration, column-ACL/RLS drift refusal, occupied-object preservation, supplied exact empty recovery, populated destructive refusal, history preservation, installed empty withholding and immutable no-fallback, ordinary-role/private/profile denials and exact managed-role grantor/ACL/membership cleanup. Local file tests prove collision cleanup, one concurrent writer, exact accepted-file/current-source/original-receipt/SQL tamper refusal and read-only recompile verification. Settings observation does not measure native timeout/cancel/drain or concurrent locks.

No genuine source/reviewer/rights/criteria/corpus, hosted Auth/PostgREST/assigned account, native two-connection lock/cancel/recovery, real provider/log/window, physical-device/appearance/performance, final review or release proof is supplied. The [initial mutable prequalification syntax failure](../verifier/launch-install-packages-initial-syntax-failure-2026-10-03.json) is retained separately; it was corrected before these final source-bound runs, and its intermediate source bytes were not preserved. Prior October 2 receipts/manifests and every failed historical qualification remain unchanged. This is a new source-package generation; no earlier or protected rehearsal is implied. Parent independent review, final integrated source qualification, exact stage installation/recovery approvals, genuine population and reader/operation activation remain separate open gates. Incremental provider subscription/overage commitment remains $0.
