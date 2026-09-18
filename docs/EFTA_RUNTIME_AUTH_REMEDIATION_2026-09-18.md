# EFTA runtime and live-authentication remediation packet

**Date:** 2026-09-18

**Inspection anchor:** `a7f5c5d33ce621dc37013b34410c42f3dee96c39`

**Remediation branch:** `codex/mip-efta-runtime-auth-remediation-20260918`

**Implementation candidate under exact-head qualification:** `676fc3198241cdbbd80f61691e154cd31c016b53`

**Candidate tree:** `0307196b722215136dda8c3ae04ac56fb87f8a25`

**Effect:** bounded non-production remediation and qualification only.

This packet authorizes no deployment, infrastructure installation, production database change, credential or assignment creation, MFA or Supabase configuration change, grant, identity-head activation, admission, release, publication, merge, or public release.

## Definitive hosted-Edge finding

Hosted Supabase Edge Functions do not provide the required least-authority boundary for the EFTA gateway. Supabase documents that hosted functions receive `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY`/`SUPABASE_SECRET_KEYS`, legacy `SUPABASE_SERVICE_ROLE_KEY`, and related project values as environment variables, while arbitrary code in the same isolate can use `Deno.env.get()`. The secret/service-role credentials bypass RLS. No supported per-function control was found that suppresses or makes those injected values inaccessible to arbitrary code executing in that function.

The three states are therefore:

1. **Present:** the privileged project credentials are ambient in the hosted runtime.
2. **Inaccessible by enforceable isolation:** not demonstrated; application conventions, local deletion, wrappers and operation allowlists are not isolation.
3. **Recoverable by arbitrary same-runtime code:** yes, through the documented environment API.

Hosted Edge is rejected for this EFTA gateway. Platform `verify_jwt` is also insufficient because compatibility behavior can accept legacy HS256 or API-key forms; the candidate verifies the approved token contract itself.

