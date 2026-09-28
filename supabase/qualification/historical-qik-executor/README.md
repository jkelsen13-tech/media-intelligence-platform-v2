# Historical qik executor — source candidate, fail closed

Nothing in this directory has been installed, deployed, invoked against material,
or operationally qualified. The code is an acquisition/export/custody implementation,
not proof that a transfer happened. No secret values belong in this repository.

## Implemented paths

- candidate.sql: qik-only private schema, two-source bounded dblink acquisition,
  immutable original export, single permanent payload home, canonicalize-once,
  sealed manifest, atomic insert-if-absent unit references, independent readback
  support, metadata-only checkpoint CAS, final private grants/RLS/principal checks.
- contracts.mjs: concrete read-only SELECT construction for the pinned 21 NIE and
  15 YHB field contracts (29 distinct family names); public namespace, explicit
  field projections, source-native occurrence and version tuples, directed
  article-root relation traversal, exact full storage.objects inventory.
- executor.mjs: lossless canonicalization and exact original-export reopen;
  unchanged pinned transfer engine performs full manifest/fence checks, verified
  receipt-prefix validation, source reads, immutable writes and independent readback.
- install.mjs: pinned-source ordinary NOSUPERUSER installer; creates owner/runtime
  roles through an isolated temporary creator, removes all membership edges,
  and installs a fixed UUID-only acquisition helper owned by the trusted installer.
  It reuses the already closed mip_factual_transport extension without changing
  its schema, ownership or function/schema ACLs. Historical owner receives no
  raw dblink or Vault privilege. Exact transport metadata is compared before/after.
- handler.mjs/index.ts/deno.json/config.toml: concrete restricted qik Edge entry
  using pinned pg@8.23.0, Node compatibility globals and the unchanged engine;
  gateway JWT required plus a separate private invoker token; fixed status-only
  responses. No caller-supplied SQL, connection, secrets, admission or material.
- tests/historicalQikExecutorPostgres17.test.mjs: concrete armed CI runner creates
  and tears down only three owned synthetic databases on the existing official
  loopback PG17.6 service, exercises real dblink snapshots/concurrent source change,
  independent readback, ambiguous commits/CAS, immutable rows and actual roles.
  Vault is explicitly a fixture view surrogate, not Supabase Vault qualification.
  The optional closed-ordinary profile tests the ordinary-role constructor and
  preserved closed transport shape. It is not the full existing main installer.
- tests/historicalQikExecutorHandler.test.mjs: restricted HTTP/credential/host/TLS
  boundary and status redaction tests.
- tests/historicalQikExecutor.mjs: synthetic canonicalization/capacity/retry/
  ambiguity/readback/refusal tests and future full-PostgreSQL qualification hooks.
  In-memory tests do not prove SQL isolation, grants, host capacity or cost.

## Exact source and preservation contracts

Engine blob b5b80ee37c6cd068d17f59b506bab6df70839ea6 remains unchanged, with its
existing transitive imports, lossless parser and stableStringify. PostgreSQL
row_to_json preserves numeric text/null/Unicode before JS lossless parsing.
PostgreSQL jsonb::text is NEVER used as the canonical wire representation.
JSONB is used for relational traversal and semantic equality only.

Every source inventory and field SELECT executes on ONE named dblink session in
ONE REPEATABLE READ READ ONLY transaction for that source. pg_export_snapshot and
native MVCC descriptor are captured inside it. A local acquisition failure rolls
back all attempt rows; no partial attempt becomes resumable and no fresh source
snapshot can extend an existing attempt. acquire(existing operation) always
refuses, whether acquired or sealed. A new attempt ID denotes a different
snapshot, never a resume. Acquired raw bytes are durable but the engine refuses
them until canonicalization and seal complete. Canonicalization resumes only
those original bytes; it never reconnects to source projects. Remote snapshot
tokens are not treated as valid after their owning transaction ends.

Native identity follows read-only catalog evidence: id for keyed families,
(article_id, entity_id) for article_entities, (event_id, article_id) for
event_articles, and run_id for gdelt_staging_runs. Eight NIE backups have no
PK/unique constraint and use the original snapshot's physical (tableoid, ctid)
occurrence; all logical columns remain losslessly in payload. xmin/tableoid/ctid
plus the source snapshot form the qualified version digest. Physical occurrence
identities are valid ONLY inside this original export; never deduplicate
independent captures using ctid. Identical historical rows remain separate.
No source captured_at, publication time or provenance value is fabricated.

