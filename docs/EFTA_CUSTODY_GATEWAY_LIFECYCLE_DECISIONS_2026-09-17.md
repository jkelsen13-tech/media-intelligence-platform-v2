# EFTA custody, gateway and credential-lifecycle inspection packet

**Date:** 2026-09-17  
**Source anchor:** `c070bae5d565b9834f16a89f6d75ea29be50bf9d`  
**Branch:** `codex/mip-efta-credential-authority-preflight-20260917`  
**Machine-readable record:** `verifier/efta-custody-gateway-lifecycle-2026-09-17/inspection.json`  
**Effect:** preparation and inspection only. This packet authorizes no installation, deployment, credential, grant, membership or MFA change, identity-head activation, assignment, admission, release, publication, or production mutation.

## Parent reconciliation

The owner decisions are recorded exactly as design selections, not executable authority:

- Proposed primary credential custodian: `supabase_org_member:jkelsen13@gmail.com`, bounded to the future EFTA broker credential.
- Proposed runtime: Supabase Edge Function through `aws-0-us-west-1.pooler.supabase.com:6543`, transaction mode, TLS required, prepared statements disabled, one application connection per warm isolate.
- Proposed authentication contract: exact issuer `https://qikvmopbtijoebdqosyq.supabase.co/auth/v1`, audience `authenticated`, bound `sub`, ES256-only, exact governed KID set, live `session_id`, assignment revision and expiration.
- Network restrictions remain an observed, versioned dependency: applied `false`, IPv4 `[]`, IPv6 `[]`.
- All 42 rights/privacy operation-evidence cells remain `evidence_required` and unapproved. No rights or privacy approver exists.
- EFTA admitter and private-reader subjects remain unselected.

No credential, secret, role, membership, assignment or identity head exists because of this packet.

## Exact proposed records

| Record | ID | State |
|---|---|---|
| Primary custody | `f3c8a9b0-624b-41b3-97e2-1ac7698ac4ef` | conditionally selected; inactive |
| Gateway/runtime | `646ccac2-f8f7-416a-8b68-4166179c5d33` | design selected; not production-suitable yet |
| Authentication policy | `49dae53c-f260-4c74-97ea-347400d24cee` | approved contract; not implemented |
| Network dependency | `4d4d39b0-b14f-426d-83c9-1069e1b084bb` | observed dependency; not authority |
| Credential lifecycle | `df8f4c1c-f31f-4ecc-8299-0aec9ece1c41` | recommendation only |
| Emergency revocation | `4b4df6f3-9c56-43c2-9322-52de9902a019` | proposed; not executable |
| Secondary protection | `8ce98a0f-d373-4e16-90ca-ffe45887eff5` | alternatives; owner selection required |
| Lifecycle receipt | `bf275f97-caf2-4acf-bf90-5ee3554a57a1` | schema contract only |

The JSON record carries exact fields, unfinalized fields, authority boundaries, transition behavior and the append-only receipt contract. Secret values, tokens, private keys, TOTP seeds/codes, recovery shares and complete database URIs are forbidden receipt content.

## Exact MFA gate

Before any real EFTA credential is created or changed, all of these must be true:

1. The Supabase control-plane account `jkelsen13@gmail.com` is shown as MFA enabled.
2. A primary TOTP factor is verified.
3. A distinct backup TOTP factor is enrolled and separately custodied.
4. A fresh post-enrollment login challenge succeeds.
5. Durable evidence records only factor metadata, status and observation time—never a seed or code.

Current MFA is disabled, so the gate is closed. Supabase platform MFA has no recovery codes. Organization-wide MFA enforcement is a separate owner-reserved mutation. Custodian MFA does not establish reviewer AAL2.

## Runtime and authority findings

The intended database transaction remains:

`acquire exclusive client → BEGIN → SET LOCAL ROLE mip_efta_reviewer_v1 → exactly one literal allowlisted EFTA operation → COMMIT/guaranteed ROLLBACK → release`

