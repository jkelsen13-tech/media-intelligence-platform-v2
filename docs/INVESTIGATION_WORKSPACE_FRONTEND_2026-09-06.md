# Coordinated frontend integration: five investigation sections

Build Overview, What Changed, Hypotheses, Commitments and Evidence Gaps in one reviewed frontend PR against `investigation-workspace-1`. The backend migration and Edge Function are already deployed. The included data client is implemented but not mounted. Preserve its API and tested backend bytes; frontend integration is the remaining work for this batch.

## Product and placement

Reuse the existing calm investigation workspace, typography, spacing, inspector and mobile behavior. Inspect `src/components/InvestigationWorkspace.jsx`, its `src/App.jsx` integration, `src/lib/investigationContext.js`, `src/lib/investigationSurface.js` and `src/lib/auth.js` before changing navigation. Add a discoverable private investigation entry using the current account/session system. Keep private investigation selection separate from the public canonical graph selection while using existing navigation callbacks for eligible shared entities.

The question is the primary title. Show the displayed revision, when its observation was saved, and whether it is the current saved version. Explain that newer collection may exist outside this saved version. Keep all five sections on one bundle. Do not issue separate per-section reads that can mix revisions.

| Section | Data | Required interaction and meaning |
|---|---|---|
| Overview | `version.state.question`, scope, time range, unresolved questions; selected assessments | Explain the question and current recorded assessment state, with rationale and remaining uncertainty. Never manufacture an overall answer or confidence score. |
| What Changed | `comparison`, explicit review receipt | Compare with the user's reviewed version. Open exact before/after versions and excerpts. Mark the displayed version reviewed only on an explicit action. |
| Hypotheses | `version.state.hypotheses` | Show alternatives, assumptions, support/contradiction/context excerpts and what would strengthen or weaken each explanation. |
| Commitments | `version.state.commitments` | Show prerequisites and branches, evidence per stage, conditions, deadline wording and success criterion. Preserve unknown and no-follow-up states. |
| Evidence Gaps | `version.state.coverage`, unresolved questions | Show declared source classes, languages, regions, period, retained text, search status, method and limitations. Explain observation gaps separately from conflicting evidence. |

Hypotheses, commitment stages and collection declarations are private analyst records. Their source bindings are checked; the API does not automatically verify their semantic judgments. There is no browser question editor, assignment editor, hypothesis editor, commitment editor or search-run action in this contract. Deliver read/drilldown and explicit review; do not add nonfunctional editing buttons.

## Authenticated HTTP contract

Endpoint: `https://qikvmopbtijoebdqosyq.supabase.co/functions/v1/investigation-workspace`.

Use the existing configured Supabase browser client and session. `functions.invoke` supplies the session token; do not embed credentials. The function accepts POST JSON with `{action, input}`. The only allowed browser Origin is `https://jkelsen13-tech.github.io`. Local visual tests use an injected local fixture client; do not expand production CORS for preview hosts without a separately reviewed deployment.

```js
import {
  createInvestigationWorkspaceClient,
  investigationWorkspacePanels,
  resolveWorkspaceExcerpt,
} from './lib/investigationWorkspaceClient.js'

const client = createInvestigationWorkspaceClient(supabase)
const catalog = await client.list({ limit: 20 })
// Load more with { limit: 20, after: catalog.data.next_after } when has_more.
const result = await client.read(investigationId) // current saved head
const historical = await client.read(investigationId, versionId)
const panels = investigationWorkspacePanels(result.data)

// Run only after the reviewer explicitly clicks on the displayed version.
const reviewResult = await client.markReviewed({
  investigationId: result.data.investigation_id,
  versionId: result.data.version.id,
  receiptId: crypto.randomUUID(), // retain the same request for network retries
  previousReceiptId: result.data.review?.id ?? null,
})
```

Client methods return `{data, error}`. The wire success envelope is `{data: result}`. HTTP input keys are exact:

| Action | Input |
|---|---|
| `list` | `{}` or `{after:UUID\|null, limit:1..50}` |
| `read` | `{investigation_id:UUID, version_id?:UUID}` |
| `mark_review` | `{investigation_id:UUID, version_id:UUID, receipt_id:UUID, previous_receipt_id:UUID\|null}` |

