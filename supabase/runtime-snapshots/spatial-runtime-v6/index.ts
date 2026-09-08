// ============================================================================
// MIP Spatial Runtime Boundary — Edge Function "spatial-runtime"
// Implementation artifact v0.2.1 — REVIEW ONLY. DO NOT DEPLOY without separate
// owner authorization.
//
// v0.2.1 bounded production-parity corrections over the accepted v0.2.0:
//  1. Deno-2-compatible pinned driver jsr:@db/postgres@0.19.5 (replaces
//     https://deno.land/x/postgres@v0.19.3/mod.ts), frozen lockfile.
//  2. True byte-bounded request-body reader (65,536 raw bytes), handler.ts.
//  3. Publishable key resolved from platform SUPABASE_PUBLISHABLE_KEYS
//     (JSON dict, key "default"), fail-closed — config.ts. No secret,
//     service-role, or default-privileged env is ever read or used.
//  4. Explicit function configuration (verify_jwt = true, entrypoint,
//     import map) — deploy/supabase.config.toml + FUNCTION_CONFIGURATION.md.
//
// Secrets: SPATIAL_WRITER_DB_URL (only true secret; never logged).
// Non-secret env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS (platform-provided),
//                 SPATIAL_RUNTIME_ALLOWED_ORIGIN (optional CORS origin).
// No service-role key is used anywhere.
// ============================================================================

import { Pool } from "@db/postgres";
import { bootConfig } from "./config.ts";
import { createHandler } from "./handler.ts";

const boot = bootConfig((name) => Deno.env.get(name));

// Pool ceiling 3: one headroom slot under the role's CONNECTION LIMIT 4.
// lazy=true: no connection is opened until the first request.
// sslmode=require|verify-full is validated at boot (config.ts) and is parsed
// by the driver into tls {enabled:true, enforce:true}.
const pool = new Pool(boot.dbUrl, 3, true);

const handler = createHandler({
  env: boot.env,
  pool: pool as unknown as import("./handler.ts").PoolLike,
});

Deno.serve(handler);
