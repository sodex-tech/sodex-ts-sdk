import { describe, expect, it } from "vitest";
import { parseOrderBook } from "../src/common/types";

describe("parseOrderBook", () => {
  it("maps the REST OrderBook wire shape exactly", () => {
    // Verified against a live mainnet response from
    // `GET /markets/vBTC_vUSDC/orderbook?limit=1`.
    const raw = {
      blockTime: 1776265847349n,
      blockHeight: 129584211n,
      updateID: 970185093n,
      bids: [["73985", "0.00126"]],
      asks: [["73989", "0.00329"]],
    };
    const book = parseOrderBook(raw, { symbol: "vBTC_vUSDC" });
    expect(book).toEqual({
      symbol: "vBTC_vUSDC",
      updateID: 970185093n,
      blockTime: 1776265847349n,
      blockHeight: 129584211n,
      bids: [{ price: "73985", size: "0.00126" }],
      asks: [{ price: "73989", size: "0.00329" }],
    });
  });

  it.each(["updateID", "blockTime", "blockHeight", "bids", "asks"] as const)(
    "throws when required field `%s` is missing",
    (missing) => {
      const full: Record<string, unknown> = {
        updateID: 1n,
        blockTime: 1n,
        blockHeight: 1n,
        bids: [],
        asks: [],
      };
      delete full[missing];
      expect(() => parseOrderBook(full, { symbol: "X" })).toThrow(
        new RegExp(`missing required field \\\`${missing}\\\``),
      );
    },
  );

  it("throws on levels that are not length-2 tuples", () => {
    // A 3-tuple is schema drift we want to surface, not silently ignore.
    expect(() =>
      parseOrderBook(
        {
          updateID: 1n,
          blockTime: 1n,
          blockHeight: 1n,
          bids: [["100", "1", "extra"]],
          asks: [],
        },
        { symbol: "X" },
      ),
    ).toThrow(/bids\[0\] must be a \[price, size\] tuple/);

    expect(() =>
      parseOrderBook(
        {
          updateID: 1n,
          blockTime: 1n,
          blockHeight: 1n,
          bids: [],
          asks: [{ price: "100", size: "1" }],
        },
        { symbol: "X" },
      ),
    ).toThrow(/asks\[0\] must be a \[price, size\] tuple/);
  });

  it("throws when bids/asks is not an array", () => {
    expect(() =>
      parseOrderBook(
        { updateID: 1n, blockTime: 1n, blockHeight: 1n, bids: "oops", asks: [] },
        { symbol: "X" },
      ),
    ).toThrow(/`bids` must be an array/);
  });
});