Never send `user_id`, `access_role`, `put`, or `set_access`. The server obtains identity from Auth. HTTP bodies are bounded to 8 KiB. Use the same public Supabase key already configured by the app; a public anon key alone is not a signed-in user.

### List response

```js
{
  contract_version: 'investigation-workspace-1',
  items: [{ investigation_id, version_id, revision, question,
            access_role, reviewed_version_id }],
  has_more: false,
  next_after: null,
  publicly_eligible: false,
}
```

Only assigned, non-revoked investigations appear. UUID keyset pagination is not a frozen catalog snapshot. Deduplicate IDs when appending pages, reset the catalog on account changes, and provide an explicit refresh. Do not infer the number of unseen changes from a revision difference.

### Read response

```js
{
  contract_version: 'investigation-workspace-1',
  investigation_id, head_version_id, access_role,
  version: { id, investigation_id, revision, predecessor_id,
             observation_id, state, change_reason, recorded_at },
  observation: { /* exact retained PR #42 observation, including snapshot */ },
  review: null, // or receipt without user_id
  comparison: {
    mode, before_version_id, before_observation_id,
    after_version_id, after_observation_id,
    evidence_changes, definition_changes,
  },
  publicly_eligible: false,
  annotation_status: 'private_analyst_record',
}
```

`investigationWorkspacePanels` provides a pure mapping and filters assessment rows to `selected_assessment_ids`. Dependency assessments remain available in the snapshot for explanation; do not mix them into the selected assessment list. Reject an unsupported contract version with a clear unavailable state instead of guessing field mappings.

### Comparison modes

| Mode | Display |
|---|---|
| `not_reviewed` | No personal baseline. Show current records; do not say everything is new. Offer an explicit review action to reviewers. |
| `comparable` | Evidence and definition changes since the named reviewed version. Empty changes mean these saved records are unchanged. |
| `scope_changed` | Candidate scope differs from the review baseline. Explain that comparison is unavailable and show both scope/version references. |
| `historical_before_review` | This version predates the current review marker. Display history without reversed change counts or an action that moves the baseline backward. |

`definition_changes` contains `{added, removed, updated}` ID arrays for hypotheses, commitments and coverage plus `question_changed`, `scope_changed`, `unresolved_questions_changed`. A removed object is available in `client.read(investigationId, before_version_id)`. The reference implementation and PR #42 docs define `evidence_changes`; consume their actual structure instead of deriving changes from timestamps or counts.

For a changed candidate scope, evidence comparison is unavailable; forward definition changes can still be returned and shown as edits to the recorded investigation. Keep that distinction visible.

Use precise labels for PR #42 changes: evidence entered the observation; assessment added; dependency state changed; assessment replaced. A correction can make an assessment stale without producing a replacement. Do not label every correction a contradiction, every new citation confirmation, or dependency invalidation completed recalculation.

`evidence_changes` is an array when comparable, otherwise null. Each item has the following fields:

| `kind` | Other fields |
|---|---|
| `evidence_entered_observation` | `position` (decimal string) |
| `assessment_added` | `assessment_id`, `candidate_id` |
| `assessment_dependency_change` | `assessment_id`, `candidate_id`, `before_stale`, `after_stale`, `before_causes`, `after_causes` |
| `assessment_replaced` | `candidate_id`, `before_assessment_id`, `after_assessment_id`, `before_outcome`, `after_outcome` |

The snapshot contains `scope_candidate_ids`, `selected_assessment_ids`, `candidates`, `assessments`, `inputs` and `watch_keys`. Inputs have `{position, queued_at, capture, record_version}`. Its `coverage: 'complete_for_explicit_scope'` describes retained dependency closure, not real-world collection completeness. Evidence Gaps must use `version.state.coverage`, whose declarations retain their explicit limits.

### Review behavior

The successful result is `{id, investigation_id, version_id, previous_receipt_id, recorded_at}`. Reviewers alone can mark a version reviewed. Readers have no such button. Do not mark on mount, navigation, scroll, tab switching, visibility, polling or successful fetch.

Capture the displayed investigation/version, current receipt and a new receipt UUID at click time. Disable duplicate clicks during that request. Retry a transport failure with exactly that same request; do not mint another UUID or replace its version with a newer head. After success, refresh the bundle and catalog only if the same user and investigation remain active. If a newer version arrived meanwhile, it remains pending review. On a 409 conflict, reload and explain that the baseline changed; require a fresh explicit decision. Do not silently acknowledge the newly loaded version.

