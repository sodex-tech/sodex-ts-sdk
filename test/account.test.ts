/**
 * Unit tests for the batched issue 6–9 fixes:
 *   - parseFeeRate
 *   - parseSpotBalances / parsePerpsBalances
 *   - parsePerpsPosition
 *   - parseBatchOrderReceipt / parseBatchCancelReceipt
 */
import { describe, expect, it } from "vitest";
import {
  parseBatchCancelReceipt,
  parseBatchOrderReceipt,
  parseFeeRate,
} from "../src/common/types";
import { parsePerpsBalances, parsePerpsPosition } from "../src/perps/client";
import { parseSpotBalances } from "../src/spot/client";

describe("parseFeeRate", () => {
  function full(): Record<string, unknown> {
    return {
      makerFeeRate: "0.0001",
      takerFeeRate: "0.0005",
      feeTier: 0,
      stakingTier: 0,
      makerRebateTier: 0,
    };
  }

  it("maps a complete wire record", () => {
    expect(parseFeeRate(full())).toEqual({
      makerFeeRate: "0.0001",
      takerFeeRate: "0.0005",
      feeTier: 0,
      stakingTier: 0,
      makerRebateTier: 0,
    });
  });

  it.each([
    "makerFeeRate",
    "takerFeeRate",
    "feeTier",
    "stakingTier",
    "makerRebateTier",
  ] as const)("throws when required field `%s` is missing", (key) => {
    const raw = full();
    delete raw[key];
    expect(() => parseFeeRate(raw)).toThrow(
      new RegExp(`missing required field \\\`${key}\\\``),
    );
  });

  it("does not conflate `null` with tier 0", () => {
    expect(() => parseFeeRate({ ...full(), feeTier: null })).toThrow(
      /missing required field `feeTier`/,
    );
  });
});

describe("parseSpotBalances", () => {
  function full(): Record<string, unknown> {
    // sodex-docs/rest-v1/schema.md#spotaccountbalances
    return {
      blockTime: 1_700_000_000_000n,
      blockHeight: 100n,
      balances: [{ id: 1n, coin: "vUSDC", total: "1000", locked: "50" }],
    };
  }

  it("maps a complete wire record and renames inner `id` → `coinId`", () => {
    expect(parseSpotBalances(full())).toEqual({
      blockTime: 1_700_000_000_000n,
      blockHeight: 100n,
      balances: [{ coinId: 1n, coin: "vUSDC", total: "1000", locked: "50" }],
    });
  });

  it.each(["blockTime", "blockHeight", "balances"] as const)(
    "throws when envelope field `%s` is missing",
    (key) => {
      const raw = full();
      delete raw[key];
      expect(() => parseSpotBalances(raw)).toThrow(
        new RegExp(`missing required field \\\`${key}\\\``),
      );
    },
  );

  it.each(["id", "coin", "total", "locked"] as const)(
    "throws when inner balance field `%s` is missing",
    (key) => {
      const bal: Record<string, unknown> = {
        id: 1n,
        coin: "vUSDC",
        total: "1",
        locked: "0",
      };
      delete bal[key];
      expect(() =>
        parseSpotBalances({
          blockTime: 1n,
          blockHeight: 1n,
          balances: [bal],
        }),
      ).toThrow(new RegExp(`missing required field \\\`${key}\\\``));
    },
  );

  it("rejects the pre-fix invented `available` field as non-actionable", () => {
    // `available` never existed on the wire; feeding it (without `locked`)
    // must not silently succeed.
    expect(() =>
      parseSpotBalances({
        blockTime: 1n,
        blockHeight: 1n,
        balances: [{ id: 1n, coin: "X", total: "1", available: "1" }],
      }),
    ).toThrow(/missing required field `locked`/);
  });
});

