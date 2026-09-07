# Producer-scoped evidence job claiming

Adds server-only `public.mip_evidence_change_claim_v1(p_route text, p_producer text)`.
Both arguments are mandatory: route is `dependency_lookup` or `new_candidate_search`; producer is `capture` or `record_version`. Null, empty and unknown values fail before mutation.

The producer predicate applies to both ready selection and bounded expired-lease recovery. Unsupported producers retain their state, lease, attempts and events. The existing two-minute UUID lease, five-attempt budget, exponential backoff, 100-expiration bound, SKIP LOCKED job selection and return shape are preserved. Complete/fail through the existing `mip_evidence_changes_v1` API with the returned job ID and lease. Legacy mixed claims remain available and share the same job row locks.

This is a worker prerequisite, not an activated worker or scheduler. Hosted capture retrieval still requires an explicitly selected leased job. No semantic results, queue completion, or public changes are manufactured. A capture claim can return null while record-version backlog remains.

The function is SECURITY INVOKER with empty search_path and EXECUTE granted only to service_role. No table privileges, policies, triggers, historical migrations or legacy functions change.

## Validation

Isolated PGlite tests cover producer and route validation; older unsupported jobs; exact completion retry; shared legacy claims; producer-scoped expiration; stale lease rejection; backoff and fifth-attempt exhaustion; the 100-expiration bound, and actual service/browser role execution. Real multi-connection contention remains a later worker integration gate.

Applied and verified on current v2 project `qikvmopbtijoebdqosyq` as migration `20260907234007_evidence_change_producer_claim_v1`. SQL was tested in GitHub CI before application, then registered under the actual version returned by Supabase. This follows the owner's cloud-only workflow without creating local project files or inventing a migration timestamp. Do not replay historical migrations.

References: [Supabase function security](https://supabase.com/docs/guides/database/functions). The current changelog was checked; the logs endpoint, extension version and self-hosted gateway changes do not affect this additive function.

## Live verification

Both CI runs passed at implementation head `c4d67197b2c67cd0d6f88b7c6970a1fad40240a1`. The deployed function body exactly matches the tested SQL; SECURITY INVOKER, empty search_path, and service-only ACL were read back.

A rollback-only live test under service_role confirmed that a capture claim returns null and changes no queue rows/events, while a record-version claim leases the expected producer. Null producer input is rejected. Real anon and authenticated role calls are denied. The record-version lease and event were rolled back; identity sequence allocation can leave a gap.

Before/after hashes match for jobs, job events, evidence changes, and both legacy claim/API functions. Six unsupported new-candidate-search record-version jobs remain pending at attempt zero. No new security-advisor findings (86 existing notices unchanged). No scheduler, deployed Edge Function, browser code, evidence content or publication state changed.

Next: integrate producer-scoped claiming into a bounded hosted capture-worker operation, with durable recovery and no automatic semantic or publication claims. This SQL API is callable server-side now; the existing hosted adapter still accepts explicit leased jobs only.
