import { describe, expect, it } from "vitest";
import {
  parseWsBookTicker,
  parseWsCandle,
  parseWsCoinPrice,
  parseWsLiquidationEvent,
  parseWsMarkPrice,
  parseWsMiniTicker,
  parseWsOrderBook,
  parseWsOrderBookUpdate,
  parseWsPerpsAccountTrade,
  parseWsPerpsAccountUpdate,
  parseWsPerpsOrderUpdate,
  parseWsSpotAccountTrade,
  parseWsSpotAccountUpdate,
  parseWsSpotOrderUpdate,
  parseWsSpotTicker,
  parseWsTrade,
} from "../../src/ws/parsers";

// ---------------------------------------------------------------------------
// Fixtures based on sodex-docs/websocket-v1 examples
// ---------------------------------------------------------------------------

const TICKER_WIRE = {
  E: 1766907127667n,
  s: "BTC-USD",
  c: "87653",
  Q: "0.00081",
  w: "87542.18",
  a: "106482",
  A: "0.00001",
  b: "106394",
  B: "0.00016",
  p: "108",
  P: 0.123365,
  o: "87545",
  h: "87923",
  l: "87274",
  v: "5842.97664",
  q: "511506937.76986",
  O: 1766820725123n,
  C: 1766907125123n,
};

const MINI_TICKER_WIRE = {
  E: 1766907116587n,
  s: "BTC-USD",
  c: "87644",
  o: "87545",
  h: "87923",
  l: "87274",
  v: "5839.63544",
  q: "511238370.12834",
};

const BOOK_TICKER_WIRE = {
  E: 1766844967026n,
  s: "vBTC_vUSDC",
  u: 2631n,
  a: "99380",
  A: "0.94474",
  b: "99165",
  B: "0.94382",
};

const MARK_PRICE_WIRE = {
  E: 1766850625430n,
  s: "BTC-USD",
  oi: "0",
  p: "107631.584573",
  i: "107702.323374",
  r: "0.0000125",
  T: 1766851200000n,
};

const COIN_PRICE_WIRE = {
  E: 1781104149800n,
  i: 1n,
  a: "vBTC",
  p: "61984.5",
  mr: "0.9",
};

const ORDER_BOOK_WIRE = {
  s: "WSOSO_vUSDC",
  u: 12345n,
  E: 1672515782136n,
  b: [
    ["0.5666", "4831.75"],
    ["0.5665", "4831.75"],
  ],
  a: [
    ["0.5668", "4410.79"],
    ["0.5669", "4410.79"],
  ],
};

const ORDER_BOOK_UPDATE_WIRE = {
  s: "BTC-USD",
  U: 12344n,
  u: 12345n,
  E: 1672515782136n,
  b: [["99165", "1.5"]],
  a: [["99380", "0.5"]],
};

const CANDLE_WIRE = {
  t: 1767972900000n,
  T: 1767972938724n,
  s: "BTC-USD",
  i: "1m",
  o: "91869",
  h: "91982",
  l: "91869",
  c: "91976",
  v: "4.12298",
  q: "379148.6798",
  n: 0,
  x: false,
};

const TRADE_WIRE = {
  E: 1766846445234n,
  T: 1766846558207n,
  t: 4352n,
  s: "vBTC_vUSDC",
  S: "BUY",
  p: "100732",
  q: "0.0007",
  bi: 247817583n,
  si: 1001n,
};

const SPOT_ACCOUNT_UPDATE_WIRE = {
  E: 1766847039189n,
  T: 1766847039189n,
  h: 2211n,
  B: [
    { i: 1n, a: "vBTC", t: "10113.00266312", l: "4.57789" },
  ],
};

const PERPS_ACCOUNT_UPDATE_WIRE = {
  E: 1766847039189n,
  T: 1766847039189n,
  h: 2211n,
  B: [{ i: 0n, a: "vUSDC", wb: "999998045.21473685" }],
  P: [
    {
      i: 1n,
      s: "BTC-USD",
      sz: "1.5",
      ep: "50000",
      iw: null,
      ps: "BOTH",
      ct: 1776418125332,
      ut: 1776418813658,
    },
  ],
};

const SPOT_ORDER_UPDATE_WIRE = {
  E: 1766849004730n,
  T: 1766848473207n,
  s: "vBTC_vUSDC",
  c: "MAKER-ADJUST-0-70399739516726",
  i: 58119n,
  S: "SELL",
  o: "LIMIT",
  f: "GTC",
  p: "102650",
  q: "0.36734",
  F: null,
  X: "NEW",
  z: "0",
  v: "0",
  M: "0.36734",
  t: null,
  l: null,
  L: null,
  n: null,
  m: null,
  x: "NEW",
  r: null,
};

const PERPS_ORDER_UPDATE_WIRE = {
  ...SPOT_ORDER_UPDATE_WIRE,
  ps: "BOTH",
  R: false,
  sp: null,
  st: null,
  tt: null,
  pid: null,
  poid: null,
  aoids: null,
};

