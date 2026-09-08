# Survivor comparison membership guard

This batch restores one missing collector prerequisite on qikvmopbtijoebdqosyq.
Approval belongs to the reviewed event/article membership. A new member, removed
member, event reassignment, or replacement article in the same event returns
affected approved events to pending_review. The existing public comparison view
already requires approved membership and remains unchanged.

The legacy trigger only watched event_id updates. The regression reproduces an
article_id replacement retaining stale approval under that old migration, then
proves the survivor guard closes the gap.

Before changing approval, the guard retains the full prior event row and the
triggering membership row before/after in mip_private.comparison_membership_history.
History is private, RLS-enabled and append-only. Worker privileges permit reading
but not forging, updating or deleting it. Trigger functions have empty search
paths and no direct browser/worker execute grants. No cascading foreign keys can
erase history. Membership TRUNCATE is rejected rather than bypassing row guards.

The AFTER trigger ignores no-op identity updates and does not run for an insert
discarded by ON CONFLICT DO NOTHING. Constraint failures and explicit rollback
remove both invalidations and new history. A move locks affected event rows in
UUID order; deadlock/serialization failures must be retried as entire transactions,
never acknowledged as completed work.

This is approval-invalidation history, not a complete membership-version stream
or a reviewer-identity ledger. Metadata-only edits, article-content revisions,
stale external approval writers and bulk multi-connection schedule concurrency
remain separate reconciliation requirements. No existing approvals are reclassified
by applying the migration. No reviewer, source, membership or historical row is
deleted. No worker or scheduler is activated or moved.

Four focused PGlite regressions cover the old counterexample, mutation scope,
no-op/duplicate/rollback behavior, and private immutable-history boundaries.
Production installation requires successful tests/build, reviewed migration,
before/after catalog/data verification and post-merge live browser verification.

The [final consolidation gate](BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md)
remains INCOMPLETE. Missing collector tables, remaining write guards, immutable
worker outputs, ingestion/history deltas and runtime cutover remain open.
No legacy project is SAFE TO RETIRE. Legacy source projects are not modified.

## Installed survivor verification

Installed as migration 20260908104901; the stored SQL matches this repository
migration exactly. All 1,456 tests and Node 22/24 builds passed before installation.

The worker-role rollback check in supabase/tests/comparison_membership_history_rollback.sql
verified duplicate-insert no-op behavior, deletion invalidation, prior approval/
membership retention and exclusion from the actual comparison_public view.
Its exception subtransaction rolls back successful verification writes and also
rolls back unexpected failures. No test row or evidence change is committed;
identity sequence gaps can remain.

Before installation, after installation and after rollback, all three ordered
full-row digests (events, memberships, public comparison) matched. One event and
three memberships remain; history has zero rows after rollback. Catalog checks
confirmed RLS, private browser denial, read-only worker history access, two history
mutation guards and no direct execute grants on either trigger function.
The receipt is verifier/comparison-membership-history-2026-09-08.json.

This proves the installed bounded mutation guard. It does not certify external
review writers, multi-connection collector scheduling or full backend consolidation.
