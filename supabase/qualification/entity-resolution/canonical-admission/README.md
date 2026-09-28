# Governed canonical admission (source candidate)

This successor defines an explicit reviewed canonical relation producer. It does not install into a hosted project, admit actual evidence, establish extraction completeness, calibrate probability, qualify production, or authorize publication. Historical sources and predecessor assertions remain unchanged.

## Dependencies and installation

Install in this order, with the existing trusted installation identity and its original privileges:
1. Native reliability substrate: `supabase/migrations/20260905082406_evidence_pipeline_reliability.sql`.
2. `entity-resolution/001_mentions.sql`.
3. `entity-resolution/native-capture-fields/003_native_fields.sql`.
4. `entity-resolution/candidate-review/004_candidate_review.sql`.
5. `arc-membership-qik-source/001_storage.sql`, against the actual required article/entity/arc catalog.
6. This directory's `005_canonical_admission.sql`.
7. `arc-membership-qik-source/002_governed_writer.sql`.

Paths above are under `supabase/qualification/` unless explicitly stated otherwise. Optional agency 002 is not required or exercised. The canonical entity catalog must expose UUID id, text canonical_name/normalized_name/type, and text[] aliases. Runtime installation refuses a different shape. This is not evidence that a hosted installation occurred.

The exact unchanged dependency blobs are:
- native reliability: e7beb22b9a4dd2e38076b5554c7f5b4e6e0e4e77
- mentions001: 3f86cfdfe0503ca5b4277afcf601c6a716531ca9
- native003: ffc192276276cea2345690bccc7b65d54a0f0ab6
- candidate004: e25930fb4552b7b0086d7d1c50414845df453dbc
- qik001: fc321af39e982e0cb1f06238c81f99d2dcc6fe8a
- synthetic substrate tests/changeQueueFixture.sql: 235f92e0ce285cbf5426444b06b576a39adb1e38

## Review and identity semantics

Actual session membership and can_decide authorize review. Supplied principal IDs, caller GUCs, native collection tokens and source enabled flags do not authorize it. Gateway membership alone is insufficient.

`mip_mentions.admit_actor_locator(scope uuid,actor uuid)` creates a scoped nonsemantic locator with its UUID text as label. Existing actors are returned without relabeling. This neither admits canonical equivalence nor creates a qik entity.

`review_canonical_mapping(scope uuid,revision uuid,actor uuid,entity uuid,version integer,predecessor uuid,state text,identity_digest text,reason text)` explicitly binds two supplied IDs. The digest is SHA256 of UTF8 PostgreSQL JSONB text for {id,canonical_name,normalized_name,type,aliases}, version qik_entity_identity_v1. Alias order and NULL distinctions matter; mutable counts/dates do not. Identity serialization is bounded to 16384 bytes and 64 aliases. No label inference or merge occurs. Reasons are identity_reviewed, identity_replaced, identity_revoked.

`review_weight_policy(scope uuid,revision uuid,policy_key uuid,version integer,predecessor uuid,state text,reason text)` establishes an immutable reviewed policy revision. Its sole semantic kind is reviewed_evidence_weight_v1. Reasons are weight_policy_reviewed, weight_policy_replaced, weight_policy_revoked. This is an uncalibrated reviewed evidence weight, not probability, rank, accepted Boolean, institutional identity or historical extractor score.

`review_canonical_admission(scope uuid,revision uuid,mention uuid,version integer,predecessor uuid,state text,decision uuid,mapping_revision uuid,policy_revision uuid,weight numeric,reason text)` requires an explicitly supplied finite 0..1 weight. Normalized numeric text must fit 64 bytes; excess precision is refused, not rounded. Reasons are evidence_reviewed, evidence_replaced, evidence_revoked. Each active admission validates the exact current accepted decision/candidate set, canonical mapping and policy head, and original native capture/job/article/content/field/span hashes and versions. Legacy raw fields cannot become native target evidence. Supporting/conflicting mention validation remains the existing contract.

Each revision family uses active/revoked state, explicit positive version and predecessor, append-only history and a separate current head. Exact retry must use the same request ID, original parameters and session principal; active retry revalidates current authority. Stale retry never resurrects prior eligibility. Revocation preserves the predecessor binding without requiring stale bytes to become readable. Changing a mapping or accepted decision requires explicit new relation admissions.

## Reduction and projection API

All functions below are in mip_arc_qik_source:
- prepare_governed_relation(scope uuid,article uuid,entity uuid)
- prepare_governed_article(scope uuid,article uuid,expected_capture uuid)
- write_governed_relation(scope uuid,request uuid,article uuid,entity uuid,expected_predecessor uuid,admission_ids uuid[],expected_set_digest text)
- read_governed_relation(scope uuid,article uuid,entity uuid,expected_projection uuid)

