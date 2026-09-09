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

The proposed migration extends only the existing private spatial archive to
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

Production application, transfer and parity are pending isolated CI qualification.
There is an additional untyped source_change_events.source_id reference not
covered by these eight FKs. Its producer/source-version contract remains
unresolved; structural parent retention must not be described as complete
semantic provenance, evidence admission, writer qualification or backend cutover.

No local files are created. Auth provisioning, Markets rights/evidence, physical
device qualification and collector reconciliation remain independently pending.
No legacy backend is SAFE TO RETIRE.
