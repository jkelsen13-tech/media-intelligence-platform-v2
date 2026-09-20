# Edge Function authorization gates (not deployed)

## Immediate containment

Deploy deny-all versions of both functions after explicit owner authorization:

| Project | Function | Reviewed version | Reviewed SHA-256 | Deny-all response |
|---|---|---:|---|---|
| yhb | `backfill-legacy` | 9 | `5cd76641e068fb512c9d0815f9d35325a9806be11593829df1daf62f87de8f68` | 503, stable `owner_containment` code |
| nie | `policy-ingest` | 16 | `f18ec228daf35dd5001a436c1299a1229bab32fcc1657179bf44d0ef5c6143ef` | 503, stable `owner_containment` code |

Preserve those exact deployed bodies for rollback. Do not invoke either
function to test containment; use negative requests only after the deny-all
deployment.

## Required gate before any later re-enable

For yhb, create `BACKFILL_LEGACY_RUN_KEY` and require
`x-backfill-legacy-key`. For nie, create `POLICY_INGEST_RUN_KEY` and require
`x-policy-ingest-key`. Credential creation/rotation is a separate owner gate.

The following sequence must be the first code in each request handler:

```ts
if (req.method !== 'POST') {
  return Response.json({ ok: false, code: 'method_not_allowed' }, { status: 405 })
}
const expected = Deno.env.get('<FUNCTION>_RUN_KEY')
const supplied = req.headers.get('x-<function>-key')
if (!expected || !supplied || supplied !== expected) {
  return Response.json({ ok: false, code: 'forbidden' }, { status: 403 })
}
// Only after this point: read SUPABASE_SERVICE_ROLE_KEY, createClient,
// loadConfig, fetch external data, inspect mode/reset, or mutate state.
```

A constant-time comparison helper is preferred if available in the Edge
runtime. Do not log either credential. Keep the gateway JWT requirement as an
additional layer; it is not the application authorization decision.

## Mandatory verification

- GET/PUT/OPTIONS and missing/wrong header: no service client, config read,
  fetch, or write; 403/405/503 as appropriate.
- Legacy anon and authenticated JWTs without owner secret: denied.
- Correct owner secret plus intended runtime identity: reaches only the
  explicitly tested non-destructive mode.
- Yhb `reset=1`: separately disabled unless a distinct destructive-operation
  gate, backup receipt, reviewed plan, and owner authorization exist.
- Row counts/hashes, schedules and source enablement remain unchanged during
  auth-only deployment.
- Runtime logs expose stable result codes, never secret values.
