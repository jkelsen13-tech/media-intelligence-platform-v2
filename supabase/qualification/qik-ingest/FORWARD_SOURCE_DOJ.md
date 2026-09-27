# DOJ forward-source candidate — source-only hold

This is one proposed, still-disabled real-data source. It does not authorize a feed request, hosted registry write, body fetch, publication, or schedule change.

## Exact identities observed on 2026-09-27

| Register | Identity and state |
|---|---|
| qik `public.ingestion_sources` (C2) | id `1b4c6203-f6dc-4be7-a61e-5ee1c2e2866d`; key `doj-press-release-rss`; label `U.S. Department of Justice Press Releases RSS`; URL `https://www.justice.gov/news/rss?type=press_release&m=1`; type `official_feed`; `active=false`, `allow_body_fetch=false`, `collection_enabled=false`. Preserve this row. |
| qik `public.ingest_sources` (C3) | No DOJ row. The exact proposed qik C3 id is the **same qik C2 UUID** above, in a different table, with the exact feed URL and both collection flags false. Read-only qik preflight found zero id collisions and zero exact-feed collisions; repeat that preflight immediately before any separately approved insert. |
| qik `public.source_register_reconciliation` | Existing row id `5cc7fa53-53be-494d-ab6a-ecd1d912dbec` points to the C2 UUID, has null C3 id, relation `distinct_registers`, and `collection_enabled=false`. A later approved operation would bind the proposed C3 id and set `same_publisher_same_endpoint`, an existing allowed relationship value, while leaving its collection flag false. Do not treat the current row as a completed mapping. |
| YHB C2 and C3 | YHB C2 has the same DOJ key, label and URL but its own UUID `f66d542c-b556-4df1-bab5-3f30ed770f2b`. YHB C3 has no DOJ row. Its distinct UUID is lineage, not qik's identity or permission. |

The same UUID is proposed across **qik's two different tables** to make the handoff explicit and auditable. It is not inferred from a similar label or URL. `forwardSourceContract.mjs` checks the exact C2 row, future C3 row, recorded reconciliation row, and single-source C3 run plan. The present qik state fails the C3/reconciliation checks by design. BBC World RSS in qik C3 and BBC News RSS in qik C2 are recorded as different endpoints and are not a substitute.

## Attributable terms and proposed narrow use

The [DOJ Press Releases page](https://www.justice.gov/news/press-releases) advertises an RSS feed. The [DOJ Legal Policies and Disclaimers](https://www.justice.gov/legalpolicies) say DOJ-site information is generally public domain unless otherwise indicated and may be copied and distributed without permission; they appreciate citation. The policy excludes third-party-origin photos, graphics and other marked material from that default and requires separate authorization for DOJ seals and insignia. A link does not imply DOJ endorsement. These terms apply to DOJ's site, not linked third-party sites.

For a later explicitly authorized bounded run, proposed retained fields are the feed item's DOJ source identity, original DOJ URL, title, publication time and short feed summary, plus the exact native capture bytes/hash needed for lineage. Keep the article/capture pending and non-publication-eligible; preserve source-span lineage for extraction and review. Do not fetch article-page bodies or attachments, copy marked third-party material, use seals, or auto-publish under this source proposal. No real feed content was requested during this source review. The exact endpoint is pinned by the existing qik C2 registry and repository seed; live availability and item-level exceptions remain to be checked when acquisition is separately authorized.

## Next reserved actions

A future owner decision must cover the exact disabled C3 row, reconciliation update, later real RSS acquisition and evaluation scope, and any subsequent enablement. The current source-only branch performs none of them. Before a live step, re-read both qik registers and the reconciliation row, refuse id/feed collisions or drift, and preserve the paused YHB schedules and NIE hold.
