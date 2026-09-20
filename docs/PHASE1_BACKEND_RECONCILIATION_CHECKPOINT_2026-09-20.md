# MIP version 2 Phase 1 backend-reconciliation checkpoint

Date: 2026-09-20

Status: **owner review gate; Phase 2 live production work paused**

This is a durable reconstruction of the Phase 1 checkpoint from evidence that
was captured before the live changes listed below. The additional checkpoint
acceptance requirement arrived after bounded Phase 2 work had begun, so this
document does not pretend to have existed earlier. It separates the pre-change
facts from later results and preserves the decision basis.

The two supplied ZIP archives were read and verified before inventory or
implementation. Their SHA-256 values are recorded in the main reconciliation
report. The former September 22 isolated demo is frozen historical work only;
it is not a behavioral, architectural, algorithmic, presentation, or acceptance
reference. The current live MIP platform and governing requirements are the
canonical product reference for the scheduled consultation.

The frozen demo commit is not an ancestor of this consolidation branch. A
changed-path audit found no adopted demo implementation: the sole overlapping
path is `vercel.json`, whose consolidation version independently disables
deployment of this branch and contains no demo route, contract, corpus, or
presentation behavior.

## Parent reconciliation of specialist evidence

The parent reviewed and reconciled three independent evidence streams rather
than accepting any specialist conclusion as authoritative:

- The mechanical backend inventory established four healthy projects, their
  schemas, row counts, Auth/storage/Edge state, jobs, migration histories, and
  data deltas. The parent rejected name-based conclusions such as treating a
  project called `sandbox` as disposable.
- The caller trace established qik as the deployed browser and investigation
  target, but also found yhb scheduler and cross-project import dependencies.
  The parent distinguished active callers from documentation, fixtures, and
  historical project-ref strings.
- The security/recovery review found real authorization defects and incomplete
  recovery. The parent separately tested exploitability: jfn's RLS-disabled
  tables were owner-only rather than demonstrated browser-readable, while qik
  owner-authority views and the spatial self-profile path were actionable.

The reconciled conclusion was—and remains—that qik is the production-intent
destination, but current authority is split and no predecessor is
retirement-ready. The project name `mip-v2-manus-sandbox-20260818` is historical
provenance only. Its two active workers are Supabase cron jobs invoking Edge
Functions; no active Manus agent dependency was found.

## Verified pre-change backend inventory

All projects were `ACTIVE_HEALTHY` in organization `ntmqymyaujspymfqmxew` on
an organization-level Pro plan. Per-project billing, compute size, backup/PITR
retention, and recovery authority were not exposed.

| Project | Name | Region / PostgreSQL | Tables / views / rows | Auth | Edge / migrations | Jobs / storage |
|---|---|---|---:|---:|---:|---|
| `qikvmopbtijoebdqosyq` | `mip-v2-account-verification-20260831` | `us-west-1` / `17.6.1.166` | 95 / 9 / 16,506 | 2 | 8 / 36 | no cron; no buckets |
| `yhbwnrtlqbjtcrrlpbge` | `mip-v2-manus-sandbox-20260818` | `us-west-1` / `17.6.1.155` | 97 / 12 / 177,478 | 0 | 6 / 66 | two active five-minute crons; no buckets |
| `jfnzyvzthzqtczlxhjll` | `mip-spatial-verification-sandbox-20260829` | `us-west-1` / `17.6.1.166` | 28 / 0 / 46 | 0 | 0 / 5 | no cron; no buckets |
| `niejaejtbxgakyrsntxm` | `jkelsen13-tech's Project` | `us-west-2` / `17.6.1.104` | 92 / 3 / 14,103 | 3 | 6 / 77 | inactive cron definitions; one empty public bucket |

## Canonical authority map and proposed disposition

