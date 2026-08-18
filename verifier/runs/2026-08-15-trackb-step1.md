# Run log — 2026-08-15 — Track B Step 1 (shared light-theme tokens)

Append-only. Times UTC.

## 11:0x–11:5x — investigation confirmation + token design
- Confirmed Step 1 (authorized 2026-08-10) never shipped: zero light tokens,
  no `track_b_light_theme` flag, production dark end-to-end.
- Approach: extend existing `src/styles/tokens.css` (`:root` dark = single
  source of truth; JS reads via getComputedStyle) with a
  `[data-theme='light']` block; `themeFlag.js` sets
  `document.documentElement.dataset.theme` before first paint in main.jsx.
- Hex audit: every hardcoded hex in view CSS / theme.js fallbacks / JSX
  inline styles mapped to a token; new dark tokens pixel-identical to the
  replaced hexes.

## 11:5x–12:1x — implementation + local verification
- themeFlag.js + main.jsx + migration + tests written.
- Contrast pass found 3 marginal pairs (< 4.5:1): --text-muted #73736a
  (4.46), --status-green-text #1e7f43 (4.40 on its bg), --status-blue-text
  #156ebf (4.45 on its bg). Fixed to #6e6e65 (4.79), #1a6f3a (5.43),
  #1259a6 (5.94). Final: 22/22 pairs >= 4.5:1. Locked accent #156EBF kept
  (5.23:1 on white).
- Unit suite 232/232 green; vite build green (pre-existing chunk-size
  warning unchanged).
- Screenshot harness (headless Chromium, local dist served at
  /media-intelligence-platform/ base): 8 PNGs, all four tabs x both themes,
  live data. Programmatic body-bg assertion passed on every tab. Light
  applied via `document.documentElement.dataset.theme='light'` — exactly
  what the flag reader does.
- Accent-removal test on Header + News Feed: PASS (typography/layout
  hierarchy; status meaning carried by text labels).

## 12:3x–12:5x — pushes (GitHub API; sandbox has no git credentials by design)
- c2122679 core (tokens.css 74e63586, themeFlag.js 4b266eb9 [verified],
  main.jsx 78b8896d, migration c6534729, test a393ba8a)
- 958a8212 hex-audit 1/3 (theme.js 4a20aeb0, review-status.css 90a3c6f4,
  auth.css ee3c7459)
- ac4f2507 hex-audit 2/3 (timeline.css f10e0541, phase3.css e8bbb05f,
  sourcecomparison.css cedbf804)
- e16c628c hex-audit 3/3 (TimelineView.jsx 89b67dab, GroupedTimelineView.jsx
  d67dda8e, ArticlePanel.jsx fd3d9f7e, PolicyPanel.jsx 73d0ec6e)
- Byte verification: local git blob SHA (sha1 of "blob {len}\0"+content)
  vs GitHub-returned blob SHA. All listed SHAs match. NOTE: sandbox /tmp
  wiped mid-session after pushes completed; verification of e16c628c blobs
  and re-verification of the earlier blobs performed against remotely
  returned SHAs (pre-wipe local SHAs recorded above; main.jsx / migration /
  test / tokens.css verified by full-content download + assertion).

## Live migration + rollback drill
(Executed after deploy of the above commits; entries appended below.)

## 05:10Z–05:18Z — verifier push, live migration, CI, rollback drill (times UTC;
  the blocks above were logged in sandbox-local time — actual UTC = minus ~7h)
- 79b51b97 verifier: README.md (70950716), v7/trackb-step1-tokens.md
  (d87ba8b9), runs/2026-08-15-trackb-step1.md (615694cd) — byte-verified.
  (README first-verify found a 1-byte newline mismatch in the local copy;
  remote content confirmed correct, local reconstruction re-matched.)
- Migration `20260815_track_b_light_theme_flag` applied to live project
  SUPABASE_PRODUCTION_REF_REDACTED via apply_migration (recorded in schema_migrations);
  SELECT confirms key present, value false.
- CI at every commit, including final HEAD 79b51b97: Golden regression suite
  success + Deploy to GitHub Pages success (runs 31866394534 / 31866397530).
- LIVE ROLLBACK DRILL against https://jkelsen13-tech.github.io/media-intelligence-platform/
  (headless Chromium, fresh page load each phase; flag is read at load):
  1. flag=false (baseline): data-theme absent, body bg rgb(11,11,10),
     text rgb(232,234,240) — dark, news + timeline tabs. PASS
  2. UPDATE pipeline_config SET value=true (returning confirmed true):
     data-theme='light', body bg rgb(247,247,244) = #F7F7F4, text
     rgb(26,26,23) = #1a1a17 — light, news + timeline tabs. PASS
  3. UPDATE back to false: data-theme absent, body bg rgb(11,11,10) —
     instant revert to dark on next page load, no redeploy. PASS
  Screenshots: live-drill-{false-pre,true,false-post}-{news,timeline}.png.
