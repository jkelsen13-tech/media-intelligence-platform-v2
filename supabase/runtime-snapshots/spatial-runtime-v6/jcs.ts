// RFC 8785 (JSON Canonicalization Scheme) — self-contained implementation.
// Deterministic serialization: object keys sorted by UTF-16 code units,
// minimal string escaping, ECMAScript number-to-JSON for numbers, UTF-8 output.
// Rejects values that are not JSON-serializable.

export class JcsTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JcsTypeError";
  }
}

const ESCAPES: Record<number, string> = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
  0x22: '\\"',
  0x5c: "\\\\",
};

function serializeString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ESCAPES[code] !== undefined) {
      out += ESCAPES[code];
    } else if (code < 0x20) {
      out += "\\u" + code.toString(16).padStart(4, "0");
    } else {
      out += ch;
    }
  }
  return out + '"';
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new JcsTypeError("non-finite numbers are not valid JSON");
  }
  // JSON.stringify implements the ECMAScript Number-to-String conversion
  // required by RFC 8785 (including -0 -> "0" and exponential form >= 1e21).
  return JSON.stringify(n);
}

export function canonicalizeJCS(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value);
    case "string":
      return serializeString(value);
    case "object": {
      if (Array.isArray(value)) {
        return "[" + value.map((v) => canonicalizeJCS(v)).join(",") + "]";
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
      const parts = keys.map((k) => {
        const v = obj[k];
        if (typeof v === "function" || typeof v === "symbol") {
          throw new JcsTypeError("non-JSON value in object");
        }
        return serializeString(k) + ":" + canonicalizeJCS(v);
      });
      return "{" + parts.join(",") + "}";
    }
    default:
      throw new JcsTypeError(`type ${typeof value} is not valid JSON`);
  }
}

/** Canonical UTF-8 bytes of the JCS serialization. */
export function canonicalBytesJCS(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeJCS(value));
}
