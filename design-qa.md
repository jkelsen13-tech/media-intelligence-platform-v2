# Shared workspace frame — design QA

final result: blocked

This result applies to the bounded shared-frame increment in PR #92. It does
not certify completion or pixel fidelity of the five-view destination.

## Source and implementation evidence
- Source visual truth: owner's Photo 2.jpg, attachment set
  67BF1D8E-03DB-4BA4-AECC-7B91001AB59F, supplied in this conversation.
  Reference inventory: docs/FRONTEND_DESTINATION_REFERENCES_2026-09-08.md.
- Source dimensions: 590 × 1280 pixels, containing a letterboxed desktop
  Timeline dashboard approximately 590 × 442. Original CSS size/density is
  not recorded; compare app-region proportions, not phone chrome or exact pixels.
- Implementation screenshots: GitHub Actions run 34187637353, job
  101939075195, log markers MIP_SHELL_OPEN_1280/1024/768/390/320 and
  MIP_SHELL_COLLAPSED_1280/1024. JPEG screenshots remain in ephemeral CI logs,
  not the owner's filesystem. Final-revision checks are linked from PR #92.
- Browser CSS sizes/pixels: 1280 × 900, 1024 × 900, 768 × 900,
  390 × 844 and 320 × 844; deviceScaleFactor 1.
- State: light Timeline, public NASA Cleveland event, shared inspector open
  and collapsed. The reference depicts an illustrative Gulf Coast event.
  Content/state differs deliberately: no illustrative percentages, source
  counts, weather, images or timeline lanes are asserted as NASA evidence.
- Full-view comparison: source and rendered desktop capture were opened
  together. Compare the desktop app region only: the narrow left rail, shared
  header, central canvas and right inspector have similar relative proportions.
- Focused comparison: header/inspector labels and collapsed reopen control
  inspected at native implementation resolution, alongside phone/tablet
  captures. The low-resolution reference cannot establish exact font metrics.

## Comparison history and fixes
1. First rendered pass (run 34187434117) was blocked:
   - P1 phone: header plus open sticky inspector compressed evidence into a
     thin independent scrolling strip. Fixed reading views to use one page
     scroll, with the inspector following the evidence.
   - P2 tablet: optional corpus metadata reduced search to a tiny input.
     Hide that optional topbar line at widths up to 1100px.
2. Post-fix captures (run 34187637353): phone content now occupies its natural
   reading height, the inspector follows it, and Account/menu remain usable.
   Tablet search has room for its descriptive placeholder. Browser geometry
   assertions independently verify the phone flow and desktop/tablet space.
   A closer phone record capture subsequently exposed a 220px search field.
3. P2 phone search: the horizontal flex basis became vertical when controls
   stacked. Reset its flex basis and require a 44–60px field in browser checks.
   Post-fix verification pending; this is the remaining QA blocker.

## Required fidelity surfaces
- Typography: existing Inter/system sans and readable 12–13px control text,
  18–20px subject titles; wrapping retained for long subjects. No new font.
- Spacing/layout: existing 190px desktop rail and 286px inspector; collapsed
  inspector is 48px, returning 238px to evidence. At 768px the rail is 160px
  and the shared inspector stacks below evidence. Compact shared header/tabs.
- Colors/tokens: existing cool white surfaces, pale borders and blue selected
  controls remain consistent with the reference direction. Visible focus
  outlines added to shared navigation and inspector controls.
- Assets: existing MIP logo and Phosphor icon family retained. The illustrative
  event photograph and other mockup assets are intentionally not reproduced
  for this different real event. No new dataset, model, API or dependency.
- Copy/content: existing explicit missing evidence, location/time and
  uncertainty wording preserved; no fabricated metrics or confidence status.

## Interaction and error checks
Production-build browser passed five widths, dock width reclamation, tablet
stacking, phone document flow, keyboard reopening, Account opening, drawer
Escape and focus return, and unchanged canonical subject. Zero page errors.
Existing weather/camera, recent restoration, exact saved-version reference and
retained-date verifiers passed, with zero restricted hosted-weather requests.

## Implementation checklist
- Shared-frame and responsive fixes complete for this increment.
- Final-head CI, merge guard and post-deployment verification recorded in PR.
- Continue the planned Graph/Timeline composition and other view batches.

## Follow-up scope
The mockup's denser evidence visualizations, supported imagery, source metrics
and full shared inspector content remain planned work with their data/rights
prerequisites. These are explicit destination gaps, not features shipped here.
