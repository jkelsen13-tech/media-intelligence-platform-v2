# Hosted-synthetic credential operator (qik)

**Source documentation only.** This file is not a signer, not a new MIP issuer/controller, and not authorization to mint, store, or overwrite secrets.

Target: project ref `qikvmopbtijoebdqosyq`.  
`mip_identity.issue` takes `p_token_hash` and returns a **uuid** session. It does not sign JWTs.

This phase uses **disposable keys only**. This utility does not retrieve the project JWT secret, does not mint against live secrets, and does not deliver Edge secrets.

Do **not** paste project secrets into chat, git, or this tree. Do **not** sign the project secret in a browser or on a third-party website.

## Single operator route (reviewed)

Two cryptographic mechanisms, one ordered procedure. Do not substitute a second issuer.

### This phase (disposable) — exact executable path

1. SQL install via `installHostedSynthetic.mjs` (ledger + atomic 005→20 + seed).
2. **Route B (session UUID):** `runDisposableOperatorOneshot(db)` in `60_disposable_credential_session.mjs`, which:
   - generates RSA-2048 disposable keys
   - seeds `mip_identity` key/mapping rows with disposable `https://qualification.invalid` claims (not live qik values)
   - mints RS256 with `node:crypto`
   - calls existing `issueWorkloadSession` through `61_broker_connection_adapter.mjs` as `mip_identity_broker_v2`
   - returns **session UUID only**
3. **Route A (PostgREST role claim):** `shapeWorkerJwt('mip_comparison_worker_v1')` plus `assertRouteAShape`. Dummy three-part JWT for `host.js` shape check. **Not** HS256 with the project secret.

`61_broker_connection_adapter.mjs` is the broker connection adapter (`configuration` then `issue`). It is a one-shot helper, not a permanent controller.

### Later live qik (owner machine only; not this utility)

Route A HS256 stays **outside** this utility. Owner mints locally with the project JWT secret already on the owner machine:

```bash
# Owner machine. Secret never enters this repository.
# Do not sign this secret in a browser or on a third-party website.
node --input-type=module <<'EOF'
import {createHmac} from 'node:crypto'
const secret=process.env.MIP_QIK_JWT_SECRET
if(!secret) throw Error('missing MIP_QIK_JWT_SECRET')
const now=Math.floor(Date.now()/1000)
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
const input=enc({alg:'HS256',typ:'JWT'})+'.'+enc({
  role:'mip_comparison_worker_v1',iat:now,exp:now+3600
})
const sig=createHmac('sha256',secret).update(input).digest('base64url')
process.stdout.write(input+'.'+sig)
EOF
```

Add `iss`/`aud` only if live PostgREST requires the **current qik** values. Deliver to `MIP_QIK_WORKER_JWT` only if that name is absent.

Route B live: owner-held RSA whose public JWK was seeded into `mip_identity`; same `61` adapter against qik as `mip_identity_broker_v2`; UUID into `MIP_QIK_WORKER_SESSION` only if absent.

PostgREST also needs, as part of the **one** bounded operation (not a separate paste): `GRANT mip_comparison_worker_v1 TO authenticator` after confirming `authenticator` is the live API switch role; expose schema `mip_identity` on the Data API; `verify_jwt=false` for `source-comparison-generation-candidate` only.

## Edge env names (`index.ts`)

Create **only missing** names. Never overwrite.

| Secret | Meaning |
|---|---|
| `MIP_QIK_WORKER_RPC_URL` | `https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/` |
| `MIP_QIK_PUBLISHABLE_KEY` | publishable or anon JWT |
| `MIP_QIK_WORKER_JWT` | Route A HS256 worker JWT (owner-machine mint) |
| `MIP_QIK_WORKER_INVOKE_TOKEN` | opaque invoke bearer |
| `MIP_QIK_WORKER_SESSION` | Route B session UUID from `mip_identity.issue` |
| `MIP_QIK_WORKER_RUNTIME` | `hosted-synthetic-qik-v1` |
| `MIP_QIK_WORKER_IMPLEMENTATION` | `hosted-synthetic-event-projection-v1` |

No `SUPABASE_SERVICE_ROLE_KEY` fallback exists in `index.ts`.

Producer enqueue in `30_seed_runtime_and_work.sql` uses `comparison_qualification.issue_session` for a **15-minute** producer principal. That is not Route B. Cleanup revokes that session from the operation ledger.