If rollback is uncertain, discard the connection. No browser receives the broker credential or a privileged mutation endpoint.

Two findings prevent a production-equivalent least-authority claim:

1. **Ambient Edge privilege.** Hosted Edge Functions receive platform-provided `SUPABASE_DB_URL` and privileged secret/service-role keys. Custom Edge secrets are project-wide, not isolated to a single function. A narrow EFTA broker LOGIN constrains the intended route but does not constrain compromised or malicious function code that can use the ambient privileged credentials. No evidence yet shows that those defaults can be suppressed for one hosted function.
2. **Authentication implementation gap.** The candidate gateway has an abstract `checkRevocation` hook. Its SQL authority context validates MIP `sessions`/`principal_sessions`, not the live Supabase `auth.sessions` row identified by JWT `session_id`. Gateway-local ES256 and exact-KID enforcement also remains to be implemented and qualified. Platform `verify_jwt` or `/auth/v1/user` does not by itself prove rejection of the still-recognizable legacy HS256 family.

The approved contract is therefore correctly modeled but not yet implemented.

## Secondary protection for a solo owner

| Option | Standing access | Protection | Material limitation |
|---|---:|---|---|
| Offline encrypted 2-of-3 escrow | No Supabase membership | Recovery and continuity | No online veto or runtime-compromise containment; trustees/locations and ceremony become security principals |
| Managed emergency-access vault | No Supabase membership | Delayed, auditable emergency recovery | New provider, account, recovery principal and retention dependency |
| Protected GitHub environment + Actions OIDC + cloud KMS | No Supabase membership | Independent approval and managed-key operation | New KMS/WIF and scoped Supabase management authority; current viability not demonstrated |
| Second Supabase Owner/Admin | Yes, broad | Native control-plane recovery | Exposes all project Edge secrets and broad project control; fallback only |

Supabase Vault is circular for this purpose because the runtime must already connect to retrieve the value. No documented hosted-Edge workload identity capable of directly using an external KMS was demonstrated; putting a long-lived cloud credential in an Edge secret merely moves the bootstrap secret.

The smallest recovery-only option is offline encrypted 2-of-3 escrow, but it requires owner selection of holders/locations, package and cryptographic tooling, recovery ceremony, drill cadence and whether continuity without an online veto is acceptable. A stricter alternative is to keep **no offline database-password copy** and recover only by control-plane rotation after account recovery; that reduces secret copies but makes account recovery the continuity dependency.

## Credential-validity alternatives

| Policy | Routine exposure bound | Operations | Overlap and recovery |
|---|---:|---:|---|
| A: monthly, one LOGIN, fail-closed maintenance | rotate by day 30; authentication hard-stop day 32 | about 12/year | zero standing overlap; close, drain, terminate, replace, verify; failure rolls forward to another fresh revision |
| B: quarterly, one LOGIN | rotate by day 90; hard-stop day 95 | about 4/year | same maintenance pattern; roughly threefold longer routine exposure |
| C: monthly blue/green LOGINs | each slot expires by day 32 | at least 12 complex cycles/year | overlap capped at 24 hours; lower downtime but temporarily doubles credential surface |

Policy A is the bounded recommendation for a low-frequency governed workflow with no demonstrated continuous-availability requirement. Thirty days is a governance choice, not a platform requirement. The independent review preferred separate versioned LOGINs because Edge-secret propagation and authenticated pooler-session retirement are not yet proven. Accordingly, final selection remains owner-reserved until qualification measures propagation, session termination and rollback. For a one-time consultation-only credential, an expiry at the consultation cutoff with no renewal is an additional narrow alternative.

Routine and emergency rotation must never restore a retired or suspected password. Password change, `VALID UNTIL`, `NOLOGIN` and secret replacement do not alone prove termination of authenticated pooler sessions. A database-authoritative active credential revision, explicit session termination and old-revision rejection evidence are mandatory.

## Fail-closed state changes