The relation is the complete sorted current active admission-head set for this article/entity. Every member must validate and share a mapping and weight-policy revision. Its value is the maximum explicitly supplied weight. No first-seen selection, subset acceptance, silent omission, truncation or automatic extraction occurs. A stale member refuses the whole group until explicit successor/revocation. A new request with an unchanged set is refused; exact request replay is idempotent. Changed prepared metadata between prepare and write refuses safely.

The writer reserves each projected article/entity pair privately and refuses an unowned existing link, including an RLS-hidden collision. It appends projection history and changes only its owned cache link/current head. It does not overwrite unrelated relations. Old public.article_entities rows are private historical cache, not current authority. Only the exact governed reader revalidates current dependencies and the cache binding. Staleness refuses; it does not imply zero entities.

Article preparation binds the caller's originally named capture. It includes all current heads, including revoked revisions, in article_set_digest. Each active head must belong to that capture and validate. Empty status is no_admissions_not_extraction_complete. Every admitted group is returned, including admitted_not_projected. Projection changes do not alter article_set_digest; a downstream attestation must also bind returned projection IDs/status.

## Exact returned fields

Every public receipt includes these four false flags: production_qualified, source_authority_qualified, transport_qualified, publication_allowed.

Actor locator: scope,actor_id,locator_only,identity_accepted, plus four flags.
Mapping/policy/admission review: kind,revision_id,version,state, plus four flags.

Base relation group G: semantic_kind,scope,article_id,entity_id,mapping_revision,weight_policy_revision,admission_ids,evidence_weight,set_digest.
Prepare relation: G plus projection_status,expected_predecessor,current_projection_id and four flags.
Read/write relation: G plus projection_id,version,predecessor_id,projection_status and four flags.
Prepare article: semantic_kind,scope,article_id,capture_id,head_revision_ids,groups,input_status,article_set_digest and four flags.
Nested article groups: G plus projection_status,expected_predecessor,current_projection_id, without flags.
Projection status is projected_current or admitted_not_projected.

Only UUID arrays and the explicitly enumerated article group objects are nested outputs. No bytes, labels, arbitrary reasons, identity JSON, diagnostics or candidate method are returned. set_digest hashes UTF8 JSONB text of G before adding set_digest. article_set_digest hashes the canonical article object before adding article_set_digest, flags or projection decoration. These are PostgreSQL canonical serializations, not arbitrary client JSON.stringify equivalents.

## Durable column inventory

All are typed scalar columns except the bounded UUID admission_ids array; none retain source payloads.
- mip_mentions.canonical_mappings: scope,id,actor_id,entity_id,version,predecessor_id,state,identity_kind,identity_digest,reason,principal
- mip_mentions.canonical_mapping_heads: scope,actor_id,revision
- mip_mentions.canonical_weight_policies: scope,id,policy_key,version,predecessor_id,state,semantic_kind,reason,principal
- mip_mentions.canonical_weight_heads: scope,policy_key,revision
- mip_mentions.canonical_admissions: scope,id,mention_id,version,predecessor_id,state,decision_id,mapping_revision,policy_revision,evidence_weight,article_id,entity_id,field_id,capture_id,job_id,content_hash,field_hash,source_version,field_version,start_pos,end_pos,span_hash,reason,principal
- mip_mentions.canonical_admission_heads: scope,mention_id,revision
- mip_arc_qik_source.governed_ownership: article_id,entity_id,scope,first_projection
- mip_arc_qik_source.governed_projections: scope,id,article_id,entity_id,version,predecessor_id,mapping_revision,weight_policy_revision,admission_ids,evidence_weight,set_digest,principal
- mip_arc_qik_source.governed_heads: scope,article_id,entity_id,projection_id

Revision IDs/versions/predecessors support exact retry and supersession. Principals bind original review/write authority. Enumerated reasons identify the typed review operation. Identity and source hashes bind exact versions. Heads select current state without destroying history. Ownership distinguishes this writer's cache from unrelated qik relations.

## Locks, budgets and restricted helpers

Order is existing policy head, actual membership, canonical scope advisory, downstream collector/publication fences if applicable, globally sorted target/support/conflict mention advisory locks, ordered source access validation, then projection mutation locks. Standalone group/article preparation first validates the complete context to prevent later per-admission reads from acquiring an earlier source lock. Entity identity mutation takes policy-head UPDATE in BEFORE STATEMENT triggers, before tuple locks. Counter-only entity updates are excluded. Identity-column updates conservatively lock even when values are unchanged.