const SPOT_ACCOUNT_TRADE_WIRE = {
  E: 1766848149693n,
  T: 1766847863273n,
  t: 6275n,
  s: "vETH_vUSDC",
  i: 51101n,
  c: "MAKER-ADJUST-1-51126829939055",
  S: "BUY",
  p: "3511.6",
  q: "0.0268",
  f: "0",
  m: true,
};

const PERPS_ACCOUNT_TRADE_WIRE = {
  ...SPOT_ACCOUNT_TRADE_WIRE,
  d: "Long",
};

const LIQUIDATION_WIRE = {
  type: "liquidation",
  E: 1766849004730n,
  lid: 1000n,
  aid: 1002n,
  av: "123",
  mm: "CROSS",
  B: [{ i: 0n, a: "vUSDC", wb: "10" }],
  P: [{ s: "BTC-USD", ps: "BOTH", sz: "-0.00001", mp: "200000", lp: "100000" }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseWsSpotTicker", () => {
  it("parses all fields", () => {
    const t = parseWsSpotTicker(TICKER_WIRE);
    expect(t.symbol).toBe("BTC-USD");
    expect(t.lastPx).toBe("87653");
    expect(t.lastSz).toBe("0.00081");
    expect(t.vwap).toBe("87542.18");
    expect(t.change).toBe("108");
    expect(t.changePct).toBeCloseTo(0.123365);
    expect(t.volume).toBe("5842.97664");
    expect(t.askPx).toBe("106482");
    expect(t.bidPx).toBe("106394");
    expect(t.openTime).toBe(1766820725123n);
    expect(t.closeTime).toBe(1766907125123n);
    expect(t.eventTime).toBe(1766907127667n);
  });

  it("throws on missing required field", () => {
    const { s: _, ...rest } = TICKER_WIRE;
    expect(() => parseWsSpotTicker(rest)).toThrow(/missing required field.*s/);
  });
});

describe("parseWsMiniTicker", () => {
  it("parses all fields", () => {
    const t = parseWsMiniTicker(MINI_TICKER_WIRE);
    expect(t.symbol).toBe("BTC-USD");
    expect(t.lastPx).toBe("87644");
    expect(t.highPx).toBe("87923");
    expect(t.volume).toBe("5839.63544");
    expect(t.eventTime).toBe(1766907116587n);
  });

  it("throws on missing required field", () => {
    const { v: _, ...rest } = MINI_TICKER_WIRE;
    expect(() => parseWsMiniTicker(rest)).toThrow(/missing required field.*v/);
  });
});

describe("parseWsBookTicker", () => {
  it("parses all fields", () => {
    const t = parseWsBookTicker(BOOK_TICKER_WIRE);
    expect(t.symbol).toBe("vBTC_vUSDC");
    expect(t.askPx).toBe("99380");
    expect(t.bidSz).toBe("0.94382");
    expect(t.updateId).toBe(2631n);
    expect(t.eventTime).toBe(1766844967026n);
  });
});

describe("parseWsMarkPrice", () => {
  it("parses all fields", () => {
    const t = parseWsMarkPrice(MARK_PRICE_WIRE);
    expect(t.symbol).toBe("BTC-USD");
    expect(t.markPrice).toBe("107631.584573");
    expect(t.indexPrice).toBe("107702.323374");
    expect(t.fundingRate).toBe("0.0000125");
    expect(t.nextFundingTime).toBe(1766851200000n);
    expect(t.openInterest).toBe("0");
    expect(t.eventTime).toBe(1766850625430n);
  });
});

describe("parseWsCoinPrice", () => {
  it("parses all fields", () => {
    const c = parseWsCoinPrice(COIN_PRICE_WIRE);
    expect(c.coinId).toBe(1n);
    expect(c.coin).toBe("vBTC");
    expect(c.price).toBe("61984.5");
    expect(c.marginRatio).toBe("0.9");
    expect(c.eventTime).toBe(1781104149800n);
  });

  it("throws when a required field is missing", () => {
    const { p: _p, ...missingPrice } = COIN_PRICE_WIRE;
    expect(() => parseWsCoinPrice(missingPrice)).toThrow();
  });
});

describe("parseWsOrderBook", () => {
  it("parses snapshot", () => {
    const b = parseWsOrderBook(ORDER_BOOK_WIRE);
    expect(b.symbol).toBe("WSOSO_vUSDC");
    expect(b.updateId).toBe(12345n);
    expect(b.bids).toHaveLength(2);
    expect(b.bids[0]).toEqual({ price: "0.5666", size: "4831.75" });
    expect(b.asks).toHaveLength(2);
  });

  it("handles null bids/asks as empty arrays", () => {
    const b = parseWsOrderBook({ ...ORDER_BOOK_WIRE, b: null, a: null });
    expect(b.bids).toEqual([]);
    expect(b.asks).toEqual([]);
  });
});

describe("parseWsOrderBookUpdate", () => {
  it("parses L4 diff", () => {
    const u = parseWsOrderBookUpdate(ORDER_BOOK_UPDATE_WIRE);
    expect(u.firstUpdateId).toBe(12344n);
    expect(u.lastUpdateId).toBe(12345n);
    expect(u.bids).toHaveLength(1);
    expect(u.asks).toHaveLength(1);
  });
});

