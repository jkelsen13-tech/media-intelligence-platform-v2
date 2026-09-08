# Spatial runtime source reconciliation

The live spatial writer was absent from this repository. This batch registers the
eight files returned for spatial-runtime version 6 on qikvmopbtijoebdqosyq, without
changing a byte, under supabase/runtime-snapshots/spatial-runtime-v6. It is an
observed source snapshot, outside the deployable functions directory. It is not
an activation, function replacement, or complete reproducible deployment package.

The registration receipt binds per-file SHA-256 values, live function version,
JWT verification setting and bundle identifier. Per-file hashes identify retrieved
source; they do not claim to reconstruct Supabase's bundle hash. CI imports only
the dependency-free handler/config/canonicalization modules through the existing
esbuild tool. It never starts index.ts, installs the listed Deno dependencies,
opens a database connection, or reads real credentials.

## Live reconciliation

All twelve operation names, positional argument names, counts and PostgreSQL types
were retrieved from pg_proc and are compared with the registered operation table.
All twelve grant EXECUTE to spatial_writer_runtime and deny direct EXECUTE to
anon/authenticated. They are security-definer functions with pinned search paths.
The dedicated writer login is neither superuser nor BYPASSRLS, with connection
limit four. These are admin catalog observations, not a signed-in authorization
test or proof of every SQL body.

The function inventory now includes investigation-api version 2 and
capture-retrieval version 5. Older consolidation documents described earlier
inventories and must not be read as current deployment claims. Queue counts at
inspection: seven completed dependency lookups, one completed candidate search,
two pending dependency lookups, and eight pending candidate searches. No jobs
were claimed, retried, completed or published during this inspection.

Security advisors still report the existing owner-context public views, vector
extension placement and leaked-password protection settings. This batch does not
clear those findings. Private pipeline tables intentionally have RLS without
browser policies; do not add policies merely to remove an informational notice.
[View review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

## Verification and limits

New tests check exact retrieved bytes and operation/catalog parity, environment
isolation, missing/rejected authentication, unknown operations, identity injection,
multibyte body limits, canonical argument/hash construction, profile denial,
sanitized constraint rejection, bounded serialization retry, and the governed
content-hash exception. Database and Auth transports in these tests are fixtures;
they do not demonstrate successful production writes.

The recovered deno.json references a lock, mod.ts and original tests that the
retrieval did not return. Those artifacts and original deployment configuration
remain unrecovered. Do not redeploy from this snapshot or resolve replacement
dependencies and call them production parity. Retained imports are historical
references, not a new rights/dependency approval.

Additional handler review identified follow-up work: timestamp screening permits
unqualified clocks before PostgreSQL coercion, and inherited operation names can
reach a sanitized internal error rather than BAD_OPERATION. Canonical JSON edge
cases, successful-commit response ambiguity and operation-specific authorization
also need adversarial review against the database bodies before modifying the
writer. The snapshot preserves the observed source instead of silently fixing
one side of a production/repository comparison.

The frontend still uses eligible public spatial SELECT projections, not this
write service. Existing desktop/tablet/phone browser checks run before merge and
on the live Pages release, including shared dates, search/Explore, Graph/Timeline,
and World View navigation. Passing them does not certify private signed-in paths.

Next: recover the missing deployment artifacts and harden/prove the spatial
write boundary in a separate tested batch; qualify record-history producers with
the required held-out corpus; reconcile migration bodies and owner-context views
before changing their publication semantics. Frontend composition continues
alongside those backend prerequisites, without inventing released records.

Current [Supabase changelog](https://supabase.com/changelog) and
[function development guidance](https://supabase.com/docs/guides/functions/development-tips)
were reviewed; no platform API or runtime dependency is changed.

A bounded, credential-free live request also verifies anonymous denial (401) before
merge and after Pages deployment. It sends no operation and cannot establish a
successful signed-in write. The owner's-device network attempt was inconclusive;
the ephemeral CI check provides the recorded HTTP result.
