# Spatial fixture parent retention — private structural closure

PR #136 retained 39 sandbox spatial rows. Eight foreign-key definitions in those
rows refer to five external parent records absent from the survivor: one article,
place, node, policy document and source-change event.

Read-only inspection identifies these as verification fixtures: the article is
pending_review, has no body or summary and uses a reserved .invalid URL; the node,
place and policy document have fixture labels. A source label such as gao is
retained as original metadata and is not treated as proof of genuine GAO content,
authenticity, rights or publication eligibility. The spatial evidence snapshot
uses governed_internal / internal_governance retention and an immutable artifact
reference. No provider is activated or external content fetched.

The migration extends only the existing private spatial archive to
these five qualified public relation names. A BEFORE INSERT trigger requires
each parent ID to be referenced by an already retained sandbox spatial row
through one of the eight inspected relation/field mappings. The guard applies
to importer and direct INSERT, and uses invoker privileges with empty search_path.
The expanded relation check is installed before its narrower predecessor is
removed. Existing key/hash/time checks, RLS, browser denial and mutation guards
remain intact. No live public/spatial row, publication decision, identity, role
or schedule is changed.

The reference guard establishes structural eligibility for retention only.
A current parent observation is not silently treated as the parent version that
existed when an older spatial snapshot was recorded. Every original payload,
ID, precision and timestamp remains separate from its retention observation.
Corrections append versions; replay does not overwrite prior observations.

Tests exercise all eight mappings, exact revised numeric/time values, replay,
wrong relation/field, unrelated and self-asserted parents, direct INSERT bypass,
batch rollback, existing spatial scope and unchanged security. PR #136's five
adversarial tests also run against the upgraded contract.

Golden run 34392390463 passed 1,572 tests on Node 22 and 24, both builds,
and a zero-vulnerability dependency audit. Migration 20260909190228
was then applied; its recorded SQL exactly matches the tested contract.
The repository uses the Supabase-assigned migration version; no local migration
file was generated.

All five complete parent rows were captured at 2026-09-09 19:00:32.468963+00
as raw PostgreSQL JSONB text and retained in one service-role transaction.
All five ordered payload digests/counts match the source before and after transfer.
All eight declared spatial-to-parent reference checks now have zero missing rows.
The archive has 44 rows, and replaying all five parents inserted zero. The earlier
39 spatial payloads and the survivor's 19 live spatial rows remain unchanged.
Source observation times are independent; this is not a distributed snapshot.

Both original immutability triggers and the new reference trigger are enabled;
the importer/trigger bodies exactly match the tested contract. Existing grants,
non-relation constraints, RLS and security-advisor findings are unchanged.
See the [exact receipt](../verifier/spatial-parent-retention-2026-09-09.json)
and [read-only verification](../supabase/tests/spatial_parent_inventory.sql).
Final-head checks and deployment/live verification are recorded on PR #137.
There is an additional untyped source_change_events.source_id reference not
covered by these eight FKs. Its producer/source-version contract remains
unresolved; structural parent retention must not be described as complete
semantic provenance, evidence admission, writer qualification or backend cutover.

No local files are created. Auth provisioning, Markets rights/evidence, physical
device qualification and collector reconciliation remain independently pending.
No legacy backend is SAFE TO RETIRE.
