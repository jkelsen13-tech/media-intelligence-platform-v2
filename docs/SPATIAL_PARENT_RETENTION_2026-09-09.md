# Spatial fixture parent retention — private structural closure

PR #136 retained 39 sandbox spatial rows. This batch retains six referenced
verification fixtures privately: one article, place, node, policy document,
source-change event and source record. The archive now contains 45 versions.

Eight inspected foreign-key mappings identify the first five parents. The
source record is independently typed by evidence_artifact_registry:
artifact_type_code=source_record and source_record_id. The live
spatial.register_evidence_artifact function explicitly resolves that artifact
type to public.sources and validates its node. The retained source record points
to the already retained node; its arc_membership_candidate_id is null.
The source-change event's untyped source_id also matches that record, but this
equality alone does not certify the event's producer or causal/version semantics.

Fixture labels and reserved .invalid source URLs are preserved as original data.
The article is pending_review with no body or summary. A policy source label
such as gao is not evidence of genuine GAO content, authenticity, rights or
publication eligibility. The spatial evidence uses governed_internal /
internal_governance retention and an immutable artifact reference. No provider
is activated or external content fetched.

Two migrations extend only mip_private.spatial_row_versions and its importer:
20260909190228_spatial_parent_retention and
20260909191503_spatial_source_ancestor. A BEFORE INSERT trigger requires an
existing archived spatial reference from the same source project. It enforces
the eight relation/field mappings for the first five parent types and the
explicit source_record type plus source_record_id for public.sources.
Wrong-type registry rows and untyped event identifiers do not qualify a source.
The guard applies to both importer and direct INSERT.

Both functions use invoker privileges and an empty search_path. Expanded
relation checks are added before narrower predecessors are removed. Key,
hash, finite observation time, bounded batch, RLS, browser denial and
immutability constraints remain intact. No live public/spatial row,
publication decision, identity, role or schedule is changed.

Every complete source row is transferred as raw PostgreSQL JSONB text, preserving
original values, numeric precision, IDs and timestamps. Observation time is
separate from original event/publication time; current parent observations are
not asserted to be older as-of versions. Corrections append; replay does not
overwrite a prior observation. The captures are independent, not a distributed
snapshot.

The first five parents were observed at 2026-09-09 19:00:32.468963+00 and retained
in one service-role transaction. The source record was observed at
2026-09-09 19:10:45.764765+00 and retained after qualification of the typed guard.
Six source/archive ordered payload counts and digests match at 19:15 UTC.
Replay inserted zero. All eight external FK checks, the typed source-record
reference and its node reference have zero missing archive records.
The earlier 39 archived payloads, 19 live spatial rows and public Comparison
contract/payload remain unchanged.

Golden run 34393406376 passed 1,573 tests on Node 22 and 24, both builds and a
zero-vulnerability audit before the second migration was applied. Tests cover
all mappings, type confusion, unrelated/self-asserted references, direct INSERT,
exact values, replay, atomic failure and unchanged security. Both applied SQL
bodies exactly match their tested contracts. Three archive triggers remain
enabled, non-relation constraints and grants are unchanged, and security-advisor
findings are unchanged. Existing global findings are not claimed resolved.
Final-head preview and postmerge deployment/live evidence are recorded on PR #137.

See the [exact receipt](../verifier/spatial-parent-retention-2026-09-09.json)
and [read-only verification](../supabase/tests/spatial_parent_inventory.sql).
This closes the observed fixture structural retention checkpoint. It does not
certify complete semantic/as-of provenance, evidence admission, publication,
positive writer/caller behavior or backend cutover. Auth provisioning, Markets
rights/evidence, physical-device qualification and collector reconciliation
remain independently pending. No legacy backend is SAFE TO RETIRE.
No local files are created.
