# MIP convergence: auth and security source gate — 2026-10-02

Bounded source/dependency repair from `b8ac1663fa75c4c7a26d653a288f745070bafcae`. This is not a live auth journey, release approval, backend privilege change, or account creation receipt. The historical original Account Pipeline closure remains closed; V2 source and the coordinator's fresh V2 metadata establish an existing identity foundation, not a from-scratch auth build. Current Library successor inputs preserve separate provider, security, physical-device, live consumer and release gates.

## Implemented behavior

- Auth subscriptions precede startup reads. A newer auth event supersedes a late startup result, including logout and sign-in with another identity. Rejected/returned-error reads settle signed out instead of leaving session loading forever.
- Expired/malformed expiry sessions are withheld. Refresh updates the expiry deadline; if refresh never arrives, the deadline clears frontend identity and private records. Subscription/timer cleanup prevents late updates after unmount. This browser state is UI visibility, not an authorization substitute.
- Profiles are bound to their requested user ID and cancelled on identity change. The previous identity is hidden on the first render of a change. Private workspace state is also hidden immediately and outstanding requests are invalidated when identity becomes unknown or changes.
- Account logout disables repeat submission while pending and shows an error if the SDK fails. Failed magic-link requests show a retryable error. Magic-link `app: mip` metadata and `shouldCreateUser: true` remain preserved for the existing scoped trigger.
- Auth callback errors are captured without tokens before router/SDK hash replacement. Clearing an auth error preserves ordinary application deep links and history state. The outbound callback destination permits only the confirmed V2 Pages path, or a loopback address under explicit development mode. Query/hash/returnTo destinations are discarded; the auth callback owns the fragment. Cross-device restoration of a prior application hash is not implemented or claimed.
- A public browser key guard accepts Supabase publishable keys and legacy JWT-shaped `anon` keys; it rejects secret/service-role/unknown keys. This is configuration validation, not JWT verification. The coordinator integrates the `makeClient` call site from the evidence lane.
- A shared external URL guard permits absolute HTTP(S) only and rejects credentials, ambiguous backslashes, whitespace/control bytes and excessive length. Source Comparison and Legal & Policy retain unsafe locators as plain text. Other owned surfaces integrate the same helper through their lanes.

## DOMPurify advisory disposition

