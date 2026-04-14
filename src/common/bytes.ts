const HEX_CHARS = "0123456789abcdef";

export function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += HEX_CHARS[b >> 4];
    out += HEX_CHARS[b & 0x0f];
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = hexNibble(h.charCodeAt(i * 2));
    const lo = hexNibble(h.charCodeAt(i * 2 + 1));
    out[i] = (hi << 4) | lo;
  }
  return out;
}

function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 102) return code - 87; // a-f
  if (code >= 65 && code <= 70) return code - 55; // A-F
  throw new Error(`hexToBytes: invalid hex char code ${code}`);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function uint256BE(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0 && v > 0n; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function leftPad(bytes: Uint8Array, size: number): Uint8Array {
  if (bytes.length > size) throw new Error(`leftPad: input longer than ${size}`);
  if (bytes.length === size) return bytes;
  const out = new Uint8Array(size);
  out.set(bytes, size - bytes.length);
  return out;
}

const textEncoder = new TextEncoder();
export function utf8(s: string): Uint8Array {
  return textEncoder.encode(s);
}
