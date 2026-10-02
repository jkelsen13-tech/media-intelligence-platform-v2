# Private investigation Following: nondeployed source candidate

This candidate supplies a private subscription and acknowledgment cursor as an unapplied source proposal. It is not the proposed public Story Following product, an installed schema, a gateway route, an in-app notification delivery service or an automatic materiality classifier. Declaration ownership/materiality remains provisional and requires architecture approval before installation or product activation. No live install, real account, credentials, provider purchase or notification dispatch was used.

Frozen lane parent: `0d378f58ea732bbde2d3e8a1d5c66b70cf6a75a5`. The Following delta changes no historical migration, gateway/SDK registration, App or public reader. It depends on existing retained investigation, observation, assessment and workspace foundations and can operate without another proposal. October 2 combined source retains it provisionally as an unapplied proposal; other independently qualified lanes change App. Combined qualification additionally applies the relevance proposal first and exercises Following against that actual shared snapshot/diff owner.

## Requirement and existing owner

| Requirement | Existing owner / bounded extension |
| --- | --- |
| Authorized identity | Existing Auth verifier supplies the UUID; existing investigation membership verifies assignment on each database operation. New handler receives those owners by injection. |
| Stable private anchor | Existing investigation UUID and an explicit retained `canonical_subject = {type: graph_node, id}`. Null subject, foreign version and changed current subject fail closed. A question is never substituted for a public story. |
| Exact versions | Existing immutable investigation versions and observation snapshots. Subscription stores original anchor version and monotonic last acknowledged version. |
| Durable preference | New `investigation_follows`, independent of panel pin, device visit and substantive review receipts. Supported states are active, unsubscribed and revoked. No preferences for external channels. |
| Idempotency / stale writes | New append-only event receipts with caller-selected UUID, request fingerprint, same-user predecessor and compare-and-swap current event. Membership and preference locks serialize affected writes; receipt-ID advisory locks serialize identity collision checks. |
| Revocation | Existing membership assignment remains authoritative. Its revocation trigger atomically records a private subscription revocation. Assignment restoration leaves the subscription revoked until explicit fresh-baseline subscribe. |
| Materiality | Provisional explicit authorized-reviewer declaration with reason over an exact nonempty retained predecessor diff. Existing definition/observation diff functions compute the diff; no score, LLM, inferred truth or new automatic policy. |
| First delivery surface | Private bounded read projection only. Consumer must explicitly read. No notification delivery mechanism is claimed. |

The basis is the Library clarification lines 52–62 and the complete consultation reconciliation / News Reader acceptance texts (`04` and `07`) retained under `/workspace/mip-convergence-inputs`. Existing workspace blueprint and private API source establish the owner boundaries above.

## Private API

`public.mip_investigation_following_v1(action,input)` is `SECURITY INVOKER`, with an empty search path and service-role execution only. Browser roles cannot invoke it or access its tables. RLS is enabled without browser policies; the trusted service role retains the existing bypass and server-injected identity responsibility. The SQL cannot prove that an arbitrary service-role caller verified Auth; installing an authorized server binding remains an integration gate.

User-facing actions, all strictly allowlisted:

- `list`: injected `user_id`; optional UUID `after`, limit 1–50 (default 20). Returns active, assigned subscription metadata, bounded continuation cursor. It is not an unread count or delivery list.
- `read`: injected `user_id`, `investigation_id`; optional limit 1–50. Returns the private contract, preference state, exact head pointers, anchor match, version advance, registered changes, `has_more` and explicit unclassified-version indicator.
- `subscribe` / `acknowledge`: injected `user_id`, `investigation_id`, new `event_id`, expected `previous_event_id` (null for initial subscribe), exact displayed `version_id`, explicit `subject_id`. Re-subscribe requires the latest event, preserves the original anchor version and cannot move acknowledgment backwards. Acknowledgment requires an active subscription.
- `unsubscribe`: injected user/investigation and new event/expected predecessor. It suppresses material changes and active listing.