| Capability | Pre-change owner | Decision | Evidence or unresolved delta |
|---|---|---|---|
| Auth/profile/investigation | qik | **EXTEND** | Canonical UI and private workspace; preserve identities and memberships |
| Captures/evidence/reconsideration | qik | **EXTEND** | Content identities, captures, candidates, changes and assessments already form the strongest foundation |
| Retained corpus/ingestion/comparison | yhb operational; qik intended | **RECONCILE into qik** | yhb owns 34,277 articles and both active jobs; qik had no schedule |
| Claims/entities/relationships/events/arcs | yhb operational; qik projection | **RECONCILE into qik** | Stable identity, review, provenance, temporal and release mappings unresolved |
| Spatial / World View | qik intended; jfn verification history | **RECONCILE into qik** | jfn's 46 rows are not redundant; qik runtime authorization needed repair |
| Legacy content/Auth | nie | **RECONCILE into qik** | 14,103 rows, three Auth users, six functions and config/history remain unique |
| Provider-neutral semantic decisions | qik assessment foundation only | **EXTEND qik** | No complete System-One contract or provider-specific canonical store proven |
| Markets | none proven | **UNKNOWN** | **NEW** only after a requirements/authority decision |
| Public projection | qik intended, legacy mutation paths elsewhere | **RECONCILE around qik** | Caller parity and negative authorization tests required |
| Recovery | no project has a proved restore | **RECONCILE** | Snapshots/counts are not a recovery rehearsal |

## Caller matrix

| Caller | Project | Operation / identity | R/W | Necessity | Target / cutover proof |
|---|---|---|---|---|---|
| Public browser and GitHub Pages | qik | publishable/anon projection reads | R | required | qik; read parity plus forbidden-write tests |
| Account UI | qik | user JWT Auth/profile | R/W own | required | qik; login/session/profile tests |
| Investigation UI and Edge handlers | qik | user JWT followed by service RPC | R/W gated | required | qik; member/reviewer/revoked/non-member matrix |
| `spatial-runtime` | qik | user JWT plus shared DB writer | W | required foundation | qik; operation-bound capabilities and ambient-authority closure |
| `capture-retrieval` | qik | configured service credential | R/W jobs | required | qik; lease/generation/idempotency tests |
| `mip-ingest-rss-hourly` cron | yhb | Vault-backed token to `ingest-rss` | W | active | qik successor; shadow/output/watermark parity before cutover |
| `mip-source-comparison-enrichment` cron | yhb | Vault-backed token to comparison worker | R/W | active | qik successor; generation/hash parity and rollback window |
| `import-original-source` | reads nie, writes yhb | function credential; gateway JWT disabled | R/W | unresolved legacy dependency | source-qualified canonical import and zero-caller observation |
| Legacy yhb/nie Edge/RPC paths | local project | mixed service/writer credentials | R/W | unresolved per function | caller-by-caller migration and negative tests |
| Vercel production | qik | publishable environment configuration | R | active | qik; environment/ref and public contract verification |
| Former isolated demo preview | historical artifact only | none in this run | none | not required | preserve remotely; no reconciliation or acceptance role |

## Unique-data findings

- qik uniquely held the private evidence and investigation foundation: 95
  captures, 95 identities, 96 candidates, 195 changes, 390 change jobs, 100
  record versions, 9,537 retained collector versions, and 45 retained spatial
  versions.
- yhb uniquely held the active corpus and processing state: 34,277 articles,
  45,399 article/entity links, 13,463 entities, 13,008 events, 13,586
  event/article links, comparison/timeline/arc state, and active checkpoints.
- jfn held unique spatial history: assertion revisions, policies, release
  decisions, lineage, and authority records.
- nie held 752 articles, 1,892 explanations, three Auth users, historical
  lineage/config, six Edge Functions, and a public bucket definition.
- Migration histories differed materially. Matching table names and empty
  storage-object counts did not establish semantic equivalence.

## RLS, authorization, and ambient authority

- **Actionable:** seven qik owner-authority projection views exposed browser
  write grants. The safe candidate was to revoke writes while preserving reads.
- **Actionable:** qik `spatial-runtime` accepted a self-maintained profile flag
  before exercising a shared writer role. The safe candidate was a separate,
  default-deny, operation-bound capability ledger.
