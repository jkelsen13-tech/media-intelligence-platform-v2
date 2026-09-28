# Historical arc public-projection dependency qualification

This directory contains a **disposable synthetic fixture**, not a deployment migration or a native public-approval implementation. The PostgreSQL test runs the recovered projector, milestone evaluator/refresh, candidate timestamp/state triggers, retractor and atomic attachment code against synthetic rows. It does not enable automatic approval, grant an application publication capability, or prove a hosted deployment. Source was authored without execution.

## Source identity and installation

The repository dependencies are pinned to the selected historical source content in `historical_manifest.json`. The input repository revision was `79f25d3519d26fd0dbda37fd0728e5783c04834a`. Existing source files remain unchanged.

1. A dedicated PostgreSQL **17.6** database, with **pgvector 0.8.2** and **pg_trgm 1.6** extensions available, is required. The fixture creates both extensions inside its newly owned database and asserts their exact versions. pg_trgm supplies the recovered body/summary/title gin_trgm_ops indexes; the exact schema and indexes remain unchanged.
2. `historical_schema.sql` creates the recovered fourteen relations, selected exact column types/defaults/checks/keys/indexes, and the real authors/outlets foreign-key dependencies. All sixteen tables retain RLS enabled. It grants no application table permissions.
3. The manifest loads five recovered real function bodies and the unchanged atomic attach migration. It extracts only the named real functions from the recorded retraction fixture, public predicate migration and schema source. In particular, it never installs the retraction fixture's no-op refresh or synthetic-unreached projector.
4. Exact recovered trigger definitions are installed after their real functions. The unrelated source-status D5 propagation trigger is explicitly excluded: this fixture does not mutate source_status or claim D5 propagation coverage.
5. PUBLIC execute is removed from the twelve selected fixture functions before tests. This isolated synthetic privilege setup is not a proposal to revoke unrelated qik permissions.

Recovered source identities:

| Body | Git blob | Server source SHA256 |
|---|---|---|
| milestone outcome | 3dbcf5fa80cb182b26d443044e58b17b12f6121b | b82b49f1ce1a093da035e80a2de98bf0478ce3bf1a8a30ead44a0f3c4cdd7893 |
| milestone refresh | 3d2b05014e8dd22abffe6a9fa2d41db8824bd3e9 | 0383af905b9451f8318748756cb9efa1e87c59e41d93f419ad4fe9ec4b99faa7 |
| candidate touch | 2b474cb7dcf7dbc80867521c94ea6f80dbc0d5cd | 93a38d3207377c51dff1528b0b5e4d2368f64f69a0db931040528b25fa9530bb |
| projector | 1060e1aa6424b67ed7e03b5fd6f9c2cde6a51f4c | parent-recovered exact body |
| legacy approver | 1a1fcf4c26f214dad3ef2b616f47b08246c64802 | parent-recovered exact body |

Schema/trigger/index metadata was recovered as source-only blobs `9f3ad8a71a2a81b0168fddc031a78be3e1f8f09d` and `b85eccfe5952d7dc85c78a5b814e678e175d66a7`. No stored article, score, capture, candidate, citation, or graph rows were recovered. Credential screening was applied to recovered definitions/default expressions. The fixture does not reproduce legacy broad function ACLs.

## What the actual test is intended to establish

The ten child checks cover the installed recovered column shapes/RLS; unchanged milestone failure precedence, null/no-match and unknown-key behavior; default-closed legacy approval; real state-change projection followed by atomic attach and exact retry; real retraction and milestone baseline restoration; null-vector/no-root/no-document-citation branches; a lock-observed concurrent duplicate attachment; active failure precedence and remaining evidence restoration; transaction rollback when a required real conflict index is missing; and denied ambient source/function access.

The historical projector fires after candidate approval and before the legacy approver calls atomic attach. Candidate touch unconditionally advances updated_at. The fixture uses a clearly named privileged synthetic setup operation to exercise that ordering without turning on auto_approval_enabled. That setup is not a manual approval function or an application caller path.

The real atomic function preserves same-arc strict no-op behavior and its original vector fold. The fixture exercises one vector, duplicate vector and absent vector paths; it does not claim a complete numeric accuracy study or legacy reparent support. The original function does not decrement the previous arc centroid on reparenting.

The fixture's metadata sentinel is body-only. It asserts that the full body sentinel remains in the synthetic original article and is absent from the derived graph/projection/evidence destinations. This is not a claim that those destinations contain no text: the projector deliberately stores bounded title/summary/URL/outlet fields.

