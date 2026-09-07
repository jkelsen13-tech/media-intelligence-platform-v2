# Producer-scoped evidence job claiming

Adds server-only `public.mip_evidence_change_claim_v1(p_route text, p_producer text)`.
Both arguments are mandatory: route is `dependency_lookup` or `new_candidate_search`; producer is `capture` or `record_version`. Null, empty and unknown values fail before mutation.

The producer predicate applies to both ready selection and bounded expired-lease recovery. Unsupported producers retain their state, lease, attempts and events. The existing two-minute UUID lease, five-attempt budget, exponential backoff, 100-expiration bound, SKIP LOCKED job selection and return shape are preserved. Complete/fail through the existing `mip_evidence_changes_v1` API with the returned job ID and lease. Legacy mixed claims remain available and share the same job row locks.

This is a worker prerequisite, not an activated worker or scheduler. Hosted capture retrieval still requires an explicitly selected leased job. No semantic results, queue completion, or public changes are manufactured. A capture claim can return null while record-version backlog remains.

The function is SECURITY INVOKER with empty search_path and EXECUTE granted only to service_role. No table privileges, policies, triggers, historical migrations or legacy functions change.

## Validation

Isolated PGlite tests cover producer and route validation; older unsupported jobs; exact completion retry; shared legacy claims; producer-scoped expiration; stale lease rejection; backoff and fifth-attempt exhaustion; and role grants. Real multi-connection contention remains a later worker integration gate.

Deployment pending CI. SQL is staged under supabase/proposals, then will be registered under the migration version returned by Supabase. This follows the owner's cloud-only workflow without creating local project files or inventing a migration timestamp. Do not replay historical migrations.

References: [Supabase function security](https://supabase.com/docs/guides/database/functions). The current changelog was checked; the logs endpoint, extension version and self-hosted gateway changes do not affect this additive function.
