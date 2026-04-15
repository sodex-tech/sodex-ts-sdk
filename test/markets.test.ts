/**
 * Unit tests for 议题 10–12: ticker / symbol / coin / mark-price / funding
 * parsers. Wire shapes tracked by sodex-docs/rest-v1/schema.md.
 */
import { describe, expect, it } from "vitest";
import { parseBookTicker, parseMiniTicker } from "../src/common/types";
import {
  parseFunding,
  parseMarkPrice,
  parsePerpsCoin,
  parsePerpsSymbol,
  parsePerpsTicker,
} from "../src/perps/client";
import {
  parseSpotCoin,
  parseSpotSymbol,
  parseSpotTicker,
} from "../src/spot/client";

// -- BookTicker ---------------------------------------------------------------

describe("parseBookTicker", () => {
  const full = () => ({
    symbol: "vBTC_vUSDC",
    bidPx: "74050",
    bidSz: "0.1",
    askPx: "74060",
    askSz: "0.2",
  });

  it("maps all 5 required fields", () => {
    expect(parseBookTicker(full())).toEqual(full());
  });

  it.each(["symbol", "bidPx", "bidSz", "askPx", "askSz"] as const)(
    "throws when `%s` missing",
    (k) => {
      const r = full() as Record<string, unknown>;
      delete r[k];
      expect(() => parseBookTicker(r)).toThrow(
        new RegExp(`missing required field \\\`${k}\\\``),
      );
    },
  );
});

// -- MiniTicker --------------------------------------------------------------

