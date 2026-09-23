# J1 · Jfn preservation and retirement-versus-reuse decision

## 1. What happened and why it matters

**Recommend Option A: preserve the actual responsibilities, close their callers, then retire jfn. Do not repurpose it as staging by default.** J1 implemented and passed a bounded native recovery qualification. It did not move live data, establish full project recovery, or authorize retirement.

Fresh deterministic comparison found all **45 scoped rows in 21 relations** already exactly represented in qik's private `mip_private.spatial_row_versions` archive: 39 spatial rows and six parent rows. Matching ordered full-JSONB hashes, not just IDs or counts, establish this observed duplication. No archive payload was downloaded. This corrects an interpretation that absent rows in qik's live tables must be unpreserved. Archive preservation remains different from runtime replacement.

Current owner J1 instructions govern, with the adopted post-consultation workflow v3, consolidation handoff v3 and this ten-part Section Architecture Report structure. No superseded scope, final Max audit, new goal or additional service was introduced. C1/C2 and completed containment/restore evidence remain intact.

**Observed identities:** branch `codex/mip-backend-consolidation-20260920`; starting C2 head `79faf7fc9f462164bb00700cbd92fee23250ba82`, tree `daf6e5ce84737291ed3919854cf89dce39fd52c1`. Relevant main `1dc317200b7a928fad85d06b43351b60e2a50d92` and PR175 integration `4d69243cd2de91d7588e4eb263cc05b48e8fd0ef` were inspected only for reusable retention/caller foundations. PR177 remains draft/unmerged.

