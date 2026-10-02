# Browser key build gate — 2026-10-02

Base: `f06b5c636acce1d8996fb933b1bb1b81c12dd548` (tree `c68b1f5f70c4f6848c0d8a4c5096bfe52b36ec3a`). This is a bounded source correction, with no dependency, runtime auth, database, provider, or deployment changes.

## Defect and resulting behavior

The runtime Supabase client refuses privileged keys, but Vite can substitute a configured value into browser assets before that runtime check runs. The coordinator's existing Pages inspection found a public literal; this correction does not assert an observed credential leak.

The production Vite configuration now registers `browserKeyBuildGate()` first. Its early `config` hook rejects diagnostic builds with any nonempty `DEBUG`, including Vite CLI `--debug`, before Vite loads environment files. Installed Vite 7.3.6 otherwise logs resolved environment values through its debug namespace before `configResolved` can validate them. The conservative refusal uses only `MIP_BROWSER_BUILD_DEBUG_REFUSED`; users must remove `DEBUG` or `--debug` to run this production build.

The `configResolved` hook validates the final exposed `VITE_SUPABASE_ANON_KEY`, using the existing `isSafeSupabaseBrowserKey` predicate. Mode, environment directory, file priority, dotenv expansion, process overrides, and exposure prefixes are resolved by Vite rather than reimplemented. Invalid values fail before source transformation or publication-directory clearing, with only `MIP_BROWSER_KEY_ENV_REFUSED` in the thrown message and stack. Missing, null, or empty values remain valid for the unconfigured demo. Public `sb_publishable_…` values and structurally valid legacy JWT values with `role: anon` remain supported; this predicate does not authenticate JWT signatures.

Named `import.meta.env.VITE_SUPABASE_ANON_KEY` define overrides, including client-environment defines, receive the same validation. Only literal public or missing values are supported. A safe JavaScript override cannot excuse an unsafe exposed environment value because HTML substitutions can still emit it. Whole `import.meta.env` define replacement and arbitrary named expressions are refused rather than evaluated. The current production configuration uses direct environment references and requires neither feature.

## Resolution evidence

Vite documents static substitution and mode-dependent environment loading, with existing process variables taking precedence over loaded files: [environment variables and modes](https://vite.dev/guide/env-and-mode). Its [shared options](https://vite.dev/config/shared-options) document `envDir`, `envPrefix`, and `define`; its [plugin API](https://vite.dev/guide/api-plugin) documents the configuration hooks. Installed Vite 7.3.6's `loadEnv`, `resolveConfig`, and define plugin were also inspected to establish the logging order and final exposed-value boundary.

The build gate applies to builds using this production configuration. It does not promise secrecy for arbitrary external wrapper logging, earlier logging in other trusted plugins, or builds that bypass this configuration. The diagnostic refusal closes the identified Vite environment-debug path; it is not a whole-process logging guarantee.

## Qualification

All environment inputs used for this qualification were controlled synthetic fixtures or an empty dedicated environment directory. Child processes received a deliberately minimal environment instead of inheriting or inspecting host credential variables. No actual `.env` values, credentials, live configuration, or provider endpoints were read.

- RED against the prior configuration: 7 cases, 1 passed and 6 failed; unsafe values reached emitted fixtures and the refusals were absent.
- Initial GREEN: 7/7 cases passed. Final targeted run: **28/28 passed**, comprising 9 build-gate cases plus existing public-key and external-URL regressions.
- Negative builds exercised synthetic secret keys and service-role JWTs, CLI mode selection, CLI debug, mode-local files, process precedence, dotenv expansion, and define overrides. Each stopped before transformation, preserved the prior publication marker, emitted no new artifacts, and kept rejected sentinels out of captured stdout, stderr, reports, assets, and sourcemaps.
- Positive controls built with public publishable and legacy anon keys, missing and empty configuration, supported literal defines, alternate exposure prefixes, and disabled environment-file loading. These controls emitted JavaScript and sourcemaps and proved the transformation observer ran.
- The complete unconfigured production application built successfully in 35.44 seconds with an empty controlled `envDir`. The existing bundle-isolation verifier passed, including 12 verifier self-tests. Neither refusal code appeared in the client output. The existing large-chunk warning remains.
- JavaScript syntax checks and `git diff --check` passed.

Raw receipts are in `/workspace/mip-browser-build-guard-receipts`: `build-env-red.tap`, `build-env-green.tap`, `build-env-final.tap`, `unconfigured-full-app-build.log`, `full-app-build-outcome.json`, `unconfigured-bundle-isolation.json`, and `build-guard-client-module-matches.txt`. The full application output is isolated in `unconfigured-app/`; `full-app-build.mjs` and `full-app-build-launch.mjs` reproduce the controlled launch.

The coordinator retains exact-head integration, independent review, CI, push, and deployment gates. This candidate has not been pushed or deployed.
