# Dynamic lighting capture visibility — 10 September 2026

Postmerge PR #145 live refinement job 102750630768 reported successful state and
pixel-difference checks, but visual inspection found its WebKit phone ON image
contained only the star background. Desktop ON, phone OFF and phone terrain
images contained the globe. These results do not establish a product regression;
the deployed frontend assets are unchanged. They do establish that different PNGs
alone are insufficient visual verification.

Checkbox interaction can scroll the phone viewport away from the map. The old ON
capture asked the screenshot locator to scroll the map into view and captured
without an explicit settling interval after that scroll. This patch restores the
map viewport first, waits for tile readiness and 500 ms, then captures both states.
It decodes each captured PNG in a detached browser canvas and requires over 10%
colored, illuminated pixels within the central 20%-wide / 40%-high globe region.
This is specific to the fixed 25,000 km qualification camera and exact recorded
instant, not a generic Earth detector or a change to product rendering.

A blank frame now fails even if it differs from the OFF image. There is no retry
that discards failed frames. Existing camera, state, request-count, temporal,
memory, remount and preset assertions remain. Actual coverage is logged for both
captures. The hypothesis remains unconfirmed until fresh preview/live checks and
image inspection pass. No production data, publication rules or runtime are
modified. All edits and verification are remote; no local files are created.
