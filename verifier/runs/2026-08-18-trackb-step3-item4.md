# Run log — Track B Step 3, item 4 (Timeline screen, Screen 5)

Date: 2026-08-18. Criteria: `verifier/trackb3-v4/trackb3-step3-item4.md`
(namespace trackb3-v4). Branch: main.

## 1. Environment

- Master working copy: `/mnt/agents/work/media-intelligence-platform`
  (git repo, persistent). Run copy: `/tmp/mip-run` (rsync --delete,
  node_modules excluded then `npm install`; /tmp is wiped between turns
  and was recreated for the verification pass).
- Pushes via GitHub MCP `push_files` (no git credentials in the sandbox);
  byte verification via the public git trees API blob SHA vs local
  `git hash-object` (cheaper than get_file_contents for multi-file
  sweeps; same object ids).
- CI observed via `api.github.com/repos/.../actions/runs`
  (unauthenticated; log download admin-gated).
- Live smoke: Chromium via Playwright (async API only inside ipython —
  the sync API fails inside the asyncio loop) against the built dist
  served under /tmp/mip-serve/media-intelligence-platform (vite base
  path; a bare dist serve 404s the assets).

## 2. Live-data basis (read-only, project SUPABASE_PRODUCTION_REF_REDACTED, 2026-08-18)

- 49 story arcs; default arc resolves to the first active arc in
  loadArcs order ("Sophie Cunningham — misconduct case" at smoke time).
- Arc scope (default arc): 7 arc_events → 6 connectors, all "Sequence
  only" (arc_events are not nodes — item-3 finding); footer counts live:
  3 attached articles / 9 graph connections.
- Guardrail 4: an arc with missing=4 renders the verbatim scope copy
  ("Scope: 4 expected outcomes tracked for this arc, checked against the
  monitored corpus from 2026-08-09 through 2026-08-09.").
- Global scope (explicit opt-in): 337 canonical events + 46 suppressed
  mirrors; Page 1 of 14 at PAGE_SIZE 25 → 24 connectors on page 1;
  footer 336 related articles (entries with resolved article_id) / 80
  graph connections; timeline_grouped_beta flag TRUE live, grouped mode
  renders.
- Zero console errors across both scopes, both themes' tokens, 390px
  mobile and desktop viewports.

## 3. What was built

Per criteria §Scope (8 files) — seam (`timelineScreenModel.js`), shared
renderer (`ArcTimeline.jsx`), extracted `ArcEvidencePanel.jsx` consumed
by both views, rewritten `TimelineView.jsx`, read-path-only supabase
additions (doc_strength on both timeline edge selects;
loadArcConnections with both-endpoint labeling; loadArticleExcerpt),
App wiring simplification (Flat/Grouped chips + grouped-beta flag moved
inside TimelineView), ep-tl-* css (var()-only), 17 new tests.

## 4. Test/build results

- Baseline before item: 315/315 (items 1–3).
- After item: 332/332 (315 + 17 new).
- One pre-existing guard legitimately updated:
  arcGroupedTimelinePagination.test.mjs "structure: grouped loader
  keyset-paginates all seven reads" pinned the old edges select string;
  the item-4 doc_strength addition changed it — guard regex updated with
  an explanatory comment, re-run green.
- `npm run build` clean.

## 5. Push record (byte verification: local git hash-object vs remote blob)

| Commit | Content | Key blobs | CI |
|---|---|---|---|
| 9fd5b843 | tests/arcGroupedTimelinePagination.test.mjs ONLY | 1ee728f1 ✓ | RED both workflows (disclosed §6) |
| 27b65923 | src/lib/arcGroupedTimeline.js | e808b916 ✓ | green |
| e60ebeca | src/lib/supabase.js (transcription slips) | superseded | green (slipped path untested/flag-gated) |
| 49bbd2f1 | fixup: supabase.js corrected | 17eb0f70 ✓ | green |
| 8f2b47eb | src/App.jsx | 4a67cd29 ✓ | green |
| 7fc55440 | timelineScreenModel.js + ArcTimeline.jsx + ArcEvidencePanel.jsx | 109def35 ✓ 6b319a5d ✓ 58bca3d0 ✓ | green |
| 395276bd | TimelineView.jsx + ArcsView.jsx | d60491d7 ✓ 623dbc09 ✓ | green |
| ec3c3dce | epistemic.css + timelineScreenModel.test.mjs | 00cf9408 ✓ d7af1e04 ✓ | green (HEAD) |
| c414b328 | verifier criteria (trackb3-v4) | 1cab2fde ✓ | green |
| 748d6b68 | verifier README append (base 6bd45f5a) | 6b16cf8e ✓ | green |

## 6. Disclosures

1. **9fd5b843 mis-scoped commit (CI red, closed within the item).** The
   first push carried ONLY the updated pagination guard test under a
   message describing the full data layer — the message misdescribed the
   content AND the guard landed one commit before the
   arcGroupedTimeline.js select string it pins (item-3 rule re-violated
   in the transcription pipeline). Both Golden suite and Deploy failed
   at that commit; 27b65923 supplied the guarded file and every commit
   since is green on both workflows. Root cause: the push payload was
   assembled as a single file while the message was written for the
   planned four-file commit. Rule extension (now standing): before every
   push, re-read the COMMIT MESSAGE against the ACTUAL file list, not
   the planned one.
2. **e60ebeca transcription slips (CI green, caught by byte
   verification).** Two slips inside loadSkyVerificationForNode: a
   spread around the Set constructor and `.in('id', …)` for
   `.in('article_id', …)` — the second would have been a real query bug
   (sky_verifications.id filtered by article ids) had the feature flag
   been on; it is off (withhold posture) and the path is unexercised by
   the suite, which is why CI stayed green. Corrected in fixup 49bbd2f1
   (v14 precedent); byte verification then matched (17eb0f70).
3. **App.jsx comment fix pre-push.** A dangling half-comment from the
   removed timelineGroupedBeta state was repaired locally before the
   App push (comment-only; blob target re-recorded as 4a67cd29; guard
   assertions re-run green).

## 7. Acceptance sweep vs A4.1–A4.11

- A4.1 copy pins + footnote identity + n−1 connectors both scopes: tests
  1–2 + live smoke (6/6 arc-scope connectors, 24/24 page-1 global).
- A4.2/A4.3/A4.4/A4.5: unit-pinned (tests 3–9).
- A4.6: unit-pinned (buildConnectors over normalized arc_events,
  edges=[]) + live smoke (all "Sequence only").
- A4.7: remapTimelineEdges passthrough test + select-string guards on
  both loaders + null-safe no-supabase paths.
- A4.8: single-source static guards (gap-bar-track / MILESTONE_META
  absent from ArcsView; ArcEvidencePanel imported by both views; kit
  imports in TimelineView/ArcTimeline).
- A4.9: honest-degradation guards (conditional outlet/badge, undated,
  aria-expanded) + live smoke (no badge on node events, no source line
  on arc events, explicit excerpt-unavailable copy).
- A4.10: 332/332, build clean, hex audit on six files, byte-verified
  pushes, CI per commit (§5 table; two disclosed exceptions closed
  in-item).
- A4.11: App wiring guards + live smoke of the focus jump path.
