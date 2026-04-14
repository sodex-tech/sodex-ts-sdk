/**
 * Canonical JSON serializer for signature payloads.
 *
 * Differences from `JSON.stringify`:
 *   - `bigint` emitted as JSON number literals (matches Go `encoding/json`).
 *   - `undefined` at object keys is omitted (Go `omitempty`).
 *   - Object keys serialized in insertion order — builders MUST match Go struct
 *     field order or signature verification will fail.
 */
export function canonicalStringify(value: unknown): string {
  if (value === undefined) {
    throw new TypeError("canonicalStringify: root value is undefined");
  }
  return encode(value);
}

function encode(v: unknown): string {
  if (v === null) return "null";

  switch (typeof v) {
    case "bigint":
      return v.toString(10);
    case "number":
      if (!Number.isFinite(v)) {
        throw new TypeError(`canonicalStringify: non-finite number ${v}`);
      }
      return JSON.stringify(v);
    case "boolean":
      return v ? "true" : "false";
    case "string":
      return JSON.stringify(v);
    case "object":
      return Array.isArray(v) ? encodeArray(v) : encodeObject(v as Record<string, unknown>);
    default:
      throw new TypeError(`canonicalStringify: unsupported type ${typeof v}`);
  }
}

function encodeArray(arr: unknown[]): string {
  const parts: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item === undefined) {
      throw new TypeError(`canonicalStringify: undefined at array index ${i}`);
    }
    parts.push(encode(item));
  }
  return `[${parts.join(",")}]`;
}

function encodeObject(obj: object): string {
  const parts: string[] = [];
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val === undefined) continue; // omitempty
    parts.push(`${JSON.stringify(key)}:${encode(val)}`);
  }
  return `{${parts.join(",")}}`;
}