Every current and backup article seeds roots. A metadata cardinality preflight
limits raw rows and maximum root×row pairs BEFORE payload closure evaluation.
Defaults (100,000 rows and 250,000 pairs) deliberately refuse the known large
corpus; do not raise them without actual acquisition/closure resource qualification.
This prevents uncontrolled multiplication but does not claim scalable completion.
All family queries still repeat the same bounded closure; optimization remains
an engineering dependency if its measured cost cannot fit the bounded acquisition.
Backup/current same-ID matching is optional association, not an invented FK.
Null historical roots and missing authors.outlet_ids targets refuse closure.
r3 old_value values for unrelated columns remain payload, never guessed references.
Directed dependencies include
the explicitly enumerated author/outlet/entity/claim/evidence/event/arc/staging
relations; selected reverse relations include article evidence and historical
copies. Unattached rows are counted, not silently claimed transferred.
Embedded claims/provenance remain losslessly embedded; this candidate does not
invent relational identity from arbitrary embedded prose or JSON.
nodes and arc_membership_candidates are explicit graph boundaries, with their
native reference fields retained. This does not qualify full node-graph closure.

An archived article ID with no current articles row is a consequential existing
planner limitation: the unchanged planner reports root_record_missing. The
adapter must refuse that original manifest, not fabricate a current article,
drop historical occurrences, or claim entire-corpus completion. Missing explicit
relationship targets also refuse closure. Read-only source catalog evidence confirms the keyed families, eight keyless
NIE backup families, enumerated foreign keys and storage.objects.version:text.
Synthetic fixtures must still validate the generated closure contract before
enabling a material route. The SELECT projection fails closed on schema drift.

Storage objects are inventoried inside the same RR transaction. This v1 requires
the exact frozen inventory to be empty; a nonempty inventory raises
object_capture_unqualified. It does not infer absence from old aggregate counts,
does not treat a storage metadata row as immutable bytes, and does not download
unapproved external URLs. Any in-scope referenced object outside this inventory
requires an explicit byte-route extension and qualification first.

## Install and qualification sequence (not executed)

1. Review these source objects and run source/synthetic tests through the parent's
   authorized synthetic runner. Validate actual generated queries against
   disposable PG17 fixtures with duplicate historical occurrences, changed rows,
   nulls, Unicode, exact decimals, composite relationships, missing references,
   historical-only roots and empty/nonempty object inventories.
2. On existing qik only, verify PG17, extension schemas, limits, space/WAL/index
   overhead, source network access, authenticated TLS endpoints and logging.
   The existing main installer relocates the ONE dblink extension into closed
   mip_factual_transport. Do not install another copy, move it back, or widen its
   grants. candidate.sql's raw extensions-layout acquisition is a synthetic
   baseline; use install.mjs's exact pinned constructor after the main install.
   Requires existing Vault plus pgcrypto digest. No new project/provider,
   subscription upgrade or cost beyond $25 once/$10 monthly existing services.
3. Establish mip_history_owner NOLOGIN NOINHERIT and mip_history_executor LOGIN
   NOINHERIT, neither privileged nor members/grantees of other roles. Installation
   requires controlled administrator ownership transfer; remove temporary role
   memberships before final assertions. Owner needs only required Vault read and
   extensions function access. Runtime must not have Vault/schema-contract access.
   Source credentials must enforce SELECT-only least privilege on named public
   fields and storage metadata. Read-only transaction mode is additional defense.
4. Through existing qik's human secure credential entry, store the two checked
   source connection strings in qik Vault. Neither tool calls, chat, repository,
   Cursor, CI, device, query arguments, logs nor HTTP responses may contain them.
   Ensure log_statement/log_parameter/error-context/audit/APM settings do not
   record material or credential-bearing dblink internals. Edge secrets alone
   do not provide database-side dblink access. No set-secret/invoke connector is
   currently established; secure handoff is a real capability prerequisite.
5. Install candidate.sql only after its actual SQL/permission synthetic tests
   pass. It is intentionally outside migrations and is not automatically applied.
   The owner inserts concrete contract statements generated by
   sourceContractStatements using only Vault UUID REFERENCES. Do not accept SQL
   selectors, target hosts, role names or credential values from HTTP requests.
