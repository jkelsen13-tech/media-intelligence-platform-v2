# Shared workspace frame — batch 92

Continues the owner-selected frontend direction in FRONTEND_DESTINATION_REFERENCES_2026-09-08.md.

The shared inspector previously hid its contents without releasing the reserved
286px grid track. Collapsing now leaves a readable 48px vertical reopen control
and returns the remaining width to evidence. The dock aligns beside the shared
header from 1024px. At tablet widths (768–1023px), evidence and the shared
inspector stack; collapsing restores reading height. Native Graph/World View
inspectors keep ownership of their layouts.

Shared header, evidence dimensions and view tabs use a tighter spacing rhythm.
The existing logo, Phosphor icons, fonts and palette are reused. Phone tabs and
drawer controls retain 44px targets. Visible keyboard focus and inspector
keyboard reopening are included. No mockup metrics, imagery or evidence are
invented.

A production-build CI browser checks 320, 390, 768, 1024 and 1280px, captures
each layout, checks reclaimed dock space, tablet stacking, Account opening,
drawer Escape/focus return and canonical-subject preservation. Existing
weather, camera, version-reference and retained-date verifiers remain required.
Visual QA found and fixed phone evidence compression and tablet search crowding.
Reading views now use one phone page scroll and optional corpus metadata yields
to search below 1101px. See design-qa.md for the comparison and scoped result.

This is a shared-frame increment, not completion of the five-view redesign.
Graph/Timeline composition, other view refinements and supported-data
prerequisites remain in the staged plan. No new rights-bearing component,
backend change, ingestion, scheduler or POWER activation.
