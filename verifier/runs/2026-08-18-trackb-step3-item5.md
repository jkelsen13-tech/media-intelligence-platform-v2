# Run log — Track B Step 3, item 5, FINAL (ArcsView Timeline tab)

Date: 2026-08-18. Namespace: trackb3-v5. Branch: main.
Criteria: `verifier/trackb3-v5/trackb3-step3-item5.md` (locked before
implementation, per protocol).

## 1. Environment

- Master working copy: /mnt/agents/work/media-intelligence-platform
  (git, node_modules present; tests run directly here).
- Run copy: /tmp/mip-run (rsync --delete excl. node_modules/.git +
  npm install) — recreated this session (/tmp wiped between turns).
- Browser: Playwright async API in ipython; built dist served at
  /tmp/mip-serve/media-intelligence-platform (vite base path).
- Pushes: GitHub MCP push_files only (no git credentials in sandbox).
- CI: unauthenticated actions/runs polling.

## 2. Live-data basis (read-only, project SUPABASE_PRODUCTION_REF_REDACTED, 2026-08-18)

- arc_events per arc (read-only REST count): China — military
  escalation 12, Charlie Kirk — media feud 10, Andy Burnham — domestic
  policy agenda 5, + 3 more arcs at 5/4/3. Default arc (Sophie
  Cunningham — misconduct case) has 1 arc_event → 0 connectors (n−1 for
  n=1) — correct behavior, not a defect.
- arc_events remain non-nodes: arc-scope timelines carry ZERO graph
  edges → edges={[]} by construction → every connector "Sequence only"
  (unchanged from item-3/4 findings; 411 edges, zero causal live).

## 3. What was built

1. `src/views/ArcsView.jsx` (modified, blob 623dbc09 → 5e30010d):
   third tab (Timeline) between Overview and Evidence, same
   ep-tab/role/aria-selected pattern; tab body = shared ArcTimeline
   over `detail.events.map(normalizeArcEvent).filter(Boolean)` (item-4
   seam), `edges={[]}` literal at the call site,
   `loadArticle={loadArticleExcerpt}`, Screen-5-identical emptyText;
   closing footnote in the TrustFooter left slot gated on
   `activeTab === 'timeline'`, TIMELINE_CLOSING_FOOTNOTE imported via
   the timelineScreenModel seam; two stale "tab deferred" comments
   rewritten. The timelineEntries useMemo sits with the other hooks
   ABOVE the loading early-returns (see §6 incident).
2. `tests/arcTimelineTab.test.mjs` (new, blob a5380567): 6 guards —
   tab presence/order/aria, seam consumption + call-site props, engine
   behavior pin (n−1 "Sequence only" over normalized arc_events),
   footnote seam-import + tab-gating + never-re-typed, reuse-not-
   rebuild + hex audit, stale-comment guard.

No new components, no lib changes, no supabase.js changes, no CSS
changes — pure consumption of the item-3/4 kit.

## 4. Test/build results

- Baseline before edits: 332/332 (item-4 HEAD 1ef206e2).
- After edits: 338/338 (332 + 6 new), `node --test tests/`.
- `npm run build` clean (vite, no warnings beyond the standing
  chunk-size notice).

## 5. Push record (byte verification: local git hash-object vs remote blob)

| Commit | Files | Local blob | Remote blob | CI |
|---|---|---|---|---|
| 6c03efae | src/views/ArcsView.jsx | 5e30010d | 5e30010d MATCH | green both |
|          | tests/arcTimelineTab.test.mjs | a5380567 | a5380567 MATCH | (same commit) |

Pre-push discipline (trackb3 disclosure-1 rule, active for the first
time): the commit message was re-read against the actual two-file
payload BEFORE pushing — every message claim maps to ArcsView.jsx or
arcTimelineTab.test.mjs; the criteria path is a pointer (pushed in
close-out, item-4 precedent). Match confirmed; no flag-and-hold
needed. Test and guarded file rode the SAME commit (item-3 rule).

## 6. Incidents and disclosures

ONE incident, caught and fixed locally BEFORE any push — nothing to
disclose against the remote:

- React error #310 (hook-count mismatch) on first live smoke: the new
  timelineEntries useMemo was initially placed after the loading
  early-returns (`if (error) return …`), so the hook count changed
  between the loading and loaded renders and the whole app tree
  unmounted. Caught by the live smoke (white page, minified React
  #310 in console), fixed by hoisting the hook above the early
  returns with a comment pinning the constraint, re-tested 338/338,
  rebuilt, re-smoked clean. The pushed blob 5e30010d already contains
  the fix. No remote commit ever carried the broken state.

## 7. Acceptance sweep vs A5.1–A5.9

- A5.1 tab structure/order/aria: guard test + live smoke (tabs render
  Overview / Timeline / Evidence; aria-selected tracked per tab). PASS
- A5.2 seam consumption: guard test pins import, normalization call,
  edges={[]} literal, loadArticle, emptyText at the call site. PASS
- A5.3 connectors: engine behavior pin (n−1 "Sequence only") + live
  smoke on the 12-event China arc: 11 connectors, ALL
  "Sequence only", ALL ep-connector-sequence. PASS
- A5.4 footnote: guard test (seam import, gated, never re-typed) +
  live smoke (footnote present on Timeline tab, ABSENT on Overview and
  Evidence). PASS
- A5.5 reuse-not-rebuild: static guard (no buildConnectors /
  TimelineConnector / TimelineEntryDetail / hex in ArcsView). PASS
- A5.6 stale comments: rewritten + guard test pins their absence. PASS
- A5.7 suite/build/live smoke: 338/338, build clean, smoke green,
  zero console errors / pageerrors / failed requests. PASS
- A5.8 acceptance pass:
  - Grayscale/accent-removal (CSS grayscale(1) filter on <html>),
    BOTH screens: Screen 4 Timeline tab and Screen 5 arc scope fully
    legible — Confirmed badge carries checkmark icon + text label
    (state never color-alone); connector state is structural (dashed
    chip + "Sequence only" text; causal branch = solid line + link
    icon + "Source-supported causal link" text).
  - Causal-vs-sequence legibility with color removed: distinction
    reads from line treatment + icon + label text, verified in the
    grayscale captures and the TimelineConnector markup.
  - AA contrast audit (computed styles, live DOM): tab active 16.25,
    tab inactive 6.28, connector label 5.15, footnote 6.28, date 4.87,
    entry title 16.25, entry description 9.86, Confirmed badge 5.79 —
    all ≥ 4.5:1.
  - Capture set: Screen 4 Timeline desktop color + grayscale, Screen 4
    Overview + Evidence desktop, Screen 5 arc desktop color +
    grayscale, Screen 4 Timeline mobile 390px (12 entries / 11
    connectors intact), Screen 5 arc mobile 390px.
  PASS
- A5.9 push discipline: single code commit, pre-push message-vs-files
  re-read (match, no hold), byte verification MATCH × 2, CI green per
  commit (6c03efae: Golden regression suite success, Deploy success).
  PASS

## 8. Verifier close-out chain (this item)

- Criteria: verifier/trackb3-v5/trackb3-step3-item5.md (local blob
  9465a548) — pushed in its own commit.
- README append (canonical base 6b16cf8e at 748d6b68, item-5 entry
  appended; local result 12fd7e51) — pushed in its own commit.
- This run log — pushed in its own commit.
- CI sweep after each; local record commit closes the item.
