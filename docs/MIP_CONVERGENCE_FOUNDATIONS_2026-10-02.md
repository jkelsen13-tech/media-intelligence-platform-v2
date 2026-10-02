# MIP foundation seam qualification — 2 October 2026

Status: **NONDEPLOYED SOURCE PROPOSAL; bounded local qualification passed.**
Frozen predecessor: `b8ac1663fa75c4c7a26d653a288f745070bafcae`.
Lane: `codex/mip-convergence-foundations-20261002`.
This is a successor proposal, not evidence that production implements it. No
applied migration, live database, credential, publication rule, provider, worker,
schedule, backend retirement, or Markets registry was changed.

## Requirement and foundation disposition

The supplied pre-launch plan v4 (`libfile_1dd1f26f7f048191bcf91b4ac9922931.txt`,
P3 and the provider-neutral semantic decision addition) requires relevant new
evidence to invalidate reusable decisions even when absent from their original
dependency set, while unrelated corpus changes leave decisions current. The
final audit readiness gate (`libfile_ffe581ca966881919ab5625f0ea824b6.txt`) states
this explicitly. Other supplied extracts retain the distinction between source
qualification, deployed authority and unfinished external dependencies.

Requirement → existing foundation → missing delta → **EXTEND**:

| Requirement | Canonical existing foundation | Bounded delta / disposition |
|---|---|---|
| Exact evidence and corrections | `article_captures`, `record_versions`, `evidence_changes`, `change_subjects` | Keep these identities and versions. No second corpus or identity mapping. |
| Assessment history and inherited dependencies | `assessments`, `assessment_context`, `assessment_causes`, `read_assessment` | Add exact candidate/input relevance declarations to the same dependency computation. |
| Durable invalidations and recovery | `assessment_invalidations`, `process_dependency_job`, `reconcile_assessment_invalidations` | Use the same authoritative cause predicate for dependency pages and repair. |
| Saved change briefings | `collect_investigation_snapshot`, saved observations and their existing diff | Include newly relevant exact inputs and frozen declaration provenance. Keep original observations unchanged. |
| Semantic discovery and reassessment | Existing retrieval/change jobs, exact assessment append API | Remain separate. This proposal neither finds relevance nor judges a claim. |

The existing extra-input list can watch evidence an assessor already knew to add,
but it is frozen into a particular assessment. Neither the change queue nor
capture retrieval supplies a canonical candidate-to-input relevance binding that
can make an earlier assessment and its frozen descendants stale. Thus one private
association table is the missing datum, not a new evidence, decision, or retrieval
engine. All applied predecessor SQL stays byte-for-byte unchanged.

## Reproduced inconsistency and repair

The first regression runs the frozen foundation before loading the proposal:
an assessment and two descendants exist; a different retained article arrives
with a historical publication date; all dependency jobs complete. All three
assessments still read current, and zero invalidations are stored. The dependency
receipts expressly describe transport coverage without semantic reassessment.
This reproduces the missing bridge; it does not establish that the real article
was semantically relevant.

The proposal is `supabase/source-proposals/assessment_relevant_inputs_v1.sql`.
It adds immutable private `candidate_input_relevance` rows with canonical
candidate UUID, exact retained change position, selection method/reference and
rationale. It exposes one additive action through the existing server-only RPC:

```js
mip_assessments_v1('declare_relevance', {
  candidate_id: candidateUuid,
  position: '9007199254740994', // positive decimal string, never a JS Number
  selection_method: 'analyst-declaration',
  selection_ref: retainedSelectionReference,
  rationale: 'Why this exact input was selected for reconsideration.'
})
```

The result preserves the exact decimal `change_position`, original declaration
time and `publicly_eligible:false`. Identical retries return the original row;
changed method/reference/rationale for the same candidate/input conflicts.
Unsupported fields, wrong JSON types, unknown/foreign-domain candidate IDs,
unknown positions and geography candidates fail. Browser roles cannot call the
action or read its table. The existing trusted service role boundary remains;
this is not per-user authorization or an untrusted-worker sandbox.

Current causes derive relevant subjects for an assessment's candidate and its
ancestor candidates. An earlier assessment and its descendants become stale on
a fresh read even after a prior dependency job completed. Reconciliation records
the missing durable causes without reopening or forging queue receipts. Future
corrections and withdrawal records of that subject use the same existing worker.
New context includes all retained versions of relevant subjects, including old
publication arrivals. A delayed append with an omitted committed version fails;
explicit successors preserve previous results. This conservatively requires
reconsideration and never changes a saved outcome to true/false or contested.

The observation collector retains both the exact inputs behind causes and an
additive `relevance_declarations` array with frozen selection provenance. Existing
briefing events describe evidence entering and dependency state changing. Saved
baseline reads remain exact; ordinary reads do not recreate observations or mark
review. The frontend does not yet render the additive declaration provenance or
a separate relevance event when an already-watched input is declared relevant.

## Actual capability coverage

These are source-contract qualifications, not a claim of population, deployment,
global semantic coverage or positive signed-in production access.

