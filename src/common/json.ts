/**
 * BigInt-preserving JSON parser. JSON integers are emitted as `bigint` (not
 * IEEE-754 doubles) so uint64 fields like `orderID` / `accountID` are not
 * silently rounded. Fractional numbers remain `number`.
 */
export function parseJsonBigInt(text: string): unknown {
  const p = new Parser(text);
  const value = p.readValue();
  p.skipWs();
  if (p.pos !== p.src.length) p.fail("trailing data");
  return value;
}

class Parser {
  pos = 0;
  constructor(readonly src: string) {}

  readValue(): unknown {
    this.skipWs();
    const c = this.src.charCodeAt(this.pos);
    switch (c) {
      case 0x7b: // '{'
        return this.readObject();
      case 0x5b: // '['
        return this.readArray();
      case 0x22: // '"'
        return this.readString();
      case 0x74: // 't'
      case 0x66: // 'f'
        return this.readBool();
      case 0x6e: // 'n'
        return this.readNull();
      default:
        if (c === 0x2d || (c >= 0x30 && c <= 0x39)) return this.readNumber();
        this.fail(`unexpected character ${JSON.stringify(this.src[this.pos] ?? "<EOF>")}`);
    }
  }

  readObject(): Record<string, unknown> {
    this.pos++; // {
    const out: Record<string, unknown> = Object.create(null);
    this.skipWs();
    if (this.src.charCodeAt(this.pos) === 0x7d) {
      this.pos++;
      return out;
    }
    while (true) {
      this.skipWs();
      if (this.src.charCodeAt(this.pos) !== 0x22) this.fail("expected string key");
      const key = this.readString();
      this.skipWs();
      if (this.src.charCodeAt(this.pos) !== 0x3a) this.fail("expected ':'");
      this.pos++;
      const value = this.readValue();
      out[key] = value;
      this.skipWs();
      const next = this.src.charCodeAt(this.pos);
      if (next === 0x2c) {
        this.pos++;
        continue;
      }
      if (next === 0x7d) {
        this.pos++;
        return out;
      }
      this.fail("expected ',' or '}'");
    }
  }

  readArray(): unknown[] {
    this.pos++; // [
    const out: unknown[] = [];
    this.skipWs();
    if (this.src.charCodeAt(this.pos) === 0x5d) {
      this.pos++;
      return out;
    }
    while (true) {
      out.push(this.readValue());
      this.skipWs();
      const next = this.src.charCodeAt(this.pos);
      if (next === 0x2c) {
        this.pos++;
        continue;
      }
      if (next === 0x5d) {
        this.pos++;
        return out;
      }
      this.fail("expected ',' or ']'");
    }
  }

  readString(): string {
    if (this.src.charCodeAt(this.pos) !== 0x22) this.fail("expected '\"'");
    this.pos++;
    let out = "";
    while (true) {
      if (this.pos >= this.src.length) this.fail("unterminated string");
      const c = this.src.charCodeAt(this.pos);
      if (c === 0x22) {
        this.pos++;
        return out;
      }
      if (c === 0x5c) {
        this.pos++;
        const esc = this.src[this.pos++];
        switch (esc) {
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "/":
            out += "/";
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            const hex = this.src.substr(this.pos, 4);
            if (hex.length !== 4 || /[^0-9a-fA-F]/.test(hex)) this.fail("bad \\u escape");
            this.pos += 4;
            out += String.fromCharCode(Number.parseInt(hex, 16));
            break;
          }
          default:
            this.fail(`bad escape \\${esc}`);
        }
      } else {
        out += this.src[this.pos++];
      }
    }
  }

  readNumber(): number | bigint {
    const start = this.pos;
    if (this.src.charCodeAt(this.pos) === 0x2d) this.pos++;
    while (this.isDigit(this.src.charCodeAt(this.pos))) this.pos++;
    let isFloat = false;
    if (this.src.charCodeAt(this.pos) === 0x2e) {
      isFloat = true;
      this.pos++;
      while (this.isDigit(this.src.charCodeAt(this.pos))) this.pos++;
    }
    const ec = this.src.charCodeAt(this.pos);
    if (ec === 0x65 || ec === 0x45) {
      isFloat = true;
      this.pos++;
      const sign = this.src.charCodeAt(this.pos);
      if (sign === 0x2b || sign === 0x2d) this.pos++;
      while (this.isDigit(this.src.charCodeAt(this.pos))) this.pos++;
    }
    const raw = this.src.slice(start, this.pos);
    if (raw.length === 0 || raw === "-") this.fail("invalid number");
    return isFloat ? Number(raw) : BigInt(raw);
  }

  readBool(): boolean {
    if (this.src.startsWith("true", this.pos)) {
      this.pos += 4;
      return true;
    }
    if (this.src.startsWith("false", this.pos)) {
      this.pos += 5;
      return false;
    }
    this.fail("invalid literal");
  }

  readNull(): null {
    if (this.src.startsWith("null", this.pos)) {
      this.pos += 4;
      return null;
    }
    this.fail("invalid literal");
  }

  skipWs(): void {
    while (this.pos < this.src.length) {
      const c = this.src.charCodeAt(this.pos);
      if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) this.pos++;
      else break;
    }
  }

  isDigit(c: number): boolean {
    return c >= 0x30 && c <= 0x39;
  }

  fail(msg: string): never {
    throw new SyntaxError(`parseJsonBigInt: ${msg} at position ${this.pos + 1}`);
  }
}
