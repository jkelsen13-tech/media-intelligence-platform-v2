# Binding-keyed private display compositor

Source authored and unrun. This is a private server consumer, not browser access or a public release. It creates no table, durable display copy, role, source grant, publication approval, or attachment.

## Dependencies and installation

Exact source base: ec4670ade45c7ccff02f1403177f642bd402e019 / tree56afb64c3774a387cbc764e1bdd91a0bb2b4b028. Install after the existing full compiled native/comparison backend and native-comparison-binding/001_private_binding.sql blob7bd78e703b1a81414e3a24b4049ea407d00435c8. That binding stage pins the prior native/private-projection dependencies and original accepted reader018 f55f7da3b22e992c20f6c968a37ae0af75dd2a47. Existing authenticated driver is collector-native-capture/authenticatedPgDriver.mjs. No historical migration changes.

The selected installer creates new schema mip_native_display using existing mip_arc_native_owner and mip_publication_owner_v2, then removes its temporary memberships and publication-owner CREATE. Replay the complete native_display_final block after actual installer privilege cleanup. It embeds the unchanged full binding-stage assertion, then checks the new zero-table schema and four exact functions/owners/attributes/ACL/effective permissions. Preserve the compiled backend's original019 permission matrix and all earlier assertions.

Functions:
- contract(text) and project(jsonb,jsonb): immutable, invoker, native owner; only native/publication owners execute. They transform bounded values and confer no source authority.
- accepted_event(broker_session uuid,runtime text,expected_comparison jsonb): publication-owner SECURITY DEFINER; only native/publication owners execute.
- read_current(scope uuid,binding_id uuid,manifest_hash text,broker_session uuid,runtime text): native-owner SECURITY DEFINER; gateway and native owner execute.

No direct018 grant to native owner or gateway, and no binding-table access granted to publication owner. No new membership or changes to existing role attributes. The protected wrapper checks all exact expected generation/input/output/review/policy/release/event IDs/hashes and original source/evidence tuples independently.

## Currentness and locks

The outer reader first calls unchanged mip_native_comparison.read_current once. This revalidates the exact immutable binding, accepted private projection, current native generation, accepted comparison and broker authority, acquiring identity/native scope/collector/publication/source locks. Those transaction locks remain held until the response transaction ends.

The outer reader then selects the exact immutable projection selected by the binding, checks its generation, dependency/display hashes and current accepted review head, and hashes the stored display. No second native reconstruction is needed: the binding reader just validated it under the same locks.

The protected publication-owner wrapper executes unchanged018 again to obtain the selected event's actual reviewed display. It compares the original expected generation, review, policy, release, input/output/approved-payload hashes and complete source/evidence metadata. Other events are not returned. Claims, evidence links and corrections are selected by the existing accepted event/claim identities; explanations use the exact007-validated claim_grouping event identity format. No fuzzy join, fresh replacement, raw source fallback, or UI identifier inference.

Every returned native/comparison source must belong to the binding. Broker authorization is repeated before returning. Revoked source access, binding, session, current review or comparison makes the entire read unavailable.

## Bounded display and minimization

The SQL projection function chooses every returned key recursively from fixed schemas. Unknown source fields are not forwarded. The JavaScript validator independently requires exact nested output keys, scalar types, byte bounds, array limits, relation identities and false publication flags. The server returns no result until validation, COMMIT acknowledgement and connection cleanup succeed.

Bounds are whole-response refusal, never truncation:32 sources;128 selected claims/evidence/explanations/links/corrections;64 private milestone outcomes;64KiB per reviewed passage;16KiB ordinary text;2KiB URL;262144-byte accepted-reader result/selected comparison;524288-byte final response;1048576-byte sum of binding manifest, stored private display, selected comparison and response. The existing comparison preflight bounds input/output/review/context to131072 bytes before the repeated018 call. Original native and binding budgets remain unchanged.

The existing legacy accepted reader performs whole-source/context validation. These response/preflight bounds do not prove a complete legacy CPU/hash-work bound. The server uses a fixed1000ms statement timeout and fails closed on timeout. It does not alter the old reader to claim a different budget. Connection establishment and client cleanup retain the existing authenticated driver's transport timeouts.

