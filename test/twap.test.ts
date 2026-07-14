/**
 * TWAP acceptance scenarios (spec .claude/kit/spec/2026-07-09-twap-orders.md).
 * Covers: signed payload field order (scenarios 1/4/5), REST parse null->[]
 * (scenario 2), WS parse + dispatcher onTwapUpdate-only wiring (scenario 3).
 */
import { describe, expect, it } from "vitest";
import { SpotWsClient } from "../src";
import type { WsTwapOrder } from "../src";
import { canonicalStringify } from "../src/common/canonical-json";
import { parseAccountTwapOrders, parseTwapOrder } from "../src/common/types";
import { buildPerpsTwapOrderPayload } from "../src/perps/actions";
import { buildCancelTwapPayload, buildTwapOrderPayload } from "../src/spot/actions";
import { parseWsTwapOrder } from "../src/ws/parsers/twap-order";

// Scenario 1: place spot TWAP — type + field order + integer side.
describe("scenario 1: buildTwapOrderPayload (spot)", () => {
  it("type=newTwapOrder, correct param order and integer side", () => {
    const p = buildTwapOrderPayload({
      accountId: 1010n,
      symbolId: 2n,
      side: "BUY",
      quantity: "0.5",
      minutes: 10,
      randomize: false,
    });
    expect(p.type).toBe("newTwapOrder");
    expect(Object.keys(p.params as object)).toEqual([
      "accountID",
      "symbolID",
      "side",
      "quantity",
      "minutes",
      "randomize",
    ]);
    expect((p.params as Record<string, unknown>).side).toBe(1);
    expect(canonicalStringify(p.params)).toBe(
      '{"accountID":1010,"symbolID":2,"side":1,"quantity":"0.5","minutes":10,"randomize":false}',
    );
  });
});

// Scenario 4: perps reduceOnly is required, last, always emitted.
describe("scenario 4: buildPerpsTwapOrderPayload (perps)", () => {
  it("reduceOnly is last and always present (true)", () => {
    const p = buildPerpsTwapOrderPayload({
      accountId: 1010n,
      symbolId: 5n,
      side: "SELL",
      quantity: "1",
      minutes: 30,
      randomize: true,
      reduceOnly: true,
    });
    expect(Object.keys(p.params as object)).toEqual([
      "accountID",
      "symbolID",
      "side",
      "quantity",
      "minutes",
      "randomize",
      "reduceOnly",
    ]);
    expect((p.params as Record<string, unknown>).side).toBe(2);
    expect((p.params as Record<string, unknown>).reduceOnly).toBe(true);
  });

  it("reduceOnly=false still enters the canonical payload (not omitted)", () => {
    const p = buildPerpsTwapOrderPayload({
      accountId: 1n,
      symbolId: 1n,
      side: "BUY",
      quantity: "1",
      minutes: 5,
      randomize: false,
      reduceOnly: false,
    });
    expect(canonicalStringify(p.params)).toContain('"reduceOnly":false');
  });
});

// Scenario 5: cancel TWAP.
describe("scenario 5: buildCancelTwapPayload", () => {
  it("type=cancelTwapOrder, params {accountID,symbolID,orderID}", () => {
    const p = buildCancelTwapPayload({ accountId: 1010n, symbolId: 2n, orderId: 12001n });
    expect(p.type).toBe("cancelTwapOrder");
    expect(Object.keys(p.params as object)).toEqual(["accountID", "symbolID", "orderID"]);
    expect(canonicalStringify(p.params)).toBe('{"accountID":1010,"symbolID":2,"orderID":12001}');
  });
});

// Scenario 2: getTwapOrders parse — twaps=null normalizes to [], block metadata kept.
describe("scenario 2: parseAccountTwapOrders", () => {
  it("twaps=null -> [], keeps block metadata", () => {
    const r = parseAccountTwapOrders({ blockTime: 100n, blockHeight: 5n, twaps: null });
    expect(r.twaps).toEqual([]);
    expect(r.blockTime).toBe(100n);
    expect(r.blockHeight).toBe(5n);
  });

  it("parseTwapOrder maps 15 fields (incl. symbol), side via name", () => {
    const o = parseTwapOrder({
      userID: 7n,
      accountID: 1010n,
      symbol: "vBTC_vUSDC",
      symbolID: 2n,
      orderID: 12001n,
      quantity: "0.5",
      side: "BUY",
      minutes: 10n,
      randomize: false,
      reduceOnly: false,
      executedQty: "0.1",
      executedValue: "350",
      createdAt: 1_766_847_039_000n,
      nextActiveAt: 1_766_847_099_000n,
      active: true,
    });
    expect(o.symbol).toBe("vBTC_vUSDC");
    expect(o.symbolId).toBe(2n);
    expect(o.side).toBe("BUY");
    expect(o.executedQty).toBe("0.1");
    expect(o.active).toBe(true);
  });

  it("throws on missing required field (no sentinel)", () => {
    expect(() => parseTwapOrder({ userID: 1n })).toThrow(/missing required field/);
  });
});

// Scenario 3: WS accountUpdate carries TWAP — parse mapping + onTwapUpdate-only dispatch.
describe("scenario 3: WS TWAP parse + dispatcher", () => {
  const wsTwapRaw = {
    s: "vETH_vUSDC",
    i: 12001,
    S: "BUY",
    q: "0.5",
    m: 10,
    r: false,
    R: false,
    z: "0.1",
    v: "350",
    ct: 1_766_847_039_000,
    nt: 1_766_847_099_000,
    a: true,
  };

  it("parseWsTwapOrder maps without sentinels", () => {
    const t = parseWsTwapOrder(wsTwapRaw);
    expect(t.symbol).toBe("vETH_vUSDC");
    expect(t.orderId).toBe(12001n);
    expect(t.side).toBe("BUY");
    expect(t.executedQty).toBe("0.1");
    expect(t.active).toBe(true);
  });

  it("subscribes accountUpdate and fires onTwapUpdate even without onBalanceUpdate", async () => {
    const spot = new SpotWsClient({
      baseUrl: "wss://test",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await spot.connect();

    const received: WsTwapOrder[][] = [];
    spot.subscribeAccountState({ user: "0xabc" }, () => {}, {
      onTwapUpdate: (twaps) => received.push(twaps),
    });

    const ws = (spot as unknown as { transport: { ws: MockWebSocket } }).transport.ws;
    const channels = ws.sent
      .map((s) => JSON.parse(s))
      .filter((m) => m.op === "subscribe")
      .map((m) => m.params.channel);
    // dispatcher gate fix: accountUpdate is subscribed even without onBalanceUpdate.
    expect(channels).toContain("accountUpdate");

    ws.onmessage?.({
      data: JSON.stringify({
        channel: "accountUpdate",
        type: "update",
        data: { E: 1, T: 2, h: 3, B: [], TO: [wsTwapRaw] },
      }),
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.[0]?.orderId).toBe(12001n);
    expect(received[0]?.[0]?.active).toBe(true);
  });
});

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    }, 0);
  }

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "normal" });
  }
}
