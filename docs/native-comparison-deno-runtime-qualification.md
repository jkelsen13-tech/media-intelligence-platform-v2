# Deno native-comparison synthetic runtime qualification

This is a new remote-runner qualification stage, not a deployment. Existing UI and seven Edge packaging blobs stay unchanged. The only coordinated existing edit is tests/nativeComparisonCallerPostgresAssertions.mjs: the Deno check is inside its existing second check, after successful current admission/read. All eight check groups remain.

## What the probe actually exercises

tests/nativeComparisonDenoRuntime.mjs runs in actual pinned Deno, imports the actual index.ts with deployment configuration absent and confirms sanitized 503 plus Buffer/process globals. It imports actual npm pg and the canonical HTTP host. It then invokes that host against the live armed loopback PostgreSQL fixture using the same actual gateway SCRAM login. No SET ROLE, fake driver, SQL stub, target override in the Edge adapter, or replacement admission function is used.

The parent supplies only bounded synthetic context over stdin. The child has network permission only for 127.0.0.1:5432 and uses a synthetic Auth fetch callback which verifies the exact expected getUser request before returning the fixture user. Actual qik Auth network/signature verification is NOT proved by this test. Parent compares a SHA-256 digest of the canonical returned DTO with its direct successful read, and independently checks the caller's database sessions return to their baseline after child exit. Child stdout is a fixed receipt without DTO, password, bearer, user/session or raw error text.

Missing binary/cache, wrong Deno version, absent runtime dependencies, wrong fixture connection, timeout, nonzero exit, oversized output, receipt mismatch or cleanup uncertainty FAIL; they do not skip. Child execution is bounded at 30 seconds. The production Edge adapter remains qik/session-pooler-only; loopback is reached only through the canonical host's existing armed disposable mode.

Pure Deno 2.5.2 is not Supabase's hosted Edge Runtime. Passing proves this pinned Deno/npm/Node-global/HTTP/PgDriver path against actual synthetic PostgreSQL. It does not prove hosted isolation, gateway routing/JWT precheck, runtime version, TLS/CA chain (the existing disposable mode disables TLS), bundle deployment, production credentials/admission, costs or endpoint availability.

## Verified runtime pin

Use tests/nativeComparisonDenoRuntimePin.json. Official denoland/deno v2.5.2 Linux x86_64 release metadata reports archive SHA-256 520fd4bc2d18b50b6ac2ea8b7d0f7f6a35588e412754a081e8c6afd4b15264c4 and size 45074518 bytes. The matching vendor checksum text asset itself has SHA-256 4c0fc62463955fa32e56d43d4d14b37424251e4ab78f14beb33e7092fd083cda. This is a deliberate immutable compatibility probe, not a claim that 2.5.2 is the newest release.

