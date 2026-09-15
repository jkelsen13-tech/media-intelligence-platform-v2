# Backend consolidation dependency record — 13 September 2026

Baseline: `cc48e4ba37af89264f7dc308cc82956e9ef80701`, draft PR #153, `codex/isolated-authority-worker-publication-20260912`.
Production cutover **ON HOLD**. No retirement authorization. This update adds read-only inventory, bounded reconciliation machinery and deadline planning; it does not deploy F1/F3/F6.

[Sanitized observations](../verifier/backend-consolidation-2026-09-13/observations.json) contain all 312 enumerated application-table counts (97/95/92/28), relation/RLS metadata, function signatures/owners/grants/digests, trigger and policy metadata, Auth/storage counts, Edge Function versions and cron state. [Read-only queries](../verifier/backend-consolidation-2026-09-13/queries.json) retain reproduction methods. No article bodies, user identifiers, secret values or storage-object contents were requested. Observations are separate snapshots, not a cross-project transaction or final write fence. The 11-article comparison remains a separate bounded inventory.

## Completed engineering and exact limits

`scripts/collectorRetentionReconciliation.mjs` compares required source relations against retained receipts using the same PostgreSQL JSONB/UTF-8 sorted-row SHA-256 method. It denies missing/duplicate relations, missing digests, wrong source/range bindings and omitted deltas. Its result never authorizes retirement or asserts whole-backend parity. Tests include the actual sanitized observations and explicitly synthetic adversarial mutations.

At 18:27:16 UTC, all **4,775 ingestion runs, 4,755 ingestion source runs and seven ingest_sources records** match retained payload multisets. The retained run range ends **2026-09-10T05:25:05.75618+00:00**. There are **985 additional runs and 985 additional linked source-run records** after that range in this observation. This is exact range reconciliation, not subtraction of unrelated aggregate queue counts. Active ingestion can add further delta. No delta was transferred.

Fresh SHA-256 comparisons also match all **45 spatial archive rows across 21 relations**: 39 spatial rows and six public parent rows. This does not cover the sandbox's pipeline_config row, full DDL/configuration, every historical version ever held, external callers or recoverability. Database digests identify retained representations; differences would not establish publisher content edits or deletion by themselves.

The CC batch is unchanged: closed 3/3, null activation subject, tested commit `0da8b5a0a4f9540160b71a39a1bbba3d655bcc95`. No source retrieval occurred. Earlier failed/inactive attempts, frozen manifests and reviews remain untouched.

## Per-backend retirement dependencies

| Backend | Data and retained versions | Enforcement/runtime | Auth/storage/access | Exact blocking action |
| --- | --- | --- | --- | --- |
| Manus `yhbwnrtlqbjtcrrlpbge` | 97 application tables; initial inventory 32,160 articles, 13,008 events, 9,020 extraction results, 5,759 runs; later collector snapshot has 5,760 runs. Survivor retains 9,537 collector versions; 1,970 later run/source-run records observed. Import mappings 3,818 and conflicts 1,504 are not all-data transfer receipts. | 182 catalogued functions, 40 triggers, 53 policies; six Edge Functions including source-comparison-run v15 and membership-qualification v1. Two active */5 jobs. | Zero observed users/sessions/storage objects. Four Vault references and two credential-bearing table records counted without values. External callers and Edge environment custody unknown. | Complete private relation/version manifests and delta capture/restore; close collector/extraction/graph/backlog endpoints and intentional behavior differences; separately authorize eventual scheduler handoff. Counts do not prove uniqueness or parity. |
| Original `niejaejtbxgakyrsntxm` | 92 application tables; 752 articles, 347 events, 839 claims, 1,892 explanations; nonempty pre-D5, review, arc and other backup tables individually enumerated in evidence. | 128 functions, seven triggers, 60 policies; six Edge Functions including source-comparison-run v17 and batch-intake v14 with verify_jwt=false. Two observed cron jobs inactive. This is a distinct deployment from Manus v15; do not conflate them. | Three users/four session records/three email identities; profiles and mip_profiles depend on auth.users. Public post-media bucket, zero objects and multipart uploads. Empty bucket does not establish absence of application dependency. | Private account/access mapping and explicit session transition policy; preserve backup/version history with permitted custody; prove required reader/publisher/graph functionality and callers survive. Inactive cron alone does not prove unused backend. |
| Spatial sandbox `jfnzyvzthzqtczlxhjll` | 28 application tables. Matched 45 archived rows/21 relations; separate pipeline_config row remains outside that match. | 133 functions (includes extension functions), 15 triggers, nine policies. Five public tables have RLS disabled: arc_membership_candidates, authors, outlets, policies, story_arcs. No Edge Functions or cron schema. | Zero observed users/sessions/buckets/objects; external callers/configuration not established. | Reconcile configuration, function semantics and remaining empty-table/schema dependencies; prove private archive restore with authority/history relationships and no remaining caller. First candidate for closure work due to fewer observed runtime dependencies, not approved for retirement. Preserve World View and existing restrictions. |
| Survivor `qikvmopbtijoebdqosyq` | 95 application tables; five articles, one event, three membership edges; private evidence pipeline and 9,537 collector/45 spatial retained versions; live spatial records differ in scope from sandbox history. | 227 functions, 90 triggers, 23 policies; eight Edge Functions, including capture-retrieval v6; no cron schema. Isolated candidate SQL is not installed by this work. | Two users/three sessions/two email identities; zero buckets/objects. Shared public/private frontend composition is code evidence, not deployed caller verification. | Retain as designated survivor; complete capacity, access, enforcement, workload and recovery checks before separately authorized cutover. Never downgrade the whole Pro organization merely to change a redundant project's cost. |

