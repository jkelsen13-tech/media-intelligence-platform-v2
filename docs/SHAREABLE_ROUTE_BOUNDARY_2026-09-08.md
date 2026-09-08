# Shareable route boundary backfill

Package 04 preflight found malformed percent-encoded path segments could throw,
and inherited object properties could be treated as supported view slugs.
The parser now handles decoding failure as an empty route, rejects decoded path
separators/control characters and extra path segments, bounds route/field length,
and accepts only own entries in the view maps. Unknown views retain the parent
subject and existing Graph fallback. Duplicate supported query keys are omitted
rather than selecting an arbitrary first value; other valid selections survive.

These are existing public subject routes. This is not a private saved-version link,
an access grant, a persistent camera preset or a historical-state reconstruction.
Those features remain pending exact-version and authorization integration.
Token/private-text parameter names are excluded by the existing selection whitelist;
the new regression confirms their exclusion from parsing/serialization round trips.
This is not a general secret detector for arbitrary caller-supplied identity values.

## Changed paths and limits

- src/lib/deepLinks.js: bounded safe decode and own-property view lookup.
- tests/deepLinkBoundary.test.mjs: malformed routes, parent preservation, inherited
  names, duplicate keys, credential-field exclusion, limits and valid round trips.
- .github/workflows/world-weather-preview.yml: include route changes in preview.
- This document and the governing backfill tracker.

No dependencies, datasets, notices, sources, backend or overlay policy changes.
MIP-owned code only; existing source/license inventory is unchanged. Source remains
in GitHub and ephemeral CI. POWER and Browserslist remain held independently.

Full Node 22/24 suites/builds and existing built-app camera/weather responsive
preview are required. Post-merge Pages verification covers phone Account and
NASA saved-version/public Graph/Timeline/World handoff. Exact results go in the PR.
