# Run log — Track B Step 3, item 3 (timeline connector + entry-detail engine)

Date: 2026-08-18. Criteria: `verifier/trackb3-v3/trackb3-step3-item3.md`
(namespace trackb3-v3). Branch: main.

## 1. Environment

- Master working copy: `/mnt/agents/work/media-intelligence-platform`
  (git repo, persistent). Run copy: `/tmp/mip-run` (rsync --delete,
  node_modules excluded then `npm install`; /tmp is wiped between turns
  and was recreated this session).
- Pushes via GitHub MCP `push_files` (no git credentials in the sandbox,
  re-verified this session); byte verification via MCP `get_file_contents`
  blob SHA vs local `git hash-object`.
- CI observed via `api.github.com/repos/.../actions/runs` (unauthenticated;
  log download is admin-gated, so failures are root-caused by local
  reproduction instead).

## 2. Live-data basis (read-only, project SUPABASE_PRODUCTION_REF_REDACTED, 2026-08-18)

- edges 411 rows: actor 330, sequence 80, constrained_by 1, causal 0.
- edges.doc_strength: corroborated 294, circumstantial 80, documented 37.
- loadTimeline's current edge select lacks doc_strength — item 4 must add
  it (read-path only) for the connector engine to see strength.
- arc_events are not nodes (no arc_event id appears in edges endpoints), so
  arc-scoped timelines can never carry a stored causal edge → every
  connector "Sequence only", the honest state of the record.
- articles carry summary/outlet/published_at — the only real excerpt leg.

## 3. What was built

- `src/lib/timelineEngine.js` — pure seam: locked copy constants
  (CONNECTOR_SEQUENCE_LABEL, CONNECTOR_CAUSAL_LABEL,
  TIMELINE_CLOSING_FOOTNOTE), findCausalLink / connectorBetween /
  buildConnectors (exactly n−1, frozen results), DETAIL_EMPTY +
  entryDetailView (four sections on the shared AXIS_TONES vocabulary;
  excerpt only with summary + outlet + date legs; AXIS_TONES containment
  checked at call time, throws on vocabulary drift).
- `src/components/TimelineConnector.jsx` — words + causal-only link icon +
  legend-matching line (dashed sequence / solid+arrow causal), role="note"
  with aria-label; labels consumed from the model, never re-typed.
- `src/components/TimelineEntryDetail.jsx` — four labeled sections
  (document/quote/shield/questionDashed icons), unavailable tone muted;
  excerpt as blockquote+figcaption only for value tone.
- `src/components/epistemic.css` — appended ep-connector* / ep-tdetail*
  block, var()-only.
- `tests/timelineEngine.test.mjs` — 14 tests (verbatim copy, n−1 invariant
  sweep n∈{0,1,2,5,25}, nine negative branches, confirmed-grade causal
  pins, direction-must-match-chronology, mixed corpus
  [causal, sequence, sequence], AXIS_TONES containment, detail legs,
  static drift guards, hex audit).

## 4. Test/build results

- Baseline before item: 301/301 (items 1–2).
- After item: 315/315 (301 + 14 new) — run in /tmp/mip-run after
  `npm install` (first attempt showed 10 pre-existing ERR_MODULE_NOT_FOUND
  failures from the wiped /tmp node_modules; environment issue, not code).
- `npm run build` clean (7.00s).

## 5. Push chain + byte verification

| Commit | Files | Result |
|---|---|---|
| f8a080d4 | timelineEngine.js, TimelineConnector.jsx, TimelineEntryDetail.jsx, timelineEngine.test.mjs | blobs 5fbfd49d / cb6d883d / fe786344 / 1d409245 — all MATCH remote |
| b5cb22b9 | epistemic.css (item-3 styles, split out) | blob 645afe5f — MATCH remote |
| 6ef1d0b2 | verifier/trackb3-v3/trackb3-step3-item3.md | blob c88aeac5 — MATCH remote |

## 6. CI per commit (incl. the disclosed failure)

- f8a080d4: Golden regression suite FAILURE, Deploy FAILURE. Root cause
  established by local reproduction (run logs are admin-gated): the CSS
  static guard `connector line treatments are dashed-sequence /
  solid-arrow-causal in CSS and SVG` reads epistemic.css, which at that
  tree still held only the item-2 block (the item-3 styles were split into
  the follow-up commit). Reproduced exactly: item-2 css + item-3 tests →
  13/14 with only that guard failing; restored css → 14/14. Split-push
  error on my side — the test and the styles it guards should have ridden
  the same commit.
- b5cb22b9: Golden regression suite SUCCESS, Deploy SUCCESS (current HEAD).
- Full suite re-run green (315/315) against the pushed-tree state.
- Net state: HEAD green on both workflows; the failed intermediate commit
  is disclosed here and in the README entry rather than silently absorbed.

## 7. Criteria closure (A3.1–A3.9)

A3.1 verbatim labels + footnote — pinned by test 1 and static guard. ✔
A3.2 n−1 invariant — sweep n∈{0,1,2,5,25} + null input. ✔
A3.3 negative branches — nine-case sweep (no edge, sequence/actor/
constrained_by/unknown types, absent/null/circumstantial/garbage
strength). ✔
A3.4 causal branch — documented + corroborated pinned causal with edgeId;
circumstantial/null/absent/backward pinned sequence. Unreachable on live
data (zero causal edges) — proven on fixtures, per Step 2 item-4
precedent. ✔
A3.5 older read shape (no doc_strength field) → sequence. ✔
A3.6 component channels — words + causal-only link icon + distinct
classes; labels only in the model (static guard). ✔
A3.7 detail tones ⊆ AXIS_TONES; exact DETAIL_EMPTY copy; excerpt withheld
when any attribution leg missing. ✔
A3.8 static guards + hex audit across the four item-3 files. ✔
A3.9 suite 315/315, build clean, byte-verified pushes; CI green at HEAD
with the f8a080d4 intermediate failure root-caused and disclosed. ✔

## 8. Carry-over notes for item 4

- Add doc_strength to loadTimeline's edge select (read-path only) or the
  connector engine can never see strength on the Screen 5 surface.
- Arc-scoped timelines will render "Sequence only" on every connector
  today (arc_events are not nodes) — correct, honest, and expected.
- The on-demand article-excerpt loader (entry.article_id join) is an
  item-4 wiring concern; entryDetailView already consumes the resolved
  article or null.

## 9. Final push record

- 27e3c85f — verifier/README.md trackb3-v3 entry appended (append-only);
  remote blob 6bd45f5a MATCHES local.
- f66a3ab5 — this run log, initial push; remote blob b80dfae7 MATCHES
  local.
- (final update) — this section added; remote blob recorded in the local
  record commit after verification.
