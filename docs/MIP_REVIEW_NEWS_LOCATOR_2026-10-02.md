# News recorded-locator correction after source review

Date: 2026-10-02. Baseline `814cb6500265144c36a91730f16c7982866d3f49`, tree `8d5225cdd8429f42c47c19f4bda67b98c57c180e`. Isolated branch `codex/mip-review-locator-20261002`.

## Finding, requirement and bounded change

The parent supplied a fresh whole-platform source review at [Cursor](https://cursor.com/agents/bc-de89d8e4-b111-5942-b734-66a76375b3bb), with its [source report](https://matvelt.slack.com/archives/D0C5P4EFJUT/p1790938645361479). Its CLEAN source disposition includes residuals; it does not mean zero defects, installed behavior or live certification. This correction completes the parent's requested provenance residual, finding 3. The current review is parent-supplied evidence, separate from the unchanged Library register's earlier checkpoints.

Requirements read: repository `docs/00_INDEX.md`, existing evidence/canonical-reader reports, complete workflow 04/07, and the 312-line current Library convergence register v2. Reader contract 07 requires original source references, nested-field eligibility, real authorized route actions and honest absence. Register v2 preserves these evidence/provenance obligations and distinguishes source qualification from live authorization. Local register SHA-256: `4dc4d315f113333a53f590376abe7e51f466d68acb34ca68ea01705b0c742d9d`; workflow 04: `d9eda81726689b23e02b9e3cbe33127eb1d3dcd4626f711c367f47c869aa065c`; workflow 07: `a648c98f76358bb2436c0cd6942316bb40132f817e02bbe17c5d306b9ef6719e`.

Requirement → existing `safeExternalHttpUrl` and PublisherSourceRecord → rejected locators disappear from both focused original-source slots → **EXTEND** the production News renderer → preserve the existing publisher pane and reader/data owners → mounted regression.

At baseline NewsView lines 695–703 and 988–996, the original-source slots render only when `safeExternalHttpUrl(detail.url)` succeeds. The expanded list detail already contains an independent PublisherSourceRecord that retains unsafe text. Its original-source slot still drops the locator. The off-page focused detail lacks that publisher pane and drops the recorded locator entirely. These are two distinct paths; testing the existing publisher pane alone would miss the second defect.

`src/views/NewsView.jsx:127` adds the shared OriginalSourceLocator. Both focused slots use it (`:715`, `:1004`). A nonempty rejected locator appears exactly as recorded in a plain React text span inside a paragraph, with the explicit visible label **Recorded source locator (not a link)**. The label remains available without relying on generic-element ARIA naming. There is no HTML insertion, event handler, active link or sanitized substitute. Safe HTTP(S) locators retain the same canonical helper result, existing text, class, target `_blank` and `rel="noreferrer"` (including its existing opener protection). Absent null/undefined/empty locators add no recorded locator or placeholder.

No article query, DTO, projection, publication, eligibility, source status, caller authority or data-owner contract changes. The existing PublisherSourceRecord remains intact. No new source URL or body is published by this correction.

## Reproduction and qualification

`tests/reviewNewsLocatorCorrection.test.mjs` bundles and mounts the actual production NewsView with synthetic backend responses. It exercises expanded list detail and an off-page focused article, rather than a surrogate locator component. The frozen baseline produced **six failing unsafe-locator cases and four passing controls**. The new renderer passes all ten cases:

- JavaScript, data/HTML and HTML-looking strings remain exact inert text under a visible label in both detail paths.
- No locator anchor, HTML/script/image node, click handler or dangerous HTML prop is created. React DOM serialization of the mounted host tree escapes the exact stored value; it is an escaping control, not a browser-pixel claim.
- Safe HTTPS controls retain exact href/target/rel and visible source-link wording.
- Null, undefined and empty recorded locators create no invented original-source control in either path.

Focused serial qualification: **29/29 tests pass on Node 22.23.3 and Node 24.19.0**, including the new ten-case mounted regression and existing News backend/frontend/feed-model tests. No existing test was edited. `git diff --check` passes.

```bash
node --test --test-concurrency=1 tests/reviewNewsLocatorCorrection.test.mjs tests/newsBackendFrontend.test.mjs tests/newsBackend.test.mjs tests/newsFeedModel.test.mjs
```

Raw receipts: `/workspace/mip-review-locator-receipts/red-node24.log`, `green-node22.log`, `green-node24.log`; source/receipt manifest and commit identity are saved beside them. Dependencies remain the parent-provided symlink; no install or dependency mutation occurred.

This is a bounded mounted source correction. It does not establish deployed browser behavior, private/public row authority, actual publisher content, live permissions, complete publication qualification or whole-platform release readiness. Parent owns corrective integration, full CI and targeted independent re-review. No live operation, credential access, provider call, deployment, activation, merge or push occurred.