The baseline lock installed DOMPurify **3.4.14** through `cesium 1.145.0 → @cesium/engine 26.3.0 → dompurify ^3.4.14`. [The official GHSA-p98j-92pf-mc4p advisory](https://github.com/advisories/GHSA-p98j-92pf-mc4p), updated September 30, lists affected versions 3.4.13–3.4.15 and patch **3.4.16**. An exact npm override and updated lock install 3.4.16 without changing the Cesium version or its compatible semver dependency.

The application reaches Cesium `Credit.element`, which calls `DOMPurify.sanitize(this._html)` as a string, then assigns the sanitized output to a new element. App credits include terrain/imagery attribution. No app or Cesium `IN_PLACE` use or node-removing `addHook` was found. The advisory's full exploit preconditions are therefore not evidenced in this source, although the vulnerable dependency was installed. Upgrade resolves the retained advisory rather than claiming sanitizer unreachability.

Chromium 151.0.7922.173 qualified the installed 3.4.16 string sanitization and both `afterSanitizeElements`/`afterSanitizeAttributes` detached-subtree neutralization cases. The actual Cesium `Credit.element` rendering path was also exercised with safe attribution and hostile markup. All four checks passed. Fresh `npm audit --json` reports **0 vulnerabilities** for this exact local dependency graph.

## Source inspection and qualification

Dynamic Graph card fields are assigned with `textContent`; its `innerHTML` template contains only static SVG/span markup. No React unsafe HTML/Markdown renderer was found in application source. Public source hrefs were the identified executable-scheme seam. Private-workspace debug fixtures require exact `DEV === true` and the application imports them only in its development branch. No client service-role/secret-key configuration was identified. No credentials or secret stores were opened.

Current Supabase guidance was checked against [auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [getSession](https://supabase.com/docs/reference/javascript/auth-getsession), [logout](https://supabase.com/docs/reference/javascript/auth-signout), [magic links](https://supabase.com/docs/reference/javascript/auth-signinwithotp), and [redirect allowlists](https://supabase.com/docs/guides/auth/redirect-urls). The markdown changelog fetch was blocked by transport; the [official changelog page](https://supabase.com/changelog) was available as fallback. Frontend session visibility does not grant a private investigation assignment; the backend retains server-verified identity and explicit assignment enforcement.

Local receipts: `/workspace/mip-lane-auth-receipts/`:

- `auth-security-focused-final.log`: **65/65** targeted existing and new auth, account, workspace race, origin and rendered source-link checks.
- `build.log`: Vite production build passed; existing large-chunk advisories remain.
- `npm-audit-after.json`, `dompurify-tree-after.json`, `npm-dompurify-upgrade.log`: dependency outcome.
- `sanitizer-browser-result.json`, `qualify-sanitizer-browser.mjs`: controlled browser checks; no live account/provider interaction.

## Remaining gates

Real V2 magic-link delivery/signup/login persistence/logout/expiry and cross-user denial need separately authorized user-facing qualification. The coordinator verified the live `mip_profiles` identity schema, own-row policies, scoped enabled signup trigger and exactly-true account UI flag; that metadata receipt does not prove the full journey. Browser public-key validation cannot remove a privileged value already embedded by a misconfigured build; build environment/secret hygiene remains operational responsibility.

Independent review and the coherent integrated suite belong to the coordinator. No push, merge, deployment, account creation, new credential, live role/RLS/ACL mutation, paid provider activation, or release occurred in this lane.


## Separate profile privilege source proposal

The coordinator's fresh read-only V2 metadata identified broad table privileges on `mip_profiles` for browser roles, including `TRUNCATE`, `TRIGGER`, `REFERENCES` and `MAINTAIN`. RLS CRUD policies do not enforce row isolation for TRUNCATE. Consumer exposure of a destructive entry point was not established; this is an overbroad privilege finding, not a demonstrated live exploit.

`supabase/source-proposals/mip_profiles_least_privilege_2026-10-02.sql` is an **unapplied source proposal**, deliberately outside migration discovery. It revokes only those four privileges from `anon`/`authenticated`, with no new grants or CASCADE. Existing CRUD grants, owner, RLS, policies, constraints, columns, signup function bytes/ACL/owner and scoped trigger remain preserved. The REFERENCES revoke also removes owned column REFERENCES privileges; column CRUD grants are preserved.

An independently reviewed wrapper must supply the exact fresh catalog JSON in `mip.profile_acl_expected_catalog` and execute as the verified table owner. The proposal snapshots table and column ACLs including their grantors, identity schema/policies and signup function/trigger. Missing baseline, drift, non-owner execution, or residual effective privileges from PUBLIC/inheritance/other grantors abort atomically. It does not invent the missing live baseline or broaden the revoke to resolve an abort. A fresh owner/catalog/all-grantor baseline and separate live approval are still required; this source gate is **not execution-ready**.

`tests/security/mipProfilesLeastPrivilege.test.mjs` passed **5/5** on isolated PGlite. Positive control proves anonymous TRUNCATE works before the proposal despite RLS. The proposal then denies it while keeping authenticated own-row SELECT/INSERT/UPDATE, cross-user read/update/insert denial, MIP-only trigger creation, unaffected service-role grants and unchanged identity definitions. Missing baseline/policy drift and PUBLIC privilege paths roll back. Non-owner execution rejects; owned column REFERENCES removal preserves column SELECT. Receipt: `profile-proposal-tests.log` in the local receipt directory.

Source commits: auth/dependency/helper candidate `119eaffac62a9ce2d82824c93a6513aea5678883`; the profile proposal and this qualification update are a separate follow-on commit. Other original projects' catalog status/ACL observations belong to the coordinator and were not mutated here.