[Official release](https://github.com/denoland/deno/releases/tag/v2.5.2), [release metadata](https://api.github.com/repos/denoland/deno/releases/tags/v2.5.2), [vendor installation guidance](https://docs.deno.com/runtime/getting_started/installation/). The pinned actual runner supports --frozen and --node-modules-dir=none for check; --cached-only applies to run, not check. An attempted check --cached-only was refused by Deno2.5.2, and this successor uses frozen check with lock bytes unchanged. The unsupported allowJs compiler option is removed. Relevant pinned CLI implementation: [pinned CLI implementation](https://github.com/denoland/deno/blob/v2.5.2/cli/args/flags.rs).

## Bounded existing Linux GitHub runner snippet

Parent owns the combined workflow. Run these commands only in its already-authorized synthetic runner after checkout, before Node/PG calls this helper. No persistent host/service, upload-artifact action or device execution is required. Use a 5-minute step timeout and an existing job budget. Do not use shell tracing.

```bash
set -euo pipefail
test "$(uname -s)" = Linux
test "$(uname -m)" = x86_64
probe_dir="$(mktemp -d "$RUNNER_TEMP/native-comparison-deno.XXXXXX")"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 10 --max-time 60 --max-filesize 50000000 \
  'https://github.com/denoland/deno/releases/download/v2.5.2/deno-x86_64-unknown-linux-gnu.zip' -o "$probe_dir/deno.zip"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 10 --max-time 30 --max-filesize 1024 \
  'https://github.com/denoland/deno/releases/download/v2.5.2/deno-x86_64-unknown-linux-gnu.zip.sha256sum' -o "$probe_dir/vendor.sha256sum"
printf '%s  %s\n' '520fd4bc2d18b50b6ac2ea8b7d0f7f6a35588e412754a081e8c6afd4b15264c4' "$probe_dir/deno.zip" | sha256sum --check --status
printf '%s  %s\n' '4c0fc62463955fa32e56d43d4d14b37424251e4ab78f14beb33e7092fd083cda' "$probe_dir/vendor.sha256sum" | sha256sum --check --status
test "$(awk 'NR==1 {print $1}' "$probe_dir/vendor.sha256sum")" = '520fd4bc2d18b50b6ac2ea8b7d0f7f6a35588e412754a081e8c6afd4b15264c4'
unzip -q "$probe_dir/deno.zip" deno -d "$probe_dir"
chmod 700 "$probe_dir/deno"
export DENO_BINARY="$probe_dir/deno"
export DENO_DIR="$probe_dir/cache"
export DENO_NO_UPDATE_CHECK=1
test "$("$DENO_BINARY" --version | head -n 1)" = 'deno 2.5.2 (stable, release, x86_64-unknown-linux-gnu)'
cfg='supabase/functions/native-comparison-display/deno.json'
lock='supabase/functions/native-comparison-display/deno.lock'
timeout --signal=KILL 90s "$DENO_BINARY" cache --config="$cfg" --lock="$lock" --frozen=false --node-modules-dir=none \
  supabase/functions/native-comparison-display/index.ts \
  supabase/qualification/native-comparison-caller/host.mjs \
  tests/nativeComparisonDenoRuntime.mjs
timeout --signal=KILL 90s "$DENO_BINARY" check --config="$cfg" --lock="$lock" --frozen=false --node-modules-dir=none \
  supabase/functions/native-comparison-display/index.ts
lock_before="$(sha256sum "$lock" | awk '{print $1}')"
timeout --signal=KILL 30s "$DENO_BINARY" check --config="$cfg" --lock="$lock" --frozen --node-modules-dir=none \
  supabase/functions/native-comparison-display/index.ts
test "$(sha256sum "$lock" | awk '{print $1}')" = "$lock_before"
printf 'DENO_BINARY=%s\nDENO_DIR=%s\nDENO_NO_UPDATE_CHECK=1\n' "$DENO_BINARY" "$DENO_DIR" >> "$GITHUB_ENV"
```

The subsequent existing FULL Node/PG fixture must have MIP_DISPOSABLE_POSTGRES=qik-native-caller, use its original actual gateway login, and retain its original cleanup. Its helper spawns the Deno child using --cached-only --frozen, the generated lock, explicit source/cache read permissions, and loopback-only network permissions. It does not inherit GitHub tokens, production database credentials or arbitrary environment variables.

## Real lockfile capture

No deno.lock is fabricated here. The cache/check commands above generate the real lock in the remote runner. After both frozen check and synthetic fixture pass, capture that file only through the existing permitted source-result route. Suggested bounded source receipt is {kind:"deno-lock-source-v1",runtime:"2.5.2",sha256,bytes,base64}; require valid JSON and at most 65536 bytes, and hash the exact file bytes. This is generated dependency source metadata, not a test artifact or private material. Do not upload an Actions artifact or add a new return channel.

Parent should read back that receipt, verify its exact digest, create an unreferenced source blob using the already-authorized source connector, and incorporate the resulting lock into the coherent review candidate. Once a lock is accepted, change the runner preparation to --frozen throughout instead of resolving it again. A failed first qualification is not permission to fabricate or relax its dependency closure.

Auth/network, runtime, source-only lock creation and SQL cleanup test results remain pending execution by the parent-controlled runner.
