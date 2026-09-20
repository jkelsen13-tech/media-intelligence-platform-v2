# Collector algorithm shadow candidate

This is isolated, non-deployed design evidence for qik. It evaluates
caller-supplied staged feed text with pure parser/extractor seams from the
captured yhb `ingest-rss` v8 implementation. That predecessor code is a
version-labelled candidate seam, not a parity-qualified or canonical MIP
algorithm.

The worker has no Supabase client, service-role credential, environment access,
network call, scheduler, provider integration, table interface, or publication
path. A future host must supply exactly three dedicated capabilities:
`shadow_claim`, `shadow_complete`, and `shadow_fail`. Their database contract is
modeled by the separate, non-migration
`supabase/qualification/collector-algorithm-shadow/contract.sql`. That isolated
contract is design/test evidence, not a deployable production definition;
actual production roles, login provisioning, host isolation, and authentic
authority-record integration remain owner/platform-gated. Substituting a
service-role client would violate this candidate's contract.

The worker proves only internal digest consistency of caller assertions. It
does not prove that text is an immutable raw capture, that a source ID belongs
to a URL, or that rights approval is genuine. A future capability host must
authenticate immutable source-registry, capture, rights-envelope, and config
revisions, knowledge-change predecessor relationships, and globally unique
request IDs before claim. Outputs preserve typed `not_extracted`,
`coverage_incomplete`, malformed-feed failure, and unsafe-URL quarantine
semantics; none proves that a fact was absent from a source or retained
evidence. Parsed URLs remain tainted and must not be fetched, rendered, or
promoted. Provider execution is explicitly disabled.

The durable wrapper is the only acceptable future host entrypoint. Exact retry
requires its remote journal to retain lease tokens and completion payloads, so
the journal must be independently verified as access-controlled, encrypted,
log-redacted, and governed by an explicit retention policy. The JavaScript
assertion is not evidence that those controls exist. The qualification contract
tests atomic SQL, explicit expired-lease requeue, and unique direct-login
runtime authority in a disposable database. Real PostgreSQL concurrency,
platform object ownership, credential issuance, journal security, and restore
recovery remain unimplemented deployment gates.

The envelope check is deliberately bounded and is not a validating XML parser.
A production host must add a hardened, fully bounded XML parser and record its
version before treating parser coverage as qualified.

Allowed effects for a future reviewed host are limited to appending approved
staging input revisions, private derived outputs/receipts, and narrowly scoped
lease state. Canonical articles, evidence, graph, assessments, publication,
review approvals, user/capability state, predecessor queues, schedules, external
providers, and secret export are forbidden.

No live project, function, job, caller, or deployment is changed by these files.
The yhb schedules remain active and authoritative pending independently audited
parity, recovery, and owner-approved cutover evidence.
