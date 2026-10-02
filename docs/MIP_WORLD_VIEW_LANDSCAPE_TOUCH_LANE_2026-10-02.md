# World View short-landscape pointer clearance — 2026-10-02

The native selected scope plaque was visible and unoccluded, but collapsed
Explore overlays intercepted its center pointer. At 844×390 the Evidence &
context banner covered the center. After clearing that banner, the 640×360
run showed the collapsed Spatial groups summary intercepting the same tap
and opening the chooser instead of the selected record card.

The bounded repair is six added lines in `src/styles/world-view-explore.css`.
Inside the existing landscape / maximum-height 600px media query, Interact
hides the collapsed context banner and collapsed spatial-group details with
`display: none`. Their controls leave the visual, pointer, focus and
accessibility trees together. Done restores the same mounted controls.
Expanded group or Inspector content remains available; the existing explicit
Inspector action exits Interact and expands the context. Done retains its
existing minimum 44px height. Desktop and portrait presentation is unaffected.

No JavaScript, canonical coordinates, camera behavior, glyph position, eye
offset, precision, near/far thresholds, legal floor, terrain or source
admission changed. No layout prototype was selected. The World View prototype
gate remains in place.

## Qualified source and evidence

Source commits are `df65ffdab8102dc0d64616e1b19c5c52a326d703` (context banner)
and `7b5cf5479069a56da1d6fdd6e1fe81c7eeac9c65` (collapsed groups). The latter
is the exact browser-qualified source commit, tree
`5709a7c09dac5ebbca78a52e6943542b7c7d0683`. The final CSS SHA-256 is
`10284bb092c7a6ab0ce23269739475fdee730fcc6f07e6ebfe236ea0521991c3`.
The following qualification commit adds documentation and the receipt only.

The unchanged parent-owned full-App harness SHA-256 was
`4b975022259666d3707e9377acb8097490545c5e5e39c320d65cca686a441572`.
It ran against the worker at `http://127.0.0.1:4180/media-intelligence-platform-v2/`,
with the candidate override set to the exact source commit. Chromium
151.0.7922.173 ran headless with `--enable-unsafe-swiftshader`.

All four native city viewports passed: **1280×900, 390×844, 844×390 and
640×360**. Each completed native center-pointer expansion, sequential
Shift+Tab → Tab focus and Enter reopening, reader tabs, explicit Inspector,
recorded-time/subject preservation and Graph → Map remount camera retention.
Each reported `ellipsoid-globe` and zero page errors. Each mocked five HEAD
count requests and blocked two external RPC POSTs. External GET totals were
215, 160, 162 and 158 respectively; those requests were intercepted and never
qualify real source access.

The final-source Atlas recovery run also passed at 1280×900 with
`atlas-fallback`, zero page errors, and no unsupported native camera. All
backend records were synthetic. The public hostname configuration used a
noncredential fixture value; Supabase GET/HEAD requests were mocked and POSTs
aborted. No live reader/auth or provider admission was exercised.

Node **22.23.3** and **24.19.0** each passed **31 focused checks** covering
Explore session/focus/scroll cleanup, keyboard/card/Inspector bindings,
selection/time/stale-state guards, native integration and Atlas recovery.
Both final-source production builds passed; the existing large-chunk advisory
remains. No additional implementation-mirroring unit test was added for this
CSS repair; the actual full-App pointer journey reproduced and qualified it.

The [qualification receipt](MIP_WORLD_VIEW_LANDSCAPE_TOUCH_QUALIFICATION_RECEIPT_2026-10-02.json)
records every artifact and log hash. Its SHA-256 is
`13ab071dbd8e2408ccf969966e0d27f70dc17cd92085f5622b79d545410dbc5d`.
The native city JSON is 16,744 bytes, SHA-256
`3172a64bcddb1f6203ee2cd750832fa62cd87be86baa38d5d40e724c3258c3e3`;
the Atlas JSON is 2,485 bytes, SHA-256
`e206865959418aca59aa5484bc7d1f75b7e9fc42546bb5e9b8b3c207069707fc`.
Artifacts reside under `/workspace/mip-launch-receipts/browser-landscape-touch`
and `browser-landscape-touch-atlas`. Earlier failures are retained separately.
The initial worker configuration failure loaded no rows and is not counted as
product qualification.

Physical devices, physical mobile/FPS, live reader/auth and real source/provider
admission remain unqualified. The optional injected source-fault journey was
not rerun for this CSS-only lane. No merge, deployment or protected mutation
was performed.