The catalog snapshot is timestamped **2026-09-23T06:15:26.065685Z**. Related bounded hash/caller reads occurred during J1; exact individual completion timestamps were not retained, so no continuous observation window is claimed. CI ran **06:40:45–06:41:18 UTC**. Sensitive hashes, catalog/configuration metadata and account-specific billing observations are retained in the [private observation receipt](https://github.com/jkelsen13-tech/mip-production-qualification/blob/ac4106148623bdd5e69b84492accd355c65b14ca/evidence/jfn-retirement/2026-09-23-scoped-observation.json); this report contains sanitized conclusions.

## 2. Architecture before the section

Jfn is the existing spatial verification project, with public parents, an append-oriented spatial history model, a dedicated direct-wire writer identity and Gate A release behavior. Qik is the intended canonical destination and already owns a source-qualified private historical archive. The September 9 retention migrations preserve payloads independently of native production tables.

The relevant code had a generic isolated restore/comparator foundation and identity reconciliation, but no executable path proving this retained spatial dependency graph could be restored with its native constraints and selected effective authority. Historical absence from qik native tables and small jfn counts were insufficient retirement evidence.

### Scoped responsibility and disposition matrix

Classes: **A** required real domain state/history; **B** required runtime/caller; **C** qualification fixtures/history; **D** reproducible code/configuration; **E** demonstrated duplicate state; **F** unresolved disposition. A family can have more than one class. “E” below means exact duplication in the private archive, not permission to discard or merge it.

| Responsibility / relation | Current count | Classification and evidence | Proposed destination / disposition |
|---|---:|---|---|
| public.articles | 1 | C/E; historical qualification context, pending_review, reserved .invalid URL; no body/summary; exact archive match | Keep source-qualified private history; no News publication or native article promotion |
| public.nodes | 1 | C/E; retained parent and exact match | Same archive; preserve node identity/authority links |
| public.geographic_places | 1 | C/E; retained spatial parent | Same archive; exact coordinate/precision meaning retained |
| public.policy_documents | 1 | E/F; exact match, but reserved-URL criterion does not establish synthetic provenance | Preserve privately as predecessor history; do not assert real/synthetic provenance or promote |
| public.sources | 1 | C/E; reserved .invalid URL and typed source ancestry | Same archive; preserve source-to-node identity |
| public.source_change_events | 1 | C/E; exact retained ancestry/event payload | Same archive; retain original event/history meaning |
| spatial.assertions | 1 | C/E; qualification history, exact match | Same archive; do not manufacture a production assertion |
| spatial.assertion_revisions | 8 | C/E | Preserve all revisions and ordinals, native time, uncertainty and location roles |
| spatial.revision_lineage | 3 | C/E | Preserve historical relationship endpoints and types |
| spatial.graph_node_authority_snapshots | 1 | C/E | Preserve the historical authority snapshot, not today's node substituted into it |
| spatial.place_authority_snapshots | 2 | C/E | Preserve version-specific place authority/precision |
| spatial.geometry_snapshots | 1 | C/E | Preserve exact geometry and source/precision interpretation |
| spatial.policy_artifacts | 9 | C/E with underlying policy meaning retained | Preserve versions, families, content and predecessor links |
| spatial.audience_scopes | 2 | C/E | Preserve version/capability and supersession semantics |
| spatial.evidence_artifact_registry | 3 | C/E | Preserve article/policy/source distinctions and source-qualified parents |
| spatial.evidence_snapshots | 1 | C/E; payload provenance remains historical | Preserve reference/hash/offset/version and retention/access meaning |
| spatial.evidence_condition_events | 1 | C/E | Preserve observation and source-change dependency |
| spatial.revision_evidence | 1 | C/E | Preserve evidence role and revision linkage |
| spatial.review_decisions | 1 | C/E | Preserve original review/support disposition |
| spatial.release_decisions | 4 | C/E | Preserve release chains/dispositions, never recalculate them as permission |
| spatial.break_glass_audit | 1 | C/E | Preserve original historical authorization/audit record |
| public.pipeline_config | 1 | D; account_ui migration and value hash observed | Preserve configuration provenance in private receipt/reproducible migration; no live qik setting change |
| public.arc_membership_candidates, authors, outlets, policies, story_arcs | 0 each | D; current structural parents, no rows to migrate | Preserve required definitions for recovery; no invented data |
| public.mip_profiles | 0 | D/F for managed Auth behavior | Keep migration/code; full Auth configuration recovery still needs evidence |
| All 28 public/spatial tables | 28 definitions | D; RLS enabled on every table, constraints/indexes/triggers/grants inspected | Selected native definitions captured for isolated recovery; never replay historical broad grants blindly |
| Spatial functions and writer | 17 functions; one custom LOGIN writer | D/B/F; exact native bodies, owners/search_path/grants captured; direct-wire operator closure unconfirmed | Preserve native behavior for recovery; no assumed qik replacement or new credential |
| Application views | 0 | D; catalog observation | No view migration obligation identified |
| Auth users/sessions; Storage buckets/objects; Vault secrets | 0 observed each | No row/object transfer identified; managed configuration is separate | Do not export Auth records or credentials; retain redacted configuration when accessible |
| Edge functions / development branches / cron | 0 / 0 / absent | No observed hosted function, branch or cron responsibility | No activation or scheduler migration required by this observation |
| Subscriptions, foreign servers, publication tables | 0 observed | No observed external DB replication dependency | Recheck only if retirement window drift warrants it |
| Migration history | 6 recorded migrations | D; names/versions retained privately | Preserve migration identity, current definitions and completed RLS hardening |
| Frontend / worker / operator callers | See map below | B/F; no current app jfn caller found, external consumers not fully closed | Obtain exact operator/integration closure, not an indefinite “no recent traffic” claim |
| Managed backups, integration configuration and independent custody | Not fully established | F; browser tool failed before those pages were completed | Complete bounded metadata checks; no backup/artifact retrieval occurred |

No unique required production-domain state was demonstrated beyond the already matched history; this is not a declaration that every payload is synthetic. Existing provider labels, matching UUIDs or a sandbox name cannot establish provenance. Keep unresolved material private and preserve its original meaning.

### Caller and recovery-dependency map

| Owner / interface | Evidence and proposed treatment |
|---|---|
| spatial_writer_runtime | Actual jfn LOGIN role, neither superuser nor BYPASSRLS. Native functions bind to session_user. Closing its external operator/credential consumers requires explicit evidence from the responsible owner; no credential value was read |
| spatial_owner | NOLOGIN definer owner. Preserve selected function ownership/ACLs; not a hosted worker login |
| src/lib/spatialBackend.js and projection consumers | Current code uses qik; synthetic browser tests intercept the interface. No jfn application caller identified in the inspected main/integration/consolidation code |
| spatial-runtime-v6 snapshot / spatial-runtime-capability candidate | Existing source snapshot is qik, not a deployed jfn function; incomplete bundle/lock/config cannot stand in for a recoverable jfn deployment |
| C2 native intake worker | Unchanged. Qik service_role is NOLOGIN and requires a legitimate login/delegation and transaction-preserving transport; jfn's spatial LOGIN role is not interchangeable |
| collector-shadow and legacy ingestion | Receipt-only / existing contracts unchanged; no new writer or cutover |
| PostgreSQL activity / statement statistics | Bounded observation showed platform activity and a small spatial-query subset; reset/coverage window was not established. Absence of a visible current writer does not prove permanent non-use |
| Existing backup and restore/comparator foundations | Reused only for their proven portable/catalog scope; old retained-material artifact was not retrieved or requalified |

## 3. What changed, and what remained unchanged

Five new files under `verifier/jfn-retirement/` implement the minimal isolated preservation/recovery path:

- `preservation.py`: verifies the fixed source-project/relation manifest and dependency closure, then restores only to the explicitly named socket-only isolated database. It accepts injected connections, not credentials or a production CLI.
- `native_structure.sql`: reconstructs the relevant native public/spatial structure, full spatial function bodies, constraints, historical mutation triggers, RLS/policies and selected effective authority.
- `native_facts.json`: sanitized captured structural facts and exact function fingerprints.
- `synthetic_rows.sql`: 25 original synthetic rows exercising all 21 retained relations, multiple revisions, lineage, typed sources, high-precision JSON/numerics and release predecessors.
- `recovery_qualification.py`: verifies archive/recovery, native behavior and refusal cases against those definitions.

The adapter retains raw PostgreSQL JSONB text and uses native `jsonb_populate_record`; it does not round-trip payload numbers through JavaScript/Python JSON values. A repeatable-read archive snapshot validates counts/hashes and closure. The target transaction locks the retained tables, checks the selected catalog/authority signature, inserts in dependency order and verifies rows and signature again before commit. An identical target is a verified no-op; a partial or divergent target is rejected. Unknown fields, even null, fail closed.

Live jfn/qik state, publication rules, C1/C2 code, browser/build warnings, all previous test receipts and containment remain unchanged. No production grant, role, secret, project or setting changed.

Browser dispatch became unavailable. A reviewed temporary push lane allowed exactly one execution, guarded by exact branch, exact commit message, run_attempt=1 and predecessor setup commit. All other PR/push jobs on this branch were guarded before runner allocation. The 20 workflow files were restored byte-for-byte to their baseline blobs after the test; only verifier files/evidence remain as the final delta. Pages/Cloud Run deployment triggers and Vercel's branch exclusion remained intact.

## 4. Why this approach was selected

**EXTEND/RECONCILE** is appropriate: the September 9 history/parent/source-ancestor migrations already provide the canonical private retention owner. Creating another production schema, copying fixture records into native qik tables, or inventing a staging project would add responsibilities without eliminating jfn's actual obligations.

The existing generic restore skeleton did not reproduce these 17 spatial functions and native history graph. The new isolated adapter supplies that missing recovery proof while preserving the archive contract. It refuses broader use rather than silently ignoring extra fields or assuming permissive parents.

Jfn and qik release behavior differ: jfn's Gate A rejects released/restricted decisions. Matching function/table names do not justify overwriting canonical behavior. No automatic native spatial merge is proposed.

## 5. Architecture after the section

Live topology is unchanged. The preservation path is now explicit:

`jfn current native history → existing qik private source-qualified archive → verified manifest/dependency closure → bounded isolated native recovery`.

Only the final synthetic arrow was executed in J1; the first retention transfer predates J1. The fresh comparison used hashes only. Exact IDs, historical assessments, evidence roles, temporal/precision meaning and original release state remain preserved in the archive; no reader-facing claim was created.

The new helper is an isolated operator procedure, not an activated ingestion worker. It requires the named disposable target, Unix socket, idle/autocommit connection, explicit isolation token and expected selected-catalog signature. It provides no hosted identity, credential custody or production installation authority.

## 6. What verification demonstrated

[Run 35827875791 / job 107073526435](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/35827875791/job/107073526435) executed commit `8dbb28b07ff8156b35b62d7597dd42360cde03ea`, tree `950c7dcafcd1274f389ef8d046fabe2287749318`. Exit 0, **nine distinct case groups PASS**, 25 synthetic rows, 21 relations, 17 exact native function definitions. Cleanup log repetition is not another execution.

| Case group | Demonstrated result |
|---|---|
| Native definition identity and constraints | Captured function fingerprints match installed native definitions |
| Source-qualified archive exactness, replay and closure | Existing retention migrations accept exact rows and duplicate replay is idempotent |
| Target identity, manifest and role drift refusal | Wrong target/manifest and changed role authority are refused |
| Missing dependency refusal | Missing source-node dependency is rejected with the expected diagnostic |
| Unknown nullable field refusal | Extra embedding:null is rejected; no partial target state remains |
| Interrupted restore / atomic recovery | Injected mid-restore failure rolls back all inserted target rows; clean retry succeeds |
| Exact identity, precision, temporal lineage and no-op | Restored synthetic row hashes equal source; precision, versions/roles, lineage and release predecessor chain remain exact; replay is no-op |
| Restored authority / private denials / direct-wire identity | Browser roles cannot read selected private relations; allowed node read works; history mutation and archive truncate denied; SET ROLE cannot impersonate session_user; separate isolated runtime login append succeeds |
| Divergent target refusal | Non-identical populated target is rejected |

Native PostgreSQL17.6, pinned image `00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`; existing pinned Python utility image/dependencies. Command: `python -I -B /workspace/verifier/jfn-retirement/recovery_qualification.py`. Runtime network=none, no published ports, no production credentials; PG512MiB, Python256MiB, 15-minute job cap. The Python runtime is unprivileged/read-only with dropped capabilities. Peak memory was not measured. Containers and socket volume removal/absence checks passed: **J1_DISPOSABLE_CLEANUP_PASS**.

The other 18 exact-head PR workflow runs skipped; Golden's ordinary test job had no runner. Only one J1 job consumed resources. Pip root-install/upgrade notices during disposable dependency preparation were retained, not suppressed. C1 browser node:crypto/import/chunk warnings remain attached to its existing build; J1 adds no browser/build proof.

### Verification limits

| Omission or boundary | Consequence |
|---|---|
| Actual 45-row archive recovery | Not executed. Live hash equality and synthetic recovery are separate evidence |
| Nullable vector(384), extension vector0.8.2 | Current article embedding is null, but actual payload includes the field. This fixture intentionally omits it and the helper rejects unknown fields; the current fixture is **not** a full real-row restore target. A complete native vector-capable target must be qualified before real recovery |
| Auth/profile and managed configuration | Empty row counts do not reconstruct Auth settings, integrations, secrets or backup service behavior |
| Selected catalog signature | Covers selected tables/columns/ACLs/constraints/indexes/triggers/RLS/functions, selected roles/direct memberships and schemas; not every cluster object or transitive authority relationship |
| Single-operator isolation | Does not protect against privileged concurrent role/function DDL on a live project |
| Semantic append admission | Seeded historical policies/fingerprints are synthetic; passing native storage constraints does not prove every seeded row passed every append-policy semantic validator |
| Hosted identity and transport | Local runtime login is a real separate PostgreSQL session in the disposable container, but socket trust does not prove a hosted password/JWT/delegation or pooler route |
| Public authority | Selected private denials pass. Existing pipeline_config has broad privileges including TRUNCATE; RLS does not govern TRUNCATE. No blanket browser-write-denial or new containment repair is claimed |
| Hosted services | Auth/JWT, PostgREST, Edge, pooler/scheduler/Storage/Realtime not qualified; no hosted equivalence claim |

Fresh non-implementing High review inspected code, meaningful corrections, native authority boundaries, the exact fallback workflow diff and terminal job evidence. It accepted the demonstrated scope without replay and found no remaining must-fix within that scope. The parent accepts that conclusion with all listed limitations.

## 7. Meaning for the larger architecture and reader

Jfn retirement need not wait for every future MIP feature or a complete live ingestion pipeline if its actual obligations are preserved and its callers closed. Conversely, a portable PASS cannot erase an unresolved operator, managed configuration or recovery dependency.

Keeping qualification/history out of canonical production tables protects News eligibility and the distinct Graph, Timeline, Arcs, Source Comparison, World View and Investigation Context meanings. The news-first canonical contract and C1/C2 native intake work remain reusable, unchanged and independently scoped.

| Consolidation verdict | Result |
|---|---|
| AUTHORITY CONSOLIDATED | NOT ESTABLISHED campaign-wide; J1 gives scoped preservation/authority evidence only |
| PIPELINE VALIDATED IN ISOLATION | NOT ESTABLISHED for the full pipeline; C1, C2 and J1 bounded PASS receipts remain separate |
| PIPELINE OPERATIONAL ON THE AUTHORIZED LIVE BACKEND | NOT ESTABLISHED; no live deployment, invocation or cutover |

## 8. What later sections can reuse

Reuse the reviewed helper, exact native definitions, synthetic fixtures, archive/hash comparator, failure diagnostics and private manifest. The tested helper's hardcoded isolated target is intentional; do not remove that guard for a live migration.

### Dependency-ordered preservation, recovery and disposition path

1. Approve the unresolved historical-only disposition of the 45 matched rows; keep their source project/relation/key and raw versioned payloads in the existing private archive. No transfer is needed merely to duplicate their current custody.
2. Close the exact external dependency gap: identify the owner of spatial_writer_runtime and any direct database/integration credential consumers, obtain no-required-caller or explicit replacement evidence, and retain a redacted closure receipt. Current code/traffic observations alone cannot close this.
3. Complete the bounded managed configuration/backup metadata record when browser access works: available backups and retention, integration names/purpose, redacted Auth/API/pooler settings and restoration dependencies. Do not retrieve retained artifacts or credentials.
4. Qualify the complete native restore substrate, including vector0.8.2/embedding, full selected effective authority and required empty Auth/profile definitions. Do not strip fields or replay historical broad grants to make it pass.
5. If actual row recovery or new independent custody is required, obtain a separate data-specific authorization. Exact candidate allowlist: only the 21 relations/45 source-qualified versions in the private receipt, with reverified counts/hashes and dependency closure; destination must be an existing access-checked private location or approved disposable native target. Exclude Auth records, credentials, unrelated qik state, publisher bodies and the old retained-material artifact. Permission/privacy basis, retention/end-of-custody disposition, raw JSONB integrity, post-write readback, backup ownership and rollback/cleanup must be fixed before transfer. No such transfer occurred or is authorized here.
6. After preservation/recovery and caller gates close, reverify only relevant drift, freeze an exact jfn deletion packet and cost consequences, and obtain separate explicit irreversible-action authorization. No qik runtime installation is required unless a real active jfn responsibility is demonstrated.
7. Execute retirement only under that later authorization; verify project removal and cessation of future compute accrual through the account surface. Do not claim a refund of historical usage.

A failed isolated restore leaves no committed partial target; retain sanitized error, correct the definition/manifest discrepancy and retry only within an available authorized execution. An already identical target is a verified no-op. A populated conflicting target is not automatically overwritten. A future full recovery procedure must preserve source-qualified provenance and historical authority while separately reviewing any grants that would broaden access.

## 9. Remaining risks, costs and owner decisions

The account-specific cycle, upcoming invoice date and accrued amounts are recorded only in the private observation receipt. The observed invoice date differs from the owner's October 3 operational target. The dashboard showed Pro, enabled spend cap and Micro compute; IPv4/PITR/custom-domain add-ons were disabled. Accrued compute continues to change while jfn runs. A credit balance amount was not displayed.

[Supabase compute pricing](https://supabase.com/docs/guides/platform/manage-your-usage/compute) lists Micro at **$0.01344/hour**, billed in arrears with partial-hour rounding. That is about $0.32256/day. The private receipt reconciles the organization credit against observed other-project usage. Thus removing jfn would avoid its future compute hours under the observed configuration; the Pro subscription remains. No independent jfn-specific future-use forecast, refund or final invoice total is claimed. Storage is currently empty; other managed retention/export costs remain subject to the actual disposition and service terms.

[Paid projects cannot pause](https://supabase.com/docs/guides/platform/free-project-pausing); the current UI pause control was disabled. [Deletion stops future charges and removes project data/backups/configuration](https://supabase.com/docs/guides/platform/delete-project), not already incurred charges. No deletion happened.

| Option | Earliest safe reduction and cost | Required work / decision |
|---|---|---|
| A: preserve, close callers, retire | Immediately after the named gates and explicit deletion authorization; target before Oct3 if evidence permits, not guaranteed | Existing exact archive reduces transfer work. Finish disposition, caller/configuration and independent recovery evidence |
| B: temporary jfn C3 reuse, then retire | Later by the reuse duration; 48 extra Micro hours about $0.65, with no guarantee of faster readiness | All A preservation/caller gates first, plus project-wide isolation and explicit repurposing authorization. Not recommended on current evidence |

If Option B is chosen later, limit it to **at most 48 hours** with proposed final retirement **no later than October 3, 2026**, subject to completed preservation and separate deletion approval. Do not start a reuse window that cannot close by that date. Named tests only: hosted candidate installation/order/privilege checks; legitimate worker login/delegation; transaction-preserving direct/session-pooler behavior with rollback/retry; Auth/JWT/PostgREST reader/private denials; cleanup/restoration readback. Match qik's relevant hosted dependencies before dispatch. Jfn PG17.6.1.166 matches the observed qik PG baseline, but that alone does not establish extension/role/API parity. Jfn Auth2.197.0/PostgREST14.5 were observed, not treated as a full qik-hosted equivalence proof. A separate schema cannot isolate project-wide roles, Auth, extensions, Storage, routing or integrations. No testing alongside unpreserved protected state.

The exit condition would be completion or terminal failure of that fixed test list, followed by cleanup and the separately authorized retirement process. No indefinite “one more hosted test” responsibility and no substitute billable environment are proposed.

**Cost before execution:** VERIFIED NO ADDITIONAL CHARGE for the J1 standard public-repository GitHub runner under [Actions billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions), with no uploaded artifacts/cache, upgraded runner or provider call. Existing-active-project bounded reads did not change compute/resources; ongoing compute accrual is not savings. No billing control changed. All future resource-consuming actions still require fresh cost verification; existing subscription alone is insufficient.

**Ledger:** inherited 8 executions/925 seconds used, 2 executions/2675 seconds remaining. J1 consumed 1 execution/33 observed runner-seconds. Total **9 executions/958 seconds used; 1 execution/2642 seconds (44m02s) remain**. Queue time and skipped jobs are not runner consumption. The one-run 4GiB build exception remains consumed; no build ran.

### Separate readiness conclusions

| Boundary | Conclusion |
|---|---|
| Required state/history preservation | Exact 45-row archive duplication verified for the scoped window; unresolved provenance/disposition remains private; full-project configuration custody not complete |
| Canonical runtime replacement | No current application jfn runtime dependency identified; direct-wire operator closure remains unresolved. No qik replacement/install claim |
| Caller closure | NOT READY: named external writer/integration ownership gap remains |
| Independent recovery | Synthetic selected-native PASS; full real-state/vector/managed recovery NOT READY |
| Temporary hosted reuse | NOT RECOMMENDED / NOT READY; no repurposing or new login approved |
| Project retirement and billing reduction | NOT READY for deletion; future compute effect established in principle, no money saved during J1 |

## 10. Exact continuation state

Implementation execution identity is `8dbb28b07ff8156b35b62d7597dd42360cde03ea` / tree `950c7dcafcd1274f389ef8d046fabe2287749318`. Cleanup/receipt head is `2d196afc06578d9cf84da1debf64f24694848f1a` / tree `4750d0e1ebdafdf75ba3b8c8c5c7a0705e4edbc3`; report-only successors do not change tested code. All20 workflow blobs were verified restored.

| File | Tested blob |
|---|---|
| preservation.py | 695a8f4080eaffddc88b13a1de4acf67b23a47ec |
| native_structure.sql | 33bc3059abb9b9dafdaddf03fa841eb071973cdc |
| synthetic_rows.sql | 8c5badbbd6747670bcec6a4d6f7055f0df520a08 |
| native_facts.json | 4cfd98ba372a6dbd6b67dafe6d013ea2348303b5 |
| recovery_qualification.py | df5c5f8d24a4c1deb7b51eea516f62e439e9ffe8 |
| execution-receipt.json | 4088b0fd7a973485f743e9794b3a5125f05e57ba |

C1 implementation `6a3585ed931be328b1f0199512b6dde69f6415f2`, build `b9502dc79949a2b27363b94f495bcfc1b62cf5bc`, and C2 report/head remain preserved. The execution confirms unchanged src tree `4cfffc8bbf4c0a105328f0ae543f11dd135cdc13`, tests `667b8d39bf77290bcbf1d83ecc9176ab683f8289`, lock `b5d44ec6e0a21f931cb2d43884010025ee89889c`. News-intake subtree remains `85082f2f0f604f1d85b12ed944a5601b5a88342b`.

Actual same-run capabilities: Sol Medium isolated implementation specialist, Luna Medium bounded evidence specialist and fresh non-implementing High reviewer were used; the parent reconciled the report once. Parent configured model/effort telemetry was not exposed, so no switch or exact Astra-setting claim is made. GitHub/Supabase connectors remained available; browser transport failed after the bounded billing reads. No independent replay is claimed.

**Next exact owner decision:** approve retaining these 45 hash-matched rows as private predecessor material, including historical qualification evidence and unresolved-provenance records, in the existing qik archive without production-domain promotion or a new export. This is a disposition decision, not permission to delete jfn. Other already-authorized bounded read-only work can continue when the missing browser capability returns.

No real state was transferred, new project created, backend mutated, caller cut over, deployment/merge performed or money saved in J1. No durable MIP files were created on the owner's physical device.