6. Qualify acquisition statement time/CPU/memory/WAL/storage and unchanged engine
   full-manifest peak. A 128 MiB unit is indivisible. The engine clones unit
   content and independently reloads readback, and replans the full manifest on
   each invocation; payload totals alone do not establish 256 MiB/2 s CPU fit.
   Measure both inventory passes, prefix validation and exact largest unit using
   representative upper-bound SYNTHETIC data on the actual restricted qik host.
   Record verified route limits and evidence in the owner-only route row.
   Enabling route qualified is an administrative evidence decision, not a caller
   boolean. Never manufacture the asserted measurements. If unchanged engine
   cannot fit Edge, leave route disabled and report capacity_unqualified.
   Lower invocation budgets do not split a deterministic unit or make metadata
   planning cheaper. This candidate does not authorize an external runtime.
7. The concrete index.ts handler uses pinned pg@8.23.0 and a dedicated TLS
   connection with cancellation/ambiguous-commit recovery. It accepts only the
   fixed qik database host and mip_history_executor login, never privileged
   postgres. Hosted SUPABASE_DB_URL may already exist server-side, but is accepted
   only if its actual role is the restricted executor; otherwise securely configure
   MIP_HISTORY_EXECUTOR_DB_URL. No default admin fallback is permitted.
   Source Vault connection setup remains separate. Gateway JWT verification stays
   enabled, and MIP_HISTORY_INVOKER_TOKEN must be entered through secure server
   configuration, never chat/tools/code. Verify exact host, caller identity, private schema exclusion from
   Data API, final ACLs/RLS, source read-only rights, no material logs, and no
   worker/publication side effects using real roles. Synthetic bool fixtures are
   not this evidence. Set client/session acquisition timeout BEFORE invocation;
   do not rely on changing statement_timeout mid-statement.
8. Future internal invocations, after all qualifications: acquire(operation UUID)
   once; seal(same UUID, manifest_limits); resume(same UUID, original limits,
   bounded max_units/material bytes/time). Return fixed status/error codes only.
   Do not return private manifests, snapshots, root IDs, payloads, object names,
   query strings or database error text to chat/Cursor/CI/device. The engine's
   internal metadata report can remain in qik; externally reduce to state/code.
   Private pending committed units point to the existing immutable payload home.
   No public table writes, upsert, enqueue, global finish, processing or publication.

## Remaining evidence

No synthetic tests in this candidate have been run by its author. Parent owns
integration, execution and Cursor review. Actual PostgreSQL tests are authored but have not been executed by this author.
The initial hook is not test evidence; use the concrete PG17 runner. Bootstrap
extensions-layout success is not ordinary-role/closed-transport qualification;
closed-ordinary success is not full main→historical ordered-install evidence.
Parent owns those executions and source reviews. Existing main audit assertions
must be replayed unchanged after historical installation; the new component may
not weaken them. Live qik acquisition/engine capacity, source schema
qualification, credentials, closure/object inventory and final access assertions
remain unqualified. Therefore no historical material invocation is authorized by
the existence of these source files alone.

References checked: PostgreSQL 17 dblink/dblink_connect documentation and current
Supabase Edge limits. Supabase changelog.md fetch was attempted but unsupported
by the browsing endpoint; no current feature change is inferred from that failure.

## Synthetic CI invocation contract

Use the existing approved official postgres:17.6 service only:
MIP_HISTORICAL_EXECUTOR_DISPOSABLE=synthetic-pg17-only.
The runner connects solely to 127.0.0.1:5432 with the existing documented disposable
fixture password. It never accepts remote connection URLs or real credentials.
MIP_HISTORICAL_EXECUTOR_INSTALL_PROFILE=closed-ordinary selects the NOSUPERUSER,
CREATEROLE, CREATEDB, BYPASSRLS fixture installer and the preclosed transport shape.
Without that variable it exercises the clearly labeled bootstrap core profile.
Both profiles need candidate.sql blob 6fe6035223de1dac94fba6c238e33324bc0ca266 for
the pinned closed constructor. Do not substitute edited SQL without updating and
reviewing its pin. No actual test was launched by the source author.

The acquisition session sets jit=off only inside its original read-only
transaction. Repeated short closure statements must not pay repeated compilation
cost from inflated recursive plan estimates; no persistent source setting changes.
The repaired PG fixture gate is a first-statement advisory lock in a security
invoker function. The runner confirms the exact waiting lock, its blocker, source
database/principal and active snapshot before changing the synthetic source.
It always releases and settles acquisition, and stops dependent tests on failure.
Neither test nor acquisition timeouts were increased for this repair.