Function counts include extension-supplied public functions; they are inventory measures, not counts of unique MIP behaviors. Full per-relation backup counts and catalog digests are in observations. No unobserved record is declared redundant. Current source-rights uncertainty remains explicit and denies unsupported operations; it does not prevent isolated engineering.

Known external dependency: `.github/workflows/deploy-cloud-run.yml` describes manual deployment to **mop-extraction / us-central1 / mop-extraction**, referencing **GCP_SA_KEY** and an unauthenticated service option. It is configuration evidence only. Current Cloud Run revisions, IAM, environment/secret references, scheduler callers and service traffic are not exposed by the present connectors. No deployment was invoked. Existing secret references are not an approved future custody arrangement.

Database backups do not include Storage object bytes. Even with zero observed objects, configuration and later deltas require explicit handling. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

## Finite requirement register and classification

[Machine-readable remaining register](../verifier/backend-consolidation-2026-09-13/requirements.json) is the current finite list; earlier status documents remain historical.

- **A — retirement dependencies:** complete data/version disposition and final delta; schema/enforcement equivalence; Auth/access and all callers; storage/jobs/configuration; protected export/restore and rollback; production-shaped verification, targeted review where required, explicit cutover/retirement authorization and verified billing consequence. Each protects a resource or required behavior that disappears when a backend does.
- **B — coherent review dependencies:** executable F1 broker/least privilege, F3 durable recovery/collector receipts, F6 authoritative fail-closed adapter and D4/D5, regression/adversarial evidence and explicit unresolved deployment limitations. Isolated implementations exist; current operational reconciliation and external Auth/runtime closure remain incomplete. The completed CC component closes only its exact permission path.
- **C — public-launch/later:** new semantic promotion/F2, new publisher or spatial admission, new paid providers/Markets capabilities and public activation where they do not supply an existing A/B dependency. This is dependency classification, not a scope waiver. An actual required behavior depending on any of these remains blocked until its decision is satisfied. World View, provenance, history and existing safeguards remain required.

Unsafe legacy blanket acknowledgement, partial destructive projection updates and rollback-lost rejection auditing are **intentional differences**, not parity targets. The frozen handler tests and isolated generation/D4/D5 tests prove replacement behavior in isolation; they do not prove live operational equivalence. No old queue row receives an invented generation mapping.

## Backward plan toward October 3

These are target windows conditioned on access and evidence, not promises or execution authorization.

| Target window | Dependency and evidence needed |
| --- | --- |
| Sep 13–16 | Finish metadata/config/caller inventory; resolve D1/D2/D4 below. Prioritize spatial closure, then original Auth/history; Manus collector remains critical path. |
| Sep 17–21 | Approved private restore rehearsal and exact relation/version/delta reconciliation; finish runtime/access and operational equivalence gaps. Continue isolated engineering independently of unsupported publisher operations. |
| Sep 22–24 | Freeze coherent candidate only when its evidence requirements actually close; prepare targeted independent review covering changed F1/F3/F6 plus consolidation boundaries. Preserve prior independent native gate. |
| Sep 25–27 | Only after separate approval: bounded production-shaped verification and cutover/rollback trial against exact candidate and identities. No trial is authorized now. |
| Sep 28–30 | Final reconciliation, source write fence/scheduler handoff, recovery readback and rollback decision. Recheck billing action using account-specific evidence. |
| Oct 1–2 | Separately authorized retirement only for each backend that independently passes its gates; verify service and billing consequences. |
| Oct 3 | Deadline target, not first cutover attempt or assumed billing renewal. Retain a blocked backend rather than waive safeguards. |

Main risks: continuing Manus delta; unknown external consumers; original Auth and historical backups; missing private export custody; source-rights constraints on any new copies; production-shaped verification approval/access; independent-review findings. Shortening the plan does not remove these dependencies.

## Smallest prioritized decisions / access proposals

**D1 — private recovery boundary (blocks every retirement).** Evidence: only bounded collector/spatial retention and fixture restore are demonstrated; original backup tables and private evidence exist. Choose an existing owner-controlled encrypted remote destination and disposable private restore environment, identify authorized custodians/readers and a retention period, and explicitly authorize the minimum protected export/restore scope. Recommend a private, access-controlled remote rehearsal with egress disabled and schedules/workers/publication off, using existing infrastructure if available; public GitHub artifacts and the physical device are unsuitable. If no permitted existing environment exists, keep retirement blocked and return an exact alternative before provisioning anything. Minimum authority: read/export selected backend schemas plus write to that isolated destination only. Rights restrictions on historical content must be resolved for that specific transfer; this proposal does not waive them. Untested: actual whole-backend recovery, foreign keys, Auth/configuration recovery and rollback.

