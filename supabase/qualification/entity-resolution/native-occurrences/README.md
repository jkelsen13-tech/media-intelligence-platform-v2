# Native entity physical occurrences — source qualification

This successor preserves the existing YHB v8 heuristic's matching/filtering behavior while retaining each physical occurrence before normalized-name aggregation. It creates no actors, candidate-to-actor links, accepted identities, agency assertions, model/provider calls, schedules, database grants or publication rights. All qualification flags remain false.

## Exact dependencies and ownership

Base source: ea4e771d9948a8767ef2f0e7654367f70e9016f9.

- Unchanged aggregation oracle: supabase/functions/collector-algorithm-shadow-candidate/predecessorV8.js, Git blob 6dc53dfc776d686a53bdf2d7de7c6a0374ea1ced. This module imports its normalizeEntityName and retains its matcher/stoplist definitions verbatim. Unit tests pin the complete oracle Git blob.
- Immutable mention contract: supabase/qualification/entity-resolution/001_mentions.sql, blob 3f86cfdfe0503ca5b4277afcf601c6a716531ca9, and mentionContract.mjs, blob 78bd8a2cfe5037ab9b6b76d0638aacdeb894b743.
- Metadata-only native field admission: native-capture-fields/003_native_fields.sql, blob ffc192276276cea2345690bccc7b65d54a0f0ab6.
- Actual capture substrate: supabase/migrations/20260905082406_evidence_pipeline_reliability.sql, blob e7beb22b9a4dd2e38076b5554c7f5b4e6e0e4e77.
- Optional unchanged 002_agency.sql remains an existing downstream consumer; it is not required to create physical mentions.

The recovered ingest-rss EntityResolver mutates public.entities and article_entities. It is historical producer context, not authority to create mip_mentions actors or accept identity. The qualified native collection wrapper still emits claim candidates only. This source does not change either boundary.

## Producer and exact input

extractEntityOccurrences(text, outletNames) is the same proper-name matcher, prefix loop (maximum three prefixes), stoplist, single-token frequency, outlet exclusion and six-word filter as the oracle, before its Map aggregation. Exact-surface single-token counts are memoized transiently; they use the same regex and produce the same count. No matching quality improvement is claimed.

The producer starts at each regex match.index and advances UTF16 coordinates only by leading trimming and consumed role-prefix lengths within that match. It converts the surviving literal's coordinates to Unicode code points against the original string. It never searches the document for an aggregated, normalized or longest name. Repeated literals are distinct occurrences; different literal surfaces that normalize alike remain distinct. An extracted role prefix is labelled role_prefix, an extraction annotation; speaker/addressee remain null.

buildNativeEntityOccurrencePlan requires:
- The exact twelve-column native fields metadata shape from 003, including raw=null, existing scope/field/capture/job/article UUIDs, native content hash, named source field, byte length, immutable versions and field hash.
- Transient Uint8Array/Buffer bytes of that exact named field.
- An explicitly supplied Set of already normalized outlet names and an explicit configurationVersion.
- For exact retry, the original expectedPlanDigest.

Only title, summary and body_text are valid fields. The producer validates the exact UTF8 field hash/length, fatal UTF8 decoding, scalar text, metadata shape and the version formulas from 003. It does not trim, sanitize, normalize or concatenate source fields. BOM and combining bytes are preserved. NUL, lone surrogates, invalid UTF8, missing or stale versions and malformed metadata fail with a fixed diagnostic.

Local validation cannot prove capture/job/article existence or source authorization. In particular, a locally consistent supplied metadata envelope remains untrusted. The input path must supply the original admitted metadata and transient bytes through existing authorized access. Actual put_mention revalidates the stored field and original native source using 003. A collection token, normalized name, locally computed digest or this plan is not a capability.

## Physical identity and replay

Each mention UUID is a domain-separated SHA256-derived version-8 UUID over a fixed ordered tuple: domain, extractor version, scope, field UUID, capture UUID, job UUID, article UUID, native content hash, source field, source/field versions, exact field hash, offset unit, start, end and literal. No UUID is generated randomly per retry. It is a physical occurrence locator, never an actor identity or authenticity proof. SQL still enforces exact retries and one immutable physical occurrence per field/span.

