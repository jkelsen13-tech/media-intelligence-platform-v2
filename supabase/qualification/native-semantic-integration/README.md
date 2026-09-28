# Native semantic producer/consumer integration v1

UNAPPROVED successor to the qualified pure semantic envelope. Parent affected synthetic qualification has completed; this successor remains unapproved for installation and material transmission. It creates no SQL objects, grants, durable records, provider jobs, public eligibility or additional material receiver.

## Real producer paths

reader.mjs imports the existing authenticatedPgDriver.mjs (af0f3b69c34695f9241934fae89ac00cedd08515), whose credentialDelivery.mjs is 354679fadc48eb9f8a8154456f3d38e7faab3e61, and semanticAuthorityEnvelope.js (27d44e70227f53080ef7ff18bb07d7afc326cd77). Node 22.14.0, existing pg dependency and WebCrypto are required. The driver performs authenticated session identity/logging checks and rejects privileged login identities. No arbitrary query hook is accepted.

Assessment is an INTERNAL service-role consumer. Its configured ordinary *_native login must already be authorized to SET ROLE service_role. It calls public.mip_assessments_v1('read', exact assessment UUID), checks exact expected input_fingerprint, then maps the complete producer result. No user-scoped endpoint is claimed: this RPC has service authority, not hypothesis workspace authorization. Rationale and uncertainty necessarily enter this trusted server transiently through the existing read; neither is returned in the envelope. Invocation requires the existing private material route. This is NOT a source/metadata-only GitHub installation operation.

Hypothesis is a distinct gateway consumer. The existing authenticator supplies verifiedUserId. The reader calls real read_bound_history and reassessment_backlog with that user and investigation, selects the exact revision, requires available status, then selects the exact cause. SQL projection keeps retained assessment text inside PostgreSQL; only selected revision metadata and bounded backlog cross the connection. Full history authorization still executes, including the generation closure. Unsupported cause mapping, withheld input, absent cause/revision or membership denial refuses the whole operation. Only method_changed and permission_changed have supported canonical mappings; correction/retraction/source absence cannot be invented from generic change records.

Both paths use READ COMMITTED because existing permission-fenced readers acquire row locks. Two reads in one transaction must yield identical constructed envelopes; supplied expectedEnvelopeDigest must match. This detects observed drift, not indefinite authority after commit. Historical retained assessment reads preserve original identity and stale/superseded status; current mode refuses them. Cause currentness remains unknown. No automatic application retry: an uncertain commit returns a bounded failure; caller may explicitly reread the SAME identity and expected digest under fresh authentication. Rollback and close failures remain independent static errors. The underlying driver can swallow connection-failure close errors; this component does not claim verified transport cleanup in that case.

## Exact API

Trusted configuration exact keys: connectionString, expectedLogin, disposable, sessionPoolerHost. Credentials remain transient process configuration; no receipt/journal stores them.

createNativeSemanticAssessmentReader(config) returns an async reader accepting exactly assessmentId, expectedInputFingerprint, expectedEnvelopeDigest (null or SHA256), mode (current or retained).

createNativeSemanticChangeReader(config) returns an async reader accepting exactly verifiedUserId, investigationId, revisionId, causeId, expectedEnvelopeDigest (null or SHA256). verifiedUserId must NEVER be deserialized from browser input.

Both return the unchanged mip_semantic_authority_envelope_v1 exact output allowlist from the pinned module: contract_version, kind, identity, scope, producer, metadata, currentness, visibility, time, authority, envelope_digest. All five authority flags remain false. Legacy input fingerprint and new canonical-envelope digest retain different meanings. Exact timestamps/ordinals/source IDs survive; no native span/capture/provider provenance is manufactured where the producer does not represent it. There is no new payload/rationale persistence or duplicate change journal.

## Bounds

Producer response selected at most 65536 PostgreSQL UTF8 bytes; backlog also limited to 256 causes. The pure module independently enforces canonical encoding/depth/count/byte limits. These are additional result bounds, NOT whole-operation CPU/memory limits for legacy read_bound_history or underlying assessment reads. Existing driver timeout is unchanged. Source authorization and SQL locks remain the actual authority, never the metadata digest.

## Qualification source

tests/nativeSemanticIntegration.test.mjs contains four preconnection request/configuration refusal tests; it does not mock successful PG authorization.

tests/nativeSemanticIntegrationPostgres17.test.mjs is a separate owned disposable database test, armed with MIP_NATIVE_SEMANTIC_DISPOSABLE=synthetic-pg17-only. It requires the existing official PostgreSQL 17.6 localhost:5432 synthetic admin fixture. It validates source blob identities and loads:
1. tests/changeQueueFixture.sql — 235f92e0ce285cbf5426444b06b576a39adb1e38 (only its fixture role creation line is replaced after independent role validation).
2. evidence_pipeline_reliability migration — e7beb22b9a4dd2e38076b5554c7f5b4e6e0e4e77.
3. evidence_change_queue migration — 1b93f947f5351097e629adc718659a1125fdfe1f.
4. evidence_assessment_dependencies migration — d6092de9540550c4d126c91494cfe3374f02a721.

