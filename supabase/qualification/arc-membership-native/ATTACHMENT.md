# Private governed Arc membership successor

This component is an explicit manual private membership transition, separate from accepting a private score. It does not approve a legacy public candidate, change public.articles.arc_id, set the historical approval GUC, invoke the public projector, enable an automatic threshold, or confer publication eligibility. Public C9 release/projector integration and its C10 event/milestone semantics remain required mission dependencies.

## Recovered historical authority

Full source was read from the already recovered GitHub blobs:
- mip_approve_arc_membership_candidate: 1a1fcf4c26f214dad3ef2b616f47b08246c64802; source SHA256 469d0f189bbab002689221ebd10bd2246f9042daf27500c35cd1569fb0558703.
- mip_project_approved_arc_membership: 1060e1aa6424b67ed7e03b5fd6f9c2cde6a51f4c; source SHA256 46518aa16161e87656f88081fa9262ec1f785f58c74b148be9b0e22a0780c20e.

The historical approver requires a pending candidate, latest admissible score with no hard rejections, exact candidate timestamp, and a fixture-passed, auto-enabled, nonnull release threshold met by the score. Private acceptance does not satisfy this contract. This successor never enables auto approval to reuse it.

The historical projector requires approved candidate/score, then writes nodes, sources, arc_events, edges, projection_runs, milestone baselines/evidence and story_arcs.last_update_at. It maps Arc categories to event categories, derives event confidence from citation kinds, hardcodes node confidence70, uses article publication date as event date, and applies milestone outcome/refresh helpers. Those historical transformations are not imported as new evidence policy. Their explicit public release and C10 qualification remain unresolved by this private component.

## Dependency order and shared validation

Install the complete existing native capture, mention001/native003/candidate004/canonical005/qik001/qik002 and native C9 dependencies, then the coordinated native001/002 shared attachment validation core, then 003_governed_attachment.sql. Do not install this against the older ff213/f2f950 native pair alone: the required protected functions are:
- prepare_attachment_input(uuid,uuid,text,text,uuid)
- validate_attachment_set(uuid,uuid,uuid[])

The predecessor native pair ff213eb4420ebd3b42a75ece4fd0bf656e2978de / f2f950cf2822576e5687c795146bc3f9ceaa630f supplied the original score/cohort contract. Parent records the exact coordinated successor pins in the integrated manifest after both owners deliver source.

Normal capture/score validation includes the COMPLETE public and private membership union, excluding the candidate, with max31 members plus candidate. Every private addition, replacement or revocation advances the Arc revision and invalidates old ordinary current-score input. Missing or over-budget evidence refuses the whole operation, never truncates.

Current private attachment validation uses a bounded deduplicated shared source context to reconstruct each original generation. Original public members and originally bound private dependency heads must remain exact; later unrelated private heads do not rewrite an earlier attachment's original cohort. Every current private head is independently included in full-set validation. Replacing/revoking a bound dependency invalidates its dependants until explicit repair. Dependency heads must be current, same Arc and strictly earlier Arc revisions. No recursive full-payload rehash loop, fresh capture substitution or duplicated durable payload is introduced.

Lock order: existing policy/member/scope context, collector write fence, publication write fence, shared sorted mention/context/source locks, private transition mutation. Write fences precede original reader SHARE locks. All source/identity/canonical/scalar authority remains the existing validator's responsibility.

## Calls and authority

All functions are in mip_arc_native. Session membership and can_decide authorize prepare/attach/revoke; gateway membership alone does not. read functions require actual scope access.

prepare_private_attachment(scope,generation,input_hash,output_hash,review_id) validates an exact current accepted_private score and returns the version, expected predecessor and complete private set binding required by the writer.

attach_private_membership(scope,request,generation,input_hash,output_hash,review_id,version,predecessor,private_arc_revision,private_set_digest) records the separate manual membership decision. IDs/hashes are copied from the validated generation, never caller-chosen article/Arc labels. Active private reparenting and public assignment collisions refuse. Exact retry requires identical request/principal/arguments and revalidates current membership. A new version requires the exact predecessor and current set binding; unrelated history is never overwritten.

read_private_attachment(scope,attachment_id) validates the entire current Arc set and returns the named current attachment plus complete current member IDs. read_private_arc_membership(scope,arc,expected_revision,expected_digest) is the concrete private Timeline/Arc membership route. It exposes only validated IDs/digests and explicitly identifies News-record membership; it creates no event or occurrence date.

revoke_private_attachment(scope,request,prior,version,arc_revision,set_digest) preserves immutable source bindings in a revoked successor. It need not make stale source bytes readable. Dependent attachments remain retained and cause whole-set refusal rather than being silently omitted.

## Private storage and minimization

mip_arc_attachment_owner is isolated NOLOGIN/NOINHERIT/NOBYPASSRLS, with no memberships and no public/native source table privileges. It owns only FORCE-RLS private tables and calls restricted native validators. Existing publication predicates, source grants and worker rights remain unchanged.

