# trackb3-v3 — Track B Step 3, Item 3: Timeline entry + connector-label engine

Date: 2026-08-18. Namespace: trackb3-v3. Branch: main.
Reference: 04_ADDENDUM_SIX_SCREEN_REFERENCE_SPEC (2026-08-17), Screen 5
(Timeline) — the locked reference, esp. "Connector labels between entries —
the causation boundary made visible" and "Expanded entry detail card".

## Scope

The shared engine both timeline surfaces (Screen 5 screen, item 4; Arc
Timeline tab, item 5) consume:

1. `src/lib/timelineEngine.js` — pure seam: connector derivation between
   adjacent entries, expanded-detail view model, locked copy constants.
2. `src/components/TimelineConnector.jsx` — the connector label element.
3. `src/components/TimelineEntryDetail.jsx` — the expanded detail card.
4. `tests/timelineEngine.test.mjs` — unit pins + static drift guards.

No screen wiring in this item (that is item 4/5); no DB writes.

## Live-data facts (read-only queries, 2026-08-18, project SUPABASE_PRODUCTION_REF_REDACTED)

- edges: 411 rows — actor 330, sequence 80, constrained_by 1. ZERO causal.
- edges.doc_strength vocabulary: corroborated 294, circumstantial 80,
  documented 37. Zero causal edges with any strength.
- edges columns include doc_strength, signal_source, claimed_by,
  disputed_by, alternative_causes, counterfactual_test, reliability,
  sky_verified. The current timeline read (loadTimeline) selects only
  id/source_id/target_id/type/weight/label — item 4 must ADD doc_strength
  to that select for the connector engine to see it (read-path only).
- nodes (timeline entries) columns: id, slug, label, type, description,
  confidence, summary, occurred_at, metadata, created_at, updated_at,
  arc_id. NO authentication/excerpt column.
- articles columns include summary, outlet, published_at, url — a real
  source excerpt exists ONLY via the article join (entry.article_id).
- arc_events are NOT nodes: their ids never appear in edges.source_id /
  target_id, so no stored causal relation between arc_events can exist in
  the current schema. Arc-scoped timelines therefore render "Sequence
  only" on every connector — the honest state of the record.

## The connector rule (the non-negotiable, made precise)

Every gap between two adjacent entries is labeled, never implicit:

- **"Source-supported causal link"** (with link icon) iff ALL of:
  1. a stored edge connects the earlier entry's key to the later entry's
     key, in THAT direction (source = earlier, target = later) — a
     backward causal claim (later → earlier) never labels a chronological
     gap, since the label would read as "earlier led to later";
  2. edge.type === 'causal';
  3. edge.doc_strength is confirmed-grade: 'documented' or 'corroborated'.
     'circumstantial' is the weak tier and does not earn the label;
     absent/null strength withholds the label (withhold posture — the
     stronger claim requires the stronger record). The underlying edge
     remains visible verbatim in the entry's expanded detail.
- **"Sequence only"** in every other case — including when a sequence or
  actor edge exists between the pair. Temporal adjacency is never
  presented as causation.

Labels are verbatim constants; the closing footnote "Chronology is shown
as sequence. Causal links appear only when source-supported." is a
verbatim constant. None may be abbreviated or dropped for density
(static-guarded).

Non-color channels (accent-removal bar): the distinction reads from (a)
the WORDS, (b) the link icon present only on the causal label, (c) line
treatment matching the graph legend — dashed for sequence, solid with
arrow for causal. Grayscale legibility is screenshot-verified in item 5.

## Expanded detail card (v16 three-tone honest states)

`entryDetailView({ entry, article })` returns four sections, each with a
tone from the existing AXIS_TONES vocabulary (value / unverified /
unavailable — imported from relationshipProvenance, not redefined):

- **What changed** — entry.description (value), else explicit
  unavailable: "No description recorded for this entry."
- **Source excerpt** — only when the article join resolves AND the
  article carries a summary: italic quoted excerpt + attribution
  "— {outlet}, {date}" (value). Otherwise explicit unavailable: "No
  source excerpt recorded for this entry." Never fabricated.
- **Authentication** — the schema has no per-event authentication record
  (sky_verified lives on edges, not nodes): always the explicit
  unavailable state "Not archived — authentication not yet available for
  this entry." (v16 wording), until a real signal lands.
- **Remaining uncertainty** — no per-entry field exists: explicit
  unavailable "No remaining-uncertainty note recorded for this entry."

## Acceptance criteria

A3.1 CONNECTOR labels verbatim: 'Sequence only' and 'Source-supported
causal link'; footnote verbatim: 'Chronology is shown as sequence. Causal
links appear only when source-supported.'
A3.2 buildConnectors(entries, edges) returns exactly entries.length − 1
connectors for n ≥ 1 entries — a connector for EVERY gap, never dropped.
A3.3 No edges / non-causal edges / unknown-type edges between a pair →
sequence connector.
A3.4 Causal branch (unit-test-pinned; unreachable on live data today):
type causal + direction earlier→later + doc_strength documented → causal;
corroborated → causal; circumstantial → sequence; null/absent → sequence;
backward direction (later→earlier) → sequence.
A3.5 Withhold posture: an edge row missing the doc_strength field
entirely (older read shape) → sequence.
A3.6 Connector component renders words + (causal-only) link icon + line
treatment class; sequence and causal carry distinct classes for the
legend-matching line styles.
A3.7 entryDetailView tones ⊆ AXIS_TONES; each absent leg returns the
exact documented copy; article excerpt renders only with summary AND
attribution legs present (outlet or date missing → excerpt withheld).
A3.8 Locked-copy static guards: both connector labels and the footnote
present verbatim in the component/model files; no hex in new/changed
files.
A3.9 Full suite green (301 baseline + new), build clean, byte-verified
pushes, CI green per commit.
