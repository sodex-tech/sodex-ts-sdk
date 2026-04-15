/**
 * Unit tests for the account-state snapshot parsers (议题 13).
 *
 * These parse the short-key `WsSpotState`/`WsPerpsState` shapes returned by
 * `GET /accounts/{user}/state`. Live validation requires a signed request
 * with a known-active account, so coverage here is mocked-wire only —
 * shapes match sodex-docs/rest-v1/schema.md#wsspotstate / #wsperpsstate.
 */
import { describe, expect, it } from "vitest";
import {
  parsePerpsAccountSnapshot,
  parsePerpsSnapshotBalance,
  parsePerpsSnapshotOrder,
  parsePerpsSnapshotPosition,
  parsePerpsSnapshotSymbolConfig,
} from "../src/perps/client";
import {
  parseSpotAccountSnapshot,
  parseSpotSnapshotBalance,
  parseSpotSnapshotOrder,
} from "../src/spot/client";

// -- Spot --------------------------------------------------------------------

describe("parseSpotSnapshotBalance", () => {
  const full = () => ({ i: 1n, a: "vUSDC", t: "1000", l: "50" });

  it("maps the 4-field WsSpotBalance wire", () => {
    expect(parseSpotSnapshotBalance(full())).toEqual({
      coinId: 1n,
      coin: "vUSDC",
      total: "1000",
      locked: "50",
    });
  });

  it.each(["i", "a", "t", "l"] as const)("throws when `%s` missing", (k) => {
    const b = full() as Record<string, unknown>;
    delete b[k];
    expect(() => parseSpotSnapshotBalance(b)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

describe("parseSpotSnapshotOrder", () => {
  const full = () => ({
    s: "vBTC_vUSDC",
    c: "cl-1",
    i: 42n,
    S: "BUY",
    o: "LIMIT",
    f: "GTC",
    p: "50000",
    q: "0.01",
    F: null,
    X: "NEW",
    z: "0",
    v: "0",
    M: "500",
  });

  it("maps WsSpotOrder with F=null → funds undefined", () => {
    const order = parseSpotSnapshotOrder(full());
    expect(order).toEqual({
      orderID: 42n,
      symbol: "vBTC_vUSDC",
      clOrdID: "cl-1",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      status: "NEW",
      price: "50000",
      origQty: "0.01",
      executedQty: "0",
      executedValue: "0",
      marginFrozen: "500",
      funds: undefined,
    });
  });

  it("maps F as a string when the server reports funds", () => {
    expect(parseSpotSnapshotOrder({ ...full(), F: "1000" }).funds).toBe("1000");
  });

  it.each([
    "s",
    "c",
    "i",
    "S",
    "o",
    "f",
    "p",
    "q",
    "X",
    "z",
    "v",
    "M",
  ] as const)("throws when required `%s` missing", (k) => {
    const o = full() as Record<string, unknown>;
    delete o[k];
    expect(() => parseSpotSnapshotOrder(o)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

describe("parseSpotAccountSnapshot", () => {
  const full = () => ({
    user: "0xabc",
    aid: 1001n,
    uid: 1n,
    B: [{ i: 1n, a: "vUSDC", t: "1000", l: "0" }],
    O: [],
  });

  it("maps a WsSpotState envelope", () => {
    const snap = parseSpotAccountSnapshot(full());
    expect(snap.userAddress).toBe("0xabc");
    expect(snap.accountId).toBe(1001n);
    expect(snap.userId).toBe(1n);
    expect(snap.balances).toHaveLength(1);
    expect(snap.openOrders).toEqual([]);
  });

  it.each(["user", "aid", "uid", "B", "O"] as const)(
    "throws when envelope `%s` missing",
    (k) => {
      const r = full() as Record<string, unknown>;
      delete r[k];
      expect(() => parseSpotAccountSnapshot(r)).toThrow(
        new RegExp(`missing required field \\\`${k}\\\``),
      );
    },
  );

  it("throws when B/O present but not arrays", () => {
    expect(() => parseSpotAccountSnapshot({ ...full(), B: "nope" })).toThrow(
      /`B` must be an array/,
    );
    expect(() => parseSpotAccountSnapshot({ ...full(), O: 42 })).toThrow(
      /`O` must be an array/,
    );
  });
});

// -- Perps -------------------------------------------------------------------

describe("parsePerpsSnapshotBalance", () => {
  const full = () => ({
    i: 1n,
    a: "vUSDC",
    wb: "1000",
    mr: "0.1",
    px: "1",
    iw: null,
    aw: "800",
    ww: "800",
    wm: "100",
    am: "700",
  });

  it("maps WsPerpsBalanceDetailed with iw=null → isolatedFrozen undefined", () => {
    const bal = parsePerpsSnapshotBalance(full());
    expect(bal).toEqual({
      coinId: 1n,
      coin: "vUSDC",
      walletBalance: "1000",
      marginRatio: "0.1",
      oraclePrice: "1",
      availableForMargin: "800",
      availableForWithdraw: "800",
      walletMargin: "100",
      availableMargin: "700",
      isolatedFrozen: undefined,
    });
  });

  it("surfaces iw string when present", () => {
    expect(parsePerpsSnapshotBalance({ ...full(), iw: "200" }).isolatedFrozen).toBe("200");
  });

  it.each(["i", "a", "wb", "mr", "px", "aw", "ww", "wm", "am"] as const)(
    "throws when required `%s` missing",
    (k) => {
      const b = full() as Record<string, unknown>;
      delete b[k];
      expect(() => parsePerpsSnapshotBalance(b)).toThrow(
        new RegExp(`missing required field \\\`${k}\\\``),
      );
    },
  );
});

describe("parsePerpsSnapshotOrder", () => {
  const full = () => ({
    s: "BTC-USD",
    c: "cl-1",
    i: 42n,
    S: "BUY",
    o: "LIMIT",
    f: "GTC",
    p: "50000",
    q: "0.01",
    F: null,
    X: "NEW",
    z: "0",
    v: "0",
    M: "500",
    ps: "BOTH",
    R: false,
    sp: null,
    st: null,
    tt: null,
    pid: null,
    poid: null,
    aoids: null,
  });

  it("maps all nullables to undefined, fills perps-only required fields", () => {
    const order = parsePerpsSnapshotOrder(full());
    expect(order).toEqual({
      orderID: 42n,
      symbol: "BTC-USD",
      clOrdID: "cl-1",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      status: "NEW",
      price: "50000",
      origQty: "0.01",
      executedQty: "0",
      executedValue: "0",
      marginFrozen: "500",
      positionSide: "BOTH",
      reduceOnly: false,
      funds: undefined,
      stopPrice: undefined,
      stopType: undefined,
      triggerType: undefined,
      positionID: undefined,
      primaryOrderID: undefined,
      attachedOrderIDs: undefined,
    });
  });

  it("populates perps nullables when present", () => {
    const order = parsePerpsSnapshotOrder({
      ...full(),
      sp: "49000",
      st: "STOP_LOSS",
      tt: "LAST",
      pid: 99n,
      poid: 41n,
      aoids: [43n, 44n],
    });
    expect(order.stopPrice).toBe("49000");
    expect(order.stopType).toBe("STOP_LOSS");
    expect(order.triggerType).toBe("LAST");
    expect(order.positionID).toBe(99n);
    expect(order.primaryOrderID).toBe(41n);
    expect(order.attachedOrderIDs).toEqual([43n, 44n]);
  });

  it("throws when R is not a boolean", () => {
    expect(() => parsePerpsSnapshotOrder({ ...full(), R: 1 })).toThrow(
      /`R` must be a boolean/,
    );
  });

  it("throws when aoids is present but not an array", () => {
    expect(() => parsePerpsSnapshotOrder({ ...full(), aoids: "nope" })).toThrow(
      /`aoids` must be an array/,
    );
  });

  it.each([
    "s",
    "c",
    "i",
    "S",
    "o",
    "f",
    "p",
    "q",
    "X",
    "z",
    "v",
    "M",
    "ps",
    "R",
  ] as const)("throws when required scalar `%s` missing", (k) => {
    const o = full() as Record<string, unknown>;
    delete o[k];
    expect(() => parsePerpsSnapshotOrder(o)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

describe("parsePerpsSnapshotPosition", () => {
  const full = () => ({
    i: 7n,
    s: "BTC-USD",
    m: "CROSS",
    ps: "BOTH",
    sz: "0.1",
    iw: null,
    ep: "50000",
    co: "5000",
    cf: "0.5",
    cc: "0",
    cp: "0",
    ms: "0.1",
    cr: "0",
    ur: "10",
    l: 10,
    lp: "45000",
  });

  it("maps WsPerpsPosition with iw=null → isolatedMargin undefined", () => {
    const pos = parsePerpsSnapshotPosition(full());
    expect(pos.id).toBe(7n);
    expect(pos.isolatedMargin).toBeUndefined();
    expect(pos.leverage).toBe(10);
  });

  it.each([
    "i",
    "s",
    "m",
    "ps",
    "sz",
    "ep",
    "co",
    "cf",
    "cc",
    "cp",
    "ms",
    "cr",
    "ur",
    "l",
    "lp",
  ] as const)("throws when required `%s` missing", (k) => {
    const p = full() as Record<string, unknown>;
    delete p[k];
    expect(() => parsePerpsSnapshotPosition(p)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

describe("parsePerpsSnapshotSymbolConfig", () => {
  it("maps WsPerpsSymbolConfig", () => {
    expect(
      parsePerpsSnapshotSymbolConfig({ s: "BTC-USD", l: 20, m: "CROSS" }),
    ).toEqual({ symbol: "BTC-USD", leverage: 20, marginMode: "CROSS" });
  });

  it.each(["s", "l", "m"] as const)("throws when `%s` missing", (k) => {
    const c: Record<string, unknown> = { s: "X", l: 1, m: "CROSS" };
    delete c[k];
    expect(() => parsePerpsSnapshotSymbolConfig(c)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });
});

describe("parsePerpsAccountSnapshot", () => {
  const full = () => ({
    user: "0xabc",
    aid: 1001n,
    uid: 1n,
    av: "10000",
    am: "9000",
    ami: "0",
    amw: "9000",
    im: "0",
    cm: "100",
    oim: "0",
    ocm: "50",
    B: [],
    O: [],
    P: [],
    S: [],
  });

  it("maps a complete WsPerpsState envelope", () => {
    const snap = parsePerpsAccountSnapshot(full());
    expect(snap.userAddress).toBe("0xabc");
    expect(snap.accountValue).toBe("10000");
    expect(snap.availableMargin).toBe("9000");
    expect(snap.openPositions).toEqual([]);
    expect(snap.symbolConfigs).toEqual([]);
  });

  it.each([
    "user",
    "aid",
    "uid",
    "av",
    "am",
    "ami",
    "amw",
    "im",
    "cm",
    "oim",
    "ocm",
    "B",
    "O",
    "P",
    "S",
  ] as const)("throws when envelope field `%s` missing", (k) => {
    const r = full() as Record<string, unknown>;
    delete r[k];
    expect(() => parsePerpsAccountSnapshot(r)).toThrow(
      new RegExp(`missing required field \\\`${k}\\\``),
    );
  });

  it.each(["B", "O", "P", "S"] as const)(
    "throws when `%s` is present but not an array",
    (k) => {
      expect(() => parsePerpsAccountSnapshot({ ...full(), [k]: "nope" })).toThrow(
        new RegExp(`\\\`${k}\\\` must be an array`),
      );
    },
  );
});
