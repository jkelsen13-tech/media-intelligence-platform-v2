// buildCanonicalArgs — real implementation.
// Interleaves validated client values with server-computed JCS canonical texts,
// SHA-256 fingerprints, and the server-generated run identity into the exact
// canonical signature order defined by operations.ts.
import { canonicalBytesJCS, canonicalizeJCS } from "./jcs.ts";
import { sha256Hex } from "./sha256.ts";
import {
  type OperationName,
  OPERATIONS,
  type OperationSpec,
} from "./operations.ts";

const RE_UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const RE_SHA256 = /^[0-9a-f]{64}$/;
// ISO-8601-ish timestamp; the canonical layer is the final strict validator.
const RE_TIMESTAMPTZ =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:\d{2})?)?$/;

export class InputError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "InputError";
    this.code = code;
  }
}

// Identity / principal / canonicalization fields a client may NEVER supply.
// Operation-aware per owner ruling 2026-09-01: 'content_hash' is forbidden
// globally EXCEPT for append_evidence_snapshot, where it is an accepted
// governed client domain field (validated as sha256hex).
const FORBIDDEN_CLIENT_FIELDS: ReadonlySet<string> = new Set([
  "run_id",
  "p_run_id",
  "principal",
  "actor",
  "actor_id",
  "auth_user_id",
  "user_id",
  "uid",
  "created_by_principal_ref",
  "canonical_text",
  "identity_canonical_text",
  "revision_canonical_text",
  "node_canonical_text",
  "place_canonical_text",
  "registry_canonical_text",
  "source_node_canonical_text",
  "source_graph_canonical_text",
  "snapshot_canonical_text",
  "linkage_canonical_text",
  "lineage_canonical_text",
  "event_canonical_text",
  "decision_canonical_text",
  "geometry_canonical_text",
  "assertion_fingerprint",
  "revision_fingerprint",
  "node_snapshot_hash",
  "place_snapshot_hash",
  "registry_fingerprint",
  "source_node_snapshot_hash",
  "source_graph_association_fingerprint",
  "snapshot_fingerprint",
  "linkage_fingerprint",
  "lineage_fingerprint",
  "event_fingerprint",
  "decision_fingerprint",
  "geometry_hash",
  "content_hash",
]);

function validateClientValue(
  type: string,
  key: string,
  value: unknown,
  required: boolean,
): unknown {
  if (value === null || value === undefined) {
    if (required) {
      throw new InputError(
        "MISSING_PARAM",
        `missing required parameter ${key}`,
      );
    }
    return null;
  }
  switch (type) {
    case "text":
      if (typeof value !== "string") {
        throw new InputError("INVALID_INPUT", `${key} must be a string`);
      }
      return value;
    case "uuid":
      if (typeof value !== "string" || !RE_UUID.test(value)) {
        throw new InputError("INVALID_INPUT", `${key} must be a UUID string`);
      }
      return value.toLowerCase();
    case "jsonb":
      canonicalizeJCS(value); // proves JSON-serializability; throws JcsTypeError otherwise
      return value;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new InputError("INVALID_INPUT", `${key} must be an integer`);
      }
      return value;
    case "timestamptz":
      if (typeof value !== "string" || !RE_TIMESTAMPTZ.test(value)) {
        throw new InputError(
          "INVALID_INPUT",
          `${key} must be an ISO-8601 timestamp string`,
        );
      }
      return value;
    case "sha256hex":
      if (typeof value !== "string" || !RE_SHA256.test(value)) {
        throw new InputError(
          "INVALID_INPUT",
          `${key} must be a lowercase 64-char sha256 hex string`,
        );
      }
      return value;
    default:
      throw new InputError("INTERNAL", "unknown parameter type");
  }
}

/** Validate request params against the operation contract (strict, fail-closed). */
export function validateParams(
  op: OperationSpec,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const clientSpecs = op.params.filter((p) => p.kind === "client");
  const accepted = new Set(clientSpecs.map((p) => p.key!));
  for (const k of Object.keys(params)) {
    if (FORBIDDEN_CLIENT_FIELDS.has(k) && !accepted.has(k)) {
      throw new InputError("IDENTITY_FIELD_REJECTED", `forbidden field ${k}`);
    }
    if (!accepted.has(k)) {
      throw new InputError("UNKNOWN_PARAM", `unknown parameter ${k}`);
    }
  }
  const out: Record<string, unknown> = {};
  for (const spec of clientSpecs) {
    out[spec.key!] = validateClientValue(
      spec.type!,
      spec.key!,
      params[spec.key!],
      spec.required!,
    );
  }
  return out;
}

export interface BuiltArgs {
  args: unknown[];
  fingerprint: string;
}

/**
 * Build the exact positional argument array for the canonical call.
 * `params` MUST already have passed validateParams.
 */
export async function buildCanonicalArgs(
  operation: OperationName,
  params: Record<string, unknown>,
  runId: string,
): Promise<BuiltArgs> {
  const op = OPERATIONS[operation];
  const canonicalCache = new Map<string, string>();
  const hashCache = new Map<string, string>();
  const args: unknown[] = [];
  for (const spec of op.params) {
    switch (spec.kind) {
      case "client":
        args.push(params[spec.key!] ?? null);
        break;
      case "canon": {
        const payloadKey = spec.of!.slice(2); // p_x -> x
        let c = canonicalCache.get(spec.of!);
        if (c === undefined) {
          c = canonicalizeJCS(params[payloadKey]);
          canonicalCache.set(spec.of!, c);
        }
        args.push(c);
        break;
      }
      case "hash": {
        const payloadKey = spec.of!.slice(2);
        let h = hashCache.get(spec.of!);
        if (h === undefined) {
          h = await sha256Hex(canonicalBytesJCS(params[payloadKey]));
          hashCache.set(spec.of!, h);
        }
        args.push(h);
        break;
      }
      case "run":
        args.push(runId);
        break;
    }
  }
  if (args.length !== op.arity) {
    throw new InputError("INTERNAL", "argument arity mismatch");
  }
  // Every op's primary receipt field is a server-computed hash (verified in tests).
  const primaryIdx = op.params.findIndex((p) =>
    p.name === op.primary && p.kind === "hash"
  );
  if (primaryIdx < 0) {
    throw new InputError("INTERNAL", "primary fingerprint spec missing");
  }
  const fingerprint = args[primaryIdx] as string;
  return { args, fingerprint };
}