Only consumer-needed approved passages and selected private display text are returned. Whole native bodies, payloads, arbitrary archived-source objects, raw membership objects, diagnostic content, principals, credentials and broker values are excluded. No response is persisted or logged by these modules. Intentional passage return is not a promise that all source-derived text is absent.

## Actual server route

Import readNativeComparisonDisplay from serverRoute.mjs. Supply exactly:

    {
      connection: {connectionString, expectedLogin, sessionPoolerHost, disposable},
      request: {scope, binding_id, manifest_hash, broker: {session, runtime}}
    }

The connection contract and host restrictions are identical to the existing binding server caller. The actual authenticated LOGIN must have only the gateway capability. No SET ROLE/session impersonation is used by this route. Disposable testing requires MIP_DISPOSABLE_POSTGRES=qik-native-caller; production credentials/session are supplied transiently by the already authorized execution host.

A successful envelope is {state:'current_private_display',display,connection_closed:true,diagnostics:[],publication_allowed:false,attachment_allowed:false}. Any read, shape, timeout, commit-acknowledgement or cleanup failure returns display:null and fixed diagnostic codes only. Invalid configuration throws a fixed static error. No automatic retry, browser fallback, raw error echo, or new network destination.

## Consumer contract

displayContract.mjs exports DISPLAY_SCHEMA, validateDisplay and buildPrivateWorkspace. The latter supplies comparison, arc and timeline consumer models using this private binding selection:
- Comparison retains exact accepted event ID/title/status, source publisher URLs/publication timestamps, canonical claims, reviewed physical spans/excerpts, explanations, evidence links and corrections. These are the fields rendered by src/lib/sourceComparisonReadPath.js and SourceComparisonView.jsx; it does not claim omission, source independence or composite confidence beyond the accepted data.
- Arc retains the private projection ID, original arc/article IDs, selected node/event/sequence-edge/milestone outcomes and current private review. The identity kind is private_projection. No private projection UUID becomes a public node/event ID.
- Timeline is explicitly a private_news_record with original source publication date, title, summary/outlet/link, original article ID and separate unverified comparison event occurrence. ArcTimeline's News record semantics are retained; publication timestamps are not promoted into occurrence dates.

The public frontend loaders remain unchanged and must not receive this private DTO as if it were comparison_public. Remaining wiring is an authenticated server endpoint invoking this route, and a private consumer rendering buildPrivateWorkspace while preserving binding selection and explicit unavailable state. No endpoint authentication, hosting, UI rollout, public publication or operational installation is claimed by these source modules.

## Synthetic qualification

Unit command: node --test tests/nativeComparisonDisplay.test.mjs (seven tests).

The parent full PostgreSQL17.6 fixture installs the new SQL after binding, then invokes assertNativeComparisonDisplay from tests/nativeComparisonDisplayAssertions.mjs BEFORE existing binding revocation tests. Supply:
- syntheticFixture:true; db; reviewer; gateway; outsider; worker;
- binding: existing valid admission receipt, including scope,binding_id,manifest_hash,native_generation_id,comparison_generation_id;
- broker:{session:existing publisherSession,runtime};
- connection:existing real SCRAM reviewer/gateway connection contract;
- withRevokedComparisonSession,withRevokedNativeAccess,withInvalidatedComparison,withRevokedBinding: rollback-only real mutation callbacks passing the authenticated reader client to their body;
- optional forbiddenBodySentinel: the unselected remainder sentinel, NOT a deliberately approved evidence passage or returned publisher URL.

Five groups exercise exact current output/retry/physical evidence, direct and protected permission denial, stale identities and real revocations, complete installation assertion plus rollback ACL/schema/definer drift, and the actual authenticated server route/refusal. The existing parent fixture owns pristine database guards, synthetic construction and cleanup. The helper does not create infrastructure or substitute validators. The fixture may use a privileged connection solely for its rollback-only mutation and catalog drift checks.

Authorship and this source inspection are implementation collaboration, not external Cursor review. No tests or SQL were executed by the author.
