// spatial-runtime request handler — injectable dependencies for offline testing.
// Production wiring (real Pool, real fetch, Deno.serve) lives in index.ts only.
import { buildCanonicalArgs, InputError, validateParams } from "./canonical.ts";
import { type OperationName, OPERATIONS } from "./operations.ts";

export interface DbClient {
  queryObject<T = Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ): Promise<{ rows: T[] }>;
  release(): void;
}
export interface PoolLike {
  connect(): Promise<DbClient>;
}
export interface HandlerEnv {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SPATIAL_RUNTIME_ALLOWED_ORIGIN?: string;
}
export interface HandlerDeps {
  env: HandlerEnv;
  pool: PoolLike;
  authFetch?: typeof fetch;
  log?: (entry: Record<string, unknown>) => void;
  randomUUID?: () => string;
  authTimeoutMs?: number;
}

export const MAX_BODY_BYTES = 65536;
const JSON_HEADERS = { "content-type": "application/json" };

/**
 * True byte-bounded body reader (v0.2.1 Correction 2).
 * Counts RAW BYTES (not UTF-16 code units or characters), streams chunk by
 * chunk, and stops immediately once the limit is exceeded — the body is never
 * fully loaded into memory before the limit is enforced. On overflow the
 * stream is cancelled and the lock released.
 * Returns the byte buffer, or null if the body exceeds MAX_BODY_BYTES.
 */
export async function readBoundedBody(
  req: Request,
  limit = MAX_BODY_BYTES,
): Promise<Uint8Array | null> {
  const body = req.body;
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Strict Content-Length early rejection: only a valid, non-negative decimal
 * integer greater than the limit yields an immediate 413. Absent, malformed,
 * or false-low values are NOT trusted — streaming enforcement still applies.
 */
export function contentLengthExceedsLimit(
  header: string | null,
  limit = MAX_BODY_BYTES,
): boolean {
  if (header === null) return false;
  if (!/^\d+$/.test(header.trim())) return false;
  const n = Number(header);
  if (!Number.isSafeInteger(n)) return false;
  return n > limit;
}

function jsonResponse(
  status: number,
  body: unknown,
  cors?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...cors },
  });
}
function fail(
  status: number,
  code: string,
  cors?: Record<string, string>,
): Response {
  return jsonResponse(status, { ok: false, code }, cors);
}

function corsHeaders(req: Request, env: HandlerEnv): Record<string, string> {
  // Explicit, restricted CORS: a single configured origin, or none (deny-by-default).
  const allowed = env.SPATIAL_RUNTIME_ALLOWED_ORIGIN;
  const origin = req.headers.get("origin");
  if (allowed && origin === allowed) {
    return {
      "access-control-allow-origin": allowed,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "600",
      vary: "Origin",
    };
  }
  return {};
}

// SQLSTATE -> safe HTTP mapping. Never leaks SQL text, params, or identifiers.
function mapDbError(err: unknown, cors: Record<string, string>): Response {
  const sqlstate = (err as { fields?: { code?: string } })?.fields?.code;
  if (sqlstate === "23505") return fail(409, "ALREADY_RECORDED", cors);
  if (sqlstate === "42501" || sqlstate === "55000" || sqlstate === "P0001") {
    return fail(422, "CANONICAL_REJECTED", cors);
  }
  // v0.2.3 Correction 1: client-reachable CHECK-constraint violation
  // (SQLSTATE 23514) maps to the same sanitized semantic rejection as the
  // other domain rejections. The response carries only {ok, code} — never
  // constraint names, SQL text, database messages, schema details, or
  // parameters. Fail-closed behavior (rollback, no log, no residue) is
  // unchanged.
  if (sqlstate === "23514") return fail(422, "CANONICAL_REJECTED", cors);
  return fail(500, "INTERNAL", cors);
}

