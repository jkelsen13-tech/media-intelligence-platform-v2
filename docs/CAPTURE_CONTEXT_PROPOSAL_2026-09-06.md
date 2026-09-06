# Private context-aware capture proposals

Base: `421dfaf5ed58c807ac8ae9351ae566b6780226a9` (PR #40 merged).
Contract: `capture-context-proposal-2`. Status: offline implementation for
controlled evaluation; not deployed, calibrated or approved for publication.

## Why this slice exists

The previous diagnostic found unrelated pairs linked only by terminal display
text, ambiguous shared words, and changing numbers without enough event context.
This implementation removes the narrow display artifact and adds a second
retrieval route through versioned, excerpt-bound identity annotations. It makes
the next semantic stage's input explicit without pretending retrieval proves a
relationship. The deployed SQL `capture-lexical-1` remains unchanged.

## Architecture blueprint

| Exact repository path | Purpose |
|---|---|
| `scripts/captureContextProposal.mjs` | Private proposal contract, text selection/filtering, typed identity annotations, raw-span validation, frozen sessions and bounded pages. |
| `scripts/runCaptureContextProposal.mjs` | Private operator comparison against the actual unchanged SQL baseline; exclusive result-file creation. |
| `tests/captureContextProposal.test.mjs` | Adversarial tests including SQL parity, historical arrivals, pagination, identity separation, source preservation and file privacy. |
| `docs/CAPTURE_CONTEXT_PROPOSAL_2026-09-06.md` | This contract and integration guide. |
| `verifier/capture_context_proposal_2026-09-06.json` | Sanitized implementation/test evidence, scope and limits. |

No existing source file or migration is edited. The new modules reuse
`prepareCollection` and its source qualification, the original article validator,
and the prior offline evaluator. Importing them does not execute a CLI, connect
to a live service or obtain a credential.

## Input qualification and identity

Source input is the same JSON array used by `evaluateCaptureCollection.mjs`:
2..100 records containing `id`, `feed`, `source_status`, `fetched_at`, optional
`exported_at`, and article fields `url`, `title`, `outlet`, `summary`, `body_text`,
`published_at`. The same six-feed diagnostic allowlist applies. Metadata,
inactive/withdrawn rows, missing source clocks and insufficient retained text
remain rejected with reasons. Fewer than two admitted rows fail. Collection
overflow fails rather than silently choosing a top-k subset.

The imported `prepareCollection` is specific to source project
`yhbwnrtlqbjtcrrlpbge`. Its `source_id` is that source's ARTICLE ID. It is never
treated as a target capture UUID, graph event, comparison event or queue position.
Each output endpoint uses `identity_family: source_article_snapshot`, the source
project/article identity, the exact article hash and the context hash. A future
live adapter must resolve these into real retained capture/change identities.

Body fields repeating summaries remain explicitly labeled; other text has
unverified completeness. Source fetched/published/export clocks are retained,
but are not substituted for MIP first-observed time. Historical `as_of` queries
are refused. This is current offline reconstruction over a supplied snapshot.

## Versioned identity annotations

Optional contexts are an array, at most one per admitted source ID. Each contains:

```json
{
  "source_id": "00000000-0000-0000-0000-000000000001",
  "article_sha256": "<exact hash returned by prepareCollection>",
  "bindings": [{
    "family": "case",
    "key": "case-17",
    "resolution_id": "fixture-resolution-1",
    "resolution_version": "1",
    "span": {"field": "body_text", "start": 0, "end": 9, "quote": "Orchestra"}
  }]
}
```

This is a synthetic shape example, not a real entity resolution. Allowed families
are `entity`, `graph_event`, `comparison_event`, `primary_document`, `case`, and
`place`. Keys and resolution references are bounded nonempty string identifiers.
Namespaces are compared exactly; the same literal key in different families
does not match. Each context allows at most 32 annotations and 64 KiB.

Offsets are half-open **Unicode code-point** positions in the raw retained
`title`, `summary` or `body_text`, not JavaScript UTF-16 indexes and not positions
in cleaned text. Exact quote and article-hash mismatches fail before evaluation.
Duplicate identical annotations are deduplicated; version changes alter the
context and result hashes.

These checks prove text binding and version identity only. The module does not
query a canonical registry, authenticate an annotation producer, or prove the
annotation's semantic correctness. All outputs label the annotations as
caller-supplied and not registry-verified. Never accept these contexts directly
from a browser as authoritative. There is no automated entity extractor here.

## Proposal and verification behavior

Text selection preserves the SQL baseline's nonempty-body/summary precedence.
Only a terminal `Continue reading...` or `Continue reading…` is removed from the
selected analysis text. An emptied body does not fall back to a different summary.
Raw article fields, Unicode offsets, numbers and negation are never rewritten.
Tokenization keeps the existing ASCII lexical rules and stop list; parity tests
compare against the actual SQL function on cleaned selected-text fixtures.

| Pair condition | Result |
|---|---|
| Exact same source URL | `same_source_url`; preserve both versions without treating them as independent evidence. |
| At least two filtered shared terms, or a shared non-place typed identity | `retrieval_proposal`. |
| Proposal with a shared event, document or case annotation | `needs_semantic_verification`. |
| Proposal with only words, an entity or a place | `insufficient_bound_context`. |
| Shared place alone, or no matching signal | `no_candidate_signal`. |

`no_candidate_signal` means these retrieval routes found nothing; it is not a
semantic rejection. `needs_semantic_verification` is not support or eligibility.
Numbers and negation trigger no blanket equivalence/contradiction rule. The next
stage must inspect endpoint identity, event/date scope, polarity/modality,
quantity/unit/subject/attribution, source lineage and endpoint-bound relation
support. Every proposal lists those remaining checks.

Every result is private, publicly ineligible, and has null confidence and null
independent-source count. Outlet copies, multiple matching annotations and
agreement between retrieval routes cannot inflate support. The same exact pair
and annotation versions have the same proposal ID in either scan direction.
Unrelated arrivals do not rename existing pairs; input/context changes do.

## Server/operator integration guide

```js
import { createProposalSession } from './scripts/captureContextProposal.mjs'
const session = createProposalSession(records, contexts)
const page = session.page({ source_id: records[0].id, limit: 25 })
const next = page.next_after
  ? session.page({ source_id: records[0].id, after: page.next_after, limit: 25 })
  : null
const raw = session.input(records[0].id)
```

`manifest` exposes the frozen snapshot hash, admitted exact identities, rejected
rows and bounded coverage scope. `input(source_id)` returns a separate copy of
the raw article, source clocks, text-extent label, unknown lineage and annotations.
`page` returns `contract`, `snapshot_sha256`, source reference, `items`,
`scanned_through`, `total_targets`, `coverage` and `next_after`.

An item carries a deterministic `proposal_id`, exact left/right input references,
signals, disposition, verification state, remaining checks and private eligibility.
Raw articles are stored once in the comparison output's `inputs` collection;
pair references resolve to those exact versions. They are not duplicated across
every pair. No HTTP route, request body, headers, hook, environment variables or
browser key are required for these local function calls.

Pages scan 1..25 targets from a frozen admitted collection, without a publication
date window. Cursors bind to the source and snapshot; cross-source/stale cursors
fail. Completion means all other admitted records in this snapshot were visited,
not all external history. A newly arrived old document or revised mapping requires
a fresh session; it can introduce new proposals without changing old results.
Cursors are operator continuation data, not authenticated access-control tokens.
Sessions are in-memory and are not a durable queue or a production index.

Compare all pairs with the unchanged SQL baseline:

```text
node scripts/runCaptureContextProposal.mjs private-source.json NEW-private-result.json [private-contexts.json]
```

Use paths outside the public repository. The comparison runs the existing SQL
only in ephemeral PGlite, checks complete unordered pair enumeration and returns
numerical proposal counts with null accuracy metrics. It scans every admitted
source and deduplicates reverse pairs. At 100 admitted records this is at most
4,950 unordered pairs; it is intentionally not a corpus-scale retrieval engine.

The CLI caps each input file at 32 MiB, writes a new file exclusively at mode 0600,
and refuses existing files and symlinks. Standard output contains aggregate
counts only; error output does not echo private source text. Programmatic callers
must handle private exceptions in their own restricted logging environment.

## Frontend and database boundaries

ArticlePanel, GraphView, WorldView and InvestigationContext require no calls or
changes for this slice. These results cannot be displayed as verified edges,
events or assessments. No new public endpoint is available.

The existing `mip_capture_retrieval_v1` and `mip_assessments_v1` contracts are
unchanged. A proposal ID is not a database candidate ID and must not be passed to
`mip_assessments_v1.append`. Live integration first needs a reviewed identity
adapter, endpoint-bound source candidate creation, true queue/context positions,
and a semantic assessor. Its decisions must then pass existing eligibility gates.

No schema, migration, RLS, grant, source import, scheduler or release policy is
changed. No SQL must be applied. Keep prior migration history intact, including
the staging timestamp discrepancy; do not use blanket `supabase db push`.

## Validation and remaining gates

Synthetic regressions cover boilerplate-only pairs, ambiguous identity families,
shared actors, changed quantities/negation, exact Unicode spans, source revisions,
annotation versions, duplicate/reverse results, private output, baseline SQL
parity, late older inputs, 52-record pagination and stale-cursor refusal.

No new real-corpus accuracy measurement or independent adjudication was performed.
The private 20-record diagnostic snapshot was unavailable in this implementation
session; its previously reported counts are not presented as new measurements.
Semantic/embedding model comparison, resolved canonical identity adapters,
lineage verification, multilingual retrieval, durable indexed search, concurrent
workers, retraction propagation and public cross-surface integration remain gates.
Keep `capture-lexical-1` as the baseline while evaluating this new contract.