describe("parseWsCandle", () => {
  it("parses all fields including WS-only", () => {
    const k = parseWsCandle(CANDLE_WIRE);
    expect(k.symbol).toBe("BTC-USD");
    expect(k.interval).toBe("1m");
    expect(k.openTime).toBe(1767972900000n);
    expect(k.closeTime).toBe(1767972938724n);
    expect(k.openPx).toBe("91869");
    expect(k.closePx).toBe("91976");
    expect(k.isClosed).toBe(false);
    expect(k.tradeCount).toBe(0);
  });
});

describe("parseWsTrade", () => {
  it("parses trade with eventTime", () => {
    const t = parseWsTrade(TRADE_WIRE);
    expect(t.id).toBe(4352n);
    expect(t.symbol).toBe("vBTC_vUSDC");
    expect(t.side).toBe("BUY");
    expect(t.price).toBe("100732");
    expect(t.eventTime).toBe(1766846445234n);
    expect(t.buyerAccountId).toBe(247817583n);
    expect(t.sellerAccountId).toBe(1001n);
  });
});

describe("parseWsSpotAccountUpdate", () => {
  it("parses balance update", () => {
    const u = parseWsSpotAccountUpdate(SPOT_ACCOUNT_UPDATE_WIRE);
    expect(u.eventTime).toBe(1766847039189n);
    expect(u.blockHeight).toBe(2211n);
    expect(u.balances).toHaveLength(1);
    expect(u.balances[0]!.coin).toBe("vBTC");
    expect(u.balances[0]!.total).toBe("10113.00266312");
  });
});

describe("parseWsPerpsAccountUpdate", () => {
  it("parses balance + position update", () => {
    const u = parseWsPerpsAccountUpdate(PERPS_ACCOUNT_UPDATE_WIRE);
    expect(u.balances).toHaveLength(1);
    expect(u.balances[0]!.walletBalance).toBe("999998045.21473685");
    expect(u.positions).toHaveLength(1);
    expect(u.positions[0]!.symbol).toBe("BTC-USD");
    expect(u.positions[0]!.size).toBe("1.5");
    expect(u.positions[0]!.positionSide).toBe("BOTH");
    expect(u.positions[0]!.isolatedMargin).toBeUndefined();
    expect(u.positions[0]!.createdAt).toBe(1776418125332n);
    expect(u.positions[0]!.updatedAt).toBe(1776418813658n);
  });
});

describe("parseWsSpotOrderUpdate", () => {
  it("parses execution event", () => {
    const o = parseWsSpotOrderUpdate(SPOT_ORDER_UPDATE_WIRE);
    expect(o.orderID).toBe(58119n);
    expect(o.symbol).toBe("vBTC_vUSDC");
    expect(o.side).toBe("SELL");
    expect(o.type).toBe("LIMIT");
    expect(o.status).toBe("NEW");
    expect(o.execType).toBe("NEW");
    expect(o.price).toBe("102650");
    expect(o.funds).toBeUndefined();
    expect(o.tradeID).toBeUndefined();
    expect(o.isMaker).toBeUndefined();
  });
});

describe("parseWsPerpsOrderUpdate", () => {
  it("extends spot with perps fields", () => {
    const o = parseWsPerpsOrderUpdate(PERPS_ORDER_UPDATE_WIRE);
    expect(o.positionSide).toBe("BOTH");
    expect(o.reduceOnly).toBe(false);
    expect(o.stopPrice).toBeUndefined();
    expect(o.positionID).toBeUndefined();
    expect(o.attachedOrderIDs).toBeUndefined();
  });
});

describe("parseWsSpotAccountTrade", () => {
  it("parses trade fill", () => {
    const t = parseWsSpotAccountTrade(SPOT_ACCOUNT_TRADE_WIRE);
    expect(t.tradeID).toBe(6275n);
    expect(t.symbol).toBe("vETH_vUSDC");
    expect(t.side).toBe("BUY");
    expect(t.price).toBe("3511.6");
    expect(t.fee).toBe("0");
    expect(t.isMaker).toBe(true);
  });
});

describe("parseWsPerpsAccountTrade", () => {
  it("adds direction field", () => {
    const t = parseWsPerpsAccountTrade(PERPS_ACCOUNT_TRADE_WIRE);
    expect(t.direction).toBe("Long");
    expect(t.tradeID).toBe(6275n);
  });
});

describe("parseWsLiquidationEvent", () => {
  it("parses liquidation event", () => {
    const e = parseWsLiquidationEvent(LIQUIDATION_WIRE);
    expect(e.liquidatorId).toBe(1000n);
    expect(e.accountId).toBe(1002n);
    expect(e.accountValue).toBe("123");
    expect(e.marginMode).toBe("CROSS");
    expect(e.balances).toHaveLength(1);
    expect(e.positions).toHaveLength(1);
    expect(e.positions[0]!.symbol).toBe("BTC-USD");
    expect(e.positions[0]!.liquidationPrice).toBe("100000");
  });
});
