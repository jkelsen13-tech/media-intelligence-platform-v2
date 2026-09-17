# EFTA qualification-remediation authority

This document describes a non-production qualification proposal. It grants no authority,
records no owner decision, and does not authorize deployment, reviewer assignment,
identity approval, admission, publication, merge, or production mutation.

`011_efta_governed_review.sql` finishes in a private, default-deny EFTA-only authority
surface. The file is an exact-once member of the disposable `001` through `011`
bootstrap chain; its externally callable operations are request-idempotent and reject
conflicting replay. It creates no login role, credential, approved reviewer assignment,
approved identity head, approved permission head, admission, canonical/public record, or
release.

## Proposed institutional identities

The owner-review proposals use deterministic UUIDv5 names and are intentionally inert:

| Institution | Proposed canonical UUID | Proposed revision UUID | Relationship |
| --- | --- | --- | --- |
| United States Congress | `62bb9132-5a8a-581f-992f-f0a38ae78e39` | `d8428b15-0827-599b-8856-f1dbf89e584b` | independent legislature |
| United States Department of Justice | `a95e3f14-f75d-5718-a7b3-55e4c4e055a9` | `6875d412-6b9a-512f-a8b5-dd03ccaf7e76` | executive department |
| U.S. Department of Justice Office of Inspector General | `d9e9e444-d183-5e9e-b4cb-f0b4670723a3` | `c50912f4-0fd0-5fd4-9034-08d20b092c75` | child of DOJ |

Their namespace names are respectively
`https://mip.invalid/institution/us-congress`,
`https://mip.invalid/institution/us-doj`, and
`https://mip.invalid/institution/us-doj-oig`, under the standard URL UUIDv5 namespace.
The `.invalid` host emphasizes that these are stable names, not dereferenceable evidence.
All three version rows are `proposed_unapproved`, and no head is seeded. Qualification
fixtures must use separate owner-approved fixture versions and must never modify these
proposal rows or describe them as owner approved.

## EFTA-only authority

The EFTA-only principals are `mip_efta_reviewer_v1`, `mip_efta_admitter_v1`, and
`mip_efta_private_reader_v1`; each is `NOLOGIN`, has no table access, and receives only its
corresponding function capability. `mip_efta_owner_v1` owns the six EFTA
`SECURITY DEFINER` functions but is also `NOLOGIN`, `NOBYPASSRLS`, and receives no public
or canonical write capability. A live human is not selected by this SQL. In particular,
`auth_user:f576f162-b6c6-46b7-9aaf-96b1ea90e194` remains only an owner-selectable
candidate until a distinct `owner_approved` assignment version and active head exist.

The JavaScript contract remains a candidate-generation/preflight validator only. It may
receive and then discard a free-text reviewer display label, but that label never reaches
an authoritative review record. The SQL decision contract rejects a `reviewer` key and
derives the human subject exclusively from the active assignment and broker session.

Every positive candidate decision must close six exact operation cells:
`retention`, `analysis`, and `excerpt_display`, each for both `rights` and `privacy`.
The authoritative adapter binds the exact candidate, retained capture, content hash,
audience, evidence hash, non-fixture flag, validity interval, active head, and owner
approval receipt. Free-text `rights_ref`, `privacy_ref`, `owner_authorization_ref`, and
`reviewer` keys are rejected rather than treated as authority.

The final external signatures are:

```sql
mip_identity.efta_resolve_identity(uuid,text,uuid,uuid,text,text,uuid,text,uuid)
mip_identity.efta_decide(uuid,uuid,text,uuid,jsonb,uuid,text,uuid)
mip_identity.efta_admit(uuid,uuid,uuid,text,uuid)
mip_identity.efta_private_read(uuid,uuid,text,uuid)
```

`efta_current_binding(uuid)` and `efta_require_identity(uuid,jsonb)` are internal-only.
Every durable decision/read/admission receipt captures the authenticated subject,
assignment revision, authentication/broker session, mapping revision, key revision,
gateway-credential revision/fingerprint, database actor, and authoritative
operation-closure hash. Gateway credential versions store only a SHA-256 fingerprint and
approval metadata, never secret material. A credential head must be active, current,
unexpired, and owner approved. Its approval payload hash covers the fingerprint and
validity interval; the assignment approval payload hash separately covers the subject,
capability, mapping, signing-key revision, gateway-credential revision, predecessor, and
validity interval. Therefore a credential rotation invalidates the old assignment rather
than silently inheriting its authority.

## Relational continuity and replay

Assignment, canonical-institution, and operation-evidence heads use composite foreign
keys to the exact version identity represented by every head key. In particular, an
operation head for one candidate/operation/domain cannot point at another cell's version;
the operation reader independently checks candidate, operation, domain, audience,
capture, and content hash as defense in depth. Runtime EFTA roles receive neither direct
table access nor `UPDATE` on heads. Rotation is an owner-gated qualification/bootstrap
operation protected by the publication fence.

Authoritative decision input contains only `identity_resolution_id`; caller-supplied
`review.entity` is rejected. Private-read output reconstructs the entity from the current
owner-approved institutional version with namespace `mip:institution`, canonical UUID,
normalized label, and institutional revision. Exact RPC replay revalidates source state,
all six operation-evidence cells, and identity currency, and rejects any historical row
that has acquired a correction, reversal, or superseding identity resolution.

This dedicated file is intentionally outside the historical cutover disclosure set. The
historically disclosed authority README and its recorded review-packet hash remain
byte-for-byte unchanged.
