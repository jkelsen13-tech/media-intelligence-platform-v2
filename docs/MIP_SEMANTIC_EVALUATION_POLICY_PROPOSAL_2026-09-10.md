# Proposed semantic evaluation policy and reference-label protocol

**Status:** Proposal for owner freeze **before** final held-out evaluation. Thresholds are **not** filled from observed candidate performance.  
**Identifier:** `mip-semantic-evaluation-policy-proposal-1`  
**Machine-readable copy:** `verifier/mip-production-cutover-review-v1/evaluation-policy.json`  
**Existing harness:** `scripts/evaluateRecordCandidates.mjs` / corpus contract `record-candidate-corpus-1` (see `docs/RECORD_CANDIDATE_EVALUATION_2026-09-08.md`).

This proposal extends that harness’s measures. It does **not** approve publication, automatic membership approval, or cutover. `qualification` remains `not_assessed`.

## Intended operating scope

In scope once the owner freezes this policy:

- Event membership for approved multi-outlet comparison inputs
- Claim grouping and surface binding to the exact event and article identity
- Source lineage versus independent corroboration
- Correction, retraction, and withdrawn support
- As-known-then versus current reconstruction
- Collection-aware abstention when evidence is insufficient

Out of scope until a separate freeze: Markets price/quote accuracy; World View photorealism; publication eligibility; automatic membership approval.

## Error categories

| Code | Definition |
|---|---|
| `false_merge` | Distinct events or identities treated as one. |
| `false_split` | One event or claim treated as unrelated. |
| `wrong_relation_type` | Sequence, allegation, or co-location promoted to a stronger relation. |
| `source_lineage_error` | Copy/syndication treated as independent, or independent sources treated as copies. |
| `identity_substitution` | Ticker, title, comparison event key, graph UUID, or outlet name used as a different identity family. |
| `temporal_leakage` | Evidence first observed later used in an as-known-then result. |
| `stale_current` | Withdrawn or corrected support still presented as current. |
| `unsupported_confidence` | A numeric or verbal confidence not licensed by retained evidence and coverage. |
| `retrieval_miss` | Relevant retained evidence not retrieved. |
| `false_retrieval` | Irrelevant material retrieved and treated as support. |

## Critical-error rules

Any of these is **critical** after human adjudication:

- `false_merge` of distinct real-world events
- A published current claim that is withdrawn or retracted in retained source history
- `identity_substitution` that would attach evidence to the wrong actor, asset, or place
- `temporal_leakage` into an as-known-then reconstruction
- Treating implementation-agent labels or model agreement as independent ground truth

`critical_error_threshold` in the JSON companion is **null**. This proposal **recommends** blocking release eligibility on any adjudicated critical error in the frozen held-out set. That recommendation is not an approved threshold and must not be back-solved from a candidate’s scores.

## Precision, recall, abstention, coverage

Report with numerator and denominator. An empty denominator is **null**, not zero. Unresolved cases remain in coverage. Do not drop hard cases.

| Measure | Definition |
|---|---|
| Retrieval recall | retrieved relevant / resolved relevant |
| Retrieval precision | retrieved relevant / retrieved resolved (retrieved unresolved counted separately and excluded from this denominator) |
| Verifier accuracy | correct decisions / resolved non-abstaining decisions |
| Resolved decision coverage | resolved non-abstaining decisions / resolved labels |
| Useful population coverage | correct decisions / entire held-out population, including unresolved and abstentions |
| Abstention rate | abstentions / held-out population |
| Unresolved population | unresolved labels / held-out population |

All numeric thresholds in `evaluation-policy.json` are **null** until the owner freezes numbers **without** looking at this candidate’s final held-out run.

Uncertainty language stays the locked six-axis vocabulary in `docs/UNCERTAINTY_VOCABULARY.md`. Missing evidence is not contradicting evidence. Numeric confidence requires calibration against independently adjudicated labels, not model agreement.

## Sample requirements

`minimum_cases` is **null**. Choose N from required coverage and error bounds **after** owner freeze. Do not invent a universal N and do not back-solve N from a desired score.

Required coverage matrix (from the JSON companion): event membership (shared actor in distinct episodes; true paraphrase; broad topic versus one occurrence); claims (negation; 12 versus 120; attribution; modality; changed date/unit; correction versus contradiction); source lineage (exact copy; appended paragraph; wire attribution; partial reuse); retractions; historical discovery; surface consistency (event-to-News identity; Comparison explanation bound to its event).

Current labeled volume against this matrix is **NOT TESTED**.

## Split protocol (freeze before final eval)

Reuse `record-candidate-corpus-1`:

1. Group by `event_groups`, `arc_groups`, `origin_groups`, `duplicate_groups`, and exact `input_sha256`. None may cross development/held-out.
2. `development_until` is strictly before `heldout_from`. Development observations cannot be after the development boundary; held-out observations cannot be before the held-out boundary.
3. Origin groups partition source families.
4. Record the frozen membership list and SHA-256 of the id list. That freeze file is **not** in this packet because labels are not frozen.
5. After freeze, implementations may not add/remove eval ids without a new policy identifier.

The manifest cannot authenticate undisclosed near-duplicates. Residual leakage is a review limitation until owner-adjudicated duplicate discovery is complete.

## Reference-label adjudication (owner decision)

Ground truth is independently adjudicated, source-grounded human labels **accepted by the owner**.

Not ground truth: implementation-agent labels; model agreement; queue acknowledgement; membership scores; auto-approval eligibility flags.

Proposed practical arrangement:

1. **Primary:** one human per case using the retained source (exact capture/history version, as-of boundary, rights-cleared excerpts that actually exist). Decision ∈ supporting / disconfirming / unrelated / unresolved. No invented bodies.
2. **Critical cases and disagreement:** second independent human. Disagreement stays unresolved until owner decision.
3. **Random sample:** dual adjudication on a portion of non-critical cases after the owner freezes the fraction (not fitted here).
4. **Blinding:** adjudicators do not see model decisions or implementation-agent scores on the first pass.
5. **Record:** written rationale hashed into the adjudication record (`adjudication.sha256` in the existing corpus contract).
6. Agent labels may only **queue** cases for humans.

Human adjudication requires timeboxed access to private evidence storage for payloads that cannot be in GitHub; a codebook frozen before labeling (this document); and a conflict rule: the implementation agent that produced the candidate is not the adjudicator.

Reference-label acceptance remains a **separate owner decision**.

## Distinctions this policy does not collapse

| Track | This packet |
|---|---|
| Internal candidate generation | Allowed as queue input only |
| Operational correctness | Isolated tests when run; live NOT TESTED |
| Semantic qualification | **NOT PERFORMED** |
| Release eligibility | **NOT PERFORMED**; owner after independent review |

Automatic membership approval and publication stay **disabled** regardless of any future semantic score.