- Flag left at false (dark) — withhold posture restored.

## 05:50Z–06:10Z — PRODUCTION FLIP to light (owner-authorized 2026-08-15)
- Pre-flip SELECT confirmed live value was false (not assumed).
- UPDATE pipeline_config SET value=true, returning confirmed true.
- Live verification against production (headless Chromium, fresh loads):
  all four tabs (News/Graph/Timeline/Arcs) render light —
  data-theme='light', body bg rgb(247,247,244)=#F7F7F4, text
  rgb(26,26,23)=#1a1a17 on every tab. Screenshots: live-light-*.png.
- Accent-removal test re-run against the LIVE light state (accent +
  cat-blue neutralized to grey): Header + News Feed remain fully legible —
  hierarchy via typography/layout, statuses are text labels. PASS.
  Screenshot: live-light-accent-removed-news.png.
- NO-FLASH CHECK — found a real defect: content render is correctly gated
  (first-contentful-paint at 4636ms, already light), but the page BACKDROP
  painted dark rgb(11,11,10) from first-paint (1340ms) until the flag
  resolved (4624ms). Reported to owner; owner answered "no preference" —
  shipped the minimal fix as Step 1 polish:
- ee0c7480 flash fix: index.html inline head script applies the
  localStorage-cached theme ('mip-theme') before first paint;
  themeFlag.js cacheTheme() writes the cache after each authoritative
  resolution; +1 unit test (5 total, all green locally with stubbed
  supabase). Cache is a paint-time hint only — authoritative re-resolution
  gates render on every load, withhold posture intact (failed fetch =>
  dark regardless of cache). Byte-verified: index.html 84a81948,
  themeFlag.js 004a52f7, themeFlag.test.mjs cba73f06.
- Post-fix flash measurement (deployed at ee0c7480, CI green: Golden
  regression suite + Pages deploy both success):
  - WARM visit (cache primed): data-theme='light' at 46ms, bg light from
    the start, first-paint 32ms light, FCP 388ms. ZERO flash.
  - COLD visit (empty cache, e.g. first-ever visit or right after a flag
    change): dark backdrop during flag fetch, content still gated light.
    Documented limitation, by design.
- CI re-confirmed post-flip: latest runs at HEAD 6bc98e5b and ee0c7480 all
  success; DB-only flip triggered no runs, as expected.
- Final state: track_b_light_theme = true; light theme is the production
  default. Rollback remains: set flag false (one SQL update).

---
## 2026-08-15T08:40Z — Track B card-radius 20px (verifier v8)

Scope: owner-approved `--card-radius` 8px → 20px, uniform across rectangular
content cards; deliberate departure from the original 4–8px spec.
- Radius audit first (same class as the hex audit): 23 hardcoded card radii
  found across 7 stylesheets and moved to var(--card-radius); pills/badges,
  small controls, buttons, sheet tops, and focus outlines deliberately
  untouched. Full table in v8/trackb-radius-20px.md.
- Tests: 233/233 green; vite build green (pre-existing chunk-size warning).
- Push: first push_files call failed with "Service temporarily unavailable".
  Rule 9 read-only check: HEAD still 773c7ac6, all 8 remote blobs at
  pre-push SHAs — nothing landed. Retried as two commits:
  c123cd83 (7 files) + 04ebb359 (index.css).
- Byte verification (local blob SHA1 == GitHub API SHA at commit):
  tokens.css c1358e77 | index.css d6dfb95f | edge-list.css b58faef9 |
  phase3.css f4d461a2 | sourcecomparison.css 29d68cbe | timeline.css
  0c7d0422 | news.css 78ed1722 | review-status.css 819d88df — 8/8 match.
- CI: Golden regression + Pages deploy success at c123cd83 and 04ebb359.
- Live: production bundle assets/index-1ugBINzW.css serves
  `--card-radius: 20px` (only declaration); light theme remains default.
- Visual: 6-tab screenshots (News, Graph, Timeline, Arcs, Source
  Comparison, Legal & Policy) at 20px light theme reviewed; no bubble-like
  small cards; pills proportionate. 20px is an owner estimate from a
  reference image — adjustment-ready, not locked.
- Open item unchanged: 13px → 16-18px body-text bump still excluded.
- Erratum: the first verifier-docs push (592456f3) went out with
  unfilled placeholders (my error); corrected by the immediately following
  commit. The placeholder blobs were never intended content.