describe("parseMiniTicker", () => {
  const full = () => ({
    symbol: "vBTC_vUSDC",
    lastPx: "74050",
    openPx: "73000",
    highPx: "74500",
    lowPx: "72900",
    volume: "10",
    quoteVolume: "740000",
    openTime: 1_700_000_000_000n,
    closeTime: 1_700_000_086_399n,
  });

  it("maps all 9 required fields", () => {
    expect(parseMiniTicker(full())).toEqual(full());
  });

  it.each([
    "symbol",
    "lastPx",
    "openPx",
    "highPx",
    "lowPx",
    "volume",
    "quoteVolume",
    "openTime",
    "closeTime",
  ] as const)("throws when `%s` missing", (k) => {
    const r = full() as Record<string, unknown>;
    delete r[k];
    expect(() => parseMiniTicker(r)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

// -- MarkPriceTicker ----------------------------------------------------------

describe("parseMarkPrice", () => {
  const full = () => ({
    symbol: "BTC-USD",
    fundingRate: "0.0001",
    nextFundingTime: 1_700_000_000_000n,
    indexPrice: "74000",
    markPrice: "74010",
    openInterest: "100",
  });

  it("maps all 6 required fields", () => {
    expect(parseMarkPrice(full())).toEqual(full());
  });

  it.each([
    "symbol",
    "fundingRate",
    "nextFundingTime",
    "indexPrice",
    "markPrice",
    "openInterest",
  ] as const)("throws when `%s` missing", (k) => {
    const r = full() as Record<string, unknown>;
    delete r[k];
    expect(() => parseMarkPrice(r)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

// -- FundingPayment -----------------------------------------------------------

describe("parseFunding", () => {
  const full = () => ({
    symbol: "BTC-USD",
    positionID: 99n,
    positionSide: "BOTH",
    fundingFee: "-0.5",
    feeCoin: "vUSDC",
    timestamp: 1_700_000_000_000n,
  });

  it("maps all 6 required fields; surfaces wire `positionID` (not `positionId`)", () => {
    expect(parseFunding(full())).toEqual(full());
  });

  it("no longer accepts the dead `positionId` / `time` aliases", () => {
    expect(() =>
      parseFunding({
        symbol: "BTC-USD",
        positionId: 99n, // lowercase 'd' — not wire key
        positionSide: "BOTH",
        fundingFee: "0",
        feeCoin: "vUSDC",
        timestamp: 1n,
      }),
    ).toThrow(/missing required field `positionID`/);
  });

  it.each([
    "symbol",
    "positionID",
    "positionSide",
    "fundingFee",
    "feeCoin",
    "timestamp",
  ] as const)("throws when required `%s` missing", (k) => {
    const r = full() as Record<string, unknown>;
    delete r[k];
    expect(() => parseFunding(r)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

// -- SpotTicker ---------------------------------------------------------------

describe("parseSpotTicker", () => {
  const full = () => ({
    symbol: "vBTC_vUSDC",
    lastPx: "74000",
    openPx: "73000",
    highPx: "74500",
    lowPx: "72900",
    change: "1000",
    changePct: 1.37,
    volume: "10",
    quoteVolume: "740000",
    bidPx: "73990",
    bidSz: "0.1",
    askPx: "74010",
    askSz: "0.2",
    openTime: 1_700_000_000_000n,
    closeTime: 1_700_000_086_399n,
  });

  it("maps required fields; optionals (lastSz, vwap) → undefined", () => {
    const t = parseSpotTicker(full());
    expect(t.symbol).toBe("vBTC_vUSDC");
    expect(t.changePct).toBe(1.37);
    expect(t.lastSz).toBeUndefined();
    expect(t.vwap).toBeUndefined();
  });

  it("populates optionals when present", () => {
    const t = parseSpotTicker({ ...full(), lastSz: "0.5", vwap: "73500" });
    expect(t.lastSz).toBe("0.5");
    expect(t.vwap).toBe("73500");
  });

  it.each([
    "symbol",
    "lastPx",
    "openPx",
    "highPx",
    "lowPx",
    "change",
    "changePct",
    "volume",
    "quoteVolume",
    "bidPx",
    "bidSz",
    "askPx",
    "askSz",
    "openTime",
    "closeTime",
  ] as const)("throws when required `%s` missing", (k) => {
    const r = full() as Record<string, unknown>;
    delete r[k];
    expect(() => parseSpotTicker(r)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

// -- PerpsTicker --------------------------------------------------------------

describe("parsePerpsTicker", () => {
  const full = () => ({
    symbol: "BTC-USD",
    lastPx: "74000",
    openPx: "73000",
    highPx: "74500",
    lowPx: "72900",
    volume: "10",
    quoteVolume: "740000",
    bidPx: "73990",
    bidSz: "0.1",
    askPx: "74010",
    askSz: "0.2",
    fundingRate: "0.0001",
    nextFundingTime: 1_700_000_000_000n,
    indexPrice: "73950",
    markPrice: "73960",
    openInterest: "100",
    openTime: 1_700_000_000_000n,
    closeTime: 1_700_000_086_399n,
  });

  it("maps required; optional (lastSz, vwap, change, changePct) → undefined", () => {
    const t = parsePerpsTicker(full());
    expect(t.lastSz).toBeUndefined();
    expect(t.vwap).toBeUndefined();
    expect(t.change).toBeUndefined();
    expect(t.changePct).toBeUndefined();
  });

  it("populates optionals when present", () => {
    const t = parsePerpsTicker({ ...full(), lastSz: "0.5", vwap: "73500", change: "500", changePct: 0.68 });
    expect(t.changePct).toBe(0.68);
  });

  it.each([
    "symbol",
    "lastPx",
    "openPx",
    "highPx",
    "lowPx",
    "volume",
    "quoteVolume",
    "bidPx",
    "bidSz",
    "askPx",
    "askSz",
    "fundingRate",
    "nextFundingTime",
    "indexPrice",
    "markPrice",
    "openInterest",
    "openTime",
    "closeTime",
  ] as const)("throws when required `%s` missing", (k) => {
    const r = full() as Record<string, unknown>;
    delete r[k];
    expect(() => parsePerpsTicker(r)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

// -- SpotSymbol ---------------------------------------------------------------

describe("parseSpotSymbol", () => {
  function full(): Record<string, unknown> {
    return {
      id: 1n,
      name: "vBTC_vUSDC",
      displayName: "BTC/USDC",
      baseCoinID: 10n,
      quoteCoinID: 11n,
      pricePrecision: 2,
      tickSize: "0.01",
      minPrice: "0",
      maxPrice: "0",
      quantityPrecision: 5,
      stepSize: "0.00001",
      minQuantity: "0.00001",
      maxQuantity: "1000",
      marketMinQuantity: "0.00001",
      marketMaxQuantity: "500",
      minNotional: "10",
      maxNotional: "100000",
      buyLimitUpRatio: "0.05",
      sellLimitDownRatio: "0.05",
      marketDeviationRatio: "0.1",
      makerFee: "0.0001",
      takerFee: "0.0005",
      status: "TRADING",
    };
  }

  it("maps required fields; optional coin-denorm fields → undefined", () => {
    const s = parseSpotSymbol(full());
    expect(s.id).toBe(1n);
    expect(s.baseCoinId).toBe(10n);
    expect(s.quoteCoinId).toBe(11n);
    expect(s.status).toBe("TRADING");
    expect(s.baseCoin).toBeUndefined();
    expect(s.baseCoinPrecision).toBeUndefined();
    expect(s.quoteCoin).toBeUndefined();
    expect(s.quoteCoinPrecision).toBeUndefined();
  });

  it("populates optional coin fields when present", () => {
    const s = parseSpotSymbol({
      ...full(),
      baseCoin: "vBTC",
      baseCoinPrecision: 8,
      quoteCoin: "vUSDC",
      quoteCoinPrecision: 6,
    });
    expect(s.baseCoin).toBe("vBTC");
    expect(s.baseCoinPrecision).toBe(8);
    expect(s.quoteCoinPrecision).toBe(6);
  });

  it("throws when `baseCoinID` is missing (required)", () => {
    const r = full();
    delete r.baseCoinID;
    expect(() => parseSpotSymbol(r)).toThrow(/missing required field `baseCoinID`/);
  });
});

// -- PerpsSymbol --------------------------------------------------------------

describe("parsePerpsSymbol", () => {
  function full(): Record<string, unknown> {
    return {
      id: 1n,
      name: "BTC-USD",
      displayName: "BTC-USD",
      baseCoin: "BTC",
      quoteCoinID: 10n,
      quoteCoin: "vUSDC",
      quoteCoinPrecision: 6,
      pricePrecision: 1,
      tickSize: "0.1",
      minPrice: "0",
      maxPrice: "0",
      quantityPrecision: 5,
      stepSize: "0.00001",
      minQuantity: "0.00001",
      maxQuantity: "1000",
      marketMinQuantity: "0.00001",
      marketMaxQuantity: "500",
      minNotional: "10",
      maxNotional: "100000",
      buyLimitUpRatio: "0.05",
      sellLimitDownRatio: "0.05",
      marketDeviationRatio: "0.1",
      maxLeverage: 50,
      initLeverage: 10,
      marginTiers: [
        {
          maxNotionalValue: "1000000",
          maintenanceMarginRate: "0.1",
          maxLeverage: 50,
          maintenanceDeduction: "0",
        },
      ],
      fundingInterval: 3600,
      interestRate: "0.0001",
      maxFundingRate: "0.04",
      minFundingRate: "-0.04",
      makerFee: "0.0001",
      takerFee: "0.0005",
      status: "TRADING",
    };
  }

  it("maps required + MarginTier array; optional open-interest caps → undefined", () => {
    const s = parsePerpsSymbol(full());
    expect(s.marginTiers).toHaveLength(1);
    expect(s.marginTiers[0]!.maxLeverage).toBe(50);
    expect(s.openInterestCap).toBeUndefined();
    expect(s.openInterestCapUSD).toBeUndefined();
  });

  it("throws when marginTiers is not an array", () => {
    expect(() => parsePerpsSymbol({ ...full(), marginTiers: "nope" })).toThrow(
      /`marginTiers` must be an array/,
    );
  });

  it("throws when a nested margin tier is missing a required field", () => {
    expect(() =>
      parsePerpsSymbol({
        ...full(),
        marginTiers: [{ maxNotionalValue: "1", maintenanceMarginRate: "0.1", maxLeverage: 10 }],
      }),
    ).toThrow(/missing required field `maintenanceDeduction`/);
  });
});

// -- SpotCoin / PerpsCoin ---------------------------------------------------

describe("parseSpotCoin", () => {
  it("maps 3 required fields", () => {
    expect(parseSpotCoin({ id: 1n, name: "vBTC", precision: 8 })).toEqual({
      id: 1n,
      name: "vBTC",
      precision: 8,
    });
  });

  it.each(["id", "name", "precision"] as const)("throws when `%s` missing", (k) => {
    const r: Record<string, unknown> = { id: 1n, name: "x", precision: 1 };
    delete r[k];
    expect(() => parseSpotCoin(r)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

describe("parsePerpsCoin", () => {
  it("maps required; price → undefined when absent", () => {
    const c = parsePerpsCoin({ id: 1n, name: "vUSDC", precision: 6, marginRatio: "0.1" });
    expect(c.price).toBeUndefined();
  });

  it("populates price when present", () => {
    const c = parsePerpsCoin({
      id: 1n,
      name: "vBTC",
      precision: 8,
      marginRatio: "0.1",
      price: "74000",
    });
    expect(c.price).toBe("74000");
  });

  it.each(["id", "name", "precision", "marginRatio"] as const)(
    "throws when required `%s` missing",
    (k) => {
      const r: Record<string, unknown> = {
        id: 1n,
        name: "x",
        precision: 1,
        marginRatio: "0",
      };
      delete r[k];
      expect(() => parsePerpsCoin(r)).toThrow(
        new RegExp(`missing required field \\\`${k}\\\``),
      );
    },
  );
});
