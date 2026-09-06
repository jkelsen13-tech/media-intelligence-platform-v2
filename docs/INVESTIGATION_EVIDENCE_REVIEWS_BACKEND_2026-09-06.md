# Saved evidence review decisions

This batch follows PR #44, merged as `be206d7c18f9f669ce42476401b4e41f50864150`. It makes the source-link and evidence-cue lists actionable through a private review ledger, a shared review summary and exact decision history. It is a human triage workflow; full claim-lineage adjudication and verified independence remain later work.

## Behavior

An assigned reviewer explicitly saves a decision about one returned target in one saved evidence-check report. Each decision requires a rationale and 1–8 exact retained evidence references. Source links require references covering both input positions; evidence cues require their input position. Additional context references may come from that same saved observation. Viewers can read the summary and history. Opening a section never submits a decision.

| Stored decision | Product label | Meaning |
|---|---|---|
| `needs_review` | Needs review | Unreviewed by default; an explicit event can also reopen it. |
| `relevant` | Retained for follow-up | The reviewer considers this item useful for further investigation. |
| `not_relevant` | Dismissed for this investigation | The reviewer dismisses its relevance to this saved question/scope. |
| `disputed` | Disputed | A disagreement or unresolved concern needs attention. |

These are relevance decisions, not true/false verdicts, verified transmission paths, or independent-source classifications. A dismissal does not delete a cue or establish that no correction occurred. The machine report, evidence, source publication state, workspace head, assessment/confidence fields and workspace review receipt are unchanged. Independence stays unknown. No model, external retrieval, scheduler, corpus import, assignment creation or public exposure is added.

## Identity, concurrency and history

Every request carries `investigation_id`, `version_id` and `report_id`. The server verifies the complete relationship before returning data. A new version starts without these review events, even if it reuses the same observation. Reviewing an archived version remains possible; its review timestamps describe a later analyst action, never knowledge at the source date.

Events are append-only. An event records its predecessor, decision, rationale, evidence and audit principal. Saving requires a caller-generated `event_id` UUID and the exact current `previous_event_id` for that target, or explicit `null` on first review. A stale predecessor returns HTTP 409. Refresh and deliberate resubmission are required; no automatic last-writer-wins behavior is provided.

A transaction locks current membership before writing and serializes report revisions with an advisory lock. Revocation and reviewer writes serialize on the membership row. A retried event is accepted only if the principal and all decision fields match the original. A retry returns the original event, even after a later event supersedes it. Treat the response as a receipt and re-read the overview before rendering current state.

Revisions are increasing **decimal strings** within each report. An overview pins all target states to one revision. Target history is requested at that revision and paginated in descending order, 20 events per page. Newer decisions cannot enter a pinned history page. Each event retains exact evidence and rationale; overview cards contain a 240-character rationale preview instead of repeated full evidence. Actor UUIDs stay private; `authored_by_you` supports first-person labeling without exposing profile IDs.

## API

Edge function: `investigation-evidence-reviews`, JWT verification enabled. Contract: `investigation-evidence-reviews-1`. Service-only SQL RPC: `public.mip_investigation_evidence_reviews_v1`.

POST JSON, maximum 65,536 bytes:

```json
{"action":"read","input":{"investigation_id":"UUID","version_id":"UUID","report_id":"UUID"}}
```

The other actions add these required keys:

| Action | Additional input |
|---|---|
| `decide` | `event_id`, `previous_event_id` (UUID or null), `target_kind` (`source_link` or `evidence_cue`), `target_id`, `decision`, `rationale`, `evidence` |
| `history` | `target_kind`, `target_id`, `at_revision` (decimal string), `before_revision` (decimal string or null on first page) |

Only targets returned in the saved report are reviewable. Omitted or truncated targets cannot be invented from predictable IDs. References to another observation and mismatched excerpts/status values are rejected. Text references use the existing workspace shape:

```js
{ position: '123', source_field: 'summary', span_start: 2, span_end: 11,
  excerpt: 'corrected', relation: 'context', note: 'Why this passage matters.' }
```

Offsets are zero-based, half-open **Unicode code points**, not UTF-16 units. Positions remain strings, including above JavaScript's safe-integer limit. Exact metadata references use `{position, source_field:'source_status', value}` and must match a saved article record version. They cannot resolve against a live article. Rationale is nonblank and bounded to 2,000 characters; each text reference uses the existing 4,000-character excerpt and 2,000-character note limits. Duplicate references and evidence arrays over 49,152 serialized bytes are rejected.

Transport returns `{data: bundle}`; the supplied client unwraps it into `{data,error}`. Common bundle fields:

```js
{ contract_version: 'investigation-evidence-reviews-1', investigation_id,
  version_id, observation_id, report_id, access_role, publicly_eligible: false }
```

Mode-specific fields:

| Mode | Fields |
|---|---|
| `overview` | `revision`, `targets:[{target_kind,target_id,decision,latest_event}]`, `summary`, original report `coverage`, `review_scope:'returned_report_targets_only'`, `independence:'unknown'`, `assessment_effect:'none'` |
| `receipt` | `revision` (current report revision), `replayed`, `event` (the saved event; may be superseded) |
| `history` | `revision` (pinned requested revision), `target_kind`, `target_id`, `events`, `next_before_revision` (string or null) |

`summary` contains `returned_targets`, `never_reviewed`, `needs_review`, `relevant`, `not_relevant`, `disputed`. Never-reviewed is a subset of needs-review; do not add both into one total. Counts concern only the maximum 400 returned machine-report targets. Retain the original scan limits and omitted/result-capped notices from PR #44.

Auth verifies the bearer with the fixed target's Auth service, refuses anonymous users and injects the real UUID. Browser-supplied principals, roles, revision assignments and extra keys are rejected. Service credentials are sent only to the fixed target's RPC, never Auth or a caller-controlled URL. Origin stays `https://jkelsen13-tech.github.io`; responses are private/no-store. 401 means authenticate, 403 means clear inaccessible data, 409 means refresh before a new decision, 400 means invalid input, 503 means unavailable. Raw database errors stay private.

The private event table uses RLS, explicit service-only SELECT/INSERT, immutable update/delete/truncate triggers and indexed foreign keys/history queries. All SQL functions are invoker with empty search paths. Existing PR #44 migration, function and detector bytes remain unchanged.

## Deployment

Applied migration: `20260906121130_investigation_evidence_reviews_v1`. Edge function `investigation-evidence-reviews` is ACTIVE at version 1 with JWT verification enabled in `qikvmopbtijoebdqosyq`. Exact deployed Edge bytes and all three SQL function bodies match the supplied files.

## Delivery and validation

The verifier records the actual migration timestamp, deployment result, checks and hashes. Cursor records the supplied already-live backend and builds the frontend; it must not replay SQL, redeploy the function, run blanket `supabase db push`, or repair unrelated migration history.

Verification covers real SQL decision transitions, replay after supersession, stale-write conflicts, current access denial/revocation, version separation, exact pair/text/status references, bounded pinned history, role denial, immutable history, inert reads and untouched reports/receipts, plus Auth transport and client identity guards. The supplied live canary makes only temporary fixtures inside a rollback transaction. Populated signed-in live UI validation still needs a real assigned investigation; this batch creates none.
