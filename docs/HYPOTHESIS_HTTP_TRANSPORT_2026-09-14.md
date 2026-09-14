# Explicit hypothesis HTTP transport — isolated continuation

The feature client previously accepted only an injected call function. createHypothesisHttpTransport now supplies a real fetch adapter for an explicitly configured HTTPS endpoint and a trusted access-token callback. No production endpoint, identity, credential or deployment is selected.

## Contract and account lifecycle

Create the transport with endpoint and getAccessToken, then pass it to createHypothesisAssessmentClient. The callback obtains the current bearer token from the application's authenticated session boundary on each call. The transport does not parse token claims, assign a user UUID, approve a session, read browser storage or cache credentials. Server verification remains mandatory.

Call transport.dispose() immediately on logout/account transition or replacement of the client/configuration, and create a new transport for the next context. Shutdown is irreversible, aborts outstanding fetch/body reads, suppresses late results even if an injected fetch ignores cancellation, and prevents dispatch after a delayed token lookup. Existing workspace scope guards remain required. No live app wiring is activated by this file.

The adapter serializes exact action/input arguments before asynchronous token acquisition. It does not retry. An uncertain write remains uncertain and uses the existing same-request retry/recovery controls after current authentication. Shutdown or timeout does not prove server rollback.

Requests use POST, Authorization header, credentials omit, cache no-store, redirect error and no-referrer. Endpoint query strings, fragments, embedded credentials and non-HTTPS schemes are rejected. Response handling accepts bounded UTF-8 JSON with the expected envelope, rejects redirects/different final URLs and returns only allowed sanitized error codes. It never returns raw server diagnostics.

The 64KiB request limit matches the existing handler. The default 2MiB response limit and 30-second deadline are configurable transport resource limits, not semantic thresholds, session lifetimes or production custody/rotation decisions. Large or slow responses fail without exposing a partial history; pagination/scale qualification remains a separate requirement if the intended workload exceeds these bounds.

## Verification coverage

Twelve new offline tests exercise explicit configuration, fresh tokens and fixed options, exact argument capture, absent/malformed tokens, invalid/large requests, shutdown during token lookup/fetch/body reading, bounded timeout, no automatic write retry, streamed-response limits, redirect/content/envelope rejection and sanitized errors.

The configured native integration now sends the same generation/worker/history/review/permission-revocation path through this adapter into the actual Request/Response handler and parameterized PostgreSQL gateway. It still uses an explicitly synthetic Auth callback and an in-process fetch bridge. Actual database transactions and durable worker tests remain separate from provider qualification.

The Chromium/WebKit browser suite now sends its comparison-history requests using browser fetch and this adapter. Requests to the reserved synthetic URL are fulfilled in process by Playwright. Tests inspect the synthetic authorization header, absent cookies/referrer, denied refresh and permission-change clearing. All other requests are aborted; no source retrieval, external network request or live provider is introduced. This qualifies browser request mechanics, not a deployed network, cross-origin provider, TLS infrastructure or production Auth session.

Exact-candidate CI must pass before the new assertions are reported verified. Production-shaped provider/Auth/runtime closure, historical commit visibility and owner-approved analytical methodology remain open. No new credential is needed for these isolated tests.

Production cutover remains ON HOLD; PR153 remains draft/unmerged. The CC batch stays closed at 3/3 with no activation subject. No production write, permission change, source admission, model disclosure, schedule, paid activation or local project-file storage.
