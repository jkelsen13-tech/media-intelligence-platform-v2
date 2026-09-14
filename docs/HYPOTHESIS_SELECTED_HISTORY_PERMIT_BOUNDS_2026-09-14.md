# Selected saved history and bounded permit metadata

This isolated follow-up to PR172 builds on `e973a2a4fa413c452e8ab48800587a248be3eb4f`. It addresses the history-materialization and permanent-payload-storage findings. Production admission remains false; cancellation and transport are still unresolved.

## Selected history

The private selected reader filters investigation and revision IDs in its first revision query. It checks selected cardinality before loading assessments, visits at most 128 selected revisions, preserves ascending revision order, and applies acceptance provenance and current permissions, reassessment closure bindings, generation closure bindings, and method-head freshness. It does not call the whole-investigation readers. Individual assessments and the accumulated available response are checked against the 1 MiB limit, followed by the final envelope check. These limits bound selected response construction, not arbitrary database plans, underlying retained-material size, database administrator behavior, or all physical memory.

A deliberately malformed binding on a later, unselected revision is an adversarial test: the existing whole-history reader fails on it while the selected route succeeds. The test also requests 129 selected rows and checks private-function ACLs. Copies are explicit disposable fixture fault injection, not valid authored assessments.

## Permit metadata and custody

Permit storage contains a SHA-256 digest, byte count and entry count of the authorized JSONB response instead of its text or rationale. Consumption recomputes the selected current-permission response and compares all three values before disclosure. Savepoint replay retains the same PID, transaction, permit identity, scope, original expiry and response fingerprint. Cryptographic digest equality replaces retained JSONB equality; no collision-proof mathematical claim is made.

A trigger serializes inserts through one transaction advisory lock and caps retained rows at 1,024 globally and 32 per user, including expired rows that have not been deleted. Each metadata row is capped at 32 KiB. Issuance acquires that lock before source and permission locks and first invokes bounded cleanup. Cleanup removes at most 256 expired rows ordered by expiry/ID and skips locked rows. Consumption does not acquire the quota lock. Fresh rows cannot be deleted through the guard. Table truncation remains denied.

Only the distinct NOLOGIN, NOINHERIT, NOBYPASSRLS cleanup role can execute the cleanup entrypoint; it receives no table access, issuer permission or consumer permission. The function is owned by the existing private owner with empty search path and forced RLS. Issuer and consumer remain table-blind. Tests race two final user-quota inserts and two final global-quota inserts, hold an expired row locked across cleanup to prove SKIP LOCKED behavior, reject early deletion of consumed rows, check cleanup/guard owners and ACLs, and require exactly one success, verify metadata has no payload, reject fresh deletion, inspect role access, and invoke cleanup after natural expiry.

The ten-second authorization lease is distinct from physical erasure. The caps are database-enforced logical row limits. A deployment must admit an independently managed cleanup scheduler (maximum 60 seconds between runs), monitor failures, and qualify vacuum, backups, WAL and retention policy before claiming physical erasure. No scheduler or production cleanup custodian is configured here. Opportunistic cleanup does not prove deletion while idle; quota exhaustion fails closed.

## Remaining boundaries

The PR172 coordinator still accepts arbitrary custody/issuer/transaction adapters and an arbitrary callback. Its timer and AbortSignal do not independently cancel noncooperative work, and cleanup can still await such work indefinitely. Its callback cannot enforce an absolute pre-write deadline during a synchronous stall. A separate slice must implement explicit finite operation deadlines/cancellation contracts and a concrete narrowly admitted transport whose writes check the absolute lease. Real Auth session freshness, custody independence and transport admission remain unqualified.

Every source/history/publication flag remains false. This is no live migration, deployment, merge, credential provision or release approval. The prior failed reviews and their evidence remain preserved in PR172's documentation.

## Verification

This component branch is not a combined frontend/backend candidate. Green checks on it do not prove integration with PR171, PR170, other backend branches, or deployed Supabase. The pull-request evidence ledger must record this exact base, proposed head, GitHub-tested merge commit and tree, and the workflow run IDs; a combined candidate needs a single reconciled tree and cross-layer tests. At preparation time the base is `e973a2a4fa413c452e8ab48800587a248be3eb4f`, reviewed implementation parent is `58e03bcea0a26643ad4d0dda142821835eb79140`, and no merge commit or hosted result exists yet.

Native GitHub CI must install SQL023 and exercise the new groups. Generic SQL concurrency checks do not install this file and cannot prove this change. New results must be attached to the resulting commit; none are predeclared passed.

Current Supabase documentation checked: [function privileges and empty search paths](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and [explicit Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically). No public grants are added.