- **Not demonstrated as directly exploitable:** five jfn public tables had RLS
  disabled but ACLs were postgres-owner-only. Defense-in-depth RLS was still
  appropriate, with no new browser grants.
- **Actionable:** selected legacy SECURITY DEFINER functions allowed browser
  EXECUTE without sufficient caller checks. The safe candidate was to preserve
  service compatibility while revoking browser execution.
- **Unresolved:** hosted Edge code can retain broad project credentials or a
  shared direct database writer. Gateway JWT checks are not proof of
  least-privilege effective authority.
- **Platform gate:** `supabase_admin` public default privileges could not be
  changed by the connected migration principal.

## Proposed predecessor dispositions at Phase 1

| Project | Disposition | Reason |
|---|---|---|
| qik | **KEEP; NOT CONSOLIDATION-COMPLETE** | Canonical foundations exist, but corpus/jobs and security/recovery gaps remain |
| yhb | **CONSOLIDATE; NOT RETIRE-READY** | Active jobs, unique large corpus, functions, Vault references and no restore proof |
| jfn | **CONSOLIDATE; NOT RETIRE-READY** | Unique spatial history and no full restore proof |
| nie | **CONSOLIDATE; NOT RETIRE-READY** | Unique Auth/data/history/functions and no caller/recovery closure |

## Unresolved ambiguities at the gate

1. Whether every yhb/nie job, webhook, direct database client, and external
   integration has been observed.
2. Identity/conflict rules for corpus, entity, relationship, event, timeline,
   arc, review, Auth, and publication histories.
3. Complete System-One contract ownership and cross-user reuse safety.
4. Canonical representations for all absence and knowledge-change causes.
5. Secret/config equivalence without disclosing or rotating credentials.
6. Full Edge effective authority below application-level checks.
7. Backup/PITR entitlement, recovery owner, RPO/RTO, and isolated restore.
8. Per-project billing impact and the exact paid redundancy claim.
9. Qualified full test environment and the 25 frozen-head failures.

## Planned reversible actions

The Phase 1 plan allowed only additive or permission-reducing work with explicit
receipts and rollback paths:

1. Revoke unintended browser writes/EXECUTE while preserving required reads and
   service callers; verify negative authorization.
2. Add a default-deny spatial capability gate without deleting profiles or
   changing publication state.
3. Append source-qualified predecessor history to private canonical archives;
   verify counts and ordered hashes without overwriting domain rows.
4. Add private canonical operational contracts and a receipt-only collector
   shadow; do not schedule it or write canonical articles/analysis.
5. Retain exact deployed worker sources and package hashes for recovery.
6. Prepare, but do not execute, corpus/identity migration, scheduler cutover,
   secret rotation, project pause/delete, destructive DDL, billing changes, or
   main-branch merge.

## Work performed after the reconstructed checkpoint

Before the new acceptance gate arrived, the bounded live changes above were
performed and verified: qik projection grants and spatial authorization were
hardened; jfn RLS was enabled; unsafe legacy browser function execution was
revoked; yhb histories and worker packages were retained; private qik
operational/shadow contracts were added; and seven receipt-only source probes
succeeded. No predecessor scheduler was stopped, no domain record was copied or
overwritten by the shadow, and no project was retired.

The new rule says a Phase 1 production mutation finding requires owner review.
Accordingly, further live production work is paused. Isolated branch documents,
tests, migration candidates, and review packaging may continue.

## Phase 1 decision

Phase 2 cannot autonomously advance to scheduler or corpus reconciliation:
production mutation is required, active authority remains split, recovery is
not proven, and residual authorization ambiguity remains. Owner review is
required before any further live action. No destructive action is proposed or
authorized by this checkpoint.

An index-only follow-up for `ingestion_source_runs.run_id` was prepared after
this gate to satisfy the foreign-key access pattern. It is explicitly marked
unapplied and does not change the checkpoint decision.

## Parent reconciliation of the algorithm-shadow reviews

The parent reconciled three later specialist traces against the repository and
retained live packages rather than adopting any conclusion automatically:

