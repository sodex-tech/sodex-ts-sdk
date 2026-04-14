import { describe, expect, it } from "vitest";
import { parseJsonBigInt } from "../../src/common/json";

describe("parseJsonBigInt", () => {
  it("parses integers beyond Number.MAX_SAFE_INTEGER without rounding", () => {
    const huge = "18446744073709551615"; // uint64 max
    const parsed = parseJsonBigInt(`{"orderID":${huge}}`);
    expect((parsed as any).orderID).toBe(18446744073709551615n);
  });

  it("emits small integers as bigint too (uniform type)", () => {
    expect(parseJsonBigInt("{\"n\":1}")).toEqual({ n: 1n });
  });

  it("emits floats and scientific numbers as number", () => {
    expect(parseJsonBigInt("1.5")).toBe(1.5);
    expect(parseJsonBigInt("1e2")).toBe(100);
    expect(parseJsonBigInt("-0.001")).toBe(-0.001);
  });

  it("handles nested arrays and objects in insertion order", () => {
    const v = parseJsonBigInt(
      '{"a":[1,2,{"b":"x","c":true}],"d":null,"e":false}',
    ) as any;
    expect(Object.keys(v)).toEqual(["a", "d", "e"]);
    expect(v.a).toEqual([1n, 2n, { b: "x", c: true }]);
    expect(v.d).toBeNull();
    expect(v.e).toBe(false);
  });

  it("parses escaped strings", () => {
    expect(parseJsonBigInt('"a\\nb\\t\\"c\\""')).toBe('a\nb\t"c"');
    expect(parseJsonBigInt('"\\u00e9"')).toBe("é");
  });

  it("rejects malformed input with a position", () => {
    expect(() => parseJsonBigInt("{foo:1}")).toThrow(/position/);
    expect(() => parseJsonBigInt("[1,]")).toThrow();
    expect(() => parseJsonBigInt("{\"k\":1,}")).toThrow();
  });

  it("round-trips typical exchange envelopes", () => {
    const text = '{"code":0,"timestamp":1767501757000,"data":{"orderID":99999999999999999}}';
    const v = parseJsonBigInt(text) as any;
    expect(v.code).toBe(0n);
    expect(v.timestamp).toBe(1767501757000n);
    expect(v.data.orderID).toBe(99999999999999999n);
  });

  it("ignores __proto__ keys to prevent prototype pollution", () => {
    const before = (Object.prototype as any).polluted;
    const parsed = parseJsonBigInt('{"__proto__":{"polluted":true},"ok":1}') as any;
    // Neither the returned object nor the global Object.prototype is mutated.
    expect((Object.prototype as any).polluted).toBe(before);
    expect(parsed.polluted).toBeUndefined();
    expect(parsed.ok).toBe(1n);
    // The parsed object itself is prototype-less so even copying through {...}
    // can't be abused via __proto__.
    expect(Object.getPrototypeOf(parsed)).toBeNull();
  });

  it("preserves constructor/prototype keys on null-prototype objects", () => {
    const parsed = parseJsonBigInt('{"constructor":1,"prototype":2,"good":3}') as any;
    // Object.create(null) means these are plain data keys, not prototype-chain hooks.
    expect(parsed.constructor).toBe(1n);
    expect(parsed.prototype).toBe(2n);
    expect(parsed.good).toBe(3n);
    expect(Object.getPrototypeOf(parsed)).toBeNull();
  });
});
