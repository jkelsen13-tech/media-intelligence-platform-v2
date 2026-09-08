// Boot/configuration layer — pure, injectable, offline-testable.
// All environment access for the artifact is funneled through the injected
// getter so tests can prove exactly which variables are (and are NOT) read.
//
// v0.2.1 (Correction 3): the publishable key is resolved from the
// platform-provided SUPABASE_PUBLISHABLE_KEYS JSON dictionary (key "default"),
// never from SUPABASE_SECRET_KEYS, SUPABASE_SERVICE_ROLE_KEY, or the
// privileged default SUPABASE_DB_URL. Database access uses only the custom
// SPATIAL_WRITER_DB_URL secret.

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

// Explicitly documented expected key name inside SUPABASE_PUBLISHABLE_KEYS.
export const PUBLISHABLE_KEY_NAME = "default";

export type EnvGet = (name: string) => string | undefined;

/** True iff the value has publishable-key shape (modern or legacy anon). */
export function hasPublishableKeyShape(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  // Hard reject anything secret-shaped before any acceptance path.
  if (value.startsWith("sb_secret_")) return false;
  // Modern publishable key.
  if (value.startsWith("sb_publishable_")) return true;
  // Legacy anon key: a signed JWT whose payload role is exactly "anon".
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    // A service_role or any other role JWT is NOT publishable.
    return payload?.role === "anon";
  } catch {
    return false;
  }
}

/** Resolve the publishable key from SUPABASE_PUBLISHABLE_KEYS, fail-closed. */
export function resolvePublishableKey(get: EnvGet): string {
  const raw = get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw === undefined || raw === "") {
    throw new ConfigError("SUPABASE_PUBLISHABLE_KEYS is not set");
  }
  let map: unknown;
  try {
    map = JSON.parse(raw);
  } catch {
    throw new ConfigError("SUPABASE_PUBLISHABLE_KEYS is not valid JSON");
  }
  if (typeof map !== "object" || map === null || Array.isArray(map)) {
    throw new ConfigError("SUPABASE_PUBLISHABLE_KEYS must be a JSON object");
  }
  const value = (map as Record<string, unknown>)[PUBLISHABLE_KEY_NAME];
  if (value === undefined) {
    throw new ConfigError(
      `SUPABASE_PUBLISHABLE_KEYS is missing expected key "${PUBLISHABLE_KEY_NAME}"`,
    );
  }
  if (typeof value !== "string") {
    throw new ConfigError(
      `SUPABASE_PUBLISHABLE_KEYS["${PUBLISHABLE_KEY_NAME}"] must be a string`,
    );
  }
  if (!hasPublishableKeyShape(value)) {
    throw new ConfigError(
      `SUPABASE_PUBLISHABLE_KEYS["${PUBLISHABLE_KEY_NAME}"] does not have publishable-key shape`,
    );
  }
  return value;
}

/** Validate the custom writer DSN: postgres scheme, exact role, TLS enforced. */
export function validateDbUrl(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
    throw new ConfigError(
      "SPATIAL_WRITER_DB_URL must be a postgres connection URL",
    );
  }
  if (decodeURIComponent(u.username) !== "spatial_writer_runtime") {
    throw new ConfigError(
      "SPATIAL_WRITER_DB_URL must connect as spatial_writer_runtime",
    );
  }
  const sslmode = u.searchParams.get("sslmode") ?? "";
  if (sslmode !== "require" && sslmode !== "verify-full") {
    throw new ConfigError(
      "SPATIAL_WRITER_DB_URL must enforce TLS (sslmode=require or verify-full)",
    );
  }
}

export interface BootConfig {
  dbUrl: string;
  env: {
    SUPABASE_URL: string;
    SUPABASE_PUBLISHABLE_KEY: string;
    SPATIAL_RUNTIME_ALLOWED_ORIGIN?: string;
  };
}

/**
 * Full boot configuration resolution. Reads ONLY:
 *   SPATIAL_WRITER_DB_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS,
 *   SPATIAL_RUNTIME_ALLOWED_ORIGIN.
 * It never reads SUPABASE_SECRET_KEYS, SUPABASE_SERVICE_ROLE_KEY, or
 * SUPABASE_DB_URL (proven by instrumentation in tests/config_test.ts).
 */
export function bootConfig(get: EnvGet): BootConfig {
  const dbUrl = get("SPATIAL_WRITER_DB_URL");
  if (!dbUrl) {
    throw new ConfigError("missing required env SPATIAL_WRITER_DB_URL");
  }
  validateDbUrl(dbUrl);

  const supabaseUrl = get("SUPABASE_URL");
  if (!supabaseUrl) throw new ConfigError("missing required env SUPABASE_URL");
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new ConfigError("SUPABASE_URL must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new ConfigError("SUPABASE_URL must use https");
  }

  return {
    dbUrl,
    env: {
      SUPABASE_URL: supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: resolvePublishableKey(get),
      SPATIAL_RUNTIME_ALLOWED_ORIGIN: get("SPATIAL_RUNTIME_ALLOWED_ORIGIN"),
    },
  };
}