Outlet configuration is a separate plan input, not physical occurrence identity. configuration_digest hashes its explicit version and lexically sorted normalized names. input_digest binds that configuration digest plus every native field reference and extractor version. result_digest binds the complete ordered selected occurrence set, IDs, literal spans, role-prefix annotations and null participants. plan_digest binds the complete input/result pair.

Changing Set insertion order changes nothing. Changing filter membership or configuration version changes plan identity even if the selected output happens to stay the same. Shared physical occurrences retain their mention IDs across filter configurations. Supplying expectedPlanDigest rejects any changed input or result before the caller can write. A call without that expected digest prepares a new distinguishable plan; it does not claim to be a replay.

The originally bound configuration/version must be supplied on retry by a future qualified caller, never fetched as an unbound latest outlet table. This module retains no full outlet inventory, configuration store, raw field, payload, base64 or durable receipt. The caller may retain the small version/digests for this explicit retry consumer; no durable configuration-generation claim is made.

Changing extractor version may yield new UUIDs at an already-existing physical span. Existing SQL rejects a second identity there. This module does not migrate or reconcile those identities automatically; an extractor upgrade requires explicit reconciliation. Cryptographic locators and plan digests are not access-control decisions.

## Bounds and output

Hard ceilings: 262,144 source bytes, 4,096 regex matches, 256 selected occurrences, 4,096 outlet names and 512 UTF8 bytes per normalized outlet name. Exceeding any ceiling refuses the whole plan, never truncates a candidate set. Existing SQL policy limits still apply separately when mentions are admitted/read.

The frozen result contains native metadata references, the extractor/configuration version and digests, selected literal spans and role-prefix annotations. It contains no complete field bytes, payload or full outlet list. Selected mention literals necessarily remain source spans, as required by 001. No confidence, canonical-name identity, entity type or accepted actor is inferred.

There is no DB transport in this module. A qualified caller would build the complete plan before its first write, then pass each exact mention object to the existing put_mention signature. On a lost result it must reproduce the same field/configuration, require the original plan_digest and retry the same deterministic mention IDs. No partial result is silently declared complete.

## Synthetic tests and installation order

Unit source: tests/nativeEntityOccurrences.test.mjs. It pins the oracle and compares aggregate results for repeated/differing surfaces, prefix chains, outlet exclusions, acronyms, newlines, astral text and combining marks; verifies exact codepoint literals, native metadata/hash/UTF8 refusal, deterministic identities, strict bounds, minimization and configuration-bound replay.

Actual PostgreSQL source: tests/nativeEntityOccurrencesPostgres17.test.mjs. Parent must create an empty mip_native_occurrences_test database on 127.0.0.1:5432 using the existing dedicated PostgreSQL 17.6 fixture, and set MIP_NATIVE_ENTITY_OCCURRENCES_DISPOSABLE=synthetic-pg17-only. Only fixed synthetic credentials are used. The harness refuses a wrong database/version, existing user schemas/public relations, functions, types, operators, collations, conversions, text-search objects, operator classes/families, extended statistics, reserved roles, extra extensions/catalogs or non-SCRAM host authentication before cleanup is armed.

Installation order inside that dedicated fixture:
1. Existing tests/changeQueueFixture.sql synthetic substrate.
2. Actual native reliability migration above.
3. Unchanged 001_mentions.sql.
4. Qualified 003_native_fields.sql.
5. Synthetic owner scope membership and explicit native field admission.
6. Independently granted source field_access, actual SCRAM-authenticated gateway/admin logins.
7. Native occurrence plan -> actual put_mention/read_mention operations.

The tests use actual enqueue/claim/finish and retain metadata-only fields, then verify physical occurrence insertion, duplicate/lost-result exact retry, wrong UTF16 offsets/fields/versions/hashes/scopes, nested-output minimization, no actors/candidates/decisions, source/member revocation and refusal to substitute a newer capture under an old field identity. Failed connections receive a close attempt. Cleanup attempts each owned schema, function, table, role and client independently, then reports a static failure if any attempt failed. The reserved-name guard covers every role created by the synthetic substrate, 001, 003 and this fixture. Cleanup removes only guarded fixture objects/roles; parent drops the dedicated database.

No tests were run by the authoring worker. Parent owns remote execution, repairs, complete qualification, integration and fresh consequential review. This is implementation source, not independent review or hosted installation authorization.
