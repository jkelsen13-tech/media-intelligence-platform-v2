# Hosted-synthetic credential operators (qik)

**Source documentation only.** This file is not a signer, not a new MIP issuer/controller, and not authorization to mint, store, or overwrite secrets.

Target: project ref `qikvmopbtijoebdqosyq`.  
`005_broker_sessions.sql` is **not a signer**. `mip_identity.issue` takes `p_token_hash` and returns a `uuid` session. It does not create, sign, or return a JWT.

Do **not** invent `iss` / `aud` / `sub` in SQL. Those values belong in owner-held mapping/key rows and in tokens the owner mints off-box against those rows.

## Two routes

### Route A — provider-accepted worker JWT (PostgREST role switch)

| Item | Verified fact |
|---|---|
| Purpose | `Authorization: Bearer` on PostgREST RPC so `SET ROLE` becomes `mip_comparison_worker_v1` |
| Algorithm | **HS256** signed with the **Supabase project JWT secret** (legacy JWT secret in project settings) |
| Required claim | `"role": "mip_comparison_worker_v1"` — exact. `host.js` also rejects any other `role` on this token (shape check only; the provider verifies the signature) |
| Typical additional claims | `iat`, `exp` (do not mint an immortal token). `iss` and/or `aud` **only if** live qik PostgREST JWT configuration requires them — copy from current project JWT/API settings; this package does not invent those strings |
| Not this token | Workload `sub`, broker session UUID, invoke token, service_role, anon |
| Operator | Owner mints off-box (dashboard JWT debugger, `jose`, or equivalent). **No in-repo signer.** Do not add a controller |
| Delivery | Edge secret `MIP_QIK_WORKER_JWT` **only if that name is absent**. Never overwrite an existing secret |
| Host config | `index.ts` reads `MIP_QIK_WORKER_JWT`. `host.js` requires `claims.role === 'mip_comparison_worker_v1'` |

Example claim shape (role required; `iss`/`aud` shown as placeholders the owner must replace from live config or omit if unused):

```json
{
  "role": "mip_comparison_worker_v1",
  "iat": "<unix seconds>",
  "exp": "<unix seconds>"
}
```

If live PostgREST is configured to check issuer/audience, add those claims using the **current qik values**, not values from this file.

Related provider identity for the public API key (not the worker JWT): `MIP_QIK_PUBLISHABLE_KEY` must be a `sb_publishable_…` key or a JWT whose `role` is `anon`. `host.js` refuses `service_role` and `sb_secret_*`.

PostgREST also needs, as **separate owner actions** after SQL install (not this commit):

- `GRANT mip_comparison_worker_v1 TO authenticator` (and only that membership, after confirming `authenticator` is the live API switch role)
- Expose schema `mip_identity` on the Data API (`host.js` sends `content-profile` / `accept-profile`: `mip_identity`)
- `GRANT USAGE` on `mip_identity` is already given to `mip_comparison_worker_v1` by 005; do not grant table DML to the worker

### Route B — workload identity token → broker session UUID

| Item | Verified fact |
|---|---|
| Purpose | Prove the owner-held workload mapping, then obtain a native `comparison_qualification.principal_sessions` UUID |
| Algorithm | **RS256 only**. `workloadIdentity.js` verifies; it does not sign |
| Key | Owner-held RSA private key whose public JWK was seeded into `mip_identity.key_versions` / `key_heads` (owner SQL fixture). Kid, issuer, validity window, and `approval_ref` are owner-chosen |
| Claims | `iss`, `aud`, `sub`, `iat`, `exp` (optional `nbf`) **must match the seeded `mip_identity.mapping_versions` row** for runtime `hosted-synthetic-qik-v1` and principal `mip_comparison_worker_v1`. Header: `alg=RS256`, `typ=JWT`, `kid` = seeded kid. Token `role` / `runtime` / `user_metadata` claims cannot grant authority |
| Mint | Owner `openssl` / `jose` against that key. **Not a new MIP controller.** Do not add a repo issuer |
| Broker operator | `EXECUTE` as `mip_identity_broker_v2` via existing `issueWorkloadSession` (`brokerSession.js`): `configuration` then `issue`. SQL `mip_identity.issue(...)` returns **session UUID only** |
| Delivery | that UUID into Edge secret `MIP_QIK_WORKER_SESSION` **only if that name is absent** |

