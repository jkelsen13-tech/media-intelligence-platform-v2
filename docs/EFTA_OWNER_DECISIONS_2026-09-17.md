# EFTA owner decisions and evidence-resolution packet

Date: 2026-09-17

Source commit: `2c862413e5a3f943f2f6ed8376e9a5fa6a8c9249`

Source tree: `18e629031de154352787042ee9530f2b03aef4e5`

Branch: `codex/mip-efta-owner-decisions-20260917`

Effect: inspection and preparation only. This packet creates no production assignment, identity head, credential, membership, grant, operation-evidence approval, admission, release, publication, deployment, or merge.

## Recorded owner decisions

The owner selected `auth_user:f576f162-b6c6-46b7-9aaf-96b1ea90e194` as the proposed human subject for the EFTA factual-reviewer assignment only. The exact selection-intent UUID is `e28950b8-c81a-5864-a618-0a471df187db`; it is not an assignment revision and grants no authority. Admitter and private-reader subjects remain unselected.

The owner approved the semantics and supplied proposal revision identifiers for:

- United States Congress: institution `62bb9132-5a8a-581f-992f-f0a38ae78e39`, proposal revision `d8428b15-0827-599b-8856-f1dbf89e584b`.
- United States Department of Justice: institution `a95e3f14-f75d-5718-a7b3-55e4c4e055a9`, proposal revision `6875d412-6b9a-512f-a8b5-dd03ccaf7e76`.
- U.S. Department of Justice Office of Inspector General: institution `d9e9e444-d183-5e9e-b4cb-f0b4670723a3`, proposal revision `c50912f4-0fd0-5fd4-9034-08d20b092c75`, parent DOJ.

## Fail-closed record-model result

Migration 011 already seeds those three revision UUIDs as immutable `proposed/proposed_unapproved` versions with no heads. Its update/delete guards prevent converting the same rows into `current/owner_approved`. A head pointing to those rows would still fail the identity guard.

The architecture-consistent preservation path is to retain the approved proposal history and, after a separate owner decision, append current successors:

| Institution | Proposal receipt hash | Candidate successor | Predecessor | Status |
|---|---|---|---|---|
| Congress | `0630fc94971f09b5c6397dcf0a9a986aaff53aa79acfce8001ea1c65d90f18be` | `85b4e360-a014-5e14-a727-a29ff85536a8` | `d8428b15-0827-599b-8856-f1dbf89e584b` | unapproved candidate |
| DOJ | `079e8b568a558796af8c70ae280677ab08255dded088f1dac98a07994377be62` | `40baeeaf-4b99-5dfe-96ab-cf7474c064a2` | `6875d412-6b9a-512f-a8b5-dd03ccaf7e76` | unapproved candidate |
| DOJ OIG | `146a005d06c8afe5b1d1a07220263fdbf9087ba31bb270c7b06417cfae2f9726` | `b1e6e59c-72c5-594a-a33a-747ca7c2d8e0` | `c50912f4-0fd0-5fd4-9034-08d20b092c75` | unapproved candidate |

The inspection-only approval-receipt content digests are `f2a59ace096a01f0aa576cb735be592b43db2f9a918558459c364652b30c355c`, `a2beab4418eb16ff943209f32a89efedb326dc6927e2c474f925874dec9a0b61`, and `ce4505f311d9bce2cec2b40ad12d4601c849b2ccd5bfc9e5df2e1f0e0b429c31`. They are content digests, not authenticated durable approval receipts, and must not populate an approval-receipt column until the receipt contract and successors are explicitly accepted.

An alternative is to amend 011 before installation so the supplied revisions are initially current/approved. That changes the migration blob and requires complete requalification. It also discards database-visible proposal-to-approval succession. The bounded recommendation is the successor path.

Corrections append another immutable revision with `predecessor` equal to the current revision and atomically move the head. Historical rows are never rewritten or destroyed. The DOJ head must exist before the OIG head can activate.

## Reviewer assignment record

A schema-valid assignment cannot yet be produced. The table requires exact mapping, signing-key, credential, validity-start, and validity-end revisions, and the final SHA-256 payload digest binds all of them using PostgreSQL canonical `jsonb::text`. These values are owner-deferred. `decision-records.json` therefore contains a non-schema selection-intent envelope with all unresolved fields null, `head_active=false`, and `production_authority=false`.

## Credential architecture

The live project is `qikvmopbtijoebdqosyq`; the inspected project was healthy on PostgreSQL 17.6.1 in `us-west-1`. Existing functions use broad legacy service-role transport. That transport is ineligible: it bypasses RLS and 011 revokes EFTA execution from `service_role`.

Concrete alternatives:

1. Existing Supabase Edge Function plus Edge Function Secret plus a versioned EFTA-reviewer-only LOGIN. This is the smallest reuse, but only if every project member able to view Edge secrets is an approved custodian and an isolated test proves Edge-to-database connectivity under current network restrictions.
2. An already-authorized persistent backend with workload identity, a KMS-backed external secret manager, and an allowed private/static route. This gives stronger custody separation and is preferred if it already exists.
3. A new external broker/runtime. It can isolate well but adds infrastructure, networking, monitoring and authorization scope; do not choose it merely for this demonstration.

Rejected: Supabase Vault as the bootstrap DB credential store; `service_role`/secret API keys; browser/PostgREST mutation; reuse of `authenticator`; custom project-JWT role minting; or one LOGIN spanning reviewer, admitter and reader.

Recommended reviewer path, if option 1 passes the two checks: verify Supabase Auth token signature and live session on each sensitive call; require issuer `https://qikvmopbtijoebdqosyq.supabase.co/auth/v1`, audience `authenticated`, the selected subject, non-anonymous session, and a maximum 15-minute mutation reauthentication age. Bind the raw-token SHA-256 without storing the token, immutable `DENO_DEPLOYMENT_ID`, authentication/mapping/signing-key/credential/assignment revisions, broker session, `SESSION_USER`, and `CURRENT_USER`.

