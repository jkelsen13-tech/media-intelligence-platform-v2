# Record candidate evaluation diagnostics

This offline batch implements the measurement prerequisite in
[EVIDENCE_DISCOVERY_EVALUATION_V1.md](EVIDENCE_DISCOVERY_EVALUATION_V1.md).
It does not issue a worker qualification or claim pending work.

## Inputs and scope

Call `evaluateRecordCandidates(manifestJson, predictionsJson)` from
`scripts/evaluateRecordCandidates.mjs` with two UTF-8 JSON strings. Each is bounded
to 2 MiB, 60,000 visited nodes and depth 12. There are 2..1,000 manifest cases.
No new dependency, provider, dataset, source excerpt or network integration is added.

The corpus contract is `record-candidate-corpus-1`. It has explicit UTC
`development_until` and later `heldout_from` boundaries and both partitions.
Each case retains a unique ID, observed clock, input SHA-256, retained reference,
event/arc/origin/near-duplicate grouping arrays, reference label and adjudication.
Cases may be supporting, disconfirming, unrelated or unresolved.
Resolved labels require an independently-adjudicated assertion, retained rationale,
reference and artifact hash; unresolved labels retain their own record.

Grouping keys and exact input hashes cannot cross partitions. Observation clocks
must respect the temporal split. These clocks partition a corpus; they do not
reconstruct historical knowledge or substitute for source valid/publication times.
Input artifacts must preserve those clocks and exact record versions separately.

The run contract is `record-candidate-predictions-1`, binding exact manifest bytes,
implementation SHA-256 and algorithm version. Supply one explicit retrieved flag
and supporting/disconfirming/unrelated/abstain decision for every held-out case.
A retrieval miss must abstain. Missing, duplicate, development and unknown results
are rejected. There is no silent removal of unresolved cases or retrieval misses.

## Report interpretation

Every ratio includes its numerator and denominator; an empty denominator is null.
Retrieval recall counts retrieved relevant cases over resolved relevant cases.
Retrieval precision excludes retrieved unresolved labels from its denominator and
reports their count separately. Verifier accuracy uses resolved non-abstaining
decisions. Resolved decision coverage, correct decisions over the entire held-out
population, unresolved population and total abstention are separate ratios.
The confusion table retains abstentions. Wrong polarity, false relation, missed
relation and retrieval misses are distinct counts.

These are **case-level descriptive diagnostics**, not independent-trial error bounds.
Groups prevent declared cross-split leakage but do not authenticate group discovery,
detect undisclosed near duplicates, verify source rights, fetch artifacts or confirm
independent adjudication. The manifest does not prove complete admission-population
coverage. The caller must retain the exact input strings alongside the report hashes.
No source text or case-level rationale is copied into the returned report.

No threshold is invented. Every report states `qualification: not_assessed`.
The output is not a SQL evaluation receipt and cannot itself satisfy the existing
record-claim gate. A varied rights-cleared real corpus, independent adjudication,
coverage/error-bound design and comparative baseline run remain required.
No evaluation row, pending job, NASA version, review receipt or publication changes.

## Verification

Synthetic regressions cover split leakage through all grouping dimensions and input
hashes, real UTC boundaries, exact byte binding, complete held-out population,
unresolved denominators, abstention, false relation/polarity/missed-relation counts,
adjudication shape and resource limits. They do not supply held-out semantic labels.
Full Node 22/24 suites and builds must pass before merge. There is no frontend code
change; after Pages deployment, check existing phone Account and the saved NASA
Graph/Timeline/World View handoff. Actual results are recorded in the pull request.

POWER and the held Browserslist candidate remain pending their separate rights reviews.
