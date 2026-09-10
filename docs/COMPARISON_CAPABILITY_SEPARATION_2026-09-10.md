# Isolated comparison capability-separation contract (design starting point)

**Date:** 10 September 2026  
**Status:** Isolated qualification only. Not authorization to provision roles, grant production EXECUTE, flip operating gates, or bind live runtimes.  
**Baseline:** `1dc317200b7a928fad85d06b43351b60e2a50d92`  
**Load order:** `contract.sql` → `selection.sql` → `capability.sql` under `supabase/qualification/comparison-generations/`.

## Purpose

The 10 September 2026 owner decision brief is the intended design starting point. Its full text is **not in this repository** (review limitation: missing evidence). This document reconstructs the smallest viable capability split that the brief, prior operator packets, and the 10 September prompt require, then implements **exact** RPC signatures, grants, RLS, function ownership, runtime-to-principal bindings, credential exposure, and revocation **only** in disposable Postgres.

Existing `enqueue` / `claim` / `complete` / `fail` / `select_output` remain **unbound ambient APIs**. They stay GRANT EXECUTE to `service_role`. Bound RPCs below are **not** granted to `service_role`. A process holding `service_role` still bypasses the bound contract. Tests demonstrate that session revocation blocks `worker_complete` and does **not** block `service_role.complete`.

## Roles (isolated)

| Role | Bound RPCs |
|---|---|
| `qual_public_reader` | none (RLS: `publication_history` / heads with `state='released'` only) |
| `qual_comparison_producer` | `producer_enqueue`, `retain_parity` |
| `qual_comparison_worker` | `worker_claim`, `worker_complete`, `worker_fail` |
| `qual_comparison_scheduler` | `scheduler_claim` (cannot complete or fail) |
| `qual_selector` | `selector_select` |
| `qual_publisher` | `publisher_propose`, `publisher_release` |
| `qual_membership_scorer` | `membership_auto_approve` (denied by default gate; no release path) |

Owner/superuser fixtures, **not** granted to those roles: `issue_session`, `revoke_session`, `bind_runtime`, `revoke_binding`. Production must not treat these as operator self-service.

There is **no** `publisher_withdraw` RPC. Withdrawal is `selector_select` with a null generation, which calls `follow_publication`: `withdrawn`, or `revoked` if the prior publication head was `released`.

## Operating gates

`operating_gates` is a singleton. Both flags **default false**:

- `publication_release_enabled`
- `membership_auto_approval_enabled`

`publisher_release` re-reads the publication gate **after** locking `publication_heads`. It raises `mip_publication_disabled` while the gate is false.

`membership_auto_approve` raises `mip_membership_auto_approval_disabled` while that gate is false. If the gate is flipped, the function still raises that there is no isolated release path.

Flipping a gate in qualification is an **owner-fixture test**, not production publication authorization. Tests restore both flags to false.

## Bindings and sessions

- `runtime_bindings`: `(runtime_id, principal, rpc_name)` with `revoked_at`.
- `principal_sessions`: isolated table with `revoked_at` and `expires_at`. Live `auth.sessions` on all four projects has **no** `revoked` column (has `not_after`). Mapping live Auth to this contract is an unresolved owner decision.
- Bound RPCs take `p_runtime`, `p_session`, and (for mutating work) `p_request`.
- Replay of `worker_claim` / `scheduler_claim` omits `lease_token` (`mip_request_replay_omits_token`). `request_runs` never stores lease tokens.

## Authorization-failure diagnosis

`diagnose_authorization(p_rpc)` is SECURITY INVOKER and reports GRANT / `bypassrls` for `current_user`.

`diagnose_bound_call(p_rpc, p_principal, p_session_id, p_runtime_id)` returns:

| Code | Meaning |
|---|---|
| `mip_authz_missing_session` | session row absent or arguments unusable |
| `mip_authz_revoked_session` | `revoked_at` set |
| `mip_authz_stale_session` | `expires_at` in the past |
| `mip_authz_principal_mismatch` | session principal ≠ argument |
| `mip_authz_runtime_mismatch` | session runtime ≠ argument |
| `mip_authz_unbound_principal` | no binding row |
| `mip_authz_revoked_principal` | binding `revoked_at` set |
| `ok` | binding+session would pass |

Missing GRANT EXECUTE on the **target** RPC is a catalog `permission denied`, not an `mip_authz_*` code. Tests assert that distinction.

`effective_authority()` is `diagnose_authorization('effective_authority')`.

## Publication / withdrawal / parity

- `selector_select` writes selection then `follow_publication` (`unpublished` for a generation; `withdrawn`/`revoked` for a null generation).
- `publisher_propose` requires an `unpublished` or `proposed` head with a generation.
- `publisher_release` inserts `released` only if the locked head is still `proposed` and the gate is true.
- Native CI test: concurrent withdrawal vs release; waiter observes the lock; result is `unbound publication selection`, head `withdrawn`, zero `released` rows; gate restored false. Locally **NOT TESTED**.
- `retain_parity` copies hashes and job state. Pending remains pending. This is not live Manus acknowledgement. Live Manus `source_comparison_enrichment_queue` this run: 8 `succeeded` rows, no pending.

## What this does not do

- Does not install on `qikvmopbtijoebdqosyq`, `yhbwnrtlqbjtcrrlpbge`, `niejaejtbxgakyrsntxm`, or `jfnzyvzthzqtczlxhjll` (verified absent this run).
- Does not GRANT bound RPCs to `service_role`.
- Does not enable publication or membership auto-approval in any live project.
- Does not bind Cloud Run, pg_cron, or Edge Function identities.
- Does not replace live `auth.users` / `auth.sessions`.
