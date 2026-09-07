# Saved investigation evidence trails

## Behavior

Overview assessments, hypothesis-linked assessments, and the before/after change inspector expose the same saved evidence trail. Users can open exact retained input positions, source text, direct assessment dependencies, earlier dependencies, and revision links. Long lists reveal ten records at a time; input content is mounted only after its disclosure opens.

An input also lists the selected assessments whose saved context contains that exact position. Dependency-only assessments are excluded from that selected list. Reused inputs and shared dependencies do not count as independent sources, and context membership does not establish support, contradiction, or the effect of withdrawing an input. This is a dependency inspection step toward the roadmap's sensitivity workflow, not a completed counterfactual reassessment or source-origin analysis.

Revision links remain separate from dependency links. Missing linked records are unavailable; no live or newer assessment substitutes for a saved record. Shared ancestors appear once per trail, and rendering does not recursively traverse dependency graphs. Historical disclosures use their own observation bundle and reset when the selected version changes.

## Temporal provenance correction

The previous input and citation inspectors looked for publication and recording timestamps on fields that the backend does not populate. The shared date display now reads:

- Source publication: `capture.payload.published_at`.
- Capture saved: `capture.captured_at`.
- Record version saved: `record_version.recorded_at`.
- Change queued: `input.queued_at`.

Available timestamps retain their exact source value in the time element and display in UTC with time of day. Unknown dates stay unrecorded; capture and queue dates never substitute for publication. These dates do not assert the time of the reported event.

## Backend and release boundary

The existing observation contract already retains the required dependency closure, input records, and timestamps. This batch consumes that contract without changing a migration, database grant, edge function, administrative write path, or immutable saved row. Original pinned workspace sources remain unchanged. Deployment consists of the frontend release after the batch PR is approved for merge.

Backend coverage uses the real migrations in an isolated database to construct a dependency diamond with positions above JavaScript's safe integer range. It verifies dependency closure, selected-assessment separation, actual timestamp fields, a later source correction and assessment replacement, unchanged historical snapshots, and denied reads for browser database roles. A newer observation can retain new collection while the existing assessment's context remains unchanged and its dependency status becomes stale.

## Verification

Targeted frontend, backend, and existing workspace tests pass. The production build passes with the project's existing chunk-size and module-import warnings. Local fixture previews were inspected at 320, 390, and 1024 pixels with expanded retained inputs and saved dependency reasoning; the document width matched the viewport at each width. Fixtures are synthetic and the preview is excluded from the release.

The currently assigned live investigation has no selected assessments. This release preserves that empty state and does not manufacture assessments, hypotheses, or evidence to populate the trail. Real source-origin grouping, withdrawal reassessment, additional authored institutional workflows, and geography observation notifications remain separate roadmap work.
