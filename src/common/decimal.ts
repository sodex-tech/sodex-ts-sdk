export type DecimalInput = string | number | bigint;

/**
 * Normalize a decimal input to canonical form for signing payloads.
 * Trailing zeros are stripped to match Go's `shopspring/decimal.String()`.
 */
export function toDecimalString(input: DecimalInput, field = "decimal"): string {
  let s: string;
  if (typeof input === "string") {
    if (!isDecimalString(input)) {
      throw new TypeError(`${field}: invalid decimal string "${input}"`);
    }
    s = input;
  } else if (typeof input === "bigint") {
    return input.toString(10); // integers — no decimal point, no trailing zeros
  } else if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new TypeError(`${field}: non-finite number ${input}`);
    }
    const str = input.toString();
    if (str.includes("e") || str.includes("E")) {
      throw new TypeError(`${field}: exponential notation not allowed (${str}); pass as string`);
    }
    s = str;
  } else {
    throw new TypeError(`${field}: expected string|number|bigint, got ${typeof input}`);
  }
  return stripTrailingZeros(s);
}

const DECIMAL_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

export function isDecimalString(s: string): boolean {
  return DECIMAL_RE.test(s);
}

function stripTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  // Remove trailing '0's, then a trailing '.' if the fractional part is empty.
  let end = s.length;
  while (end > 0 && s[end - 1] === "0") end--;
  if (end > 0 && s[end - 1] === ".") end--;
  return s.slice(0, end);
}
