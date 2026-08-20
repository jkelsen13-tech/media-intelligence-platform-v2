# V2 Source Comparison Backfill Validation

| Check | Result |
|---|---|
| Deployed revision | `bb5a531` — GitHub Pages deployment succeeded. |
| Public News route | Loaded successfully with **12,558** articles. |
| Source Comparison route | Pending card-level validation after the public navigation route is opened. |

The V2 projection derives comparison output from existing V2 multi-outlet event membership and does not modify `articles`, `sources`, `events`, or `event_articles`.

| Public navigation | The deployed menu opened and transitioned to the Source Comparison route. The route began in its normal loading state; card rendering is being checked after the data read completes. |

| Public Source Comparison card | **Passed.** The deployed `Michigan Looks Left` card rendered with two outlet samples, captured per-outlet framing, **13 extracted claims**, article links, timing, a linked Story Arc and Timeline entry, explanation disclosures, and explicit **awaiting review** state. |
| Primary evidence | The card showed **0 primary evidence links**. This is a legitimate, explicit data gap: V2’s imported citation schema contains no explicit primary-record URL for these claims, and the backfill did not fabricate one. |
| No source-quality label | No R1–R4 or source-tier label was visible on the deployed comparison card. |

The three eligible events without projection claims were audited. Each has zero member articles with an extracted claim payload, so the empty state is legitimate rather than a failed backfill: `Redistricting in Louisiana ahead of the 2026 elections`, `Louisiana v. Callais`, and `Court granted DOJ motion regarding Norfolk decree`.

## V2 RLS Remediation Stop-and-Flag

No V2 grant or policy was changed in this pass. The corrected V2-only RLS directive lists `pipeline_config`, `claims`, `article_claims`, and `claim_evidence_links` for `anon` SELECT revocation. The validated unauthenticated public Source Comparison route directly reads each of those tables through `sourceComparisonReadPath.js`; it is currently functioning because the reads succeed. Revoking the listed `anon` grants would therefore make the public Source Comparison beta gate and its claim/evidence rendering fail with authorization errors.

Per the directive’s own required stop-and-flag rule, I did **not** apply the revocations or introduce an unauthenticated workaround that would bypass the intended protection. A separate architecture decision is required to choose between an authenticated comparison surface, a narrowly authorized server-side public projection, or retaining public read access for the specific derived comparison outputs. The V2-only RLS table list itself is otherwise preserved unchanged.
