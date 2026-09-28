# qik native-comparison Edge packaging candidate

New source files only. This package adapts the existing Node caller to the existing qik Edge runtime; it does not add another host/provider, rewrite caller/Auth/SQL logic, or independently satisfy deployment gates under the consolidation authorization. The endpoint is not established as available.

## Entry and unchanged boundary

index.ts loads Node Buffer/process compatibility globals, then the adapter dynamically imports the canonical native-comparison-caller/host.mjs. The default fetch export uses the currently documented Edge entrypoint shape. deno.json maps the host's bare pg import to npm:pg@8.23.0, matching the existing historical-qik-executor wrapper and repository npm lock.

The adapter snapshots configuration once per worker and restricts this Edge package to the observed qik session pooler on port 5432, database postgres. It never reads the request body, replaces request identity/signal/headers, generates Auth claims, changes a host Response, runs SQL, or logs values. Missing configuration, import/construction failures, and unhandled request failures return only service_unavailable.

The held config.fragment.toml is not the active supabase/config.toml. Its proposed entry enables verify_jwt for this user-only route and names the entrypoint. Parent must coordinate/integrate that fragment separately; this task changes no existing config. Function-scoped deno.json provides the dependency map.

## Exact secure configuration names

- SUPABASE_URL: platform-provided existing qik URL, exactly https://qikvmopbtijoebdqosyq.supabase.co. No cross-project override.
- MIP_NATIVE_COMPARISON_DATABASE_URL: password-bearing ordinary gateway-login PostgreSQL URL to aws-0-us-west-1.pooler.supabase.com:5432/postgres. Pooler username is the configured login followed by .qikvmopbtijoebdqosyq. No query, fragment, transaction pooler, superuser, service-role or collector credential.
- MIP_NATIVE_COMPARISON_DATABASE_LOGIN: exact ordinary login name checked again by the canonical driver. The caller also requires membership in mip_mentions_gateway with no extra role membership; the wrapper never installs or grants it.
- MIP_NATIVE_COMPARISON_AUTH_PUBLIC_KEY: current qik publishable/anon API key used only for the existing Auth user endpoint. The canonical host validates its accepted public-key form. No SUPABASE_SERVICE_ROLE_KEY or broad SUPABASE_DB_URL fallback.

Only names and requirements are documented. No values were read or configured. Exact current-user/scope/binding/hash admission, trusted broker context, safe SQL installation and least-privilege gateway provisioning remain independent prerequisites.

## Auth callback and transaction behavior

The unchanged privateGateway createPrivateUserAuthenticator performs GET https://qikvmopbtijoebdqosyq.supabase.co/auth/v1/user with the incoming exact Authorization bearer and configured public apikey. This is the network getUser behavior; no new supabase-js client/session store or automatic refresh is added. It bounds JSON, refuses redirects, returns null for 401/403, and then decodes claims only as additional restrictions after Auth success.

The unchanged host additionally verifies user/session claims, exact current database session and admission through its governed SQL. getUser is not a substitute for that check. It admits the existing DTO only after COMMIT and connection close. The Edge wrapper neither bypasses nor parallelizes those operations. Existing error sanitization, no publication/attachment, and no payload logging remain in force.

## TLS CA handling and concrete limits

The canonical PgDriver explicitly sets ssl: {rejectUnauthorized:true}; it does not accept a custom ca option or TLS parameters in the connection URL. This wrapper preserves that API. Supabase documents production Edge-to-database SSL as preconfigured. Therefore this candidate relies on the hosted runtime trust store and full certificate/hostname verification. It does not disable TLS verification, mutate the trust store, read a PEM file, accept an invented CA secret, or set NODE_TLS_REJECT_UNAUTHORIZED.

A failing qik Node-pg TLS handshake must remain unavailable. If the deployed runtime requires a custom CA for this exact driver path, this unchanged-host packaging cannot supply one: a separately coordinated driver extension and qualification would be required. The official production statement is not evidence that this exact qik/pg@8.23.0 path has passed a handshake.

dependency-closure.json records the entire project-module import closure and the repository-locked pg npm dependency inventory. Deno does not consume that npm lock automatically. The actual deno.lock was generated and captured in both successful authorized remote synthetic jobs, verified byte-equal and hashed before exact source readback. Its SHA256 is df06499a54915068be7976853021d67c0b6598927c552cf5e6f19b99c404dbe3 (3185 bytes). It pins pg and actual transitive runtime/type dependencies, including @types/node24.2.0/undici-types7.10.0. This is a real generated lock, separate from package-lock. Current preparation must use --frozen throughout; no dependency resolution update is permitted.

## Qualification still required

The seven adapter/Auth mock tests passed inside the 266-check combined qualification (run36449315760/job109019669886), together with the browser source build. Standalone Deno2.5.2 checked the actual index and exercised the canonical host/npm pg against actual loopback PostgreSQL17.6/SCRAM; its Auth response is synthetic. A separate historical run36449393457/job109019936467 passed83 checks including actual Deno first custody/retry. These prove neither hosted Edge bundling/TLS/Auth network nor browser rendering, real credentials, costs/headroom or deployment. The newly captured frozen lock requires the targeted runtime recheck, not an unchanged full-suite rerun. Existing runtime CPU/memory limits, closure resolution, held config integration, gateway/admission setup and fresh integrated review remain release gates. This package has actual standalone synthetic compatibility evidence, while hosted endpoint qualification remains open.

Official sources consulted:
- [Dependencies and Node built-ins](https://supabase.com/docs/guides/functions/dependencies)
- [Node Postgres migration example](https://supabase.com/blog/edge-functions-node-npm)
- [Function configuration and entrypoints](https://supabase.com/docs/guides/functions/function-configuration)
- [User JWT and apikey boundaries](https://supabase.com/docs/guides/functions/auth-headers)
- [Production SSL guidance](https://supabase.com/docs/guides/functions/connect-to-postgres)
