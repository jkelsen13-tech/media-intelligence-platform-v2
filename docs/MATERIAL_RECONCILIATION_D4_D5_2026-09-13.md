# Bounded material reconciliation and D4/D5 — isolated PR #153

Baseline: `8d3e1efa96b2066334ab4ca5ace7ce3ff7b9e78d`. This is continued isolated engineering; cutover ON HOLD, publication/automatic approval disabled. No source-rights approval or new material admission is inferred.

The owner's current instruction resolves the bounded inventory choice: account for all 11 article IDs and the 15 previously observed eligible event-membership edges. It does not authorize their material operations or define the whole launch corpus. [Exact metadata, native hashes, receipt IDs and read-only queries](../verifier/material-reconciliation-2026-09-13.json) are retained separately from the earlier frozen observation.

| Article ID / outlet | Observed eligible events | Survivor current record / selected edges | Survivor import mapping / retained article version |
| --- | --- | --- | --- |
| `46dedf23-f7e0-4f88-b783-c4470d044e10` — aspenpublicradio.org | India | Absent / 0 | 0 / 0 |
| `a87de488-a58f-4959-9823-cfb982071ab1` — wcsufm.org | India | Absent / 0 | 0 / 0 |
| `575d4113-cbae-49af-94fc-e2858310ec4c` — Fox News | Cyclospora | Present / 1 | 1 / 1 |
| `7b40ed41-39ad-42e0-baae-da888a77caf4` — New York Times | Cyclospora | Present / 1 | 1 / 1 |
| `cc68af15-2f7a-4d40-b689-cd95a9ee7830` — Al Jazeera | Cyclospora | Present / 1 | 1 / 1 |
| `042cbab5-20d9-4cc1-bd7f-e25f8e9a6f29` — Al Jazeera | Saudi-A, Saudi-B | Absent / 0 | 1 / 0 |
| `1cb6e00c-7bae-4172-ade2-1a0ea7688c15` — Times of India | Saudi-A, Saudi-B | Absent / 0 | 1 / 0 |
| `96fbd272-9d0d-4a13-8cb0-374b62e1cd2a` — Al Jazeera | Saudi-A, Saudi-B | Absent / 0 | 1 / 0 |
| `9d424bd0-1d82-4aaf-9ae1-de7776be5672` — Al Jazeera | Saudi-A | Absent / 0 | 1 / 0 |
| `b7729d14-2d26-4bca-a425-fb4020504a69` — BBC | Saudi-A, Saudi-B | Absent / 0 | 1 / 0 |
| `17661244-b441-4e94-8c72-c8454329cf55` — South China Morning Post | Saudi-B | Absent / 0 | 1 / 0 |

All 11 legacy rows remain present, reader-eligible and source-active; their project-local full-row hashes match the earlier inventory. All 15 designated edges remain present in legacy. Four legacy events are candidate/approved and have 2, 3, 3 and 4 distinct outlets respectively. Only Cyclospora and its three edges exist in the survivor's current tables; its event is also candidate/approved with three eligible active outlets. The missing eight are not merely excluded by survivor reader/source flags: the exact current IDs and exact-URL alternate identity search are absent. No deletion is inferred.

The selector requires approved comparison validation, non-timeline status and multiple nonempty outlets. The 11 IDs also have additional legacy memberships: eleven timeline-only events and two pending-review clusters are excluded by those filters. These extra observed relationships are accounted for in metadata, without expanding the designated reconciliation corpus.

The three shared IDs have **body_text present in legacy and NULL in survivor**. Database-computed hashes of just title/summary/body differ; this directly establishes different retained representations, not publisher edits or a conclusion derived from whole-row hashes. Survivor has one retained article-version row for each of these IDs, recorded 5 September, and no matched article captures. All three still have summaries. No bodies were retrieved into this workflow.

Six absent Saudi-related IDs have original-project import mappings in survivor; those same historical mappings also exist in legacy. The two India-story IDs have none. Neither mapping presence nor its imported_at date proves transfer into survivor. No corresponding records were found in the inspected collector retention, staged records, payload versions or conflicts using current IDs, mapped original IDs and exact URLs. The [5 September transfer receipt](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/8d3e1efa96b2066334ab4ca5ace7ce3ff7b9e78d/verifier/mip_public_surface_transfer_2026-09-05.json) explicitly records verified Cyclospora readback, collectors remaining on legacy, and unfinished data/function dependencies. Current results are consistent with that bounded transfer; the specific historical rationale for not transferring each other article is not established. Existing records are preserved; no new copies, repair imports, deletions or invented generation/output links were performed.

No accessible record found in this bounded inventory establishes the seven operation/audience permissions. Unsupported operations continue to deny with specific missing-evidence reasons. Existing retention obligations remain unresolved; preserving history during this engineering run is not a new license to retain publisher content indefinitely. No repeated request for unknown publisher permission is made.

## Proposed real permission qualification material