The database LOGIN must be versioned, `NOINHERIT`, `NOBYPASSRLS`, non-superuser, no create/replication rights, connection limit 1 or 2, have no direct object grants, and have only `SET TRUE / INHERIT FALSE / ADMIN FALSE` membership in `mip_efta_reviewer_v1`. Each request uses one TLS Supavisor transaction-mode connection, explicit transaction, `SET LOCAL ROLE mip_efta_reviewer_v1`, one allowlisted signature, commit/rollback, and close. No admitter or private-reader broker is prepared.

Suggested limits, still owner-reserved: JWT lifetime at most one hour; mutation reauthentication age 15 minutes; broker transaction 60 seconds; assignment expiry `2026-09-23T04:00:00Z` or earlier; credential validity at most 90 days, rotate by day 60, overlap at most 24 hours. Consultation-only expiry at consultation plus one day is smaller.

Edge Secrets documentation: https://supabase.com/docs/guides/functions/secrets

Supabase access-control documentation: https://supabase.com/docs/guides/platform/access-control

Network restrictions: https://supabase.com/docs/guides/platform/network-restrictions

Database connections and pooling: https://supabase.com/docs/guides/database/connecting-to-postgres

Auth sessions and signing keys: https://supabase.com/docs/guides/auth/sessions and https://supabase.com/docs/guides/auth/signing-keys

PostgreSQL SET ROLE: https://www.postgresql.org/docs/17/sql-set-role.html

## Rights/privacy resolution

The seven exact retained spans were re-found in current official sources. None of those exact bytes contains victim identity, private-person PII, medical details, sensitive images, allegations about a named person, seals, or apparent third-party content.

All 42 operation/domain cells have a supportable substantive basis for the exact bytes and isolated internal-review audience. All 42 remain `evidence_required_unapproved`; approved count is zero. Public access and government authorship are evidence, not authorization. Synthetic qualification rows are not genuine authority.

| Candidate | retention rights/privacy | analysis rights/privacy | excerpt display rights/privacy |
|---|---|---|---|
| `f5548254-e6c4-4abd-925d-8ea6d8e076ea` | supported -> evidence required | supported -> evidence required | supported -> evidence required |
| `dd1ef05f-dd67-4595-908f-d195671a5db5` | supported -> evidence required | supported -> evidence required | supported -> evidence required |
| `a255ffc5-2209-4e50-8fec-cf72f3f0e7eb` | supported -> evidence required | supported -> evidence required | supported -> evidence required |
| `c5a7416f-2495-41cf-b3d6-8a02d3becf22` | supported -> evidence required | supported -> evidence required | supported -> evidence required |
| `f741208c-0a00-418a-afab-028f558b902b` | supported -> evidence required | supported -> evidence required | supported -> evidence required |
| `5cabcb8f-99bf-4e42-8172-473ef6c59f0f` | supported -> evidence required | supported -> evidence required | supported -> evidence required |
| `a5457418-1a23-4345-8fb7-788d07123aa8` | supported -> evidence required | supported -> evidence required | supported -> evidence required |

The complete 42-cell candidate/capture/hash/span-bound matrix is in `rights-privacy-matrix.json`.

The rights basis is the official federal source provenance, 17 U.S.C. sections 101/105, DOJ policy, and GovInfo policy. Third-party material, seals, images and foreign rights remain outside it. Sources: https://uscode.house.gov/view.xhtml?edition=prelim&path=%2Fprelim%40title17%2Fchapter1, https://www.justice.gov/legalpolicies, and https://www.govinfo.gov/about/policies.

The privacy basis is exact-span minimization plus a negative PII/victim-information screen. The Act itself identifies victim PII, personal/medical files, CSAM, sensitive imagery, investigations and classified material as protected categories, and DOJ warns that broader EFTA files may still contain inadvertent PII. Sources: https://www.govinfo.gov/content/pkg/PLAW-119publ38/html/PLAW-119publ38.htm and https://www.justice.gov/epstein.

Material boundaries: the review-protocol PDF outside the span includes graphic descriptions of sexual abuse involving minors; the letters discuss victim, grand-jury, protective-order and privileged material; the press release warns of false submissions in underlying files; the OIG notice is not a finding; the Federal Register appendix can name officials and politically exposed persons. Whole PDFs, appendices, linked files, logos, seals and public display are excluded.

Each future cell receipt must bind candidate, capture, content hash, field/span, source URL/retrieval, evidence-snapshot hashes, operation, domain, purpose, audience, conditions, approver subject/assignment revision, decision, reason, validity, predecessor/head and reversal path. Rights and privacy remain separate.

## Remaining owner decisions

1. Accept the three deterministic identity successor revisions and inspection receipt contract, or authorize the more invasive amend-011-and-requalify path.
2. Choose credential/runtime option after the secret-visible membership and network-restriction checks; name two exact custodians.
3. Approve issuer/audience, asymmetric signing-key state or migration, exact broker LOGIN, membership, pool mode, reauthentication window, assignment/credential validity and rotation overlap.
4. Designate exact admitter and private-reader human subjects later; none is inferred here.
5. Designate exact competent rights and privacy approver principals, then approve or reject all 42 exact evidence receipts. None is approved here.

## Readiness

The bounded mechanism remains qualified at source commit `2c862413e5a3f943f2f6ed8376e9a5fa6a8c9249`, but this decision pass does not yet support an exact installation/qualification authorization. Identity-head materialization, assignment revisions, credential custody, and authoritative operation-evidence receipts are unresolved. The next action is owner selection, not production or qualification execution.
