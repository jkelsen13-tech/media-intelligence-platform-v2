# EFTA owner decisions and evidence-resolution packet

Date: 2026-09-17  
Qualified mechanism source: `2c862413e5a3f943f2f6ed8376e9a5fa6a8c9249` / tree `18e629031de154352787042ee9530f2b03aef4e5`  
Evidence branch: `codex/mip-efta-owner-decisions-20260917`

This packet is inspection/preparation only. It creates no production assignment, identity head, credential, membership, grant, operation-evidence approval, admission, release, publication, deployment, or merge.

## Reviewer selection

`auth_user:f576f162-b6c6-46b7-9aaf-96b1ea90e194` is owner-selected only as the proposed EFTA factual-reviewer subject. Selection-intent UUID `e28950b8-c81a-5864-a618-0a471df187db` is UUIDv5 URL-namespace over the exact name recorded in `decision-records.json`. It is not an assignment revision and grants no authority.

A schema-valid assignment remains impossible to prepare until exact mapping, signing-key, credential, valid-from, and valid-until revisions are selected; all are NOT NULL and included in the PostgreSQL canonical-jsonb SHA-256 payload. Admitter and private-reader subjects remain unselected.

## Canonical institutions

Migration 011 already seeds the owner-supplied revisions as immutable `proposed/proposed_unapproved` rows with no heads. Converting those same rows to current/approved is forbidden. The history-preserving path is to append successors after separate owner acceptance:

| Institution | kind | approved proposal | candidate successor | proposal hash | approval-payload digest |
|---|---|---|---|---|---|
| United States Congress | `legislature` | `d8428b15-0827-599b-8856-f1dbf89e584b` | `85b4e360-a014-5e14-a727-a29ff85536a8` | `0630fc94971f09b5c6397dcf0a9a986aaff53aa79acfce8001ea1c65d90f18be` | `f2a59ace096a01f0aa576cb735be592b43db2f9a918558459c364652b30c355c` |
| United States Department of Justice | `executive_department` | `6875d412-6b9a-512f-a8b5-dd03ccaf7e76` | `40baeeaf-4b99-5dfe-96ab-cf7474c064a2` | `079e8b568a558796af8c70ae280677ab08255dded088f1dac98a07994377be62` | `a2beab4418eb16ff943209f32a89efedb326dc6927e2c474f925874dec9a0b61` |
| DOJ Office of Inspector General | `inspector_general` | `c50912f4-0fd0-5fd4-9034-08d20b092c75` | `b1e6e59c-72c5-594a-a33a-747ca7c2d8e0` | `146a005d06c8afe5b1d1a07220263fdbf9087ba31bb270c7b06417cfae2f9726` | `ce4505f311d9bce2cec2b40ad12d4601c849b2ccd5bfc9e5df2e1f0e0b429c31` |

`decision-records.json` contains each exact proposal receipt, UUIDv5 URL namespace `6ba7b811-9dad-11d1-80b4-00c04fd430c8`, complete UTF-8 successor name, exact logical approval payload, and digest. Proposal and approval payload digests are lowercase SHA-256 over the UTF-8 bytes of PostgreSQL canonical `jsonb::text` using `comparison_qualification.argument_digest`.

The approval digests are content digests only, not authenticated owner receipts. `owner_approval_receipt_hash` stays null and no head activates. A correction later appends another immutable revision and atomically advances the head; history is never rewritten. DOJ must be current before OIG can activate.

Alternative: amend 011 before installation to seed the supplied revisions directly as approved/current. That changes the migration and requires full requalification. The bounded recommendation is the successor path because it preserves proposal history.

## Credential alternatives and recommendation

The existing broad `service_role` transport is ineligible: it bypasses RLS and 011 denies it EFTA execution.

1. Reuse an existing Supabase Edge Function with a versioned EFTA-reviewer-only LOGIN and Edge Function Secret. Smallest option, but only if every project member with secret visibility is approved as custodian and an isolated check proves Edge-to-pooler connectivity under current network restrictions.
2. Prefer an already-authorized persistent backend with workload identity, KMS-backed external secret manager, and allowed private/static route if one exists.
3. Do not introduce a new external runtime unless the two existing-infrastructure options fail.

Reject Vault for bootstrap credentials, service/secret API keys, browser/PostgREST mutation, `authenticator` reuse, custom project-JWT roles, and one LOGIN spanning reviewer/admitter/reader.