Durable columns:
- attachment_revisions: scope,id,article_id,arc_id,generation_id,review_id,input_hash,output_hash,manifest_hash,version,predecessor,arc_revision,state,reason,dependency_head_ids,prior_set_digest,principal.
- attachment_article_heads: scope,article_id,revision.
- attachment_arc_clocks: scope,arc_id,revision.

The only retained array is bounded original private dependency UUIDs, consumed by successor validation. Reasons are exactly reviewed_private_membership or private_membership_revoked. No headline, body, scalar value, score payload, narrative diagnostic, arbitrary reason, entity label or event inference is retained.

Protected attachment_members(scope,arc,candidate_article DEFAULT NULL) returns exactly arc_revision,head_ids,article_ids,set_digest. It excludes the candidate only when supplied and refuses the33rd private head. Full public/private max32 is enforced by the shared validator. Arrays are UUID-sorted. The digest is SHA256 of UTF8 PostgreSQL JSONB text for {contract:"private_arc_members_v1",scope,arc_id,arc_revision,head_ids,article_ids}. Empty Arc revision is0. All transitions advance the revision, including revocation to empty.

Protected attachment_origin_record(scope,id) returns exact current active origin metadata and checks its original dependency heads. Only native owner and attachment owner can use these protected functions. It does not recursively validate source bytes; the shared batch performs that work once.

## Output contracts

All public private-membership receipts include membership_kind=reviewed_private_membership_v1, record_kind=news_record, and false flags public_attachment,publication_allowed,auto_approval_enabled,production_qualified.

Prepare adds expected_predecessor and version to native prepare_attachment_input's exact fields: scope,generation_id,candidate_id,article_id,arc_id,review_id,input_hash,output_hash,manifest_hash,dependency_head_ids,private_arc_revision,private_set_digest,approval_allowed=false,publication_allowed=false,attached=false.

Individual current reader fields: scope,attachment_id,article_id,arc_id,generation_id,review_id,input_hash,output_hash,manifest_hash,version,predecessor,arc_revision,state,dependency_head_ids,current_arc_revision,current_set_digest,current_head_ids,current_article_ids,current_member_ids,public_member_ids, plus private flags/kinds. Principal remains private durable audit metadata.

Arc reader fields: scope,arc_id,arc_revision,head_ids,article_ids,public_member_ids,member_ids,set_digest, plus private flags/kinds. article_ids are private attached records; member_ids are the complete validated public/private union.

Revocation receipt fields: scope,attachment_id,predecessor,version,arc_revision,state, plus private flags/kinds. Revocation is not a successful current-membership read. With no active private attachment, the private current reader refuses unavailable; it does not assert a newly validated empty or public-only cohort.

Only bounded UUID arrays are nested public output values. No public browser/UI grant is added. A qualified private application can use these execute-only readers; existing public Timeline readers continue their existing contracts.

## Synthetic qualification integration

tests/nativeArcAttachmentAssertions.mjs exports assertNativeArcAttachments(fixture). The actual native C9 PostgreSQL fixture must install003, guard the additional role before mutation, provide real SCRAM clients (including a separate connection for the same reviewer), create two independently reviewed native candidates through the actual pipeline, and include this helper before cleanup. It must add the new role to owned DROP OWNED/DROP ROLE cleanup after dropping mip_arc_native. No SQL/test execution is claimed by authoring this source.

The helper asserts exact output keys/sentinel absence, reviewer versus gateway/worker authority, duplicate/lost-ack retry, a real blocked concurrent retry, two sequential additions, complete private/public member output, original attachment validity after later addition, old ordinary score staleness, scalar/identity revocation refusal, dependency revocation, direct-helper/table denial, immutable metadata shape and final isolated role/FORCE-RLS boundaries. It compares public state around each attachment interval so legitimate creation of the second synthetic candidate is not mistaken for an attachment mutation. Parent fixture owns sanitized diagnostics and exhaustive cleanup. Full qualification must also exercise shared-core cohort overflow/budgets, metadata drift and source-delta races; private source passing alone is not full public C9/C10 completion.


Final installation boundary: 003 explicitly selects all 39 function signatures from native001 3097d03987aee00df912f913d41c6e0cad342b2d and native002 92c4382b46c83027f4b9b1dd0a615462680083cd plus this attachment component; all 13 tables and the single source revision identity sequence must exist. The combined boundary checks final owners, security-definer flags, fixed search paths/time settings, direct and effective execution rights, exact private RLS policies, column ACLs, role attributes and source authority. The installer replays this complete last-stage block after real temporary privilege-edge cleanup using an ephemeral installer-only helper owned by mip_arc_native_owner. Runtime gateway/admin incoming LOGIN memberships remain allowed; all protected role outgoing memberships and all private-owner/worker incoming memberships are denied. Source001 and 002 historical assertion blocks remain unchanged. The fixture identity mutation callback commits a synthetic change, exercises the independent caller, then restores the original synthetic identity in finally.
