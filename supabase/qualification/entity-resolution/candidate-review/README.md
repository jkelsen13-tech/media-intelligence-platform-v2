# Exact candidate proposal reader — bounded C6 qualification

This additive source slice exposes the proposal context already stored by unchanged
001. It does not create a candidate producer, actor, actor mapping, decision,
source admission, membership, access grant, or new durable evidence copy.

Base reviewed for authoring:
`d185a305579e22a44a3c350668985334591f69e2`
(tree `a6bdab3ad79ccf3e4cd71d193fb21b3e5272123e`).
No hosted installation, live source authority, production operation or publication
is claimed. Source authoring and the synthetic fixture are not independent review.

## Reader and existing consumer boundary

`mip_mentions.read_candidate_proposal(scope uuid, candidate_id uuid, expected_version integer)`
is SECURITY DEFINER, owned by existing NOLOGIN/NOBYPASSRLS
`mip_mentions_owner`, with empty search_path. Only that owner and the existing
`mip_mentions_gateway` receive function execution; no new role or table is added.

The selected final contract permits incoming authorized login memberships in
gateway/admin but no incoming owner-role memberships after installation cleanup.
Trusted owner DDL remains outside qualified runtime operations; a future explicit
owner membership requires a separately changed contract.

The actual database session_user must already have current scope membership.
The exact candidate/version must exist in that scope and remain the latest
candidate for its originally bound mention and actor. The actor must exist in
the same scope. Candidate actors are existing owner-seeded scoped stubs; labels
and ranks do not establish canonical identity or confidence.

The reader takes the existing policy and membership locks, discovers an immutable
mention lock key, takes the same mention advisory lock as candidate/decision
writers, then checks the current head. It deliberately remains VOLATILE so a
successor committed while the reader waits is visible to the post-lock query.
It invokes unchanged-call-contract check_mentions, as replaced by native-fields
003, for the target plus all ordered supporting/conflicting references. That
validator checks the originally admitted native capture, job, article, content
and field hashes, versions, spans, current access, budgets and ordered access locks.
Native resolution retains its existing statement snapshot. No latest capture or
alternative evidence is substituted.

Output has exactly these top-level keys:

- scope, candidate_id, mention_id, actor_id, version, predecessor_id
- rank, method, supporting_mentions, conflicting_mentions
- policy_version, proposal_only=true, identity_accepted=false
- production_qualified=false, source_authority_qualified=false,
  transport_qualified=false, publication_allowed=false

The only nested values are the two ordered UUID arrays. No field, literal,
capture payload, actor label, internal position, decision, diagnostics or nested
source envelope is returned. Existing method is returned as untrusted text,
never executed or interpreted as authority. It must fit 256 raw characters and
1024 UTF-8 bytes: unchanged 001 bounds only btrim(method), so larger historical
padding is refused rather than silently normalized into a different retry payload.
This reader does not promise that arbitrary caller-authored method text has been
semantically sanitized; minimization concerns the data it selects.

The consumer can reconstruct the exact existing put_candidate arguments from the
returned proposal, preserving evidence array order and predecessor/version.
Superseded proposal reads refuse even though 001 may acknowledge an exact retry
of a historical candidate write. This is a current proposal reader, not a
historical proposal export endpoint. A competing candidate for another actor
does not supersede this candidate; it can still invalidate a prior decision's
candidate-set ceiling.

The returned proposal is not a decision. Only explicit authorized reviewer
`decide` writes establish reviewed status. Every accepted consumer still calls
`resolved_actor(scope,mention_id,exact_expected_decision_id)`, which checks the
latest accepted decision, candidate head/set and current evidence access.
Neither a proposal response nor an old decision acknowledgement replaces that read.
Optional 002 agency consumers additionally require their own exact actor revision,
candidate/decision and assertion bindings unchanged.

## Dependency and installation order

These files are a disposable qualification slice, not a deployment migration.
Parent integration must stage exact dependency files before executing the fixture:

1. `tests/changeQueueFixture.sql` — synthetic native substrate only;
   blob `235f92e0ce285cbf5426444b06b576a39adb1e38`.
2. `supabase/migrations/20260905082406_evidence_pipeline_reliability.sql`;
   blob `e7beb22b9a4dd2e38076b5554c7f5b4e6e0e4e77`.
3. `supabase/qualification/entity-resolution/001_mentions.sql`;
   blob `3f86cfdfe0503ca5b4277afcf601c6a716531ca9`.
