# Disabled private Edge gateway

This change adds user-only Deno entrypoints `hypothesis-api` and `private-markets-api`. Neither can return application data. Both require platform `verify_jwt = true`; the new config file did not exist at parent 7cde1087fb5089a74c6329e05d447bb2127d2750. No frontend endpoint or approval is added.

## Boundary

Only exact Pages origin https://jkelsen13-tech.github.io; validated POST preflight; POST JSON with UTF-8 only; no cookies, content encodings, query routing, redirects, retries, or user-supplied identity. Hypothesis supports only history and authoring_context request schemas (8 KiB). Markets supports its five-field bounded read request with canonical millisecond UTC timestamps (4 KiB). Other hypothesis operations and alternate timestamp formats deliberately remain unsupported in this seam.

The Auth request uses the configured public/anon key and exact caller bearer against the pinned project Auth service. A successful current user response is required before decoded claims can impose additional issuer, audience, role, subject, session id and time restrictions. Neither user_metadata nor app_metadata grants access. A single ten-second deadline bounds request body, Auth response and optional session checks, including non-cooperative injected adapters. Auth response bodies are capped at 64 KiB. No service-role key is read, accepted as a user identity, returned, or sent to the browser. Future workload authentication belongs to a separate execute-only server adapter.

The injectable verifySession seam must verify current session existence, owner, revocation and effective expiry using server authority. It is absent from both production entrypoints. Even a successful injected session check returns 503 service_unavailable: there is deliberately no admission toggle or data adapter. A valid JWT/getUser response alone does not establish that a session remains active.

## Exact outstanding dependency

Read-only live catalog inspection on 2026-09-14 found zero procedures in mip_hypothesis and mip_markets, and no application session RPC. Existing qualification SQL has not become an admitted production backend. The qualification Markets reader in supabase/qualification/markets-evidence/002_authorized_reader.sql revokes service_role and grants mip_hypothesis_gateway. Do not invent a public service-role RPC around it.

Before enabling any data path: review and migrate the required hypothesis 001–023 qualification dependencies and Markets 001–002 dependencies with their cutover authority/source permission prerequisites; prove current session checks against auth.sessions including session policy expiry; establish explicit server-side source/admission authority and exact workspace ownership; provide and test an execute-only gateway identity and bounded database adapter; verify the retained-data response contract. Promotion must preserve operation permission, observation incarnation/epoch and publication fences. Migration admission and real-data qualification are separate work. No migrations or grants are added here.

## Verification and limits

tests/privateGateway.test.mjs imports the actual production gateway and Auth adapter and uses real Request/Response streams with injected Auth/session/fetch adapters. It covers missing bearer, wrong origin, invalid preflight/method/route, malformed/schema/size/type checks, identity injection, disabled admission, session owner/id/expiry/revocation mismatch, workload/anonymous tokens, redirects and deadlines. Run: node --test tests/privateGateway.test.mjs. Hosted execution remains required; these tests are not proof of platform JWT verification, deployment or live data behavior.

Inspected live investigation-api version 3 (verify_jwt=true), whose direct domain dispatch and pinned Auth origin informed this boundary. Its service-key RPC compatibility workaround is intentionally not copied into a private data path.

Current official references checked:
- https://supabase.com/docs/guides/functions/auth — user calls retain verify_jwt; workload secret authentication is distinct.
- https://supabase.com/docs/guides/functions/cors — manual OPTIONS handling; optional trace/retry headers are not enabled in this fixed client contract.
- https://supabase.com/changelog — current Auth/Edge changes and public table auto-exposure changes reviewed. Markdown fetch was unsupported, so HTML was inspected.
- https://supabase.com/docs/guides/auth/sessions — current session validation remains a dependency.

Error envelope is always {error:{code}} with authentication_required (401), origin_denied (403), invalid_request (400/404/405/413/415), service_unavailable (503). Platform rejections occur before this envelope and must be qualified separately. No application success response exists.

## Route serialization and stream regression follow-up

Before URL parsing, the gateway rejects observable raw question-mark, fragment and backslash delimiters, then requires empty search/hash, exact path and unchanged origin-plus-path serialization. Tests cover bare/nonempty query, fragment, trailing slash, encoding, dot segments and backslash variants. Request/Edge infrastructure may normalize dot segments and backslashes before exposing request.url; HTTP fragments are not sent by browsers. The handler cannot recover those original bytes. Tests distinguish observable raw aliases (rejected) from actual Request canonicalization (canonical route reaches the hard-disabled 503 seam). Platform route canonicalization remains a deployment qualification dependency.

Browser-representative OPTIONS tests send only Origin and Access-Control-Request-Method/Headers, assert no Authorization/apikey/content-type, and verify zero authenticator calls. Real ReadableStream tests cover exact-limit and plus-one chunks, malformed JSON, invalid UTF-8, wrong content type, stalled mid-body deadlines and caller abort, with cancellation and unlocked-reader checks. Header rejection intentionally leaves unread body ownership with the caller/runtime. Additional audience, issued-at and claim-level anonymous adversaries are included.

## Auth response streaming assurance

The suite now declares 36 tests (26 prior tests plus five Auth-response tests for each entrypoint). Injected fetch returns real streamed Responses through the production Auth adapter. Exact 65,536-byte valid user JSON completes that adapter and reaches the disabled seam with no configured session checker; a completion counter distinguishes this from an accidental rejection. The 65,537-byte response, malformed JSON, invalid UTF-8, wrong content type, stalled response deadline and caller abort all return 503 and never invoke the injected session-check spy. Fetch counters and exact URL/method/header assertions prove these fixtures reached Auth rather than failing at the inbound reader. Tests check producer cancellation where applicable and reader unlock; caller abort waits until the response reader is locked. Production implementation is unchanged.

Updated test source parsed successfully in memory and remote blobs were reread exactly. All 36 runtime tests remain unexecuted pending hosted CI; no deployed behavior is claimed.
