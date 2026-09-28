# Arc membership prepared inputs — source-only qualification

This is a complete **read-only preparation component**, not a migrated C9 worker.
It owns a fresh PostgreSQL session, prepares a consistent bounded historical
public-row input, and invokes the existing recovered arc scorer and audit sampler.
It does not install anything or call the legacy writer, approval RPC, scheduler,
provider, article fetcher, private material host, or publication path.

Parent base: `1b52c11da5f7fd8fa6174ad087f39da5b8e8ce75`,
tree `70cfc27992c086a109215cbfa97ede37e04e52fa`.
No historical source, legacy fingerprint or scorer is rewritten.

## Reuse and dependencies

The executable import is the existing recovered source:

`verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js`
(blob `08ce23092cfbbe8dcb7eb7c26cf6e3943e177531`).

Unchanged companion source identities, checked by the unit suite:

- `index.ts`: `26423833f2010c0dbde95fdd921208f28529d9b3`.
- `auth.js`: `282d8da0fca76d05d626c2329896abe390a0ba0b`.

Scorer: `arc-v1-membership-2026-08-23.2`. This arc scorer does not invoke
embeddings or a model endpoint. `membership-prepared` qualifies **event**
membership for Source Comparison and is not substituted for arc membership.
Existing locked `pg` and Node crypto are the only runtime dependencies here.
No package or infrastructure change is needed.

Install order: none. This component contains no migration, DDL, role creation,
credential creation or deployment. Future permitted execution needs an existing
database login whose read authority covers the explicit relations below.
Do not grant broad access or use a new privileged RPC to make this component work.

## Transaction and completeness

`prepareArcMembership({connection,requests,sourceKind:'historical_public',...})`
constructs a fresh `pg.Client`; it never accepts `pool.query` or joins an
existing transaction. It issues `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`,
sets bounded statement/idle timeouts and deterministic timestamp formatting,
checks the isolation/read-only settings, reads all pages, scores, then commits.
Every failure rolls back and closes; commit/rollback/close failures return a
sanitized error and no partial result. There is no automatic retry.

Each request pins candidate UUID, exact PostgreSQL `updated_at::text`, article
UUID and arc UUID. Missing, duplicate, foreign, stale or post-review candidates
are refused. UUID keyset pages use explicit C collation and a complete terminating
page. Entity reads have at most 100 article IDs per chunk and independently page
each chunk. A page count is not a claim that the whole set is present until all
chunks terminate. Counts and bytes are bounded; overflow fails, never truncates.
PostgreSQL measures each projected JSON row before returning it; oversized source
text is not returned. This is an MVCC snapshot of current rows, **not**
as-known-then history, publication eligibility, or proof of native capture custody.

Default bounds: 32 candidates, 4,096 members, 32,768 entity relations,
128 rows/page, 64 KiB/projected row, 4 MiB aggregate projected bytes.
Hard ceilings are in `HARD_LIMITS`; callers may lower bounds. No body is fetched.
Source row access remains the supplied database principal's authority. The adapter
does not establish an investigation scope or make a new entitlement decision.
The `ClientClass` second argument is an explicit unit-test seam. Mocked transport
results are not actual PostgreSQL or hosted qualification.

## Field minimization and consumers

| Relation | Fields retained transiently | Concrete reason |
|---|---|---|
| arc_membership_candidates | id, article_id, arc_id, state, updated_at | requested immutable identity binding and stale/state refusal |
| articles (candidate/member) | id, title, summary, published_at, outlet, arc_id | existing scorer text, temporal and diversity calculations; exact membership and deduplication |
| story_arcs | id, title, summary, started_at, last_update_at | target identity, canonical text and existing temporal fallback |
| article_entities | article_id, entity_id, confidence | complete confidence-filtered entity sets |
| pipeline_config | entity_resolve_min_confidence only | exact filtering threshold; explicit presence/default |
| arc_membership_release_policy | fixture_passed, auto_approval_enabled, auto_approval_threshold for the exact model only | reproduce existing scorer eligibility calculation without exercising approval |
| invocation | bounded audit cutoff/sample size/seed | reproduce unchanged audit sampling |

No URL, article body, generation evidence, capture payload, excerpt, secret,
unrelated configuration or nested source copy is selected. Article source objects
are deduplicated; membership entries retain only references in the transient hash
envelope. All projected source fields live only in memory for this call.