- The mechanical worker inventory correctly identified pure parser/extractor
  seams in retained yhb `ingest-rss` v8 and destructive/domain-mutating paths
  in `source-comparison-run` v15. Direct inspection confirmed both findings.
- The pipeline trace correctly identified qik's existing intake, retrieval,
  assessment, graph-staging, and publication foundations, but also confirmed
  that qik has no active scheduler or proven live extractor. Those foundations
  are therefore canonical extension points, not evidence of operability.
- The High security/recovery review correctly rejected the existing
  `collector-shadow` service-role credential as an effective least-privilege
  boundary and rejected fresh-feed fetching for the algorithm worker. The
  existing function remains evidence of transport reachability only.

The resulting isolated candidate uses database-admitted staged text, has no
network/provider/database/environment path, preserves typed coverage, malformed
input, URL-taint, and absence meanings, and calls only abstract dedicated
claim/complete/fail capabilities. Its digest fields prove internal consistency,
not source-registry provenance or rights clearance; the future host must
authenticate those revisions. It independently reuses the existing
generation-fenced Source Comparison candidate rather than creating another
comparison store.

A later parent-reconciled qualification contract now supplies isolated SQL
design evidence for that missing capability boundary. It uses separate
NOLOGIN storage/worker-function/authority owners, dedicated direct database
logins, forced RLS, three runtime RPCs, immutable admitted source/capture/rights/
implementation/config revisions, global request-ID replay, an authorization
fence, hashed database lease tokens, and an explicit recovery-only expired
lease requeue that always produces a new token on the next claim. Five PGlite
contract tests and the twelve existing candidate tests pass. A subsequent
native PostgreSQL 17.6 workflow run (`35530600346`) also passes all 25 bounded
direct-login concurrency/security tests. The review also
identified and closed two design defects during qualification: row-locking
required broader table privileges than intended, so the contract uses
transaction-scoped advisory authorization/request locks; and session secrets
were removed from request identity so a fresh currently-authorized session can
replay a committed request without weakening principal/runtime/argument
binding.

The final High security reread found additional commit-blocking defects before
delivery. The reconciled contract now rejects non-`READ COMMITTED` entrypoints
to prevent stale-snapshot revocation bypass, rechecks expiring session/runtime
authority after blocking locks, supplies one-way rights/session/runtime/source/
implementation/config revocation paths, validates the full admitted output
binding and nested promotion flags, reuses exact immutable authority revisions,
and rejects unsafe role attributes/memberships at setup. It also fixed a
PL/pgSQL `FOUND`-state clobber that could have turned an empty claim into a
null-bound lease path. Regression coverage now includes an empty queue after
completion, altered provenance, unauthorized promotion, repeatable-read
rejection, session revocation, and shared implementation reuse. The native
suite then exercised the two-connection timing cases, `SKIP LOCKED`, atomic
terminal races, rights-revocation ordering, blocked session-expiry rechecks,
requeue/token fencing, bounded recovery exhaustion, deterministic backend
termination around commit, and graceful-restart persistence. This closes the
bounded native-core rehearsal gap only. The expanded matrix adds source,
session, runtime, implementation, and configuration authority-first rollback/
commit plus worker-first replay ordering; a new effective-default probe proves
future owner-created functions do not inherit PUBLIC execution merely because
`pg_default_acl` rows are absent.

This is still not deployed. Fixture approval is not production provenance or
rights authority; the native suite is not proof of Supabase authenticator/pooler
identity; the target database's complete inherited `PUBLIC`/security-definer
call graph is not audited; the full source/session/runtime/implementation/
configuration revocation matrix has not been rehearsed; runtime credentials,
an isolated host, and real remote-journal controls do not exist. A bounded
same-cluster logical dump/restore now proves the synthetic collector contract's
catalog, owners/ACLs/RLS, functions/policies, sequences, private histories and
post-restore behavior, but it pre-creates global roles and does not prove a
fresh cluster, a predecessor restore, Supabase Auth/Storage/Edge/Cron, PITR, or
crash recovery. Those remain the security/recovery gate. This work
advances reversible preparation without changing the Phase 1 stop decision or
either failure verdict.