**D2 — runtime/access metadata and original Auth transition.** Evidence: original has three users/four session records; survivor has two/three; equal emails or a GitHub name cannot authorize a principal mapping. Provide an approved read-only view of Auth provider/redirect/SMTP settings, deployed application endpoint references and Cloud Run mop-extraction revisions/IAM/secret-reference metadata; do not provide secret values. Recommend private owner-verified account mapping and fresh survivor authentication, preserving access/provenance bindings, rather than assuming old sessions transfer. Alternative is a separately designed session migration with explicit security review. Approval needed: chosen session-transition behavior and private mapping process, not credentials or an immediate account change. Minimum access: configuration/IAM/caller metadata read only, with no Secret Manager payload access. Untested: login, redirects, account access, current external callers and endpoint cutover.

**D3 — production workload/custody design after D2.** Recommend evaluating the already referenced Cloud Run runtime with broker-mediated, short-lived scoped sessions; workers must not receive service_role or broker/journal/audit credentials. A dedicated isolated runtime is the alternative if existing deployment cannot enforce the boundary. D2 evidence must determine feasibility before an exact issuer/audience/subject is proposed. Owner must name broker, encryption-key and independent audit custodians, trust/rotation/revocation policy and session lifetime; fixture values are not defaults. No choice is needed to rerun isolated tests. Untested: workload attestation, restart recovery and separate audit acknowledgement on the intended host. This is a concrete design dependency, not a request to provision credentials now.

**D4 — account-specific cost evidence.** The organization is confirmed Pro. Supply read-only project compute/add-on line items, applied credits and billing-cycle metadata (no payment details), or make that view accessible. Recommend evaluating the spatial project first after safety closure and retaining the survivor's organization plan. Current official guidance says paid projects cannot be paused directly; transfer to a Free organization is a separate action with eligibility, limits and operational consequences to verify. No pause/delete/downgrade recommendation or savings amount is justified yet. [Billing model](https://supabase.com/docs/guides/platform/billing-on-supabase), [pausing rules](https://supabase.com/docs/guides/platform/free-project-pausing). Untested: exact net savings, add-on removal, credit effects and effective invoice date.

**D5 — later bounded trial/cutover/retirement authorization.** Keep the hold now. After D1–D4 and candidate review, return the exact project, candidate, identities, permitted operations, rollback/export receipt, traffic/schedule boundary and stop conditions for separate approval. No generic approval of an unspecified trial is requested today.

## Review and storage disposition

Coherent independent-review boundary **not reached**. No new independent review has been commissioned. F1/F3/F6 isolated implementations and completed CC evidence are preserved; live runtime/Auth/caller closure, complete migration/recovery and operational parity remain open. No claim of SAFE TO RETIRE or production readiness.

All additions are remote GitHub code and sanitized metadata/evidence. No repository clone, project-file download, local file write, article capture, live database write, worker invocation or schedule change was performed. This work creates no protected-data export or restore copy. PRs #149–#153 remain unmerged.

## Supplemental configuration observation

Migration-version inventories contain 66 entries in Manus, 36 in survivor, 77 in original and five in spatial sandbox. Ordered version digests are in the supplemental evidence; neither migration names nor counts prove SQL/behavior equivalence. Branch listings found no separate preview project: the original's default main record points back to the same project.

The current spatial function catalog again has 17 functions on each side: 16 exact definition digests match; `append_release_decision` differs. Its release semantics remain an explicit blocker, separate from the 45-row archive match.

The repository's `src/lib/supabaseOrigin.js` and Pages workflow reference the survivor. `src/lib/supabase.js` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are configuration references, not proof of deployed environment values or caller closure. Secret values were not inventoried.

[Supplemental metadata](../verifier/backend-consolidation-2026-09-13/configuration-observations.json).

## Hosted verification

Tested engineering commit: `8403f9a5a644dfb0dcecad115de0d9971b3aac69`. [Sanitized verification](../verifier/backend-consolidation-2026-09-13/verification.json).

- [Golden run 34774946441](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34774946441): 1,675/1,675 on Node 22 and Node 24; both builds passed. Includes 12 new collector/closed-batch regressions.
- [Integrated run 34774946449](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34774946449): 53/53. Closed batch emitted MIP_PERMISSION_BATCH_NOT_ACTIVATED; no material retrieval.
- [Native run 34774946407](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34774946407): original 14, corrected authority seven, interfaces six; baseline seven discovered with four intentional skips and three preserved counterexamples.
- [Extension run 34774946412](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34774946412): eight passed.

The following evidence checkpoint changes documentation/JSON evidence only; executable files, test inputs, closed activation and all frozen manifests remain at the tested engineering tree. These are implementation-authored regressions, not independent review or live verification.
