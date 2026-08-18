# Project 2025 Reconciliation Source Record — 2026-08-18

## Approved scope

The owner-supplied **Document 08** authorizes only Track 1: **DOJ Civil Rights Division enforcement posture**, derived from Chapter 17, *Department of Justice*, in *Mandate for Leadership: The Conservative Promise* (Gene Hamilton; edition date `2023-04-21`). The original VRA/Section 2 framing was rejected by direct primary-source review and must not be reinstated. This dataset must not create a causal or sequential link to the Callais ruling, trigger Document 07 extraction, or create any composite “on-track/off-track” score.

## Supported canary records

The approved Stage C/D canary is exactly six stated objectives. Each policy record must carry `agency='DOJ'`, a structured locator with `chapter=17`, `chapter_title='Department of Justice'`, `edition='2023-04-21'`, and the page value shown below. Each companion event uses `track='stated_objective'`, `state='stated_objective'`, `event_date='2023-04-21'`, `review_status='draft'`, `method_version='p2025-track1-stageC-v1'`, and no claimed actual outcome.

| Goal | Approved stated objective | Pages | Public confirmation path |
|---:|---|---|---|
| 2 | Review all consent decrees and settlement agreements currently in force. | 557 | Court dockets covering consent-decree modification or termination. |
| 3 | Seek to terminate any unnecessary or outdated consent decree to which the United States is a party. | 557 | Court dockets and motions to terminate or dissolve. |
| 4 | Consider pursuing intervention where consent decrees or settlement agreements continue to bind parties years or decades after the fact. | 557 | Court dockets and motions to intervene. |
| 5 | Enact policies and regulations prohibiting settlement payments to third parties. | 557 | Federal Register and DOJ policy issuance. |
| 7 | Reorganize and refocus the Civil Rights Division; use first-year federal prosecutorial resources to investigate and prosecute covered discrimination claims. | 561–562 | DOJ CRT filings, reorganization announcements, and court dockets. |
| 8 | Reassign responsibility for prosecuting 18 U.S.C. § 241 election-related offenses from the Civil Rights Division to the Criminal Division. | 562 | DOJ organizational directives and case-filing division attribution. |

Goals **1** and **6** remain intentionally unwritten. The documents label their public observability as partial; neither may be inferred, silently omitted, or converted into an actual outcome.

## Evidence and lifecycle handling

The source text fixes the objectives on `2023-04-21`. Actual-outcome tracking may not predate `2025-01-20`, and every later status change requires a live primary source such as a Federal Register notice, DOJ CRT action, court docket, Senate confirmation record, GAO, or Inspector General report. Secondary advocacy characterization is citable but cannot itself move a lifecycle state. The current reconciliation inserts no outcome events, no score, no source-derived status, and no relationship edge.

## Isolation and rollback

The target is only Supabase project `yhbwnrtlqbjtcrrlpbge` (`mip-v2-manus-sandbox-20260818`). The Stage C run marker is `p2025-track1-stageC-v1`; the records will use the documented name prefix `P2025-T1-G`. The owner-supplied migration documents rollback as deleting track events where `method_version='p2025-track1-stageC-v1'`, then policies where `agency='DOJ' AND name LIKE 'P2025-T1-G%'`.

## Source documents

- `/home/ubuntu/upload/08PROJECT2025TRACKER(4).pdf`
- `/home/ubuntu/upload/08STAGEACANDIDATEMANIFEST(3).pdf`
- `/home/ubuntu/media-intelligence-platform-v2/docs/00_INDEX.md`