## Evidence and navigation

Use `resolveWorkspaceExcerpt(bundle, reference)` for quoted text. It resolves raw capture/record-version input and uses half-open Unicode code-point offsets. Keep bigint positions as strings; JavaScript `Number` loses precision. If it returns null, show an unavailable citation rather than another similarly named source. Render source text as text, never HTML. Show retained source/version identity and available source/recording dates; null dates stay unknown.

A before/after citation must resolve against its own version's observation, not the current bundle. Opening a citation should select the relevant section/inspector and existing eligible entity navigation when available. `canonical_subject.type === 'graph_node'` is generic: resolve the ID through the existing eligible public node lookup and route via existing subject/context handlers. Do not cast `graph_node` into an event/person type, inject private graph nodes or add private workspace payloads to `investigation_surface_public` or public World View datasets. If the graph identity is unavailable publicly, retain the private question and explain that its public graph view is unavailable.

`state.time_range` describes source/event context. It is not `investigationContext.as_of_time` or proof of historical database reconstruction. Reuse existing time-selection handlers only with an explicit semantic mapping. The existing display context and the immutable investigation version have distinct purposes.

## Loading, access and privacy states

- Session still loading: show a loading state without starting private requests.
- Signed out: show the existing sign-in entry and a short explanation of private investigations.
- Signed in, empty catalog: “No investigations assigned yet.” No fake cards, fixtures or automatic assignment.
- Assigned investigation with empty sections: explain “No hypotheses recorded” or the corresponding section state. Empty does not mean disproven, zero uncertainty, no activity or a completed search.
- 401 / `authentication_required`: clear private state and invite sign-in again. The gateway sometimes returns its own 401 before the handler; the included client normalizes it.
- 403 / `access_denied`: clear the affected bundle and show unavailable access. Do not reveal whether a guessed investigation ID exists.
- 409 / `version_conflict`: preserve the user's intent, reload the current baseline and request a fresh explicit review action.
- `origin_denied`, `not_configured`, unsupported contract, 503 / `service_unavailable`, or transport failure: show an honest unavailable/retry state; never use a production fixture fallback.

Keep private content only in memory. Clear bundle, catalog, before-version cache and pending review state when user/session changes or signs out. Track a request generation keyed to user, investigation and selected version; discard late responses from previous accounts or selections. Invalidate outstanding requests on unmount. Do not cache private source content in localStorage, IndexedDB, service workers, analytics, public route metadata or browser persistence of recent investigations. URLs may carry opaque investigation/version IDs only if reload still performs authorized reads; never put excerpts or tokens in the URL. The handler uses `Cache-Control: private, no-store` for its responses.

## Frontend acceptance and review

1. Restore the exact manifest files before implementing UI. Use one integration owner for App/workspace state and request lifecycle. The five sections can be implemented concurrently against the fixed shared bundle without editing the live backend contract.
2. Add meaningful component/integration coverage for signed-out and unassigned states, populated five-section rendering from local fixtures, late account/selection responses, denied access, exact before/after excerpts, historical/scope-change modes and explicit review retries/conflicts. Do not persist fixture data in production.
3. Demonstrate on a mobile viewport and desktop: reachable sections, legible question/scope, keyboard focus, touch targets, long source excerpts, loading/empty/error states, and no clipped inspector or horizontal overflow. Reuse existing responsive patterns.
4. Run the focused backend tests, frontend tests, full `npm test` and `npm run build`. This backend batch's reference counts are 25 focused / 969 total; added frontend tests should increase the actual count. Report real results and existing build warnings separately.
5. Open one draft PR registering the already-deployed backend and implementing the five frontend sections. Report restored-file checksums, added frontend paths, screenshots and tests. Do not merge.
6. After review and user-authorized merge/deployment, inspect the actual live page. Green CI and Pages deployment alone do not verify the five visible sections. A real assigned-user HTTP and populated live UI check requires the user's genuine session plus a real investigation and explicitly verified assignment. Record that limit if unavailable; do not impersonate the user.

The deployment verifier intentionally records no persistent investigations or assignments. A truthful empty frontend can be delivered now; populated local fixtures demonstrate the connected UI until a real investigation is curated and assigned. Frontend readiness, deployed backend readiness and real-data analytical validity are separate results and must be reported separately.