`arc-membership-consumed-input-v1` is a **new** canonical SHA-256 format. It binds
every consumed field, candidate revision/state, complete source sets, explicit
configuration presence, the recovered scorer identity and audit options.
It differs intentionally from the legacy fingerprint, which omits several consumed
fields. It is never written into the legacy fingerprint column or represented as
a compatible version. Snapshot transaction IDs are not input identity.

The returned private receipt contains candidate/revision IDs, counts, the hash,
numeric/typed scorer output and audit identity/stratum only—no source text or raw
fingerprint. An explicit same-input retry can pass `expectedInputHash`; any changed
observed input fails `arc_prepared_stale_source`. This re-resolves current rows
and compares identity; it does not replay a historical snapshot. There is **no
durable evidence destination** or later historical replay capability in this slice.
If source rows have changed, their prior bytes cannot be recovered from this hash.

## Native lineage and approval remain fail-closed

`sourceKind:'native'` is refused before connecting. Existing C3 claim spans are
not arc-admission evidence. No code substitutes mutable latest article rows for an
original native capture, promotes claim spans into entity mentions, or invents
capture/candidate/source-field mappings. An eventual native source adapter must
resolve owner-authorized exact capture/candidate identities, hashes, fields and
spans through their actual retention/access contract. That dependency is not met
by historical public-row preparation.

`persistOrApprovePreparedArc()` always refuses. Parent's bounded source/catalog
reconciliation found no qik `mip_approve_arc_membership_candidate`. The recovered
YHB call targets a legacy guard which checks candidate state/revision, a score,
and enabled release policy; the inspected guard does not recompute all consumed
source inputs. Its historical ACL is not suitable for copying. This package
neither migrates that guard nor grants its permissions. A read-only transaction
cannot provide the later write-time source fence such a guard would require.

The scorer's `eligible_for_auto_approval` value remains mathematically unchanged;
the component independently returns `approval_allowed:false`,
`publication_allowed:false`, `scores_persisted:false`, and `durable:false`.
No release flag or candidate state is changed. Existing disabled release policy
is not permission to enable it.

Remaining C9 chain: authoritative native candidate/source admission, exact retained
input/replay ownership, transactional score persistence/readback, and a qualified
qik guard that binds the **new full input identity** at write time. Those need
source implementation and qualification before any operational credentials or
hosted run could demonstrate C9. This component alone does not close C9.

## Synthetic checks and cleanup

Unit/transport contracts (no database; do not label these actual PostgreSQL):

```sh
node --test tests/arcMembershipPrepared.test.mjs
```

Actual PostgreSQL 17 qualification uses an **already approved disposable** loopback
database named exactly `mip_arc_prepared_test`, initially empty in public.
The harness refuses any other host/database and takes a session advisory lock.
The caller provisions that disposable database outside this package; no hosted
URL, real credentials or material belongs in this command.

```sh
MIP_DISPOSABLE_POSTGRES=arc-membership-prepared \
MIP_ARC_PREPARED_DATABASE_URL=<existing-disposable-loopback-url> \
node --test tests/arcMembershipPreparedPostgres.test.mjs
```

The harness creates only synthetic relations in that dedicated database, executes
the actual reader with more than 1,000 members, performs a competing committed
source update between reader queries, proves snapshot stability and subsequent
stale-retry refusal, checks server-enforced read-only rejection, and closes the
reader. It drops its six owned synthetic tables without CASCADE in finally.
The external harness owner removes the already-disposable database afterward.
Without the marker the native test is explicitly skipped, never reported as passed.

Tests also pin all three recovered blobs; exercise omitted-input mutations,
canonical order/page independence, missing/foreign/duplicate/stale rows, byte/count
overflow, rollback/close failures, exact field selection and private sentinel
absence from returned metadata.

Authoring status: source staged remotely; author has not executed code, tests,
database queries or deployment. Parent must run syntax/unit/native qualification,
inspect actual outputs and obtain applicable fresh independent review. No mocked
transaction assertion is claimed as native/hosted success.

References: PostgreSQL 17 repeatable-read semantics
(https://www.postgresql.org/docs/17/transaction-iso.html) and node-postgres
same-client transaction guidance (https://node-postgres.com/features/transactions).
