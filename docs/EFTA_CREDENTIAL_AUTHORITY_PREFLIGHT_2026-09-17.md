# EFTA credential and authority preflight

Date: 2026-09-17  
Source packet: `ab7b8603bbd5a8971286db96ba5aa00411c75a28` / tree `859de8d0af4f075295afd175e77e47e962706ba1`  
Branch: `codex/mip-efta-credential-authority-preflight-20260917`

Inspection only. No identity head, database object, assignment, credential, secret, grant, Auth setting, deployment, admission, release, publication, or other production state was created or changed.

## Accepted identity-successor preparation

The owner accepted the history-preserving successor records for preparation only:

- Congress `85b4e360-a014-5e14-a727-a29ff85536a8`
- DOJ `40baeeaf-4b99-5dfe-96ab-cf7474c064a2`
- DOJ OIG `b1e6e59c-72c5-594a-a33a-747ca7c2d8e0`

The exact receipt payloads, predecessor links, UUIDv5 derivation, approval boundaries and correction/supersession model remain those in `decision-records.json` at the source SHA. No receipt hash was promoted into an authenticated approval column and no head activates.

## Live Supabase project

- Ref: `qikvmopbtijoebdqosyq`
- Project: `mip-v2-account-verification-20260831`
- Organization: `ntmqymyaujspymfqmxew` (`jkelsen13-tech's Org`), Pro
- State: `ACTIVE_HEALTHY`, `us-west-1`
- PostgreSQL: engine 17, build `17.6.1.166`; SQL reports `17.6`
- Direct host currently resolved AAAA-only. The IPv4 add-on billing flag was not available.
- No live role matched `mip_efta_%`; the candidate is not installed.

## Custody/access inventory

The exact current organization/project principals, scopes and roles could not be retrieved from the authorized interfaces available in this run. The connector exposes project, organization, database and Edge Function reads, but no member-list operation or caller role. Browser/dashboard initialization failed and no authenticated CLI or Management API token was available or extracted.

Current documented Edge-secret permissions:

| Role class | View Edge secrets | Create/delete Edge secrets |
|---|---:|---:|
| Owner | yes | yes |
| Administrator | yes | yes |
| Developer | yes | no |
| Read-Only | yes | no |

