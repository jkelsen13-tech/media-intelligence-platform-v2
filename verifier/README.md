# Verifier index

Append-only goal and run index for the verification harness. Each goal gets a
versioned acceptance file; each run appends a timestamped record. See
`runs/` for the run log named in each entry.

---

## pkg1-v1 — Investigation Context semantic repair (2026-08-18)

Restores the Investigation Context panel's subject/temporal semantics:
canonical subject type/id, parent event id, as_of_time, selected time range,
and the recorded-vs-existing markers, plus the
arcId/eventKey/nodeId/relationshipId/articleId navigation contract including
the News→Timeline return-to-origin case (lands on the originating arc, never
the global corpus when an arc is known).
Details: `pkg1-v1/README.md`. Run log:
`runs/2026-08-18-pkg1-context-semantic-repair.md`.

---

## stage-d-visual-repair-v1 — Stage D terrain visual-continuity repair (2026-09-05)

Bounded owner-authorized repair: live World View terrain around the
Cleveland node was technically active but not visibly legible at the
enforced city camera floor, and CDEM-mixed Lake Erie-adjacent tiles were
fail-closed rejected, punching a seam into the approved coverage. Measures:
live preflight evidence (terrain status, accepted/rejected tile counts,
exact source headers, same-camera terrain-vs-ellipsoid captures, exact
34,641.016151377546 m floor); evidenced diagnosis inside the authorization's
enumerated causes; CDEM admitted to the display-only allowlist only after
primary-source Open Government Licence – Canada 2.0 verification with the
required attribution sentence carried in the UI disclosure; a restrained,
labeled, height-derived relief-shading treatment with no vertical
exaggeration; full suite green (723/723); branch byte-verified against the
tested tree; PR-only merge after checks pass; post-deploy 10-item live
acceptance walk; Stage D closeout addendum last, prior defect history
preserved.
Details: `stage-d-visual-repair-v1/ACCEPTANCE.md`. Run logs:
`runs/run_2026-09-05T02-10Z_v1.md`, `runs/run_2026-09-05T05-40Z_v1.md`,
`runs/run_2026-09-05T22-05Z_v1.md`, `runs/run_2026-09-05T23-55Z_v1.md`.
Differs from prior version: first version for this goal; no schema, source,
or canonical-state changes — display-only renderer repair.
