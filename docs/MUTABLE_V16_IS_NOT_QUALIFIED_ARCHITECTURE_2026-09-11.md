# Mutable v16 runtime is not the qualified generation architecture

**Date:** 11 September 2026  
**Status:** Architecture reconciliation. Not a live deploy, not a v15/v16 byte proof, not production cutover.

The repository contains two different comparison designs. Treating them as equivalent because both exist in the same tree is incorrect.

## What isolated qualification is

`supabase/qualification/comparison-generations/contract.sql` retains an immutable generation, leases one job, and acknowledges **that generation’s** exact output (or an explicit failure). `capture_source` / `complete` are never a blanket queue update. This package is **not** a migration and is **not** installed on live projects.

## What repo snapshot `source-comparison-run-v16` is

`supabase/runtime-snapshots/source-comparison-run-v16/index.ts` is a **mutable rebuild** worker:

- `rebuildProjection` deletes then inserts derived `claims` / `article_claims` / `explanations`.
- Non-dry-run scheduled runs call `acknowledgeProjectionQueue`, which marks **all** `source_comparison_enrichment_queue` rows with `state='pending'` as `succeeded`.
- Inputs are assembled from separate paged reads (`buildEventInputs`), not from `comparison_qualification.capture_source`.
- Writer auth still uses `SUPABASE_SERVICE_ROLE_KEY` and `Bearer ${serviceKey}`.

It does not call `comparison_qualification` APIs.

## What this does not prove

Live Manus is recorded in the review packet as **v15**. Byte equality of live v15 vs this v16 snapshot is **NOT TESTED** in this change. Folder name `v16` vs `RULE_VERSION` / `EVENT_PROJECTION_RULE_VERSION` strings is a reconciliation question, not proof of different live bytes.

Passing isolated generation tests does **not** qualify the disclosed v16 runtime. A production replacement must complete a retained generation and must not acknowledge sibling pending rows. That worker is not this v16 snapshot and is not a rename of `comparison_qualification.*`.
