# Timeline List width — design QA

final result: passed

Scoped CSS defect review for PR #94. Broader five-view composition remains planned.
The previous hierarchy review is retained at fba0c2a22c608a91bda9c58f382312b89f0fa06f:design-qa.md.

## Evidence
Owner iPad Photo 1, attachment CD0E6A74-DC26-440E-A5A5-F59F88ADE7FA, shows the event card squeezed into the date column. Live reproduction measured a 72px card inside a 725px entry. This is grid auto-placement after hidden date/spine elements, independent of selected investigation.
Production browser run 34189898168, job 101945637431, renders real public NASA records. MIP_TIMELINE_LIST_* screenshots cover 1280/1024/768/390/320 widths and inspector open/collapsed. Source and corrected desktop screenshot inspected together. Tablet and phone screenshots inspected separately.
The owner capture includes Safari chrome and no selected subject; the CI capture has a selected subject and a different viewport height. It is a defect comparison, not a pixel-identical mockup certification.

## Result
One flexible List grid column makes cards fill their entry at every tested width, without horizontal content overflow. Initial measured widths range from 280px at 320px viewport to 796px in the collapsed desktop reading column. Titles/descriptions read horizontally, detail controls remain reachable, and normal Chronology retains its 285px cards.
Existing typography, tokens, spacing, evidence copy, logo and icons are preserved. No new visual assets.
No unresolved material finding in this scoped change. Final checks extend coverage to WebKit and iPad landscape/portrait viewport heights; final-head run results and post-deployment verification are recorded in PR #94.


## Continuing Graph Time and connection-state batches — 8 September 2026

The owner's Graph/Timeline images remain the composition destination. The current
public collection has one eligible graph event, so illustrative network density,
scores and weather in those references are not implementation data.

PR #96 preview run 34193838664 passed Chromium/WebKit connection outage/recovery,
five-width List behavior, responsive shared frame and Account access. Its captured
desktop unavailable state and tablet List were inspected: readable scoped copy,
reachable retry, truthful count, no squeezed card. This is an integrity repair.

PR #95 preview run 34191814012 passed exact Graph Time selection by keyboard and
pointer in Chromium/WebKit at 1280/768/390/320. Captured desktop and phone screens
were inspected against the reference direction: compact date/title/action row,
full-width touch target, and phone reading flow before the shared inspector.
Existing styles, logo, icons and typography remain in use; no new asset or data.
The Graph's multi-record canvas/minimap and the Timeline's richer lanes remain
future bounded work. No pixel-identical or five-screen-complete claim is made.

Graph layout cleanup stops pending animations and drawing callbacks ignore
destroyed renderer instances; repeated Time/Relationships transitions exercise
that lifecycle in the production browser. React identity tests additionally cover
same-label nodes, undated records and disabled unavailable actions. Final combined
head verification and live release results are recorded in PR #95.