Consequently, every actual project member is potentially inside the secret-disclosure boundary, including Read-Only where that role is available. Exact membership must be known before Edge Secrets can be accepted for EFTA custody. [Supabase access-control matrix](https://supabase.com/docs/guides/platform/access-control).

## Network and pooler

The current network-restriction applied flag and CIDRs are unknown. They are management-plane settings not visible through database SQL or the available connector. Project health and historical connectivity do not prove restrictions are off.

This is material: when network restrictions are applied, hosted Edge Functions cannot directly reach Postgres or its pooler. HTTPS APIs remain reachable, but they cannot implement the qualified custom LOGIN plus `SET LOCAL ROLE` contract. [Network restrictions](https://supabase.com/docs/guides/platform/network-restrictions).

Required shared Supavisor transaction contract if restrictions are off:

- Exact host: unknown; must be copied from password-redacted project Connect metadata. It must not be guessed from region because the pooler cluster index varies.
- Port `6543`, database `postgres`, IPv4.
- Username template `[LOGIN_ROLE].qikvmopbtijoebdqosyq`.
- TLS required; verify-full preferred when supported.
- Prepared statements disabled; application-side pool maximum one per warm isolate.
- One checked-out client executes `BEGIN`; `SET LOCAL ROLE mip_efta_reviewer_v1`; one allowlisted operation; `COMMIT` or guaranteed `ROLLBACK`; release.

Shared session mode `5432` is not needed and increases persistent-state/connection risk. Direct `db.*:5432` is presently IPv6 and better suited to persistent backends. [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres).

Historical evidence: active `spatial-runtime` v6 uses a custom `SPATIAL_WRITER_DB_URL`, custom LOGIN, pinned native Postgres driver and explicit transactions. Live attributed rows show that Edge-to-native-SQL worked on 2026-09-03. This proves the architectural pattern, not current reachability.

## Auth, signing and sessions

- Issuer: `https://qikvmopbtijoebdqosyq.supabase.co/auth/v1`.
- Expected user audience: `authenticated`.
- Public JWKS currently exposes one EC P-256, ES256 signature-verification key, `kid f11c0b62-e0f6-44fc-8663-75543b5a6f3d`.
- This proves asymmetric verification infrastructure, not whether the key is current, standby or previously used.
- The selected reviewer subject exists, is non-anonymous, not banned/deleted, with `aud=authenticated`; three nonexpired session rows were observed, AAL1 only, and zero verified MFA factors.
- That proves authentication/account state only, not custody or review authority.
- Active API modes include a legacy anon key and a modern publishable key. No value is retained in this packet.
- Eight Edge Functions are active and all have platform `verify_jwt=true`.

JWT `session_id` can be checked against `auth.sessions`. Sign-out removes session state, but an already-issued access token can remain usable until expiration, so every sensitive EFTA action needs a live session/revocation check in addition to signature, issuer, audience, subject, expiration and anonymous-status checks. [Auth sessions](https://supabase.com/docs/guides/auth/sessions), [JWT fields](https://supabase.com/docs/guides/auth/jwts).

Exact access-token expiry, session time-box, inactivity timeout, single-session configuration, refresh-token reuse configuration, and signing-key lifecycle state remain unavailable. External JWKS caches can delay effective key revocation, reinforcing the live-session requirement. [Signing keys](https://supabase.com/docs/guides/auth/signing-keys).

## Existing runtime inventory

### Supabase Edge

Only demonstrated private-gateway runtime class. Eight functions are active. `spatial-runtime` demonstrates native custom-LOGIN SQL; `investigation-api` demonstrates `/auth/v1/user` authentication and literal RPC allowlisting. However, the current investigation transport uses broad `service_role`, not a narrow EFTA LOGIN, transaction-pooler role switch, or EFTA credential revision. It is not reusable as authority.

### GCP Cloud Run

The repository contains a manual `mop-extraction` deployment workflow using static `GCP_SA_KEY`, `--allow-unauthenticated`, and a health-only service with no capabilities. Current deployment, Secret Manager/KMS state, network route and callers were previously unverified. This is merely possible infrastructure, not a demonstrated or authorized EFTA runtime.

### GitHub Pages/Actions

Pages uses Pages-scoped OIDC in ephemeral jobs and public client configuration. It is not a persistent private broker and has no demonstrated database path.

No existing MIP runtime was demonstrated to combine workload identity, managed KMS/secret custody, approved database network access and EFTA-only execution authority.

Repository evidence: [investigation gateway](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/ab7b8603bbd5a8971286db96ba5aa00411c75a28/supabase/functions/investigation-api/index.ts), [Cloud Run workflow](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/ab7b8603bbd5a8971286db96ba5aa00411c75a28/.github/workflows/deploy-cloud-run.yml), [health scaffold](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/ab7b8603bbd5a8971286db96ba5aa00411c75a28/services/extraction/main.py), and [backend gate](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/ab7b8603bbd5a8971286db96ba5aa00411c75a28/docs/BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md).

## Concrete options

| Option | Custody | Connectivity | Workload authentication | Result |
|---|---|---|---|---|
| Supabase Edge + Edge secret + versioned EFTA LOGIN | All actual project members can view secret; exact people unknown | Conditional on restrictions=false and exact pooler metadata | Platform deployment identity plus static server-held DSN | Smallest only after missing custody/network evidence is resolved |
| Existing Cloud Run | Static GitHub `GCP_SA_KEY`; exact custodian unknown | No approved DB route demonstrated | Static key, not workload identity federation | Not currently viable without material new authority/infrastructure |
| GitHub Pages/Actions | Ephemeral repository/OIDC boundary | No approved DB path | Pages/job only | Not a private broker |
| New external runtime | Undefined | Undefined | Possible only | Not authorized |

No credential-runtime recommendation can yet be made without guessing. Edge remains the conditional smallest candidate, not a supported selection.

## Eligible-principal inventory

- Credential custodian: **NO DEMONSTRATED ELIGIBLE PRINCIPAL**.
- Second independent credential custodian: **NO DEMONSTRATED ELIGIBLE PRINCIPAL**.
- Rights approver: **NO DEMONSTRATED ELIGIBLE PRINCIPAL**.
- Privacy approver: **NO DEMONSTRATED ELIGIBLE PRINCIPAL**.

Repository administration, project membership, account existence, employment assumptions, task ownership and the reviewer-only selection do not prove any of these separate authorities.

## Rights/privacy preservation

All 42 cells remain `evidence_required`, unapproved, and unchanged. Public availability, federal authorship, government hosting, accessibility and synthetic qualification evidence remain insufficient for operation-specific authorization.

## Remaining blockers and owner decisions

Evidence still required:

1. Exact Supabase organization/project member list with scope and role.
2. Network-restrictions `applied` state and CIDRs.
3. Password-redacted Connect metadata containing the exact shared transaction-pooler host and username template.
4. Auth expiry/session/reuse settings and signing-key lifecycle status.
5. Two explicitly authorized credential custodians.
6. Explicitly authorized rights and privacy approvers.

Until the first four facts are supplied, the owner cannot safely choose Edge custody or authorize qualification. The next step is a sanitized management-plane evidence export, not installation or mutation.
