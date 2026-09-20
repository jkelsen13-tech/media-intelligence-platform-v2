import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const handlers = [
  "supabase/production-candidates/backend-consolidation-security/edge/backfill-legacy/index.ts",
  "supabase/production-candidates/backend-consolidation-security/edge/policy-ingest/index.ts",
];

for (const path of handlers) {
  test(`${path} is a side-effect-free owner containment response`, async () => {
    const source = await readFile(path, "utf8");
    for (const forbidden of [
      /Deno\.env/,
      /SUPABASE_/,
      /createClient/,
      /\bfetch\s*\(/,
      /\.json\s*\(/,
      /\.text\s*\(/,
      /\.formData\s*\(/,
      /\.arrayBuffer\s*\(/,
      /reset/i,
      /dispatch/i,
    ]) {
      assert.doesNotMatch(source, forbidden);
    }

    let handler;
    vm.runInNewContext(source, {
      Deno: { serve(candidate) { handler = candidate; } },
      Response,
      JSON,
    }, { filename: path });

    assert.equal(typeof handler, "function");
    const response = await handler();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      ok: false,
      code: "owner_containment",
    });
  });
}