The test uses actual enqueue/claim/finish/candidate/context/append/read, then the actual authenticated server consumer, correction invalidation, exact retry and permission denial. It checks sentinel exclusion and independent session return. Only its created database/login/roles are cleaned; preexisting validated fixture roles are preserved. No production target override.

Proposed invocations (parent must integrate and execute):
node --test tests/nativeSemanticIntegration.test.mjs
MIP_NATIVE_SEMANTIC_DISPOSABLE=synthetic-pg17-only node --test tests/nativeSemanticIntegrationPostgres17.test.mjs

tests/nativeSemanticIntegrationHttpBridge.mjs composes the actual patched handler, store, authenticated PG driver and reader. The one inserted test in verifier/hypothesisPostgresConcurrency.py uses the original real ordered hypothesis fixture: changeQueueFixture; five selected migrations (pipeline, queue, assessment, briefing, workspace); revision store001; selected actual operation-evidence/publication-fence fragments from existing008/004; retained reader002; synthetic rights/privacy heads; hypothesis003–008 and014–017, in that order. It deliberately does NOT install generation009 or method011. It verifies unsupported retained_assessment_change refusal and the genuine permission_changed producer, committed permission/membership denial and exact restoration, outsider denial, unchanged journal counts and independent zero-session/login cleanup. Fixture authentication is fixed synthetic bearer mapping, not Supabase Auth or deployed HTTP.

The actual method_changed producer exists separately in hypothesis011 (8777e2bb814c8e67e96ff8d84e3d5970ababb382), with generation009 dependencies and worker tests f2eccaf1000bc4ef5d45e5584bdd3feea7b2a802 lines436–456. Those unchanged tests are not newly executed by this qualification and do not establish this new consumer's method-path coverage.

Additional proposed invocations, existing source/synthetic-only GitHub route:
node --test tests/nativeSemanticHandlerIntegration.test.mjs tests/hypothesisHandler.test.mjs tests/hypothesisEvidenceBindingStore.test.mjs tests/hypothesisReassessment.test.mjs tests/hypothesisReview.test.mjs
After the assessment owned-database test has completed, use a separate pristine owned PG17.6 container with the original Python fixture password mip-disposable-ci-only:
PYTHONPATH=verifier MIP_DISPOSABLE_POSTGRES=comparison-qualification python3 -B -m unittest hypothesisPostgresConcurrency.Hypothesis.test_native_semantic_http_reader_with_real_retained_permission_cause hypothesisPostgresConcurrency.Hypothesis.test_retained_method_change_has_exact_receipt_without_new_source_capture hypothesisPostgresConcurrency.Hypothesis.test_permission_revocation_records_each_affected_operation_without_body_text hypothesisPostgresConcurrency.Hypothesis.test_observation_is_user_scoped_and_rechecks_membership_on_retry_and_read

The narrow Python insertion preserves the existing fixture's tests and source-kind assertions. All fixture material and passwords are synthetic; real DSNs are rejected. Explicit armed flags are required; missing flags produce skipped tests and are NOT qualification. Cleanup closes sessions, drops owned databases/random bridge LOGIN, then removes the owned container and anonymous volumes. No fixture artifacts or article contents are uploaded. Failure uses bounded static stage/source-location diagnostics.

## Remaining connection

The existing handler and store now compose semantic_change through an explicitly configured trusted reader. Browser requests accept only investigation_id, revision_id, cause_id and expected_envelope_digest; user identity comes only from the authenticator. Missing reader configuration refuses without an old-query/public fallback. The assessment service consumer remains internal and is not added as a browser action. This is not a deployed or operating consumer, and C12/C13 operational closure is not claimed. Actual private route, secure scoped configuration, full fixture qualification, current permission behavior and applicable fresh external review remain required. Policy/domain/provider/temporal semantic fields absent in the original assessment producer remain explicitly unrepresented rather than silently reconstructed.

## Actual bounded parent qualification

Candidate 4a59e987a103b707a9d7d0ea7e573e1643b59046, tree2011591e3ed47ae8a5484c3d3bde182ea3f84ce2, source30921561c962b498369151388a79169c68cbc62a/tree6b01310f7930f41877eaaa6dfb50146a0b53916b; workflow35df6f91733b5615ad41a20c1d3a495e0e2f189e. Existing GitHub Actions run36462991415/job109065954966 passed67 (62 source unit/regression,1 actual assessment PostgreSQL reader,4 original hypothesis fixture methods), zeroFAIL/zeroSKIP. Node22.14.0 and PG17.6/170006 on owned loopback SCRAM, Ubuntu22.04; both containers/volumes and new reader sessions/random LOGIN cleanup were verified. Source and historical assertions remained unchanged. Synthetic fixed Auth mapping and Request/Response composition are not hosted Supabase Auth/TLS or qik installation. New method-change consumer success remains unexecuted. Fresh required Cursor review is not completed; existing browser transport is closed. Earlier unaffected266/83/57/33 qualification receipts are separately reused.