4. `supabase/qualification/entity-resolution/native-capture-fields/003_native_fields.sql`;
   blob `ffc192276276cea2345690bccc7b65d54a0f0ab6`.
5. This directory's `004_candidate_review.sql`.

Optional unchanged `002_agency.sql`,
blob `e4af0a992f658d1158c6f4fd59f34279ca6048f5`, may follow 001 before or after
003/004. It is not required by this reader and is not installed by this fixture.
The occurrence extractor is also not a reader dependency: admitted immutable
mentions and candidate proposals are the existing boundary. Its original field,
configuration, plan and replay requirements still belong to its caller.

004 runs in one transaction, grants only the named new function, and asserts
final ownership/attributes (001 owner/gateway/admin INHERIT=true; 003 validator
INHERIT=false), no outgoing protected-role memberships and no incoming owner-role
memberships, schema owner/USAGE with
CREATE denied to gateway/admin, ambient role denial, the private validator path,
execute ACL and
forced-RLS/table privacy. It does not replace existing consumers or modify their
rights. Installation is one-time; an already existing same-name function refuses.
After dependent consumers are retired, source rollback is the narrow owner action
`DROP FUNCTION mip_mentions.read_candidate_proposal(uuid,uuid,integer)`;
no historical rows need deletion. Do not execute installation/rollback on a hosted
target without the parent's separate qualification and authorization closure.

## Synthetic PostgreSQL fixture

New test: `tests/nativeCandidateReviewPostgres17.test.mjs`.

Parent provides a dedicated empty database named `mip_candidate_review_test`
inside the already authorized disposable PostgreSQL 17.6 container, bound to
127.0.0.1:5432 with SCRAM and the existing synthetic password
`mip-efta-disposable-ci-only`. The test accepts no hosted URL. It requires exact
server_version_num 170006 and refuses unrelated schemas/public catalogs,
extensions, global fixture role names and other guarded database objects.

With Node 22.14.0 and the parent's existing pg dependency:

```text
MIP_NATIVE_CANDIDATE_REVIEW_DISPOSABLE=synthetic-pg17-only
node --test tests/nativeCandidateReviewPostgres17.test.mjs
```

The parent-owned manifest must also be staged at
`verifier/qik-c6-c9-caller-source-successor.json` (authoring blob
`98e6f0e09bf1df6807b34da6f3dad3031b23cc80`). Each actual proposal output is
compared to stages[0].retained_fields as well as the explicit tuple, nested-value,
flag and sentinel checks. The manifest is a fixture dependency, not installed SQL.

The seven groups cover complete exact proposal/retry metadata and ordered arrays;
direct/gateway/invoker-wrapper permissions with real SCRAM session identities;
scope/version/missing/source/hash/job binding/access/corruption refusals;
the separate accepted reader and candidate-set invalidation;
both real PostgreSQL Lock-observed successor race orders and metadata bounds;
assertion-only rollback drift checks for role attributes, schema rights, outgoing
memberships (including an incoming owner grant to the fixture guest), new reader
grants, inherited ambient access, private helper grants and
forced RLS; and final ordered ownership, role attributes, memberships, execute ACL, private
resolver denial and forced-RLS assertions. Existing schema/column/table/function
ACLs, roles, membership and RLS policies are compared before and after installation.

The wrapper lives only in the disposable `candidate_review_fixture` schema and
is SECURITY INVOKER. It demonstrates that wrappers cannot confer gateway or
scope authority, not a hosted transport implementation. Source-corruption cases
use privileged synthetic fault injection in a transaction, switch to Alice's
session_user for the attempted read, and roll back before continuing. This is
not the supported administrative mutation contract; real revocation uses the
existing set_membership/set_field_access functions.

All clients and each owned cleanup stage are attempted even after failures; a
static cleanup failure follows all attempts. Primary setup failure and cleanup
failure are represented independently in a sanitized AggregateError when both
occur. Subtest failures use static diagnostics so driver/assertion values are not
reflected in fixture logs. Parent destroys the dedicated
database/container and verifies external cleanup. No tests were run during source
authoring; runtime qualification and any fresh external review are parent work.

## Remaining operational responsibility

A real caller still needs a qualified target installation, actual DB principal
mapping and role membership, legitimate scope/source authority, owner-admitted
fields and actor identities, a candidate proposal producer or explicit proposal,
and authorized reviewers. No pooled JWT/GUC identity transport is implemented.
Mechanical byte validation does not establish semantic candidate correctness,
canonical actor mapping, reviewer quality, NER quality or publication permission.
