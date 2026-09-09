# Vite 7 security migration — 9 September 2026

The Vite 5.4.21 / esbuild 0.21.5 development-tool findings require a coordinated major migration. This batch pins Vite 7.3.6, retains the already-locked React plugin 4.7.0 with its explicit Vite 7 peer support, and upgrades vite-plugin-static-copy to 3.4.0. The generated lock resolves esbuild 0.28.2. Vite 7.3 receives important fixes and security patches under the upstream policy inspected on this date.

## Compatibility and scope

The production dependency declarations and every production lock entry are unchanged. Rollup stays at 4.62.2; the existing map-stack and Cesium manual chunk functions, public base path, copied Cesium directories, and license asset generation remain in place. The new glob implementation supports these forward-slash recursive patterns. No custom resolve conditions, Sass, SSR, proxy, library-mode or experimental runtime API configuration is present.

Vite 7 changes its default browser target. The configuration explicitly retains Vite 5's es2020/Edge 88/Firefox 78/Chrome 87/Safari 14 transform targets. This preserves the previous build target; it is not a claim that all application dependencies or physical devices support those oldest versions. Existing Node 22/24 CI meets the new Node 20.19+/22.12+ requirement. No Rolldown migration is included.

The lockfile was generated on the isolated GitHub Actions preparation branch from 0f2dd0d18b4e4527aae5e7e6f57d680c9d744423, with install scripts disabled during resolution. Its preparation workflow is excluded from the implementation tree. No local files were created.

## Verification and rights

A bounded isolated dev-server regression test exercises an allowed page/origin, rejects an untrusted Host, withholds CORS permission from an untrusted origin, and denies a private .env fixture without returning its contents. This is Linux CI coverage of those contracts, not Windows-specific exploit reproduction. Golden tests/builds and the full/focused browser preview and post-deployment checks remain mandatory. Final exact-head audit and release evidence belong in the PR closeout.

Six unique changed non-platform package tarballs were read in memory and verified against the lockfile SHA-512 values. Their complete upstream license texts are retained alongside the existing notices. Vite's bundled dependency notice includes MIT, ISC, BSD-2-Clause and CC0-1.0 terms; the complete text is retained. esbuild platform packages remain optional build binaries under its MIT license and retain npm integrity records. No provider, application data, publication, privacy or database gate changes are part of this migration.

Sources: [Vite support](https://vite.dev/releases), [Vite 6 migration](https://v6.vite.dev/guide/migration.html), [Vite 7 migration](https://v7.vite.dev/guide/migration.html), [Vite package](https://registry.npmjs.org/vite/7.3.6), [React plugin](https://registry.npmjs.org/@vitejs/plugin-react/4.7.0), [static-copy plugin](https://registry.npmjs.org/vite-plugin-static-copy/3.4.0).