`issueWorkloadSession` hashes the presented RS256 token and passes `token_hash` into `mip_identity.issue`. The worker never receives the RS256 token; the Edge worker uses the session UUID plus the separate HS256 PostgREST JWT.

Producer enqueue in `30_seed_runtime_and_work.sql` uses `comparison_qualification.issue_session` (owner fixture RPC) for the **producer** principal only. That is not Route B and not a worker session.

## Invoke token (not a JWT signer)

`host.js` requires `Authorization: Bearer <invokeToken>` and an empty body. Secret name: `MIP_QIK_WORKER_INVOKE_TOKEN`. Opaque bearer. Gateway `verify_jwt` for this function is incompatible with that opaque bearer (`verifier/news-intake/QIK_HOST_RESUMPTION_CANDIDATE.md`). Owner-gated deploy must set `verify_jwt=false` for `source-comparison-generation-candidate` only, or refuse deploy.

## Edge env names (`index.ts`)

Create **only missing** names. Never overwrite.

| Secret | Meaning |
|---|---|
| `MIP_QIK_WORKER_RPC_URL` | `https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/` (must be https, path ends with `/rest/v1/rpc/`) |
| `MIP_QIK_PUBLISHABLE_KEY` | publishable or anon JWT |
| `MIP_QIK_WORKER_JWT` | Route A HS256 worker JWT |
| `MIP_QIK_WORKER_INVOKE_TOKEN` | opaque invoke bearer |
| `MIP_QIK_WORKER_SESSION` | Route B session UUID from `mip_identity.issue` |
| `MIP_QIK_WORKER_RUNTIME` | must equal seed `hosted-synthetic-qik-v1` |
| `MIP_QIK_WORKER_IMPLEMENTATION` | must equal seed `hosted-synthetic-event-projection-v1` |

No `SUPABASE_SERVICE_ROLE_KEY` fallback exists in `index.ts`.

## Disposable executable procedure (PGlite / local only)

`60_disposable_credential_session.mjs` is the executable procedure for **disposable** databases. It does not mint HS256 with a project JWT secret (no in-repo signer). It:

1. **Route A shape only:** `shapeWorkerJwt('mip_comparison_worker_v1')` — dummy three-part JWT for `host.js` role check, same pattern as `tests/qikWorkerHost.test.mjs`. Live Route A remains owner mint with the project JWT secret; see table above and `liveHs256WorkerJwtSpec()`.
2. **Route B executable:** generate RSA-2048, `seedDisposableIdentity` into `mip_identity.*` (test-only `iss`/`aud`/`kid`/`sub`; never written by install SQL), `mintWorkloadRs256`, then existing `issueWorkloadSession` as `mip_identity_broker_v2`. `mip_identity.issue` returns a session UUID only → `MIP_QIK_WORKER_SESSION` analogue in the test host config.

Do not import this helper into Edge `index.ts`. Do not copy disposable `https://qualification.invalid` claims onto live qik.

## Owner seed of identity rows (not this SQL package)

After 005, the owner inserts `mip_identity.key_versions` / `key_heads` / `mapping_versions` / `mapping_heads` for runtime `hosted-synthetic-qik-v1` and principal `mip_comparison_worker_v1`, using owner-chosen `issuer`, `audience`, `subject`, `kid`, and JWK. This hosted-synthetic package **does not** write those values so it cannot invent JWT identity claims in SQL.

**Smallest remaining owner action before hosted qualification (not performed this phase):** mint Route A HS256 (`role=mip_comparison_worker_v1`) with the qik project JWT secret; seed live `mip_identity` key/mapping rows with owner-chosen claims; run `issueWorkloadSession` as `mip_identity_broker_v2`; create **absent** `MIP_QIK_*` secrets only; `GRANT mip_comparison_worker_v1 TO authenticator`; expose `mip_identity` on the Data API; deploy with `verify_jwt=false` for this function only. Requires pasted stage 3/4 allowance. This phase does not apply SQL, deploy, or write secrets on `qikvmopbtijoebdqosyq`.
