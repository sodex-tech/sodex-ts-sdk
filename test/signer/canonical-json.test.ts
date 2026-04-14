import { describe, expect, it } from "vitest";
import { canonicalStringify } from "../../src/common/canonical-json";

describe("canonicalStringify", () => {
  it("preserves object key insertion order", () => {
    // Signature verification on the server hashes the JSON bytes, so builders
    // must emit keys in the exact order of the Go struct.
    const payload = {
      accountID: 1001n,
      symbolID: 42n,
      clOrdID: "order-1",
      side: 1,
      type: 1,
      timeInForce: 1,
      price: "50000",
      quantity: "0.1",
    };
    expect(canonicalStringify(payload)).toBe(
      '{"accountID":1001,"symbolID":42,"clOrdID":"order-1","side":1,"type":1,"timeInForce":1,"price":"50000","quantity":"0.1"}',
    );
  });

  it("emits bigint as unquoted JSON number", () => {
    expect(canonicalStringify({ n: 1000000000000n })).toBe('{"n":1000000000000}');
  });

  it("omits undefined properties (omitempty)", () => {
    expect(canonicalStringify({ a: 1, b: undefined, c: "x" })).toBe('{"a":1,"c":"x"}');
  });

  it("keeps non-omitempty zero-valued fields", () => {
    // reduceOnly=false must not be omitted (Go field has no `omitempty`).
    expect(canonicalStringify({ reduceOnly: false, positionSide: 1 })).toBe(
      '{"reduceOnly":false,"positionSide":1}',
    );
  });

  it("serializes arrays in order and rejects undefined elements", () => {
    expect(canonicalStringify({ orders: [{ a: 1n }, { a: 2n }] })).toBe(
      '{"orders":[{"a":1},{"a":2}]}',
    );
    expect(() => canonicalStringify([1, undefined, 2])).toThrow(/undefined at array/);
  });

  it("preserves null explicitly", () => {
    expect(canonicalStringify({ a: null })).toBe('{"a":null}');
  });

  it("rejects non-finite numbers and root undefined", () => {
    expect(() => canonicalStringify({ x: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalStringify({ x: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => canonicalStringify(undefined)).toThrow(/root value is undefined/);
  });

  it("serializes class instances and null-prototype objects by their own enumerable keys", () => {
    // Date and Uint8Array have no enumerable own-keys, so they serialize to {}.
    expect(canonicalStringify({ t: new Date() })).toBe('{"t":{}}');
    // Class instances expose own enumerable fields.
    class Custom {
      x = 1;
    }
    expect(canonicalStringify({ c: new Custom() })).toBe('{"c":{"x":1}}');
    // null-prototype objects (from parseJsonBigInt) are first-class.
    const o = Object.create(null);
    o.a = 1n;
    expect(canonicalStringify({ wrap: o })).toBe('{"wrap":{"a":1}}');
  });

  it("matches the example payload from the docs", () => {
    // Example from docs/README.md §"How to compute payloadHash":
    //   perps market buy order signing payload (with the ActionPayload envelope).
    const payload = {
      type: "newOrder",
      params: {
        accountID: 12345n,
        symbolID: 1n,
        orders: [
          {
            clOrdID: "my-order-1",
            modifier: 1,
            side: 1,
            type: 2,
            timeInForce: 3,
            quantity: "0.001",
            reduceOnly: false,
            positionSide: 1,
          },
        ],
      },
    };
    expect(canonicalStringify(payload)).toBe(
      '{"type":"newOrder","params":{"accountID":12345,"symbolID":1,"orders":[{"clOrdID":"my-order-1","modifier":1,"side":1,"type":2,"timeInForce":3,"quantity":"0.001","reduceOnly":false,"positionSide":1}]}}',
    );
  });
});
