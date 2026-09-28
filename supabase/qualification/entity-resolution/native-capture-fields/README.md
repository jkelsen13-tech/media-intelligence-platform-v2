# Native capture field admission qualification

This is successor source for disposable PostgreSQL 17.6 qualification. It is not an installation authorization, entity extractor, live source-authority qualification, accepted identity, or publication path. All production/source-authority/transport/publication flags remain false.

## Explicit dependency order

1. The actual V2 public native substrate (articles, nodes, geographic places, pipeline_config and spatial_projection_v1); synthetic runner uses existing tests/changeQueueFixture.sql only.
2. supabase/migrations/20260905082406_evidence_pipeline_reliability.sql (actual native import_jobs/article_captures and immutable history triggers).
3. supabase/qualification/entity-resolution/001_mentions.sql unchanged.
4. Optional supabase/qualification/entity-resolution/002_agency.sql unchanged. It may run before or after the successor.
5. This directory's 003_native_fields.sql. This is an explicit qualification successor, deliberately outside automatic migrations.
6. A separately reviewed owner operation admits exact native field identities. No actual identities are provided in this source.
7. Existing scoped membership and independently approved field_access remain required. Admission creates neither.

003 does not rewrite historical raw rows or weaken their existing hash/UTF8 constraints. It extends their table with nullable raw plus a disjoint storage-kind constraint. New native field rows contain only capture/job/article locators, native content hash, source field, exact UTF8 field hash/length and immutable version strings. The existing immutable field triggers protect both representations. There is no native payload/raw-byte table, no cache and no second capture.

## Owner-only admission and bytes

admit_native_field(scope, field UUID, capture UUID, job UUID, article UUID, native JSONB content hash, source field, exact UTF8 field hash, byte length) is an owner-only function, not a gateway/admin/worker endpoint. The current session principal must already be a scope member. Explicit owner admission validates the retained source before inserting the field reference. Its private native_binding_bytes helper reads no field row, avoiding any dependence on a STABLE resolver observing an INSERT performed earlier in the same admission statement. A mismatched retry fails; an identical retry revalidates the same source and returns identical metadata. Failed validation inserts no field reference.

The admitted versions are exactly:
- source_version = native-capture:<capture UUID>:<native content hash>
- field_version = native-field:utf8:v1:<title|summary|body_text>:<UTF8 field hash>

These version strings describe the original immutable capture and named field; they do not select latest article content. The native content hash uses PostgreSQL JSONB text encoding, exactly as existing native enqueue does; the field hash uses convert_to(field text, 'UTF8'). Spans remain zero-based half-open Unicode code points. No normalization, trimming, NFC conversion or UTF16 indexing is introduced.

A new dedicated NOLOGIN/NOINHERIT/non-BYPASSRLS function owner has column-select rights only on required fields/members metadata and the native capture/job columns. It has no raw historical column privilege, no native mutation privileges, no memberships, no schema CREATE and no exposed entrypoint. Its STABLE security-definer resolver reads exact fields plus exact capture/job relation from one statement snapshot and returns transient bytes only to mip_mentions_owner. The original native/service_role rights remain unchanged. Owner-only admission calls native_binding_bytes before INSERT. The existing check_mentions calls resolve_native_field, which reads the original admitted metadata and delegates to the same private binding validator. Both byte functions are STABLE, use the caller's statement snapshot, and share the same restricted owner and ACL assertions. Gateway/browser/worker/admin access to both byte functions is denied.

Runtime source-read revocation remains the existing field_access contract, locked before byte resolution; neither private byte function is a source-access capability for a caller. Native source SELECT policies intentionally apply only to the isolated NOLOGIN validator role, which has no members; they are not per-user field-access grants. The existing operational revocation helpers take policy_head UPDATE, while consumer wrappers hold policy_head and membership SHARE before the ordered field_access locks. Owner admission retains the separate owner-seeding authority and returns only metadata even when no field-access row exists. No collector token, enabled source, extraction envelope, membership creation or actor inference is accepted as source authority. Raw privileged DML outside the existing operational admin contract remains outside concurrency qualification.

## Actual consumer closure

Only check_mentions is replaced. put_mention uses its transient private text result with its original exact hash/version/span checks and durable mention literal. Existing mention literals retain their original meaning; complete native payloads/fields are not added to metadata or wrapper results.

001 consumers through check_mentions: put_mention, put_candidate, decide, resolved_actor, candidate_page (selected rows, lookahead and cursor context), annotate_participants and read_mention. 002 consumers: put_actor_revision, put_actor_lineage, put_agency, read_agency, actor_history, agency_history and read_lineage; their exact mention references all converge through check_mentions. No consumer selects a newer capture or replaces its evidence reference.

The original policy-head SHARE -> membership SHARE -> mention lock -> ordered field_access SHARE sequence is preserved. Budget checks use immutable stored native byte length before resolver access; the resolver checks it against actual bytes. Resolution and hashing are bounded by the native capture ceiling and active field/total/context policies. Capture history immutability provides stable retained source rows; the stable resolver uses a consistent statement snapshot for the job relation too. A stale/missing/denied/tampered capture or job relation fails closed.

## Synthetic verification

Parent executes tests/nativeMentionFieldsPostgres17.test.mjs with MIP_NATIVE_MENTION_DISPOSABLE=synthetic-pg17-only against a dedicated empty loopback SCRAM PostgreSQL 17.6 fixture using the existing synthetic password. The runner guards version, empty substrate, reserved role absence and SCRAM before cleanup is armed. It uses actual native enqueue/claim/finish and actual 001/002 SQL, not a replacement native adapter. Cleanup removes only fixture-owned schemas/objects/roles.

Tests cover owner-only admission and no automatic access, exact job/capture/article/hash binding, failed-admission rollback, duplicate/lost-result retry, Unicode astral/combining spans, source/field versions, unchanged historical bytes, native metadata raw=NULL, no private field sentinel in metadata or nested wrapper results, direct resolver/raw denial, existing service_role rights, actual candidate/decision/agency consumer revocation, original capture retention after a newer revision, missing/hash/byte/state/visibility corruption refusal, immutable source rejection, membership revocation and actual PostgreSQL lock waits in both revocation orders.

No tests were executed in the worker investigation environment. Parent must run the source, repair failures, and obtain fresh actual Cursor consequential review before any hosted installation. Do not infer production qualification from static tests or from this implementation authorship.
