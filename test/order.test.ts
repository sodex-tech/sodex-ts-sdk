import { describe, expect, it } from "vitest";
import { parsePerpsOrder } from "../src/perps/client";
import { parseSpotOrder } from "../src/spot/client";

const SPOT_REQUIRED = [
  "orderID",
  "symbol",
  "side",
  "type",
  "status",
  "executedQty",
  "executedValue",
  "marginFrozen",
] as const;

const PERPS_REQUIRED = [
  ...SPOT_REQUIRED,
  "positionSide",
  "reduceOnly",
] as const;

function spotFull(): Record<string, unknown> {
  return {
    orderID: 42n,
    symbol: "vBTC_vUSDC",
    side: "BUY",
    type: "LIMIT",
    status: "NEW",
    executedQty: "0",
    executedValue: "0",
    marginFrozen: "500",
    clOrdID: "cl-1",
    timeInForce: "GTC",
    price: "50000",
    origQty: "0.01",
    createdAt: 1_700_000_000_000n,
    updatedAt: 1_700_000_000_000n,
  };
}

function perpsFull(): Record<string, unknown> {
  return {
    ...spotFull(),
    positionSide: "BOTH",
    reduceOnly: false,
  };
}

describe("parseSpotOrder", () => {
  it("maps a complete spec-shaped SpotOrder", () => {
    const order = parseSpotOrder(spotFull());
    expect(order).toEqual({
      orderID: 42n,
      symbol: "vBTC_vUSDC",
      side: "BUY",
      type: "LIMIT",
      status: "NEW",
      executedQty: "0",
      executedValue: "0",
      marginFrozen: "500",
      clOrdID: "cl-1",
      timeInForce: "GTC",
      price: "50000",
      origQty: "0.01",
      funds: undefined,
      createdAt: 1_700_000_000_000n,
      updatedAt: 1_700_000_000_000n,
    });
  });

  it("keeps optional fields undefined when absent", () => {
    const minimal = {
      orderID: 1n,
      symbol: "X",
      side: "BUY",
      type: "MARKET",
      status: "FILLED",
      executedQty: "1",
      executedValue: "1",
      marginFrozen: "0",
    };
    const order = parseSpotOrder(minimal);
    expect(order.price).toBeUndefined();
    expect(order.origQty).toBeUndefined();
    expect(order.funds).toBeUndefined();
    expect(order.clOrdID).toBeUndefined();
    expect(order.timeInForce).toBeUndefined();
    expect(order.createdAt).toBeUndefined();
    expect(order.updatedAt).toBeUndefined();
  });

  it.each(SPOT_REQUIRED)("throws when required field `%s` is missing", (key) => {
    const raw = spotFull();
    delete raw[key];
    expect(() => parseSpotOrder(raw)).toThrow(
      new RegExp(`missing required field \\\`${key}\\\``),
    );
  });

  it("rejects the pre-fix verbose field names", () => {
    // Before the rewrite, the parser read `quantity`, `cumQuoteQty`,
    // `createTime`, `updateTime` — none of which exist on the wire.
    expect(() =>
      parseSpotOrder({
        orderID: 1n,
        symbol: "X",
        side: "BUY",
        type: "MARKET",
        status: "FILLED",
        quantity: "1",
        cumQuoteQty: "1",
        createTime: 1n,
        updateTime: 1n,
      }),
    ).toThrow(/missing required field `executedQty`/);
  });
});

describe("parsePerpsOrder", () => {
  it("maps a complete spec-shaped PerpsOrder with perps-only fields", () => {
    const raw = {
      ...perpsFull(),
      stopPrice: "49000",
      stopType: "STOP_LOSS",
      triggerType: "LAST",
      positionID: 99n,
      primaryOrderID: 41n,
      attachedOrderIDs: [43n, 44n],
    };
    const order = parsePerpsOrder(raw);
    expect(order.stopPrice).toBe("49000");
    expect(order.stopType).toBe("STOP_LOSS");
    expect(order.triggerType).toBe("LAST");
    expect(order.positionID).toBe(99n);
    expect(order.primaryOrderID).toBe(41n);
    expect(order.attachedOrderIDs).toEqual([43n, 44n]);
  });

  it("keeps perps-only optional fields undefined when absent", () => {
    const order = parsePerpsOrder(perpsFull());
    expect(order.stopPrice).toBeUndefined();
    expect(order.stopType).toBeUndefined();
    expect(order.triggerType).toBeUndefined();
    expect(order.positionID).toBeUndefined();
    expect(order.primaryOrderID).toBeUndefined();
    expect(order.attachedOrderIDs).toBeUndefined();
  });

  it.each(PERPS_REQUIRED)(
    "throws when required field `%s` is missing",
    (key) => {
      const raw = perpsFull();
      delete raw[key];
      expect(() => parsePerpsOrder(raw)).toThrow(
        new RegExp(`missing required field \\\`${key}\\\``),
      );
    },
  );

  it("throws when attachedOrderIDs is present but not an array", () => {
    expect(() =>
      parsePerpsOrder({ ...perpsFull(), attachedOrderIDs: "nope" }),
    ).toThrow(/`attachedOrderIDs` must be an array of uint64/);
  });
});
