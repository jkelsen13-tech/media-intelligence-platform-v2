# Selective intake declaration foundation — 2026-10-02

This is a bounded, SOURCE-only implementation of the accepted selective-ingestion foundation: explicit `analyze_now`, `retain_deferred`, and `skip_for_now` dispositions, explicit reconsideration references, and domain classifications using the existing shared evidence stack. It supplies no automatic selection criteria, analysis jobs, rights admission, publication decision, durable store, or App path.

## Requirement and existing owner trace

The accepted Library requirement register (`libfile_953c9013cec08191be2e9bef847b753f`, “Selective ingestion and cross-domain foundations”), the complete `04_CONSULTATION_RECONCILIATION_AND_IMPLEMENTATION_PLAN.md`, and `07_NEWS_READER_CONTRACTS_AND_ACCEPTANCE.md` require selective dispositions and reconsideration while keeping religion/religious-institution coverage in the shared stack. Their acquisition, publication, and corpus gates remain distinct from implementable generic SOURCE foundations.

The repository already has immutable inputs and exact observation owners. The missing part was a deterministic declaration contract for those dispositions. Positive candidate-to-input relevance is a different fact and cannot safely absorb a disposition into its existing append-only primary key.

| Fact | Existing owner reused |
| --- | --- |
| Retained article identity and exact content version | `article_captures.id`, `article_id`, `content_hash`, `evidence_changes.position` |
| Extracted object identity and version | `evidence_candidates.id`, `capture_id`, `extractor_version`; canonical entity/relationship references remain on this object |
| Declared assessment dependencies | Assessment ID and exact `context_positions` in `mip_assessments_v1` / native observation snapshots |
| Newly declared relevant input | `candidate_input_relevance` exact candidate/position/method/ref from the existing nondeployed `assessment_relevant_inputs_v1.sql` proposal |
| Frozen scope and observed changes | `mip_investigation_briefings_v1` observations, original immutable snapshot, direct `previous_observation_id` |

See [capture collection evaluation](CAPTURE_COLLECTION_EVALUATION_2026-09-06.md), [capture context proposal](CAPTURE_CONTEXT_PROPOSAL_2026-09-06.md), [canonical intake/Reader qualification](MIP_CANONICAL_INTAKE_READER_2026-10-02.md), and [foundation relevance seam](MIP_CONVERGENCE_FOUNDATIONS_2026-10-02.md). None establishes acquisition rights or source-selection quality for a production corpus.

## Implemented contract

`scripts/selectiveIntakeDeclaration.mjs` is a pure server-side module with two exports. It imports only Node's hash implementation and performs no IO.

`declareSelectiveIntake(observation, declaration)` requires the complete native observation shape and binds:

- Exact observation ID and deterministic snapshot digest; exact scoped candidate, original capture, content hash, extractor version, and decimal input position.
- One explicit disposition, with nonempty caller-supplied method/version, policy version, selection reference, and rationale. These strings record self-asserted provenance; they do not prove a registered policy, authorized human decision, source permission, or model competence.
- Nonempty domain declarations, each with a classification reference. Religion and economy fixtures use one candidate, capture, and observation path. The labels do not prove domain coverage or create separate identities, retrieval systems, or timelines. Existing typed entity/relationship/unit/provenance owners remain authoritative.
- Nonempty reconsideration references to existing records: a current, unsuperseded assessment with an exact declared dependency position, or an exact existing positive-relevance declaration with its selection method/ref and retained input. A stale assessment cannot become a fresh dependency declaration.

Positions remain decimal strings through comparison, including values beyond JavaScript's safe integer range. Native snapshots may retain additional candidates from ancestor assessments; all explicitly scoped candidates must still be present and candidate IDs must be unique. Only a candidate in the explicit investigation scope can receive a disposition; a retained ancestor candidate does not gain declaration scope. Unknown fields, duplicate references, missing inputs, wrong capture/candidate/hash/extractor versions, and unsupported contracts reject. The module computes a declaration fingerprint; this is an integrity binding to the supplied data, **not authentication of the snapshot's origin**.

