import { describe, expect, it } from "vitest";
import { klineIntervalMs, parseKline } from "../src/common/types";

describe("parseKline", () => {
  it("maps the REST RPCKline wire shape exactly", () => {
    // Exactly the fields documented in sodex-docs/rest-v1/schema.md#rpckline.
    const raw = {
      t: 1_700_000_000_000,
      o: "50000",
      h: "50100",
      l: "49900",
      c: "50050",
      v: "1.23",
      q: "61560",
      n: 42,
    };
    const k = parseKline(raw, { symbol: "vBTC_vUSDC", interval: "1m" });
    expect(k).toEqual({
      symbol: "vBTC_vUSDC",
      interval: "1m",
      openTime: 1_700_000_000_000n,
      openPx: "50000",
      highPx: "50100",
      lowPx: "49900",
      closePx: "50050",
      volume: "1.23",
      quoteVolume: "61560",
      tradeCount: 42,
    });
  });

  it("leaves tradeCount undefined when the wire omits `n`", () => {
    // `n` is optional per spec — distinguish "unreported" from "zero trades".
    const k = parseKline(
      { t: 1n, o: "1", h: "1", l: "1", c: "1", v: "0", q: "0" },
      { symbol: "X", interval: "1m" },
    );
    expect(k.tradeCount).toBeUndefined();
  });

  it.each(["t", "o", "h", "l", "c", "v", "q"] as const)(
    "throws when required field `%s` is missing",
    (missing) => {
      const full: Record<string, unknown> = {
        t: 1,
        o: "1",
        h: "1",
        l: "1",
        c: "1",
        v: "0",
        q: "0",
      };
      delete full[missing];
      expect(() => parseKline(full, { symbol: "X", interval: "1m" })).toThrow(
        new RegExp(`missing required field \\\`${missing}\\\``),
      );
    },
  );

  it("rejects null wire values the same as missing ones", () => {
    expect(() =>
      parseKline(
        { t: 1, o: "1", h: "1", l: "1", c: "1", v: "0", q: null },
        { symbol: "X", interval: "1m" },
      ),
    ).toThrow(/missing required field `q`/);
  });

  it("does not accept verbose aliases or WS shape fields", () => {
    // `openTime` / `open` / `s` / `i` are not part of the REST RPCKline wire.
    // Feeding them should fail loudly rather than silently parsing.
    expect(() =>
      parseKline(
        {
          openTime: 1_700_000_000_000,
          open: "50000",
          high: "50100",
          low: "49900",
          close: "50050",
          volume: "1.23",
          quoteVolume: "61560",
          s: "BTC-USD",
          i: "1m",
        },
        { symbol: "vBTC_vUSDC", interval: "1m" },
      ),
    ).toThrow(/missing required field `t`/);
  });

  it("klineIntervalMs returns fixed durations and undefined for 1M", () => {
    expect(klineIntervalMs("1m")).toBe(60_000n);
    expect(klineIntervalMs("1h")).toBe(3_600_000n);
    expect(klineIntervalMs("1d")).toBe(86_400_000n);
    expect(klineIntervalMs("1w")).toBe(604_800_000n);
    expect(klineIntervalMs("1M")).toBeUndefined();
  });
});