[Machine-readable proposal](../verifier/real-permission-material-proposal-2026-09-13.json): **one text-only section, “Section 1 — Definitions,” from Attribution 4.0 International — Legal Code, English version 4.0**, [exact page](https://creativecommons.org/licenses/by/4.0/legalcode.en). Its named version is identified; no new retained-byte fingerprint or database article ID is fabricated.

Creative Commons explicitly makes its own legal-code text available under CC0, while reserving branding rights. This is a product-specific grant, distinct from the general site's CC BY license. [Licensing statement](https://creativecommons.org/policies/), [Master Terms §5, effective 26 August 2020](https://creativecommons.org/terms/), [CC0 1.0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en).

Requested test uses: one-time isolated ingestion, retention, deterministic analysis and internal excerpt display, with a GitHub-hosted disposable test process. No source text in public repository/logs/artifacts, no public release, no external model. Keep title/URL/permission references; exclude logos/navigation/media; do not imply endorsement or present a modified test excerpt as an official license. Named normative definitions present no identified private-person material; this is a recommendation, not an authoritative privacy classification. Exact capture, terms/obligations and owner admission/privacy evidence still must be bound.

The draft records target the existing 008 reference adapter: exact material version/hash, separate operation/audience/domain, primary permission evidence, source-admission approval record and verified obligations. All approval/hash placeholders remain unset and non-executable. Real authoritative-reader binding is still required; 008 continues to reject unbound real records. This proposal would test the permission component, not multi-outlet agreement, the 11 publisher articles, synthetic cases, F2 held-out qualification or the public launch corpus.

**Specific owner choice:** approve or decline this single section for the stated remote isolated uses and GitHub-runner processing. No paid license, contact, production credential, public display or external-model permission is requested. No positive qualification has run.

## D4/D5 replacement enforcement

Requirement: [PHASE_2_D4_D5_DECISIONS.md at the accepted baseline](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/8d3e1efa96b2066334ab4ca5ace7ce3ff7b9e78d/docs/PHASE_2_D4_D5_DECISIONS.md), including the second erratum and Q1-a. Current survivor inspection finds article-version retention and arc-membership invalidation; these are not equivalent to factual explanation rejection or corrected/withdrawn-source propagation. There is no explanation trigger in the observed catalog. Existing reader predicates supply part of D4 but not durable rejection auditing. Read-only legacy function inspection found its publish_explanation wrapper inserts rejection audit rows in the caller transaction and returns an error result. A full caller rollback can undo that insert; its earlier committed-wrapper evidence does not prove the stronger outer-rollback requirement here.

`009_factual_enforcement.sql` is an opt-in extension over 007/008 installed only in disposable PostgreSQL. It attaches to the actual `public.explanations`/`articles` shape and retains the preceding source/rights/privacy checks. A staging wrapper additionally requires each explanation to match the independent factual reader.

- Database guard refuses published transitions missing provenance, active eligible sources or a separate exact-version/source-bound human-review receipt.
- Independent reader reevaluates provenance, review, currentness and sources even if a trusted fixture bypasses the write trigger.
- Source correction/withdrawal creates new awaiting-review versions with existing source_corrected/source_withdrawn states. Exact prior rows are retained in protected history. Already-withdrawn assertions remain withdrawn and are counted separately, as Q1-a requires.
- Source-change events link source ID, affected/skipped version IDs, mechanism and time. Unrelated assertions remain byte-identical; rollback rolls back the source change and its propagation together.
- Returning a source to active does not republish; a fresh current version needs an explicit human-review operation. Historical release receipts never serve as fallback.
- Rejection auditing uses a separate PostgreSQL connection that commits UUID/digest/transition/rule/time before the rejecting transaction raises. It has no foreign key or lock dependency on uncommitted outer rows. A failed outer transaction cannot undo that audit.
- Audit connection custody and review APIs are outside worker/producer/publisher/service_role access; NOLOGIN ownership and FORCE RLS protect the private tables. Synthetic credentials exist only in disposable CI. An unavailable audit sink causes a distinct fail-closed error; no audit durability is claimed for a sink that did not acknowledge.

Protected history contains synthetic fixture row snapshots; the rejection/source-change audit contains no passages. This does not authorize new production audit credentials or live schema changes.

## Remaining boundaries

Engineering: actual permission-reader binding/admission evidence; authorized real-material test capture; historical migration causality and live worker/collector parity; external runtime/Auth closure and production deployment equivalence. The D4/D5 reviewer role is an isolated authorization boundary, not an invented production human identity.

Production audit custody proposal, for a later deployment decision: an execute/insert-only audit connection outside the worker boundary, with separate commit acknowledgement. Same-cluster audit is the isolated proof here; a separate service offers a different failure domain but adds custody/operations. No production choice or credential is needed to run these isolated tests.

Spatial content is not admitted or published by this batch. 007's configured relationship snapshot includes public graph nodes/edges, but the inspected 007–009 path does not read spatial policy/release tables or emit spatial projection content. No spatial artifact approval is made a prerequisite without such a dependency. World View files and restrictions remain unchanged.

F2 settings remain owner-gated. No independent review is launched. The coherent review boundary remains incomplete while real permission qualification and the stated runtime/parity gaps remain outside the demonstrated package. Hosted verification at code commit `370c1308875d10d5a6296bc2e7ba345684fedf54` is complete:


| Verification | Evidence |
| --- | --- |
| Integrated 51/51, including nine new D4/D5 cases | [Run 34732997295](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34732997295/job/103659167321) |
| Golden 1,663/1,663 on each Node 22/24; builds PASS | [Run 34732997316](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34732997316) |
| Original native 14, preserved baseline counterexamples 7, corrected authority 7, candidate interfaces 6 | [Run 34732997176](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34732997176) |
| Isolated extension 8/8 | [Run 34732997140](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34732997140) |

Failed intermediate runs [34732575814](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34732575814) and [34732736978](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34732736978) are preserved: first a fixture name collision; then the audit authentication/scoped schema boundary. No assertion was weakened to accept failure. The final transport exposes only fixed errors and whitelisted function-context names, never SQL arguments.

The new native cases demonstrate outer-rollback audit persistence, separate human review, independent read exclusion, corrected/withdrawn propagation with Q1-a, unchanged unrelated assertions, audit unavailability/access denial, operation-gated staging/public-release refusal, both source/review serialization orders, and rollback of source-change propagation. They use explicitly synthetic content and approvals. Prior frozen files/manifests remain unchanged.