Only the trusted private server RPC can perform `revoke` or reviewer-assigned `register_material_change`. They are excluded from the new consumer boundary. Registration requires `change_id`, `before_version_id`, `after_version_id`, `materiality_reason` and injected reviewer identity. Versions must belong to the same investigation, be immediate predecessors, share the same nonnull canonical subject and identical observation candidate scope. The diff is computed from retained versions/snapshots, never supplied by the caller. Empty retained diffs are refused. One declaration per transition is enforced; exact retries return the original declaration, altered retries fail. Declarer identity is retained privately for audit and excluded from returned declaration objects.

Event retries return immutable historical receipts, even after later preference changes. They are not current subscription state. Consumers must reread to learn current state; there is no automatic retry or cache. Current assignment is checked before returning a receipt, so revocation cannot be bypassed by a historical retry.

The unbound handler (`supabase/source-proposals/investigationFollowingHandler.mjs`) reuses the established private request boundary and accepts injected `authenticate`/`rpc` only. It carries no target URL, transport, credentials or gateway registration. It limits request bodies to 8 KiB, rejects identity/admin fields, verifies nonanonymous UUID identity, returns no-store responses and fixed error codes. The new client (`src/lib/investigationFollowingClient.js`) accepts an explicit `call` only and snapshots inert request primitives before asynchronous execution. Construction makes no request. Errors never return stale data or exception text.

## Coverage and acknowledgment semantics

The response always marks `publicly_eligible: false`, `scope: private_investigation` and `coverage: registered_material_changes_only`. Materiality is labeled `authorized_reviewer_declaration`. A reason records the declaration, not evidence of truth, publication, independence or public eligibility.

Versions beyond the acknowledgment cursor without a material declaration set `unclassified_version_changes: true`, including unchanged saved revisions. This means classification is unknown; it neither calls them immaterial nor claims complete coverage. An empty `changes` array is never a complete “no material change” result.

Changes are bounded and ordered by retained after-version revision. `has_more` discloses truncation. The consumer can explicitly acknowledge the last inspected exact version and reread to progress; there is no implicit page-draining acknowledgment. Acknowledging an older displayed version while newer versions exist preserves the newer changes. A review receipt does not advance Following, and Following does not create substantive review receipts. A later declaration at or before the cursor is treated as within the already acknowledged version range; declaration-arrival tracking is not implemented and must not be advertised.

If the head canonical subject changes or becomes null, read reports anchor mismatch and suppresses changes; subscribe/acknowledge refuse the mismatch. Scope changes are never declared as comparable evidence diffs. Assignment revocation denies read/write immediately under the next statement's authorized snapshot, removes active listing and records subscription revocation in the same transaction; transaction rollback preserves both previous assignment and subscription.

## Qualification and limits

Targeted `tests/followingFoundation.test.mjs` runs actual PGlite/PostgreSQL functions with synthetic retained evidence and `service_role`, viewer/reviewer/outsider assignments. It covers exact retries/conflicts, stale baselines, independent users, exact nonempty declaration, historical late correction, bounded reads, displayed-version acknowledgment, review separation, unsubscribe/re-subscribe, explicit and membership revocation, revocation rollback, anchor refusal, malformed/foreign input, browser-role denial, immutable audit rows, injected consumer identity, fixed error redaction and mutable-input snapshot binding. This is source qualification, not proof of deployed access policies, independent multi-session concurrency or live adapter behavior.

The initial local qualification reproduced a PL/pgSQL list alias ambiguity; the candidate fixes it with a distinct table alias. The corrected tests exercise the active list and revoked/unsubscribed empty lists. Qualification passed 17 new tests and 33 existing workspace/private gateway tests in separate scopes. The normal build passed with the existing large-chunk warnings; receipts reside in `/workspace/mip-following-foundation-receipts`.

Remaining external/architecture prerequisites:

1. Architect approval of explicit reviewer declarations and their materiality ownership. No routine implementation choice silently creates editorial policy.
2. Separate approved installation and existing Auth/authorized RPC binding; the source-only handler/client cannot connect on its own. Existing gateway source/manifest is unchanged.
3. Stable eligible-reader public story/subject anchors, immutable public reader versions and an audience/privacy envelope before any public Story Following UI. Private investigation identity supplies none of these guarantees.
4. A separately reviewed in-app presentation/delivery contract, revocation refresh behavior and complete pagination policy before product claims. Current source has neither a mounted UI nor notification delivery.

No applied migration was edited. Nothing here authorizes deployment or public launch.
