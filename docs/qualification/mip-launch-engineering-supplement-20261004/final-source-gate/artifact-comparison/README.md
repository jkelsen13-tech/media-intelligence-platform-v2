# Frozen artifact comparison

The **115-byte increase is a build-time browser configuration difference**, not an application-source or dependency change. The old main embeds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` constants. The fresh sanitized main has neither configured value, so Vite/esbuild retain optional missing-key accesses, environment objects and guards. That change propagates ten emitted JavaScript filenames.

Independent body reads confirm old **442 files / 23,634,201 bytes** and fresh **442 files / 23,634,316 bytes**. Fresh Node22 and Node24 files are byte-identical. All **441 bodies other than main** become byte-identical after substituting only the ten exact old/new chunk names; this includes HTML and bundle graph. Package, lock, Vite configuration, browser build gate, Supabase client/origin source and `.env.example` hashes match across all three checkouts. Dependency realpaths also match. Only `.env.example` is present in their environment-file listings.

Main identities:

- Old `assets/index-IfqN_mDM.js`: 2,032,941 bytes; SHA256 `f290fbcb9230323731193d91f0f3f647197f371d6f60c7ff6d104d31dd9bfddf`.
- Fresh `assets/index-Bqg0JbM1.js`: 2,033,056 bytes; SHA256 `6c9361885a127b4dbafd310fadf15fa9b279e0ea37e3e063883e3719469ea905`.

The bounded linear Babel token comparison accounts for **+110 bytes in five configuration-related spans, +4 bytes in matched minifier-token lengths, +1 byte of spacing = +115**. It does not use SequenceMatcher. Identifier names are ignored during token alignment; this is a configuration-delta investigation, not formal semantic equivalence of differently minified entry code.

The old 40-byte URL literal equals the unchanged source-locked V2 origin. The old 46-byte key passes the unchanged public publishable-key syntax guard; that proves neither credential authenticity nor genuine-account acceptance. No key value is printed or retained in these findings. Both old and fresh receipts show equivalent `node node_modules/vite/bin/vite.js build` commands, but the old receipts contain no environment-input snapshot. The historical source of the embedded constants cannot be proved from those receipts. No ambient environment values were read or printed.

[findings.json](findings.json) records exact configuration/artifact/receipt hashes, [body-comparison.json](body-comparison.json) records every mapped body, and [bounded-token-diff.json](bounded-token-diff.json) records bounded token spans with string values hashed. The two `.cjs` files preserve the diagnostic procedure and read existing artifacts only.

**Remaining gate:** the fresh unconfigured artifact is not the retained configured artifact and does not qualify real Auth/backend operation. Historical build-input provenance and an explicitly accepted configured release artifact remain separate. Product source is still frozen at `06833f99de62877182305eda6fb034800b905f1e` / `fd3a2889251a4ac3e16132b682eef128171cec1c`; no source edit, rebuild, network/provider/target operation, artifact selection or release action occurred here. Full-test results were supplied by the parent and were not rerun.
