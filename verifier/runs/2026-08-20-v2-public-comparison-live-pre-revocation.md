# V2 Source Comparison — pre-revocation live validation

**Date:** 2026-08-20

The deployed V2 public site at `https://jkelsen13-tech.github.io/media-intelligence-platform-v2/` was checked after commit `66219b0` deployed successfully. The Source Comparison route loaded through the new projection-backed reader without a visible error.

| Validation target | Result | Observed evidence |
|---|---|---|
| Public route | Pass | The **Source Comparison** view loaded on the public GitHub Pages deployment. |
| Second populated card | Pass | `Pochettino agrees to new manager contract with US Soccer` rendered with 4 ingested outlets and 20 extracted claims. |
| Outlet/framing surfaces | Pass | BBC, New York Times, Al Jazeera, and Fox News outlet blocks rendered with framing excerpts and `awaiting review` explanations. |
| Claim-level data | Pass | Unique claims showed per-outlet surfaces, external article links, News links, and provenance/explanation disclosures. |
| Arc/Timeline links | Pass | Story-arc and Causal Timeline links rendered on the card. |
| Michigan card | Pass | The live filtered `Michigan Looks Left` card rendered with 2 outlets, 13 claims, New York Times and Fox News framing blocks, publication timing, Arc/Timeline links, article/News links, and `awaiting review` explanation disclosures. The anonymous projection probe independently confirmed 13 surfaces. |

No base-table request or `pipeline_config` request is used by the migrated public reader; the route reads `comparison_public` only. The route has therefore passed the required pre-revocation content validation.

## Notes

The first two projection rows legitimately had empty claim arrays because their member articles have no projected extracted claims. This is an expected empty-state condition and does not affect the populated card checks above.

The next required action is the V2-only anonymous SELECT revocation specified in the authorized directive.
