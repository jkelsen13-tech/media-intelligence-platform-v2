# Bounded CC Section 1 retry — permission component PASS

Production cutover remains **ON HOLD**. This closes only the previously approved one-document permission-component test. PRs #149–#153 remain draft/unmerged; no new independent review is launched.

Activation / tested candidate: `0da8b5a0a4f9540160b71a39a1bbba3d655bcc95`, subject `Run bounded CC Definitions admission batch v1 attempt 3`, on `codex/isolated-authority-worker-publication-20260912`. Attempt **3 of the existing maximum 3**. The activation commit changed only the manifest and a read-only same-candidate CI ordering gate. Parser acceptance rules, exact material, rights basis, operations and audience were unchanged from `b50de0130a2498ddd121a7e223ce1e1b3e34e149`.

## Ordering and preserved history

The integrated 53-test suite passed first. The CI gate then verified success of Golden and both native concurrency workflows on the same activation SHA before the material request began. It used the public GitHub API without adding credentials or production permissions.

The earlier failed selection attempt at `014b5aa2e56d6b711febf8c062cb3d3891d0a154` remains **FAIL_CLOSED**, with its original `selection_discrepancy` evidence intact. The corrected-parser candidate `b50de0130a2498ddd121a7e223ce1e1b3e34e149` remains a separate successful 53-test **inactive** run, with `MIP_PERMISSION_BATCH_NOT_ACTIVATED`. Neither is rewritten as a successful capture.

## Exact admitted capture

- Material: Attribution 4.0 International, English legal code, version 4.0.
- Source: https://creativecommons.org/licenses/by/4.0/legalcode.en
- Material reference: `https://creativecommons.org/licenses/by/4.0/legalcode.en#section-1-definitions`.
- Selection: actual Section 1: Definitions heading through, but excluding, the actual Section 2: Scope heading; **eleven definitions**, text only.
- Observed: `2026-09-13T17:46:02.115642+00:00`; **one source request**.
- Normalized UTF-8: **2925 bytes**, SHA-256 `ab25e84228711f827ae10decc41a6c02c64ba33698e51694b4586db062c6d535`.
- Extraction: `heading-range-dom-text-v2`; HTML entities decoded; block boundaries to whitespace; NFC; NBSP to space; whitespace collapsed; trimmed; UTF-8, no trailing newline; generated list markers omitted.
- Full-page and pre-normalization selection hashes are retained in the [sanitized evidence](../verifier/real-permission-retry-2026-09-13.json). The page and selected text are not retained publicly.

The 27 offline synthetic parser cases passed again, including reproduction of the old lexical defect and structural exclusion of content after Section 1. No parser rule changed for this retry.

## Separate rights and internal admission bindings

The reader bound the exact selected bytes/hash to observed primary evidence from [CC policies](https://creativecommons.org/policies/), [CC terms](https://creativecommons.org/terms/) and [CC0 1.0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en). Each evidence page was requested once; document hashes, matching dedication-clause hashes and observation times are recorded without page text. The terms observation exposes **26 August 2020**; no other effective date is invented.

Internal admission/privacy remains the owner's actual record `cc-by-4-en-legalcode-text-only-admission-v1`, SHA-256 `81b8614c8cf9194573a9b6053091260aae8c090d17f51325d9c265a1f7567a1e`. This is separate from source-rights evidence. No signature, production principal, credential or external identity attestation is invented.

| Operation | Audience | Observed result |
| --- | --- | --- |
| One-time ingestion | isolated_internal_review | ALLOW; encrypted journal putOnce committed |
| Process-needed retention | isolated_internal_review | ALLOW; exact retained text/hash comparison passed |
| Deterministic analysis | isolated_internal_review | ALLOW; repeated digest matched |
| Internal excerpt-display test | isolated_internal_review | ALLOW; private escaped rendering passed; output not disclosed |

Both rights and privacy checks passed for each operation through the protected reader with `real_evidence_bound`, not `synthetic_mechanism_only`.

Fourteen explicitly simulated negative cases denied: different material, bytes or named version; full-content display, redistribution or external-model disclosure; public or external-model audience; invalid domain; missing/conflicting/unbound evidence; suspended internal admission; and rights evidence without internal privacy/admission authorization. Old admission-revision reactivation was rejected. Three worker registry access/escalation attempts were rejected. Closing the disposable batch state denied subsequent checks.

These negative state changes were transaction-local test simulations and rolled back. The actual owner admission was not suspended, no fresh owner approval was fabricated, and no CC0 publisher-revocation event was invented.

## Regression evidence

| Suite | Result and exact run |
| --- | --- |
| Integrated | **53/53**, plus the bounded permission batch: [34772418826 / 103764309816](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34772418826/job/103764309816) |
| Golden Node 22 and 24 | **1,663/1,663 each**, both builds PASS: [34772418822](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34772418822) |
| Native comparison/authority | Original 14; baseline 7 with 4 intended skips and 3 preserved counterexamples; corrected authority 7; interfaces 6: [34772418828 / 103764309847](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34772418828/job/103764309847) |
| Isolated authority extension | **8/8**: [34772418838 / 103764309841](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34772418838/job/103764309841) |

Existing D4/D5, authority, recovery, provenance and publication regressions remain intact. The closure/evidence follow-up changes no parser or permission implementation.

## Storage and closure

The existing hosted runtime-scoped AES-GCM journal was used only within the disposable qualification process. Its database was removed and absence verified. Transient child/main process memory was released on exit; physical secure erasure is not claimed. No material files or public content artifacts were created, and no section text was sent to an external model. No MIP project files were written to the owner's device.

The activation is now `closed_permission_component_passed`, with a null commit subject, while attempt/max-attempt accounting remains **3/3**. Ordinary CI cannot repeat retrieval. Prior manifests, frozen candidates and failed/inactive evidence remain unchanged.

## Remaining boundaries

The bounded real-permission reader's positive and requested negative paths are now demonstrated for this one admitted section. This is not a multi-outlet corpus, factual-publication qualification or production-ready declaration.

Remaining engineering includes external runtime/Auth closure and deployment equivalence, live v15/v16 worker/collector parity and historical migration causality, and the broader survivor eligibility integrations for supported material. The eleven historical publisher articles remain unsupported wherever operation-specific evidence is absent.

Production issuer/subject/runtime, custody/rotation/audit provisioning and release authorization remain owner-gated; F2 thresholds, labels, splits, sample minima and adjudication remain separately gated. No spatial admission, public release, redistribution, external-model disclosure, production change, schedule, paid service, contact, history rewriting or legacy retirement occurred.

The coherent independent-review boundary has **not** been reached.