`reconsiderSelectiveIntake(declaration, baseline, current, request)` requires an explicit caller request and the native direct successor observation for the same scope. It verifies the unchanged original candidate/input and original declaration binding, then accepts only:

1. A newly observed stale cause on the originally declared assessment/dependency, whose exact retained input has the same canonical subject as that dependency. An unrelated subject, already observed cause, phantom position, or undeclared assessment rejects.
2. A newly observed positive-relevance declaration for that candidate, binding its exact retained input and selection method/ref, absent from the baseline. Merely arriving, retaining an input, completing a queue job, or repeating an existing declaration does not qualify. Future relevance cannot be prebound to a nonexistent record: the reconsideration request explicitly references the new native declaration once it exists.

The result says `needs_reconsideration` and retains the original disposition. It never changes `skip_for_now` or `retain_deferred` to `analyze_now`, changes an assessment outcome, creates a relevance declaration, or claims that analysis happened. Every result records `provenance: caller_self_assertion`, `rights_admission: not_established`, `publicly_eligible: false`, `persisted: false`, and `execution: none`.

These are captured-input dispositions, not authority to erase captures or assert that a source has ceased to be worth considering. Reconsideration references describe known dependencies and observed new declarations; they are not a scheduler or a new search/relevance engine.

## Future binding and remaining gates

The existing operator intake owner (`scripts/evidencePipeline.mjs`) can use this validator after its existing capture/candidate RPC flow and an authorized native observation read, once a separately authorized writer and declaration-retention contract exist. It should pass exact returned records, preserve their version IDs, and keep existing rights/publication gates independent. The module is currently **unbound**: no existing producer, backend client, gateway, durable writer, SQL schema, queue consumer, public payload, or UI imports it.

A future binding must authenticate the snapshot read and writer, establish access boundaries and durable/idempotent declaration history, and define the source-selection policy and criteria. The pure module cannot establish those properties from a caller-supplied object. Its method/policy/version/classification references are provenance declarations, not verified registry references or human-review proof.

Provider/source rights and production corpus gates are still deferred: actual provider access and license/reuse terms; ingestion/retention/display permissions; explicit selection producer and criteria; workload/budget decisions; authorized trigger population; release corpus and religion/religious-institution coverage measurements; real relevance and extraction quality qualification; and deployment/operational ownership. Unknown or insufficient rights remain no admission. Those gates do not prevent this isolated generic contract and its source tests from existing, but this change does not close them.

## Validation

`tests/selectiveIntakeDeclaration.test.mjs` loads the actual intake reliability, change queue, assessment dependency, investigation observation migrations and existing nondeployed relevance proposal in isolated PGlite. All URLs and text are synthetic. No live service or account is contacted.

The native tests cover all dispositions; shared religion/economy classification; exact capture/version linkage; correction-driven reconsideration; stale dependency rejection; unrelated subject rejection; original snapshot retention; missing and previously known relevance; exact large bigint positions; denied anonymous/authenticated RPC/table reads; and rolled-back input references. Modified supplied snapshots are tested for integrity/subject refusal; these tests do not claim to authenticate arbitrary caller-supplied snapshots.

Validation receipts are outside the repository in `/workspace/mip-lane-selective-intake-receipts`. Final validation after the native closure repair: 51/51 tests passed, including 8 new native PGlite tests. The added cross-candidate parent-assessment fixture reproduced `candidate scope mismatch` before the repair, then qualified native expanded closure, refusal of out-of-scope declarations, missing/duplicate scope members, exact immutable candidate linkage, and native successor reconsideration. Existing intake, database, investigation, and foundation relevance regressions ran together with this test. `npm run build` passed with the existing temporal-assessment `node:crypto` browser externalization and large-chunk warnings. Build verification uses the isolated worktree with shared dependencies symlinked read-only in practice; no dependencies were installed or changed. No browser check applies to this server-only, unbound contract.
