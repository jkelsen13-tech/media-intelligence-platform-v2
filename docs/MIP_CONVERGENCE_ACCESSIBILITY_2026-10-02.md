# MIP convergence: accessibility and mobile — 2026-10-02

This bounded lane starts at frozen `b8ac1663fa75c4c7a26d653a288f745070bafcae`. It repairs functional keyboard/semantic control defects and rejects unsafe evidence links. It does not establish release readiness, live backend behavior, physical-device qualification, screen-reader speech quality, or a complete accessibility conformance result.

## Reproduced defects and repairs

| Defect at frozen base | Repair | Regression evidence |
| --- | --- | --- |
| Global workspace search ignores Enter. | Enter opens the existing Explore callback with current query; IME composition Enter is preserved. | Rendered input callback test and Chromium keyboard activation. |
| Dimmed graph buttons remain keyboard focusable despite disabled-in-practice callbacks. | Native `disabled` applies to all four buttons while dimmed. | Rendered graph action counter test; browser disabled-state check. |
| Mobile ArticlePanel resize is a pointer-only separator. | Native labeled button provides Enter/Space/assistive activation and touch tap toggling; existing drag snap behavior remains. Pointer cancellation abandons the in-progress resize. | Rendered expand/tap/drag/cancel cases; Chromium keyboard and emulated touch at three narrow viewports. |
| Workspace view navigation advertises tabs without panels or tab keyboard behavior. | The existing view-switch row is navigation with current-page semantics. | Rendered navigation structure and current-page assertion. |
| Actual Timeline/Arc evidence tabs lack keyboard arrow and Home/End focus behavior. | A single tab stop and automatic arrow/Home/End selection move focus among supplied tabs. | Rendered wrap/start/end assertions; browser actual focus and panel-content assertion. |
| Article, relationship and policy panels expose supplied unsafe URLs as anchors. | Reuse the auth/security lane's `safeExternalHttpUrl` helper. Keep article/relationship titles as text; policy links show unavailable copy for unsafe locators. | Rendered javascript/data/credential/relative locator cases plus safe HTTPS preservation. |

The seven new cases in `tests/convergenceAccessibility.test.mjs` all fail against an isolated archive of frozen `b8ac166` and pass on this candidate. The baseline run is intentionally failing; it is reproduction evidence, not a qualification result.

## Qualification

- Focused candidate suite: **48 passed, 0 failed** across the seven new cases and adjacent evidence/backend, workspace, tabs, chronology-tab wiring, graph geography, and Explore join-state tests.
- Frozen World View Explore adjacency: **18 passed, 0 failed** (`worldViewExploreShell.test.mjs` and `worldViewExploreState.test.mjs`). The qualified World View canvas/mobile/listener implementation remains unchanged.
- Chromium **151.0.7922.173**, synthetic isolated component harness: **1280×800, 390×844, 640×360, 320×568** all passed search Enter, real tab focus/selection, and dimmed graph disabling. Narrow cases passed keyboard plus emulated touch sheet toggle, page scrolling, and no document/shell horizontal overflow. No page errors occurred.
- Actual application bundled-demo path: **1280×800, 390×844, 640×360** passed global Enter → Explore, Shift+Tab wrap inside Explore, Escape dismissal and focus restoration to the Explore trigger. External requests were blocked; only the Google Fonts stylesheet was requested outside localhost. No page errors occurred. Screenshots and `app-browser.*` receipts preserve this narrower result.
- `git diff --check` passed.

Commands:

```sh
node --test tests/convergenceAccessibility.test.mjs tests/evidenceBackendFrontend.test.mjs tests/workspacePresentation.test.mjs tests/evidenceTabs.test.mjs tests/arcTimelineTab.test.mjs tests/graph_workspace_geography.test.mjs tests/investigationJoinState.test.mjs
node --test tests/worldViewExploreShell.test.mjs tests/worldViewExploreState.test.mjs
```

Raw local receipts are in `/workspace/mip-lane-a11y-receipts`: `baseline-regression.txt`, `targeted.txt`, `frozen-adjacent.txt`, `browser.cjs`, `browser.json`, `browser.txt`, component harness files, eight component viewport screenshots, `app-browser.cjs`/`.json`/`.txt`, and three application Explore screenshots. The component harness runs from ignored `tests/.compiled/a11y-browser.html` using the existing isolated Vite fixture configuration on port 4183. It uses only local synthetic data; it does not represent a populated account or production evidence corpus. Screenshots capture functional evidence; no subjective visual redesign is claimed.

## Coordination and limits

App-owned About/More modal entry, focus trap/restore and modal semantics were reported to the semantics lane; this lane does not modify App. AccountPanel/auth behavior belongs to the auth/security lane. Evidence URL imports depend on that lane's committed `src/lib/externalUrls.js`; the temporary helper copy used locally is deliberately excluded from this lane's commit.

This lane preserves nonmodal docked inspector behavior rather than imposing a modal focus trap on analytical panels. Existing App Escape dismissal, Explore helper hooks, shared mobile navigation hooks and qualified Graph/Map/Split contracts were inspected; dedicated adjacent tests remain passing. Real screen-reader testing, physical touch devices, signed-in account paths, populated live backends, and complete Graph/Map/Split browser qualification remain separate gates. The final integrated suite and production build belong to the parent convergence check.

No credentials, account creation, live backend mutation, paid activation, merge, push, deployment, or release operation was performed. The Playwright CDN download attempt returned HTTP 403 (domain forbidden); installed system Chromium subsequently supplied the successful browser run, so this is not a remaining browser blocker.
