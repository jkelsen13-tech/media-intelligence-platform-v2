import {
  contentLengthExceedsLimit,
  createHandler as createBaseHandler,
  type DbClient,
  type HandlerDeps,
  MAX_BODY_BYTES,
  type PoolLike,
  readBoundedBody,
} from "./base-handler.ts";

const CAPABILITY_SQL =
  "select public.spatial_runtime_operation_allowed($1::uuid,$2::text) as mip_profile_exists";

function capabilityPool(pool: PoolLike, operation: string): PoolLike {
  return {
    async connect(): Promise<DbClient> {
      const client = await pool.connect();
      return {
        async queryObject<T = Record<string, unknown>>(
          sql: string,
          args?: unknown[],
        ): Promise<{ rows: T[] }> {
          if (sql.includes("public.mip_profile_exists")) {
            return await client.queryObject<T>(CAPABILITY_SQL, [
              args?.[0],
              operation,
            ]);
          }
          return await client.queryObject<T>(sql, args);
        },
        release(): void {
          client.release();
        },
      };
    },
  };
}

async function operationFromBoundedClone(req: Request): Promise<string | null> {
  if (req.method !== "POST") return null;
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return null;
  if (contentLengthExceedsLimit(req.headers.get("content-length"))) return null;

  const bytes = await readBoundedBody(req.clone(), MAX_BODY_BYTES);
  if (bytes === null) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body = JSON.parse(text);
    return typeof body?.operation === "string" ? body.operation : null;
  } catch {
    return null;
  }
}

/**
 * Capability-gated spatial runtime adapter.
 *
 * The registered v6 handler remains byte-for-byte preserved. For each valid
 * request, this adapter binds the exact requested operation to the authenticated
 * user ID at the existing in-transaction gate. The database function maps the
 * operation to independently revocable write/review/release capabilities and
 * rejects anonymous or unconfirmed users. New profiles receive no capability.
 */
export function createHandler(
  deps: HandlerDeps,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const operation = await operationFromBoundedClone(req);
    const handler = operation === null
      ? createBaseHandler(deps)
      : createBaseHandler({
        ...deps,
        pool: capabilityPool(deps.pool, operation),
      });
    return await handler(req);
  };
}