## Concrete retained fields and consumers

The unchanged projector consumes candidate/approved score identity, article title, summary, body_text, URL, outlet, published_at, arc category/root, selected pending milestone keys, and existence of court_doc/agency_release citations. Body is transient milestone matching input. The old projector produces node/source/event display text and URLs; these are public projection content, not metadata receipts. Sequence edges carry the original fixed provenance fields.

The milestone baseline retains prior status and notes for the concrete retraction/refresh consumer. Milestone evidence retains outcome, article title/URL, candidate/milestone IDs and timestamp; refresh combines active runs, prioritizes failure, and reconstructs projection notes. Retraction removes derived node/source/edge/event rows while preserving baseline/evidence history. Projection runs retain generated object IDs and lifecycle timestamps for idempotency and cleanup.

These historical public copies must not be presented as native capture lineage. A native successor needs original capture/job/article/content identity, exact body/URL/citation field hashes and restricted current access; selected arc/root/milestone context plus exact revision; and an explicit original vector384 producer binding if a vector is used. It must refuse foreign conflicting projection objects, stale reviewed generations, unowned reparenting, or missing/inaccessible lineage rather than fall back to mutable public values.

## Actual qik compatibility boundary

Read-only catalog evidence found nine existing related qik tables: articles, story_arcs, arc_membership_candidates, nodes, edges, sources, arc_events, arc_milestones and citations. They are ordinary RLS-enabled tables. The five score/release/projection tracking tables used here were absent. qik also lacked the projector's candidate partial unique indexes and its exact edge conflict target; its arc vector type was unconstrained vector rather than historical vector(384). The targeted public.article_entities lookup returned no relation.

Consequently this fresh historical fixture is not an idempotent qik installer. A production successor must validate/adopt the actual existing table shapes and rows without blind CREATE, blind upsert, corpus resanitization, unrelated ACL revocation, or arbitrary owner privileges. The required new tracking and conflict-ownership contract remains explicit source work.

## Manual publication dependency

The unchanged legacy approver requires fixture_passed AND auto_approval_enabled AND a threshold. It is not suitable as the requested manual generation-bound native approver while automatic approval remains closed.

Current cutover source `004_publication_staging.sql` (38379113e73d5fea1f3a3dba8647f374ed2733fe), `007_survivor_release.sql` (9f7038d8e921ef7839a35375f2f05294058e3383) and `009_factual_enforcement.sql` (60e6198c3ad389c335dfe56024153a187f30f0a4) bind publication to their comparison generation, dependency and privacy/rights review contracts. The selected public-release function deliberately refuses; isolated release has a distinct reviewed contract. A native accepted_private score or scoped can_decide membership does not itself satisfy that publication review. This fixture does not change that boundary.

The next production source step is a reviewed native publication-input/dependency contract that binds the exact native generation/output plus required body/URL/citation/arc/vector inputs to the existing publication predicates, followed by a manual transaction adapter that owns only its derived objects and invokes the actual selected projector/attach behavior. It must preserve pending/private state until the existing release requirements are satisfied. This is required integration work, not an optional future feature, and no new eligibility or public release is claimed here.

## Invocation and cleanup

Use Node **22.14.0**, the repository's existing pg dependency, and the already selected disposable PostgreSQL 17.6 + pgvector 0.8.2 + pg_trgm 1.6 route. The administrator connection is fixed to localhost:5432 with the existing synthetic-only qualification credential. No hosted configuration is read.

```sh
MIP_ARC_PUBLIC_PROJECTION_DISPOSABLE=synthetic-pg17-only \
MIP_DISPOSABLE_POSTGRES=qik-persistent-install \
node --test tests/nativeArcPublicProjectionPostgres17.test.mjs
```

The test requires database `native_arc_public_projection_qualification` and role `native_arc_projection_fixture_reader` to be absent. It creates and tracks them explicitly; cleanup closes both test clients, verifies zero remaining sessions, then drops only the database and role it created. An existing database or role is never adopted or destroyed. Primary and cleanup failures remain separate bounded static diagnostics containing only stage/check index, SQLSTATE, numeric source position and test source line/column. Raw driver messages, SQL detail/context, parameter values and assertion values are not propagated.

This fixture requires its own qualification and consequential review after integration. It does not qualify the full native publication adapter, public reader visibility, current-access revocation, rights review, hosted installation, or actual material execution.