Proposed auth contract, still owner-reserved: issuer `https://qikvmopbtijoebdqosyq.supabase.co/auth/v1`; audience `authenticated`; exact selected subject; live session and non-anonymous check each call; signature/exp/nbf/session validation; raw-token SHA-256 binding without storing token; immutable `DENO_DEPLOYMENT_ID`; exact auth/mapping/key/credential/assignment revisions; broker session; `SESSION_USER` and `CURRENT_USER`.

The versioned reviewer broker must be `NOINHERIT`, `NOBYPASSRLS`, non-superuser, no create/replication rights, connection limit 1 or 2, no object privileges, and only `SET TRUE / INHERIT FALSE / ADMIN FALSE` membership in `mip_efta_reviewer_v1`. One TLS Supavisor transaction-mode connection performs one explicit transaction, `SET LOCAL ROLE`, one allowlisted signature, then closes.

Suggested but unapproved limits: JWT at most one hour; mutation reauthentication 15 minutes; broker transaction 60 seconds; assignment expiry `2026-09-23T04:00:00Z` or earlier; credential maximum 90 days, rotate by day 60, overlap at most 24 hours. Consultation-only expiry at consultation plus one day is narrower.

Current authoritative product references: [Edge secrets](https://supabase.com/docs/guides/functions/secrets), [platform access control](https://supabase.com/docs/guides/platform/access-control), [network restrictions](https://supabase.com/docs/guides/platform/network-restrictions), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Auth sessions](https://supabase.com/docs/guides/auth/sessions), [signing keys](https://supabase.com/docs/guides/auth/signing-keys), and [PostgreSQL SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html).

## Rights/privacy: 42 cells

The seven exact spans were re-found in current official sources. The exact spans showed no victim identity, private-person PII, medical detail, sensitive image, named-person allegation, seal, or apparent third-party material. This is evidence resolution, not legal advice or approval.

Primary classification for every retention/analysis/excerpt-display x rights/privacy cell is `evidence_required`; supported 0, unsupported 0, ambiguous 0, approved 0. Every cell is only conditionally supportable for the exact span and isolated internal-review audience. No cell can presently be supported without assumption because frozen source/policy evidence hashes, exact designated approvers and operation-specific durable receipts are absent. Analysis cells additionally lack an approved exact processor/model, terms snapshot, retention/training policy and transfer/subprocessor basis.

The 42-cell JSON binds every cell to candidate, capture, content hash, field/span, source URL, observed evidence, missing evidence, competent authority, operation-specific controls, limiting conditions and source hazard.

Rights inputs: [17 U.S.C. sections 101/105](https://uscode.house.gov/view.xhtml?edition=prelim&path=%2Fprelim%40title17%2Fchapter1), [DOJ legal policies](https://www.justice.gov/legalpolicies), and [GovInfo policies](https://www.govinfo.gov/about/policies). These support an eventual bounded decision but do not clear third-party matter, seals, images, foreign rights or redistribution.

Privacy inputs: [Public Law 119-38](https://www.govinfo.gov/content/pkg/PLAW-119publ38/html/PLAW-119publ38.htm), [DOJ EFTA library warning](https://www.justice.gov/epstein), and [DOJ Privacy Act context](https://www.justice.gov/opcl/privacy-act-1974). Public availability is not privacy clearance.

Source hazards: the review-protocol PDF outside the span includes graphic minor-sexual-abuse descriptions; the letters discuss victims, grand-jury/protective-order and privileged material; the press release warns of false submissions in underlying files; OIG has announced an audit, not a finding; the Federal Register appendix can name officials/PEPs. Whole PDFs, appendices, linked files, logos, seals and public display are excluded.

## Remaining owner decisions

1. Accept the three deterministic successor revisions and exact receipt contract, or authorize amend-011 plus full requalification.
2. Select Edge-secret custody only after project-member and network checks, or name the existing external runtime/secret manager/workload identity/network route; name two exact custodians.
3. Approve issuer/audience, signing-key mode or migration, exact reviewer LOGIN/membership/pool path, reauthentication, assignment/credential validity, rotation and overlap.
4. Later designate admitter and private-reader subjects; none is inferred.
5. Designate exact rights and privacy approvers, freeze/hash the cited source and policy evidence, resolve processor/retention controls, and decide all 42 receipts.

## Readiness

The mechanism at source commit remains qualified, but this decision pass is not ready for installation/qualification authorization. Identity successors, assignment dependencies, credential custody and all 42 operation-evidence approvals remain owner-reserved. The next action is a bounded owner decision, not execution.
