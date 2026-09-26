# Spatial runtime capability adapter

This adapter upgrades the deployed `spatial-runtime` without altering the
registered v6 source snapshot. It replaces the v6 profile-existence query at
the same in-transaction gate with
`public.spatial_runtime_operation_allowed(auth_user_id, operation)`.

Deployment composition:

- `handler.ts`: this adapter;
- `base-handler.ts`: exact bytes of
  `runtime-snapshots/spatial-runtime-v6/handler.ts`;
- `index.ts`, `config.ts`, `canonical.ts`, `operations.ts`, `jcs.ts`,
  `sha256.ts`, and `deno.json`: exact bytes from the v6 snapshot.

The migration initially grants `write`, `review`, and `release` only to the two
confirmed, non-anonymous principals who already had profiles at migration time.
This preserves the preexisting caller set while ending the rule that every new
self-created profile automatically receives all spatial authority. Subsequent
grant or revoke operations are production authorization changes and must record
the acting owner and reason in the append-preserving capability table.

Residual boundary: the hosted function still possesses a shared direct-wire
role that can execute the underlying append functions. The adapter fixes the
external self-service escalation; it does not claim that compromised function
code has been reduced to a per-user database principal.
