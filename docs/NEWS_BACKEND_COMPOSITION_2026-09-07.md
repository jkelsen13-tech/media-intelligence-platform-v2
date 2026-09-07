# News reader backend consolidation

This batch follows PR #61, merged at `4cfa8f92889f7152f790ac913b7eeb1409bc827c`. Its main regression suite and Pages deployment passed. A live browser check retained the three-article corpus and the published graph/coverage state without console errors.

News and Explore now read through `mipBackend.publicData.news`. The thirteen capabilities cover paged articles, detail, outlet directory, filtered source metrics, corpus metadata, last-visit counts, citation/event/region maps, graph links, timeline/comparison destinations and feature-gated location corroboration. They share the same configured browser client as the public workspace and private investigation composition. Existing domain return shapes, public projections, pagination, eligible-only filters and unknown states remain intact.

The factory binds the client after caller-supplied feed filters, so filters cannot replace it. Explicit null stays offline; omitted overrides on legacy loaders still use the configured global client. Graph links, timeline lookup and location corroboration now accept an explicit client. The location flag read uses that same client before any location row is read. Public bylines continue to come only from `authors_public`, and reviewed detail from `news_detail_public`. RLS/publication contracts remain authoritative for related records; this interface does not use service-role credentials or create a cross-query snapshot.

## Article switching fix

Previously, opening article A and then B while A was still loading allowed A's late response to replace B's detail, graph links, location result or destination chips. Each expansion now captures a request sequence. Only the current sequence may update those fields or the detail error. Closing, reopening or unmounting invalidates the old sequence, including when the same article ID is reopened. Existing feed search and load-more sequencing remain separate.

## Verification

Seven new tests exercise the installed SDK's requests and the real NewsView component. They cover null-client isolation with a configured global client, feed filter attempts to replace the client, eligible-only feed/detail and public bylines, reviewed claim provenance, session headers, pages after the first 30 articles, complete source metrics past 1,000 rows, source-order context, navigation joins, feature-flag denial, unavailable access, delayed responses and close/reopen failures. The HTTP fixture has an invalid hostname and synthetic rows. It does not substitute for SQL policy tests or seed production.

The focused new tests pass. The adjacent local run passed 75 checks; one PGlite publication-gate test process exhausted Windows memory. Full regression and production build verification run in Linux CI, including that SQL test. Existing publication and reviewer-revocation migrations are unchanged.

An isolated browser preview uses the actual NewsView, existing styles and new backend with synthetic HTTP responses. Article A is deliberately delayed while B loads. B retains its own publisher record and claim after A completes. The preview files are ignored and do not ship. No database migration or Edge Function deployment is required.

## Remaining work

Timeline, arcs, comparison and specialist graph panels still need to join the shared frontend composition. World View's deployed spatial runtime needs source reconciliation before its consolidation. Worker deployment and publication responsibilities still require a verified inventory. Existing private endpoints remain compatible pending reviewed retirement; this batch does not claim complete backend consolidation.

The current Supabase changelog and [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) were checked. No applicable API, schema or dependency change is needed for this read-path composition.
