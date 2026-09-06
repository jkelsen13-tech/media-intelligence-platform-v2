# Private retained-capture retrieval baseline

Target: v2 `qikvmopbtijoebdqosyq`. Repository base:
`cc97023bf5ce08f7c500df4e987cf2ef35811959` (PR #38).
Migration: `20260906054356_evidence_capture_retrieval_v1`.
See `verifier/capture_retrieval_verification_2026-09-06.json` for deployment state.

## Purpose and scope

This implements one deterministic candidate-retrieval baseline: compare an exact
retained article capture with other retained captures, regardless of publication
date. Results are private capture pairs with exact source references. They are
separate from source-span evidence_candidates and semantic assessments. No graph
edge, event membership, causal link, assessment, public content or market exposure
is created. Those require identity binding and semantic verification afterward.

The retriever compares deduplicated lowercase ASCII terms of 4..80 characters,
excluding numeric-only terms and an explicitly versioned small stopword list.
It uses title plus non-empty body_text, otherwise summary. Two shared terms yield
retrieval_candidate. This is a permissive baseline with expected false positives
and paraphrase misses, not an accuracy threshold or a confidence score. Negated
claims and changed quantities can still be retrieval candidates: the verifier
must distinguish them. Non-ASCII languages, very short text and number-only
identifiers are poorly represented. Insufficient extracted terms are explicitly
recorded. No external model, publisher request, paid API or scheduler is used.

## Durable coverage

retrieval_runs freezes a sorted explicit set of at most 2,000 other capture UUIDs.
A snapshot hash and contract identify retries. The limit fails loudly if exceeded;
it is not a sample silently presented as full corpus coverage. Each page processes
at most 25 targets and stores an immutable retrieval_run_items entry referring to
an immutable retrieval_pairs result, including negative and abstaining outcomes.
A crash rolls back both page writes and progress. Resuming uses saved targets.
The final page checks that every manifest target has a stored result and completes
its source queue job with a durable capture-retrieval:<run UUID> receipt atomically.

Coverage complete means enumeration of this visible retained-capture snapshot by
capture-lexical-1, not semantic correctness, worldwide evidence coverage, or every
producer family. The source is excluded; captures of the same article are stored
as same_article. Symmetric scans reuse the same sorted exact-version pair, so
repeated discovery does not generate independent support. Different URLs can be
copies or share a wire source: this baseline does not resolve source lineage.

New arrivals obtain their own source notices and can find earlier captures. A
refresh of a completed source job takes a new visible manifest, persists a new run
when the set changed, and preserves the old run. Matching manifests reuse prior
work. Periodically refresh every completed capture job to repair cases where
concurrent scans missed one another. There is no timestamp or sequence high-water
mark. This design has quadratic pair growth and is for a bounded evaluation
collection; a corpus-scale index/partition adapter must replace enumeration
before importing tens of thousands of captures into this retrieval path.

## Server RPC

public.mip_capture_retrieval_v1(p_action text,p_input jsonb) uses SECURITY INVOKER
and an empty search path. Only trusted service_role may call it. Three new tables
have RLS, no browser grants/policies, and no truncation. Pairs and run items are
append-only. The service role may update only run progress and completion columns;
the manifest cannot be rewritten through those privileges. Direct privileged
inserts remain the existing trusted-server boundary, not an untrusted worker API.

| Action | Input | Output |
|---|---|---|
| start | job_id, lease_token | Saved run for an already-leased capture new_candidate_search job. |
| page | run_id, lease_token, optional limit 1..25 | Partial progress or completed receipt; refresh runs need no lease token. |
| refresh | job_id of completed capture run | Current manifest run, reusing an existing manifest if unchanged. |
| read | run_id | Run manifest, progress and disposition counts. |
| results | run_id, optional after target UUID and limit 1..25 | Ordered page of results; use last target_capture_id to continue until empty. |
| pair | pair_id | Private pair and both exact retained capture payloads. |

Disposition: retrieval_candidate, no_lexical_match, same_article, insufficient_text.
Consumers must inspect disposition, not treat every result as a positive match.
Pair payloads and results are historical exact-version artifacts, not a declaration
of current validity. Corrections create new capture versions and new pairs; older
results remain for audit. The subsequent semantic adapter must pass exact evidence
contexts into the assessment layer and respect its live staleness result.

A two-minute lease fences writes for initial queue work. After reclaim, use the
new token with the same saved run. Refresh calls serialize on the source job and
run row. Completed page retries are read-only and return the stored-run receipt;
a lease token is not required to read completed work. Refresh work does not reopen
or manufacture another completion event for the original queue job.

The generic queue claim action can return unsupported record-version producers.
This retriever refuses them; do not finish or dead-letter them just to empty the
queue. No general scheduled consumer is enabled. The one-time administrator
bootstrap may prioritize the identified capture notice, claim it with the existing
queue, and finish it through this RPC in a single bounded transaction.

## Verification and remaining gates

Focused tests cover frozen manifests, partial coverage, exact replay, inverse-pair
reuse, historical arrivals, refresh after new inputs, corrections, unsupported
producers, page rollback, expired tokens, private roles, immutable results and the
unchanged deployment canary. The live canary uses retained synthetic articles and
rolls back all source, queue and retrieval rows. Sequence gaps are expected. It
requires idle intake and a collection within the 2,000-target budget.

No simultaneous multi-connection or HTTP/PostgREST worker has been tested. Real
worker concurrency, deadlock/retry load, broad semantic accuracy, non-English
recall and corpus-scale query planning remain gates before scheduling. Source
lineage, algorithm cooperation, event/entity/asset identity binding, graph-history
retrieval, full historical knowledge snapshots and synchronized surface projections
remain separate work. The one current live capture cannot establish retrieval
quality. The next useful evaluation needs a varied private real-evidence collection
and lexical-versus-semantic comparison under the existing evaluation contract.

## Deployment and registration

Register the already-applied migration at its actual recorded timestamp. Do not
reapply it on v2 or blanket db push. Existing staging discrepancy remains:
repository 20260905203600 versus live 20260906034920. Do not repair migration
history in the registration PR. On regression, stop operator invocations and
retain jobs and result history for additive repair. No scheduler was activated.

## Verified deployment result

Applied and verified on 6 September 2026. All 906 repository tests and the build
pass; the live service-role rollback canary passes. Eight content/count hashes
match the preceding verified assessment deployment baseline. Security-advisor
additions are three INFO notices for intentionally private tables without browser
policies; no new WARN/ERROR.
[Advisor definition](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The one existing retained capture completed one run with an empty target set and
zero pairs. Six record-version new_candidate_search notices remain pending. All
seven prior dependency jobs remain completed. There are zero semantic assessments.
A one-capture collection is not a retrieval quality benchmark. No fixture content
was retained and no model or scheduler was enabled.