describe("parsePerpsBalances", () => {
  function full(): Record<string, unknown> {
    return {
      blockTime: 1_700_000_000_000n,
      blockHeight: 100n,
      balances: [
        { id: 1n, coin: "vUSDC", total: "1000", marginRatio: "0.1", price: "1" },
      ],
    };
  }

  it("maps a complete wire record including optional `price`", () => {
    expect(parsePerpsBalances(full())).toEqual({
      blockTime: 1_700_000_000_000n,
      blockHeight: 100n,
      balances: [
        {
          coinId: 1n,
          coin: "vUSDC",
          total: "1000",
          marginRatio: "0.1",
          price: "1",
        },
      ],
    });
  });

  it("leaves `price` undefined when absent", () => {
    const bal = parsePerpsBalances({
      blockTime: 1n,
      blockHeight: 1n,
      balances: [{ id: 1n, coin: "X", total: "1", marginRatio: "0" }],
    });
    expect(bal.balances[0]!.price).toBeUndefined();
  });

  it.each(["id", "coin", "total", "marginRatio"] as const)(
    "throws when inner balance required field `%s` is missing",
    (key) => {
      const bal: Record<string, unknown> = {
        id: 1n,
        coin: "X",
        total: "1",
        marginRatio: "0",
      };
      delete bal[key];
      expect(() =>
        parsePerpsBalances({
          blockTime: 1n,
          blockHeight: 1n,
          balances: [bal],
        }),
      ).toThrow(new RegExp(`missing required field \\\`${key}\\\``));
    },
  );
});

describe("parsePerpsPosition", () => {
  function full(): Record<string, unknown> {
    // sodex-docs/rest-v1/schema.md#position — all 19 fields required.
    return {
      id: 42n,
      symbol: "BTC-USD",
      marginMode: "CROSS",
      side: "BOTH",
      size: "0.1",
      initialMargin: "100",
      avgEntryPrice: "50000",
      cumOpenCost: "5000",
      cumTradingFee: "0.5",
      cumClosedSize: "0",
      avgClosePrice: "0",
      maxSize: "0.1",
      realizedPnL: "0",
      leverage: 10,
      active: true,
      isTakenOver: false,
      takeOverPrice: "0",
      createdAt: 1_700_000_000_000n,
      updatedAt: 1_700_000_000_000n,
    };
  }

  it("maps a complete wire record", () => {
    const p = parsePerpsPosition(full());
    expect(p.id).toBe(42n);
    expect(p.realizedPnL).toBe("0");
    expect(p.active).toBe(true);
    expect(p.isTakenOver).toBe(false);
  });

  it.each(["active", "isTakenOver"] as const)(
    "throws when boolean field `%s` is a number instead of bool",
    (key) => {
      expect(() => parsePerpsPosition({ ...full(), [key]: 1 })).toThrow(
        new RegExp(`\\\`${key}\\\` must be a boolean, got number`),
      );
    },
  );

  it("no longer accepts the dead `realizedPnl` camelCase alias", () => {
    // docs only ever use `realizedPnL` — feeding the lowercase variant
    // should not satisfy the required-field check.
    const raw = full();
    delete raw.realizedPnL;
    raw.realizedPnl = "0";
    expect(() => parsePerpsPosition(raw)).toThrow(
      /missing required field `realizedPnL`/,
    );
  });
});

describe("parseBatchOrderReceipt", () => {
  it("maps a success receipt (code=0, orderID present, no error)", () => {
    expect(parseBatchOrderReceipt({ code: 0, clOrdID: "cl-1", orderID: 99n })).toEqual({
      code: 0,
      clOrdID: "cl-1",
      orderID: 99n,
      error: undefined,
    });
  });

  it("maps a failure receipt (code!=0, error present, no orderID)", () => {
    expect(
      parseBatchOrderReceipt({ code: 40000, clOrdID: "cl-1", error: "rejected" }),
    ).toEqual({
      code: 40000,
      clOrdID: "cl-1",
      orderID: undefined,
      error: "rejected",
    });
  });

  it("throws when required `code` is missing — cannot conflate with code 0", () => {
    expect(() => parseBatchOrderReceipt({ clOrdID: "cl-1" })).toThrow(
      /missing required field `code`/,
    );
  });

  it("throws when required `clOrdID` is missing", () => {
    expect(() => parseBatchOrderReceipt({ code: 0 })).toThrow(
      /missing required field `clOrdID`/,
    );
  });
});

describe("parseBatchCancelReceipt", () => {
  it("extends BatchOrderReceipt with optional origClOrdID", () => {
    const r = parseBatchCancelReceipt({
      code: 0,
      clOrdID: "cl-1",
      orderID: 99n,
      origClOrdID: "orig-1",
    });
    expect(r.origClOrdID).toBe("orig-1");
  });

  it("leaves origClOrdID undefined when absent", () => {
    const r = parseBatchCancelReceipt({ code: 0, clOrdID: "cl-1" });
    expect(r.origClOrdID).toBeUndefined();
  });
});
