# NASA revision 2 and live release verification — 2026-09-08

## Completed batches
PR 74 hosted capture run-next, PR 75 Node 22/24 CI and dependency/advisor triage, PR 76 private/public subject handoff, and PR 77 evaluated record claims are merged. PR 75, PR 76 and PR 77 post-merge tests/build/Pages all passed; the final PR 77 deployment contains the earlier changes.

## Retained source comparison
The live World View provenance note exposed an existing one-minute discrepancy. Direct inspection of the [NASA Where & When table](https://science.nasa.gov/eclipses/future-eclipses/eclipse-2024/where-when/) and [NASA retrospective](https://science.nasa.gov/science-research/earth-science/looking-back-on-looking-up-the-2024-total-solar-eclipse/) confirmed reported totality 3:13–3:17 p.m. EDT in both, but partial end 4:29 versus 4:28. This is a bounded agent-assisted source comparison, not a qualified autonomous worker result, independent corroboration, a source correction or a physical timing verdict.

One 118-code-point retrospective excerpt was retained through the existing intake contract. Its article remains pending_review; public eligible article count remains three. No scheduler, publication, full-text crawl or unbounded intake was enabled. The source displays publication date August 22, 2024 and updated April 30, 2025; exact publication time remains absent rather than invented at midnight.

Assessment 429c5023-bab6-421d-adb7-32340c458611 supports the existing timeline candidate only as a statement of what NASA reports. Its exact context includes the new capture. Hypothesis evidence explicitly preserves the partial-end disagreement and remaining uncertainty.

## Immutable version and receipts
- Investigation: cb470065-1043-4a83-b6bb-6e1c749ba444.
- Revision 1: 8e1d032d-f982-4de0-914a-32e99c31d4d1; complete row MD5 ba4b3667e94ab2fbb63ca594ac95328a unchanged.
- Revision 2: 6bec5ecf-904f-4b8a-a328-4f611b0a23f0, predecessor revision 1; observation eaf38f25-b4b0-4659-9f68-b6e651dfe316.
- New capture: d112dd52-d51f-49f3-9481-7ca72aa26b2b; pending-review article 377489a8-63f1-4226-9ef0-2479e7461843; input positions 32/33.
- Explicit UI review baseline receipt b063f36d-9fa0-48b4-a306-d91ca02e48f0 names revision 1.
- Explicit UI revision 2 receipt 82d73ee6-e16a-4f5c-81e4-8475735e77ea links to the revision 1 receipt.
- Saved check report 67806afa-df2b-4b86-b6a3-3bd0589b5d31 checks 5 inputs, 8 fields, 2 captures and 1 pair, and returns 0 lexical targets. That report does not detect the timing discrepancy or perform semantic adjudication. The supported assessment and linked contradicting excerpt come from the separately recorded bounded comparison.

The operational canary passed in a rollback transaction before applying. A variable/column ambiguity was fixed during the canary; no partial operations survived. The archived SQL canary requires revision 1 as head and intentionally rejects replay now that revision 2 exists. It must not be converted into a scheduler or migration.

## Live UI verification
After deployment, the signed-in NASA workspace loaded the saved report and exact new source excerpt. The before/after briefing showed inputs 32/33 and the added assessment, new hypotheses, collection replacement, scope and unresolved-question changes. The field comparison named revision 1 before and revision 2 after. The new-input inspector showed the exact excerpt on revision 2 and explicit absence on revision 1, without substituting current data.

Graph → Timeline → World View retained Cleveland's exact public subject and the revision 2 notice; Return to saved investigation restored revision 2 and the saved report. The notice distinguishes current eligible public records from the private immutable snapshot. The authorized review receipt advanced only on explicit click.

At 390×844, Account remained visible and opened the signed-in Account panel. At 320 px, the button remained within the viewport with a 44×44 touch target. Temporary viewport overrides were reset.

## Next bounded work
The original six record candidate jobs remain pending at attempt 0, with no worker qualification seeded. The single new capture/article introduced their normal bounded change jobs; they are not silently drained. A real producer adapter, retained evaluation dataset/report, recovery tests and supported record-kind qualification are still required before the record claimant can run. Dependency/advisor issues are triaged in the PR 75 report, not remediated by this batch. The NASA partial-end discrepancy, precise locations and independent observations remain open.

The live public Feed still displayed exactly the three previously eligible articles. Source Comparison preserved the NASA subject and disclosed that no released comparison is linked; the private NASA source was not published into either surface.

## Existing deployment canaries updated
The capture retrieval canary now uses the capture-scoped claim. The queue canary uses a clearly synthetic, rollback-only evaluation for its graph-node fixture. This preserves their fencing, idempotent receipt, bounded retrieval and browser-denial coverage after the legacy candidate API was closed. Both canaries passed against the applied schema; no fixtures or qualification rows survived. Historical revision 1 was also opened after reviewing revision 2: it retained zero selected assessments and explicitly preserved the newer review baseline. The browser was returned to revision 2.