| Product family | Existing implementation and verified meaning | Remaining dependency / existing owner seam |
|---|---|---|
| Change briefings | Retained observations, explicit prior baseline and saved assessment/input diffs; workspace review baseline | A real assigned investigation and deployment/positive signed-in qualification. Reuse briefing/workspace owners. |
| Evidence Impact | `investigation-input-impact/impact.mjs` and `InvestigationInputImpact`: direct saved citations and exact assessment contexts; ambiguous identity stays unresolved | Whole downstream graph/arc/public/spatial/Markets propagation is not proved. Extend these references through canonical adapters; a saved reference count is not support strength. |
| Promise to outcome | Workspace commitment records distinguish commitment/prerequisite/action/implementation/outcome, independent branch statuses and exact evidence | Real evidence-backed stage population and follow-up retrieval. Prerequisite links do not infer completion; observed outcome does not prove causation. |
| Competing explanations | Versioned hypotheses with assumptions, linked assessments, discriminating evidence and uncertainty | Measured disconfirming retrieval and semantic comparison. No automatic winning explanation or probability calibration is qualified. |
| Information lineage | Saved bounded checks nominate exact text/URL origin candidates; reviewer decisions stay versioned, independence remains unknown | Source-origin/rights collection and evaluated lineage resolution. Public `relationshipProvenance` still says lineage unverified; private nomination/review is not a public independence guarantee. |
| Institutional history | Exact saved source history, retained versions, commitment and hypothesis revisions | Canonical institutional identity and richer action/history adapters. Source capture history is not an institution's real-world history; do not build a duplicate timeline. |
| Collection-aware gaps | Workspace collection declarations, bounded search status and saved retained-text inventory with explicit limits | Measured collector/search/extraction/rights dispositions. Existing declarations do not implement the full diagnostic vocabulary below. |

## Collection gap claims and receipts

The existing workspace separates `not_run`, `partial` and
`completed_for_declared_scope`; the latter remains an analyst declaration. Text
availability distinguishes body/summary/title/missing retained fields, and an
unavailable snapshot from a valid empty inventory. A body field may be partial.
Neither missing text nor no follow-up found proves absence of real activity.

The required diagnostic vocabulary must be bound to observed collection facts:

| Diagnostic | What the current seam can warrant | Evidence needed before a stronger diagnostic |
|---|---|---|
| `notreported` | Currently unknown; missing retained text does not establish this | Completed, explicitly scoped source reporting review |
| `notretained` | Missing fields in a particular saved observation | Exact source/capture retention disposition if asserting failure to retain source material |
| `notextracted` | No extraction result alone is inconclusive | Exact retained input and extractor run/disposition |
| `notsearched` | An explicit `not_run` declaration for a named scope | Actual durable search progress for a measured statement |
| `unavailable` | Snapshot/input/service unavailable is explicit, separate from zero | Provider/source availability disposition for a source-level statement |
| `rightsblocked` | No such typed collection diagnostic is implemented here | Source license/permission decision bound to the attempted input |
| `rejected` | A saved review rejection describes its named candidate/target | Collection/relevance rejection with exact scope and reason; review rejection is not real-world absence |
| `unknown` | Preserve when no sufficient retained disposition exists | The missing collection or evaluation evidence, not an invented score |

None of these states means `realabsence`. This lane adds no guessed status,
numeric completeness score or collection policy. The canonical workspace
coverage owner and collector/retrieval owner must reconcile the measured
disposition contract before these diagnostics become populated product fields.
Likewise a completed dependency job, bounded lexical retrieval, analyst selection
reference or reviewer receipt is not semantic qualification.

## Validation and limits

Sequential local scopes (Node/PGlite; isolated fixture databases):

- New `tests/foundationSeamsRelevance.test.mjs`: **10 passed**, including the
  pre-proposal counterexample, original/child/grandchild invalidation, unrelated
  negative control, exact successors, retained late historical inputs,
  corrections/withdrawals, rollback, delayed append rejection, decimal bigint
  identities, malformed/foreign/browser rejection, historical-query refusal and
  both existing rollback SQL canaries after the proposal is loaded.
- Existing assessment, briefing and change-queue scopes: **40 passed**.
- Existing workspace/check/review/input-impact/text-availability/retained-input
  and presentation scopes: **87 passed**.

Receipts are retained in `/workspace/mip-lane-foundations-receipts/`. An initial
compatibility run used the wrong smoke-fixture filename and failed `ENOENT`;
the corrected filename passes without changing assertions or fixture SQL. The
failed receipt is retained separately. No full frontend build was required for
this proposal-only SQL/test/document lane; parent integration owns broader gates.

Selection method/reference/rationale is a server or analyst declaration, not an
independently verified semantic result. Relevance applies conservatively to the
selected candidate and its descendants; there is no declaration retraction or
supersession API in this slice. No semantic finder/provider, scoring, method
policy, publication gate, rights-aware cross-user cache or automatic reassessment
was introduced. Search jobs stay pending unless their existing genuine worker
finishes its own contract; declarations never drain them.

STABLE context/causes/collector functions preserve the existing query-snapshot
semantics. A committed relevance change missed by an earlier snapshot is visible
on the next fresh read, rather than justified by sequence/time ordering. Tests
exercise sequential rollback/commit and delayed input validation, not simultaneous
multi-connection contention. Advisory locks serialize exact declaration retries
by design; actual concurrency, PostgreSQL/PostgREST invocation and corpus-scale
query plans remain external qualification gates. Existing page limits bound
writes, not total cause-query cost. Existing 500-version context, ancestry,
observation input and byte budgets continue to fail rather than truncate.

The original Supabase skills were loaded; the markdown changelog/docs endpoints
could not be fetched by these tools, so the official HTML
[changelog](https://supabase.com/changelog) and
[database functions guide](https://supabase.com/docs/guides/database/functions)
were read. The checked recent release changes do not require a new API for this
source proposal's existing SECURITY INVOKER/empty-search-path pattern.

Before any apply: parent architecture integration and independent review must
approve the exact source proposal and predecessor disposition, then establish
fresh backend authority, exact migration lineage and authorized deployment scope.
Only that later gate should generate an actual CLI migration. Do not replay
historical applied SQL or blanket `db push`; this directory deliberately sits
outside `supabase/migrations`.