Private canonical_begin(scope uuid,review boolean,exclusive_policy boolean default false) is invoker-only and unavailable to gateway. A downstream protected owner can invoke it through an explicitly granted owner context function. canonical_prelock_articles(scope uuid,articles uuid[],captures uuid[]) is SECURITY DEFINER and has no gateway grant. A separately qualified downstream installation must grant only its protected owner execution; no role membership is added.

Cohort bounds are 32 unique article/capture pairs, 128 total current heads per article, 64 active per article and 64 active across the cohort, current policy max_context (also predecessor hard cap128), and inherited field/byte budgets. A 33rd pair, 129th head or 65th active head refuses the entire operation. Context multiplicity is conservatively checked before distinct aggregation. No truncation is treated as completeness.

Private prelock receipt keys: context_count,field_count,selected_field_bytes,span_bytes,native_capture_bytes_unique,native_capture_hash_bytes,source_and_span_bytes,largest_field_bytes,policy_version,max_context,max_fields,max_field_bytes,max_total_bytes. These count the one grouped prelock, not all later repeated work. native_capture_hash_bytes charges the original capture once per distinct resolved native field; native_capture_bytes_unique counts each distinct original capture once. canonical_capture_octets(scope uuid,field uuid) is STABLE SECURITY DEFINER owned by the existing native validator, callable only by that validator/mention owner. It returns an integer size, never source bytes, and uses existing source grants.

For a downstream sequence of one cohort prelock, one article preparation per article and one exact relation read per group, a conservative full-payload hashing upper bound is H*(1+N+4*A), with H=native_capture_hash_bytes, N=article count, A=active admissions. Add scalar-path full-capture visits separately (four scalar field resolutions charge four payload hashes per article). A conservative field/span hash bound is (selected_field_bytes+span_bytes)*(1+N+4*A), plus at most 16384*2*A identity bytes and bounded metadata digests. The reviewed downstream max_hash_work_bytes may be at most134217728, distinct from its max_total_bytes<=8388608. Downstream must charge actual conservative transient/input allocations and refuse above its limits. This file does not claim one grouped pass accounts for all CPU. Standalone calls retain their explicit cardinality and aggregate inherited validation bounds; they do not claim the downstream full operation budget.

## Security boundaries

Canonical metadata remains owned by existing mip_mentions_owner with its unchanged intended INHERIT attribute, no incoming/outgoing memberships, FORCE RLS and session scope policies. The new mip_canonical_writer is NOLOGIN/NOINHERIT/NOBYPASSRLS with zero memberships, owns only projection state and has necessary article_entities DML. Gateway receives only named public functions, no new source/table access. Native validator gains only the private size function, no new source grants. Temporary schema CREATE/installer memberships are revoked.

The article_entities statement write fence alone changes to permit the private writer path. The TRUNCATE fence remains. Release-policy fences, privileges and closed state remain unchanged. Ambient browser/service roles cannot invoke the new reader or read its cache. Existing unrelated native/service rights are preserved. Trusted owner DDL is outside the runtime contract.

## Synthetic qualification

Authored test: tests/nativeCanonicalAdmissionPostgres17.test.mjs. No execution result is claimed here. Parent must run in a pristine dedicated PostgreSQL17.6 database named mip_canonical_admission_test, loopback127.0.0.1:5432 with SCRAM, Node22.14.0 and pg. Set MIP_NATIVE_CANONICAL_ADMISSION_DISPOSABLE=synthetic-pg17-only and run node --test tests/nativeCanonicalAdmissionPostgres17.test.mjs. The existing qualification-only password is fixed in the fixture. No hosted URL is accepted. The runner creates/drops the dedicated DB and destroys the container/volume.

The fixture refuses unrelated catalogs/reserved global roles, installs real dependencies, creates full synthetic entity identity columns, uses real native enqueue/claim/finish and field/mention/candidate/decision APIs, then exercises actual review/projection functions. It covers explicit actor/identity/weight authority, Unicode/span/native binding, exact retry, collisions, full-set/max reduction, stale decisions/mappings/policies, missing/tampered/inaccessible evidence, nested/scalar output allowlists and sentinel absence, wrapper/direct permissions, actual blocked mutation/reader serialization and final owner/ACL/RLS/fences. All connection/cleanup stages are attempted independently; static primary and cleanup failures are retained without logging source or driver payloads. Optional agency is not installed. Parent must qualify and independently review the coherent integrated successor before any separately authorized hosted action.
