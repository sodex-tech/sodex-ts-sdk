import { describe, expect, it } from "vitest";
import { parseTrade } from "../src/common/types";

describe("parseTrade", () => {
  it("maps the REST Trade wire shape exactly", () => {
    // Exact wire shape from sodex-docs/rest-v1/schema.md#trade, verified
    // against a live mainnet response from `GET /markets/vBTC_vUSDC/trades`.
    // The HTTP layer (`parseJsonBigInt`) hands `uint64` fields in as bigints
    // to preserve precision beyond 2^53 — mirror that here.
    const raw = {
      t: 614733239369596992n,
      T: 1776265825408n,
      s: "vBTC_vUSDC",
      S: "SELL",
      p: "74002",
      q: "0.00009",
    };
    const trade = parseTrade(raw);
    expect(trade).toEqual({
      id: 614733239369596992n,
      time: 1776265825408n,
      symbol: "vBTC_vUSDC",
      side: "SELL",
      price: "74002",
      quantity: "0.00009",
      buyerAccountId: undefined,
      sellerAccountId: undefined,
    });
  });

  it("carries bi/si when present", () => {
    const trade = parseTrade({
      t: 1,
      T: 2,
      s: "X",
      S: "BUY",
      p: "1",
      q: "1",
      bi: 1001,
      si: 1002,
    });
    expect(trade.buyerAccountId).toBe(1001n);
    expect(trade.sellerAccountId).toBe(1002n);
  });

  it.each(["t", "T", "s", "S", "p", "q"] as const)(
    "throws when required field `%s` is missing",
    (missing) => {
      const full: Record<string, unknown> = {
        t: 1,
        T: 2,
        s: "X",
        S: "BUY",
        p: "1",
        q: "1",
      };
      delete full[missing];
      expect(() => parseTrade(full)).toThrow(
        new RegExp(`missing required field \\\`${missing}\\\``),
      );
    },
  );

  it("does not accept the pre-fix verbose field names", () => {
    // Before the rewrite, the parser read `raw.symbol`, `raw.id`, `raw.price`,
    // `raw.quantity`, `raw.time`, `raw.isBuyerMaker` — none of which exist on
    // the wire. That behavior is gone; feeding those fields should throw.
    expect(() =>
      parseTrade({
        id: 1,
        symbol: "X",
        price: "1",
        quantity: "1",
        time: 2,
        isBuyerMaker: false,
      }),
    ).toThrow(/missing required field `t`/);
  });
});
