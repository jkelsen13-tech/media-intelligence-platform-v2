# Bounded CC Definitions permission batch — stopped before qualification

Production cutover remains **ON HOLD**. PRs #149–#153 remain draft/unmerged. No independent review or production approval is claimed.

## Actual admission and scope

The [admission record](../verifier/real-permission-admission-2026-09-13.json) records the owner's actual instruction, ID `cc-by-4-en-legalcode-text-only-admission-v1`. It does not invent a signature, database principal, credential, effective date or external identity attestation.

The approved material is **Attribution 4.0 International, English legal code, version 4.0, Section 1: Definitions, text only**, from https://creativecommons.org/licenses/by/4.0/legalcode.en. The intended internal reference is that URL plus `#section-1-definitions`; no article ID is fabricated. Four operations—ingestion, process-needed retention, deterministic analysis and internal excerpt display—are confined to `isolated_internal_review` in the existing disposable GitHub environment.

Source-rights evidence is separate from internal admission/privacy authorization. The designated primary references remain [CC policies](https://creativecommons.org/policies/), [CC terms](https://creativecommons.org/terms/) and [CC0 1.0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en). This batch stopped before retrieving/verifying those evidence pages. The earlier researched proposal is preserved; no new observation or effective date is inferred.

## Observed outcome

[Sanitized machine-readable evidence](../verifier/real-permission-batch-2026-09-13.json) preserves both attempts.

1. Code `a2489a11ffc9a78073ac8320cb64e17f7e2c2f36`, [run 34735698788/job 103666613090](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34735698788/job/103666613090): 51 integrated regressions passed; activation stopped before capture. The hosted checkout did not supply the head commit required by the activation lookup. Fetch depth two corrects that prerequisite.
2. Code `014b5aa2e56d6b711febf8c062cb3d3891d0a154`, [run 34735898738/job 103667156199](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34735898738/job/103667156199): 51 integrated regressions passed, and three synthetic parser cases passed. The real page reached the extraction check, which returned `selection_discrepancy`. Capture stopped before emitting a material receipt, reading permission pages or creating the batch database.

The shared error covered an empty selection or detection of a Section 2 marker, @ marker or literal URL within the extracted text. It did **not** reveal which condition occurred. These are conservative parser checks, not newly approved privacy policy. This result does not establish that excluded material was present: a parser false positive versus a material mismatch remains unresolved. No text was retrieved into model context to diagnose it, and the source was not fetched again after this rejection.

No exact admitted capture hash or byte count is available. Null identifiers in the evidence are intentional. A selection was processed transiently in the private child process; it was not qualified, ingested into durable storage or exposed publicly.

| Requested result | Actual result in this batch |
| --- | --- |
| Ingestion / isolated_internal_review | Not executed; blocked at selection verification |
| Retention / isolated_internal_review | Not executed in durable store |
| Deterministic analysis / isolated_internal_review | Not executed on real material |
| Internal excerpt display / isolated_internal_review | Not executed; no excerpt output |
| Other material/version, unsupported operation | Real-batch negative cases not reached |
| Public audience / external-model disclosure | No operation attempted or authorized; real-batch assertions not reached |
| Missing/conflicting/unbound evidence; rights cannot bypass admission | Persistent synthetic mechanism regressions are separate from real qualification |
| Internal suspension requiring fresh authorization | Mechanism tested with explicitly synthetic records; no actual owner admission suspended and no publisher CC0 revocation invented |

## Implementation and continued isolated engineering

`010_real_permission_reader.sql` adds a protected reader over exact capture metadata, three primary evidence receipts, the separate owner admission record and current admission/batch heads. Version/hash, operation, audience, privacy scope and current status must match. Records are append-only except fenced current-state heads. NOLOGIN function ownership and FORCE RLS exclude worker, producer, publisher and service_role registry authority. Sensitive reads recheck runtime/session and source-scope authority.

The hosted capture runner uses bounded exact-page retrieval, heading-range extraction, private subprocess pipes and sanitized error output. Its prepared operation path uses the existing AES-GCM runtime-scoped remote journal. Because selection verification failed, this batch does **not** prove real storage acknowledgement, retrieval, deterministic analysis, excerpt rendering or real permission positives.

The activation manifest is now `closed_selection_check_failed`. Ordinary CI cannot ingest the document. The parser now exposes separate non-content diagnostic codes for the formerly combined check without changing its acceptance conditions. No diagnostic source retry was made.

Two persistent tests were added without removing or weakening existing assertions: a no-network synthetic parser test and native reader protection tests. They exercise actually missing primary receipt rows, missing admission, rejection of explicitly synthetic authorization, conflicting/unbound states, committed synthetic admission retirement requiring a fresh revision, immutable evidence, role access denial and NOLOGIN/FORCE-RLS catalog checks. They cannot qualify the real adapter's positive path.

## Verification

| Verification | Exact evidence |
| --- | --- |
| Integrated 53/53, including two new non-fetching permission tests; capture not activated | [Run 34736156727/job 103667854418](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34736156727/job/103667854418) |
| Golden 1,663/1,663 on Node 22 and Node 24, both builds pass | [Run 34736156731](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34736156731) |
| Original native 14; baseline counterexample mode 7 (4 skipped, 3 preserved counterexamples); corrected authority 7; interfaces 6 | [Run 34736156725/job 103667854340](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34736156725/job/103667854340) |
| Isolated authority/publication extension 8/8 | [Run 34736156720/job 103667854346](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34736156720/job/103667854346) |

Executable code: `f9e059c5779cbb933afa244435cf9dee64a85d86`. The report/evidence follow-up does not change executable code. Earlier frozen candidates, manifests, independent review evidence and the 11-item reconciliation remain intact.

## Storage and cleanup

No project files were written to the owner's physical device. Capture ran only in the existing hosted disposable environment. No material files, public content artifacts or external-model disclosures were created by this batch. The failed capture child exited and released its transient process memory; no batch database was created. Physical secure erasure of host memory is not claimed. Only code, admission metadata and sanitized non-content evidence are retained.

## Remaining engineering and owner boundaries

**Immediate engineering blocker:** determine whether the rejected selection is a parser false positive or a material mismatch, without exposing its text or expanding the admitted section. The batch stopped under the owner's explicit discrepancy instruction. Further real-source processing remains closed; the existing admission is not treated as revoked or reopened, and no request to approve unknown rights is made.

**Other engineering gaps:** real permission positive/negative execution remains incomplete; external runtime/Auth and deployment equivalence, live v15/v16 worker/collector behaviour and historical migration causality remain unresolved. The unchanged isolated F1/F3 and D4/D5 regressions do not establish full live parity. The 11 historical publisher articles remain unsupported for operations lacking evidence.

**Existing owner-gated decisions:** exact production issuer/subject/runtime, custody/rotation and audit provisioning; actual initial launch corpus/permission evidence; F2 thresholds, labels, splits, sample minima and adjudication. None was needed to execute the attempted bounded parser test, and none is invented to resolve its failure.

No public release, automatic approval, spatial admission, paid provider, schedule, canary, cutover, migration, retirement, external contact or history rewriting occurred. World View restrictions and regressions remain unchanged. The coherent independent-review boundary has **not** been reached.
