# Exact saved-version reference navigation

Saved version details now include a labeled reference field and Open referenced
version action. It opens only an exact UUID under the currently selected
investigation. Formatting is normalized; revision numbers, dates, titles, links
and malformed references are rejected. Existing session, assignment and exact
response identity checks remain authoritative. Failure retains the requested
version for retry; it never substitutes the latest version.

Pending reviews/checks disable the form. Opening a version makes no review receipt,
assessment or publication. Field state resets when the displayed version or
investigation changes. The field is keyboard accessible with linked help/error
text and a 44px minimum button target.

This advances package 04's exact-version access path. Persistent shareable presets,
camera/time/layer restoration and private link handling are not implemented here.

## Files and verification

- src/components/InvestigationVersionNavigation.jsx: scoped reference form.
- src/lib/investigationVersionNavigation.js: strict reference normalization.
- src/styles/investigation-workspace-panels.css: bounded responsive form.
- tests/investigationVersionNavigationFrontend.test.mjs: validation/pending gates,
  client-handler-hook exact historical read, unchanged review and mismatch retry.
- verifier/runVersionReferenceBrowser.mjs and existing preview workflow: ephemeral
  synthetic UI harness built from the production component at 320/390/1280px.
- This document and the no-fee plan tracker.

The browser harness serves compiled code from memory on loopback inside the GitHub
runner. No fixture is added to the production app or deployment, no credentials or
private evidence are used, and no provider is called. It reuses existing React,
Vite/esbuild and already-reviewed isolated Playwright tooling. No new dependency,
dataset, license/NOTICE item, source, backend migration or overlay policy change.
Source remains on GitHub; temporary execution stays on existing ephemeral runners.

Required gates: full Node 22/24 tests/builds; responsive form screenshots and runtime
validation; existing camera/weather preview; post-merge Pages and actual signed-in
NASA historical-reference read followed by return to revision 2 and public surfaces.
Actual results are recorded in the pull request. POWER/Browserslist remain held.