- **Network restrictions/reachability:** any mismatch, unreadable state or pooler failure suspends operations. No service-role, platform-DB-URL or privileged Data API fallback.
- **Signing keys:** only the exact approved ES256 KID set is accepted. A new/unknown KID fails until an approved overlap revision is qualified; legacy HS256 always fails.
- **Project membership/roles:** any inventory change stales custody evidence and suspends credential operations; possible disclosure triggers rotation.
- **Credential revision:** missing, inactive, expired, duplicated or mismatched revisions reject before database action.
- **Broker membership/privileges:** any owner, LOGIN, direct privilege or `SET/INHERIT/ADMIN` drift suspends and requires requalification.
- **Assignment revision:** missing, inactive, superseded, wrong subject or wrong scope rejects.
- **Live session:** missing, revoked, unverifiable or unavailable rejects every action; no cached authorization.
- **In-flight revocation:** a bounded transaction may race revocation. Terminate sessions and reconcile every operation around the cutoff.

The gateway cannot independently attest the Dashboard network or membership settings at runtime. Their signed inspection revisions are preconditions; stale or unavailable preconditions keep the gate closed.

## Rights/privacy and deferred roles

All seven candidates × retention/analysis/excerpt-display × rights/privacy = 42 cells remain unapproved. Public availability, federal authorship, government hosting, synthetic qualification data, repository/Supabase ownership, reviewer selection and credential custody grant no operation-specific authority.

Rights/privacy authority is necessary before genuine review/admission/private reading, but it is **not the only or principal current technical blocker to qualification**. Ambient Edge privilege plus the missing live-session and gateway-local algorithm/KID enforcement must be resolved first. The EFTA admitter and private-reader subjects also remain deferred.

## Remaining decisions and blockers

Critical/high blockers:

- Resolve or avoid hosted Edge ambient privileged credentials while preserving the selected least-authority semantics.
- Implement and qualify a least-privilege live Supabase-session adapter keyed by JWT `session_id`.
- Implement and qualify gateway-local ES256/exact-KID enforcement and legacy-HS256 rejection.

Owner-reserved:

- Complete and evidence the MFA gate; optionally decide organization-wide MFA enforcement.
- Select secondary-protection mode and its principals/locations/ceremony.
- Select credential cadence after a rotation rehearsal.
- Later designate rights and privacy authorities and approve cells.
- Later designate admitter and private-reader subjects.
- Reviewer AAL requirement remains to be finalized independently of custody MFA.

## Independent review

Same-session independent review confirmed the inspection-only boundary and the transaction/network controls. It independently identified the live-`auth.sessions` and ES256/KID enforcement gaps, warned that membership changes expand the Edge-secret disclosure boundary immediately, and required rotation evidence to prove both stale credentials and old sessions fail. It also noted that no Supabase recovery codes exist and that custodian MFA does not establish reviewer AAL2.

Official references:

- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Database connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Network restrictions](https://supabase.com/docs/guides/platform/network-restrictions)
- [Signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Auth sessions](https://supabase.com/docs/guides/auth/sessions)
- [Platform MFA](https://supabase.com/docs/guides/platform/multi-factor-authentication)
- [PostgreSQL 17 SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html)
- [PostgreSQL 17 ALTER ROLE](https://www.postgresql.org/docs/17/sql-alterrole.html)

## Disposition

**NOT READY.**

Exact smallest next prompt:

> Continue from the exact inspection packet head. Perform read-only/remediation design only: determine whether Supabase hosted Edge Functions can verifiably suppress or isolate the automatically provided SUPABASE_DB_URL and privileged service-role/secret keys for one EFTA function. If not, design the smallest non-production qualification using either an isolated Supabase project or an existing authorized external runtime with workload identity and only the narrow EFTA broker LOGIN. Implement no infrastructure or production change. In the candidate gateway, specify the concrete least-privilege live Supabase auth.sessions adapter keyed by JWT session_id and gateway-local ES256/exact-KID enforcement, with fail-closed tests and a requalification plan. Return the smallest owner decision that resolves only these blockers.
