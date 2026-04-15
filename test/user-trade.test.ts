import { describe, expect, it } from "vitest";
import { parseUserTrade } from "../src/common/types";

function full(): Record<string, unknown> {
  // sodex-docs/rest-v1/schema.md#usertrade — required fields only.
  return {
    tradeID: 614733239369596992n,
    orderID: 12345n,
    clOrdID: "cl-1",
    symbol: "vBTC_vUSDC",
    side: "BUY",
    price: "50000",
    quantity: "0.01",
    time: 1_700_000_000_000n,
  };
}

describe("parseUserTrade", () => {
  it("maps required fields and leaves optionals undefined", () => {
    const t = parseUserTrade(full());
    expect(t).toEqual({
      id: 614733239369596992n,
      orderID: 12345n,
      clOrdID: "cl-1",
      symbol: "vBTC_vUSDC",
      side: "BUY",
      price: "50000",
      quantity: "0.01",
      time: 1_700_000_000_000n,
      fee: undefined,
      feeCoin: undefined,
      isMaker: undefined,
    });
  });

  it("maps optional fee/feeCoin/isMaker when present", () => {
    const t = parseUserTrade({
      ...full(),
      fee: "0.001",
      feeCoin: "USDC",
      isMaker: true,
    });
    expect(t.fee).toBe("0.001");
    expect(t.feeCoin).toBe("USDC");
    expect(t.isMaker).toBe(true);
  });

  it.each([
    "tradeID",
    "orderID",
    "clOrdID",
    "symbol",
    "side",
    "price",
    "quantity",
    "time",
  ] as const)("throws when required field `%s` is missing", (key) => {
    const raw = full();
    delete raw[key];
    expect(() => parseUserTrade(raw)).toThrow(
      new RegExp(`missing required field \\\`${key}\\\``),
    );
  });

  it("rejects the pre-fix verbose aliases (`id`, `timestamp`, `quoteQty`)", () => {
    // Before the rewrite, these camelCase/lowercase aliases were accepted
    // via `??` chains. None exist on the wire — feeding them should fail.
    expect(() =>
      parseUserTrade({
        id: 1n, // should be `tradeID`
        orderID: 1n,
        clOrdID: "c",
        symbol: "X",
        side: "BUY",
        price: "1",
        quantity: "1",
        time: 1n,
      }),
    ).toThrow(/missing required field `tradeID`/);

    expect(() =>
      parseUserTrade({
        ...full(),
        timestamp: 1n, // should be `time`
      }),
    ).not.toThrow(); // `time` is already present, `timestamp` is just extraneous — ignored silently, which is fine
  });

  it("throws when isMaker is present but not a boolean", () => {
    expect(() => parseUserTrade({ ...full(), isMaker: 1 })).toThrow(
      /`isMaker` must be a boolean, got number/,
    );
  });
});