Authoritative references: [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [function configuration](https://supabase.com/docs/guides/functions/function-configuration), [limits](https://supabase.com/docs/guides/functions/limits), and [authorization headers](https://supabase.com/docs/guides/functions/auth-headers).

## Runtime alternatives

No existing persistent MIP runtime is both authorized for EFTA and demonstrably limited to one narrow broker credential.

- Existing `mop-extraction` Cloud Run is an unauthenticated health scaffold deployed with a static `GCP_SA_KEY`; its IAM, secrets and network boundary are not qualified and it is excluded from mutation.
- The isolated BigQuery sandbox is authorized for BigQuery work, not for an EFTA gateway; no suitable runtime or broker path exists there.
- GitHub Actions can qualify disposable mechanism behavior but is not a persistent frontend gateway.

The smallest production-suitable proposal is a dedicated authenticated Cloud Run EFTA service with a user-managed service identity, no Supabase administrator/project key, access to exactly one versioned broker secret, and outbound TLS only to the transaction pooler. Deployment should use GitHub OIDC/workload identity rather than a stored service-account key. This requires separate owner authorization and infrastructure qualification. Relevant references: [Cloud Run service identity](https://cloud.google.com/run/docs/securing/service-identity), [Cloud Run secrets](https://cloud.google.com/run/docs/configuring/services/secrets), and [GitHub OIDC for Google Cloud](https://docs.github.com/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-google-cloud-platform).

The minimum future non-production runtime qualification is a separate gateway container/process on an isolated network. A bootstrap process may hold an ephemeral administrator credential only long enough to install a disposable PostgreSQL fixture; the gateway receives only the narrow EFTA broker DSN and receives no repository workspace, Docker socket, GitHub token, Supabase key, administrator DSN or unrelated secret. This environment was specified but not created because creation was outside this authorization.

## Authentication and live-session architecture

`eftaStrictJwt.mjs` enforces a compact-token size/shape limit, exact `ES256`, exact authorized KID and canonical JWKS-set digest, P-256 signature validation, exact issuer `https://qikvmopbtijoebdqosyq.supabase.co/auth/v1`, scalar audience `authenticated`, `role=authenticated`, UUID `sub`, UUID `session_id`, `is_anonymous=false`, and valid `iat`/`nbf`/`exp`. It rejects HS256, alternate algorithms, JOSE `crit`, attacker-supplied key URLs/material and unexpected key-set lifecycle state. Authentication, key and token-binding revisions are server-derived.

The currently observed, not activated, key policy fixture is KID `f11c0b62-e0f6-44fc-8663-75543b5a6f3d` with canonical public-JWKS digest `b56db536c7562fcf2371d0f403caa24843db393648e54dc8c264c80549f92ea3`. The machine-readable packet preserves the public JWK, endpoint and observation time so the digest is independently reproducible; this observation is not an activation or owner authorization.

`eftaBrokerTransaction.mjs` holds one exclusive connection and one explicit transaction: `BEGIN`; `SET LOCAL ROLE mip_efta_authenticator_v1`; invoke the exact live-session assertion; `SET LOCAL ROLE` to the exact allowlisted EFTA operation role; invoke exactly one literal allowlisted EFTA RPC; `COMMIT`, otherwise guaranteed `ROLLBACK` and connection discard on uncertainty.

Migration `012_efta_live_authentication.sql` first locks the same global authority fence used by every policy/head retirement and governed EFTA operation, then locks and validates the exact `(auth.sessions.id, auth.sessions.user_id)` row. It compares the verifier-observed issuer, audience, algorithm, KID, key revision and JWKS digest to the current approved database policy under that fence, and binds those fields plus the JWT subject/session, assignment, mapping, broker credential and broker session into the durable receipt. It writes one append-only receipt per transaction and permits one consumption in that same transaction. Missing, revoked, mismatched, expired, superseded or stale state fails closed.

## Privilege matrix

| Principal | Login | `auth.sessions` | Live-auth RPC | EFTA operation RPCs | Direct authority-table access |
|---|---:|---|---|---|---|
| Browser / `PUBLIC` / `anon` / `authenticated` | n/a | none | none | none | none |
| `service_role` | external platform role | none through this contract | none | none | none |
| Future broker LOGIN | yes, not created | none | only through narrowly scoped role membership | none directly | none |
| `mip_efta_authenticator_v1` | no | none | execute exact assertion only | none | none |
| `mip_efta_auth_session_owner_v1` | no | `SELECT(id,user_id)` plus `UPDATE(id)` solely because PostgreSQL requires UPDATE privilege for `FOR KEY SHARE` | owns exact fixed-`search_path` definer | none | scoped RLS reads and append-only auth receipt insert only |
| `mip_efta_owner_v1` | no | none | internal same-transaction receipt consumption | owns fixed-`search_path` EFTA definers | exact EFTA scope only |
| `mip_efta_reviewer_v1` | no | none | none | identity resolution and decision only | none |
| `mip_efta_admitter_v1` | no | none | none | admission only | none |
| `mip_efta_private_reader_v1` | no | none | none | private read only | none |

The technical `UPDATE(id)` privilege is held only by the isolated `NOLOGIN NOINHERIT` function owner; no external role or member receives it, and qualification asserts that no other `auth.sessions` column is updateable. The fixed function body contains no dynamic SQL and returns only an opaque revision or a uniform denial, so it cannot enumerate unrelated users or sessions.

## Successor, retirement and rollback semantics

The tested order is:

`credential successor → reviewer-assignment/head successor → authentication-policy/mapping successor → fresh authentication revision → fresh broker session`

Each predecessor remains append-only historical evidence but is explicitly retired. A stale predecessor cannot satisfy current heads. Versions may be prepared in dependency order, but activation follows credential head, reviewer-assignment head, authentication/mapping heads, then fresh broker session. A successor broker session cannot bind stale credentials, assignments, mappings or authentication policy. In-flight work uses the common authority fence and row locks: if the governed transaction linearizes first, retirement waits; if retirement or session deletion commits first, the stale action fails. A rollback never re-points a head to a retired revision; it creates a fresh corrective successor with its own receipt.

The proposed backup-TOTP-under-separate-custody and no-offline-database-password-copy path remains unactivated. The day-30/day-32 zero-standing-overlap policy remains provisional until the future selected runtime demonstrates secret propagation, session termination, successor activation, failure recovery and rollback behavior.

## Preserved owner gates

- All seven sources × three operations × rights/privacy = 42 cells remain `evidence_required` and unapproved.
- No rights approver or privacy approver is designated.
- EFTA admitter and private-reader subjects remain unselected.
- Proposed reviewer selection remains non-active and no production assignment exists.
- Custodian MFA remains a prerequisite; no MFA state was changed.
- No credential, broker LOGIN, membership, secret, grant or production identity head was created.

## Exact candidate qualification

At implementation SHA `676fc3198241cdbbd80f61691e154cd31c016b53`:

- EFTA isolated PostgreSQL 17 run `35309489244` passed. PostgreSQL `17.6` applied exact migrations 001–012, then passed 16/16 ACL, RLS, receipt, replay, successor/retirement and concurrency tests with zero failures/errors.
- The same run passed the complete repository suite: 2,098/2,098, zero failed/cancelled/skipped/todo.
- The production build passed.
- `npm audit --omit=dev` passed with zero reported vulnerabilities.
- Golden regression run `35309489270` passed on both Node 22 and Node 24.
- Focused gateway/JWT/transaction tests passed locally: 14/14.

The PostgreSQL fixture is disposable, synthetic and mechanism-only. It contains no owner authorization, production data, credential, token, admission or release. It qualifies the code and SQL mechanism, not a persistent runtime, managed Supabase `auth.sessions` installation compatibility, secret propagation, production network behavior, or a real transaction-pooler driver configured with TLS, one exclusive connection, `max=1` and prepared statements disabled. The gateway normalizes verification, lookup, broker-open, invocation and close failures to one external denial; a future HTTP adapter must preserve that boundary.

## Remaining blocker and owner decision

The code-level authentication and authority blockers are remediated for the disposable PostgreSQL mechanism. The unresolved critical boundary is runtime isolation: no existing authorized persistent runtime has demonstrated that it possesses only the narrow EFTA broker credential. A separately authorized isolated runtime qualification is required before production suitability can be claimed. The disposable fixture also does not establish managed-production `auth.sessions` owner/RLS/ACL compatibility; that exact live-schema installation preflight remains an owner-gated read-only qualification step. Rights/privacy authorities and all 42 cells remain later owner gates for real-source operations; they are not silently resolved by this technical remediation.