export function createHandler(
  deps: HandlerDeps,
): (req: Request) => Promise<Response> {
  const authFetch = deps.authFetch ?? fetch;
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const authTimeout = deps.authTimeoutMs ?? 5000;

  async function attempt(
    body: { operation: OperationName; params: Record<string, unknown> },
    authUserId: string,
    cors: Record<string, string>,
  ): Promise<Response> {
    const op = OPERATIONS[body.operation];
    const runId = randomUUID();
    const placeholders = op.params.map((_, i) => `$${i + 1}`).join(",");
    const sql = `select ${op.fn}(${placeholders})`;
    const client = await deps.pool.connect();
    let committed = false;
    try {
      await client.queryObject("BEGIN");
      const { args, fingerprint } = await buildCanonicalArgs(
        body.operation,
        body.params,
        runId,
      );
      const gate = await client.queryObject<{ mip_profile_exists: boolean }>(
        "select public.mip_profile_exists($1::uuid) as mip_profile_exists",
        [authUserId],
      );
      if (!gate.rows[0]?.mip_profile_exists) {
        await client.queryObject("ROLLBACK").catch(() => {});
        return fail(403, "NO_PROFILE", cors);
      }
      try {
        await client.queryObject(sql, args);
      } catch (dbErr) {
        await client.queryObject("ROLLBACK").catch(() => {});
        throw dbErr;
      }
      await client.queryObject("COMMIT");
      committed = true;
      // Attribution log: approved fields only. Never SQL, params, headers, or secrets.
      log({
        event: "append",
        run_id: runId,
        auth_user_id: authUserId,
        operation: body.operation,
        fingerprint,
      });
      return jsonResponse(200, { ok: true, run_id: runId, fingerprint }, cors);
    } finally {
      if (!committed) {
        // guaranteed rollback + release on every non-committed path
        await client.queryObject("ROLLBACK").catch(() => {});
      }
      client.release();
    }
  }

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, deps.env);
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      if (req.method !== "POST") return fail(405, "METHOD", cors);

      const ct = req.headers.get("content-type") ?? "";
      if (!ct.toLowerCase().startsWith("application/json")) {
        return fail(415, "CONTENT_TYPE", cors);
      }

      // Early 413 on a valid Content-Length above the limit — before Auth,
      // before any body read, before any DB checkout. A false-low, malformed,
      // negative, or absent Content-Length is NOT trusted: the bounded
      // streaming read below enforces the limit on the actual bytes.
      if (contentLengthExceedsLimit(req.headers.get("content-length"))) {
        return fail(413, "PAYLOAD_TOO_LARGE", cors);
      }

      const authz = req.headers.get("authorization") ?? "";
      if (!authz.startsWith("Bearer ")) {
        return fail(401, "UNAUTHENTICATED", cors);
      }

      // 1) Verify caller JWT via Supabase Auth, publishable key only.
      let user: { id?: unknown };
      try {
        const userRes = await authFetch(
          `${deps.env.SUPABASE_URL}/auth/v1/user`,
          {
            headers: {
              authorization: authz,
              apikey: deps.env.SUPABASE_PUBLISHABLE_KEY,
            },
            signal: AbortSignal.timeout(authTimeout),
          },
        );
        if (!userRes.ok) return fail(401, "UNAUTHENTICATED", cors);
        user = await userRes.json();
      } catch {
        return fail(401, "UNAUTHENTICATED", cors);
      }
      const authUserId = typeof user?.id === "string" ? user.id : "";
      if (!authUserId) return fail(401, "UNAUTHENTICATED", cors);

      // 2) Bounded byte read, then UTF-8 decode, then JSON parse.
      // Invalid UTF-8 or invalid JSON fails closed (400) with no DB checkout.
      let body: { operation?: unknown; params?: unknown };
      const bytes = await readBoundedBody(req);
      if (bytes === null) {
        return fail(413, "PAYLOAD_TOO_LARGE", cors);
      }
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        body = JSON.parse(text);
      } catch {
        return fail(400, "BAD_REQUEST", cors);
      }
      if (
        typeof body?.operation !== "string" ||
        typeof body?.params !== "object" || body.params === null ||
        Array.isArray(body.params)
      ) {
        return fail(400, "BAD_REQUEST", cors);
      }
      if (!(body.operation in OPERATIONS)) {
        return fail(400, "BAD_OPERATION", cors);
      }
      const operation = body.operation as OperationName;

      let validated: Record<string, unknown>;
      try {
        validated = validateParams(
          OPERATIONS[operation],
          body.params as Record<string, unknown>,
        );
      } catch (e) {
        if (e instanceof InputError) return fail(400, e.code, cors);
        throw e;
      }

      // 3) Execute with one serialization-failure retry (40001), never for gate rejections.
      try {
        return await attempt(
          { operation, params: validated },
          authUserId,
          cors,
        );
      } catch (firstErr) {
        const sqlstate = (firstErr as { fields?: { code?: string } })?.fields
          ?.code;
        if (sqlstate === "40001") {
          try {
            return await attempt(
              { operation, params: validated },
              authUserId,
              cors,
            );
          } catch (secondErr) {
            return mapDbError(secondErr, cors);
          }
        }
        return mapDbError(firstErr, cors);
      }
    } catch {
      return fail(500, "INTERNAL", cors);
    }
  };
}
