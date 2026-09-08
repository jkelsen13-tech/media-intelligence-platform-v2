# Paired record-candidate diagnostics

This continues Campaign 1 and the comparative-baseline prerequisite in
[EVIDENCE_DISCOVERY_EVALUATION_V1.md](EVIDENCE_DISCOVERY_EVALUATION_V1.md).
The existing single-run evaluator remains unchanged.

## Counterexamples and invariant

An overall relevant-evidence retrieval score can rise from 2/10 to 9/10 while
losing the only disconfirming case. Equal aggregate correctness can also hide
a gain on one case and a regression on another. These are synthetic arithmetic
counterexamples, not measured producer performance.

Invariant: compare both complete held-out runs on the same exact manifest,
pair by case identity, and expose supporting, disconfirming, unrelated and
unresolved results separately. An aggregate improvement does not select a model.

## Implementation and interpretation

Call `compareRecordCandidateRuns(manifestJson, baselineJson, candidateJson)`
from `scripts/compareRecordCandidateRuns.mjs`. Both runs pass the existing
bounded parser, split-leakage, exact-byte binding and complete prediction checks.
No report objects supplied by a caller are trusted as substitutes for raw runs.

Output contract `record-candidate-paired-diagnostic-report-1` retains both
single-run reports and their exact input/run/implementation fingerprints.
Each label has baseline/candidate retrieval coverage, decision coverage,
abstention, verifier accuracy and correct-population coverage with explicit
numerators/denominators. Retrieval coverage for unrelated/unresolved cases is
not relevant-evidence recall. An empty denominator is null.

Retrieval and correctness transitions are retained/gained/lost/neither, oriented
baseline → candidate. A full decision transition matrix includes abstentions.
Correctness is absent for unresolved labels; a decision on an unresolved label
is not a success or failure. Retrieval misses remain distinct from abstention
after retrieval. Prediction ordering cannot affect the pairing.

The comparison copies no case identities, source text, retained references or
adjudication rationales. It is an aggregate diagnostic, not a publication-safe
export guarantee for arbitrary caller-supplied algorithm-version strings.

## Gates and remaining work

No worker qualification, automatic winner, confidence bound, threshold,
assessment, database write or network call is issued. Case counts are not
independent-trial estimates. Grouping, adjudication, rights and artifact references
remain operator assertions under the underlying evaluator.

A rights-cleared real corpus, independent adjudication, representative coverage,
comparative producer execution, operating-cost measurement and appropriate
error-bound design are still required before qualification. The six pending jobs
are not claimed by this offline tooling.

Nine synthetic regressions cover hidden counter-evidence loss, offsetting
case changes, order independence, unresolved/empty classes, retrieval versus
abstention, both-run validation, inherited resource/leakage gates, exact
fingerprints/private artifact exclusion and transition-count conservation.
Run full Node 22/24 tests/builds before merge. No frontend files change; verify
the existing live phone Account and saved NASA/shared-view path after Pages.

No new dependencies or datasets. POWER and the separately held Browserslist
candidate remain pending their recorded rights reviews.
