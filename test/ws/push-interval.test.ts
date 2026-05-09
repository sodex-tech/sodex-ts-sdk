/**
 * Verifies that `pushIntervalMs` on each supported subscribe* method is
 * converted to the gateway's `"<n>ms"` wire form, and that channels which
 * don't support it on the server side don't expose the option in TS.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { PerpsWsClient, SpotWsClient } from "../../src";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
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

function lastSubscribePayload(ws: MockWebSocket): Record<string, unknown> {
  const msgs = ws.sent.map((s) => JSON.parse(s));
  const sub = [...msgs].reverse().find((m) => m.op === "subscribe");
  return (sub?.params as Record<string, unknown>) ?? {};
}

describe("pushIntervalMs wire conversion", () => {
  let spot: SpotWsClient;
  let perps: PerpsWsClient;
  let spotWs: () => MockWebSocket;
  let perpsWs: () => MockWebSocket;

  beforeEach(async () => {
    spot = new SpotWsClient({
      baseUrl: "wss://test",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    perps = new PerpsWsClient({
      baseUrl: "wss://test",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await spot.connect();
    await perps.connect();
    spotWs = () => (spot as unknown as { transport: { ws: MockWebSocket } }).transport.ws;
    perpsWs = () => (perps as unknown as { transport: { ws: MockWebSocket } }).transport.ws;
  });

  it("spot ticker: 1000 → '1000ms'", () => {
    spot.subscribeTicker({ symbols: ["BTC-USD"], pushIntervalMs: 1000 }, () => {});
    expect(lastSubscribePayload(spotWs()).pushInterval).toBe("1000ms");
  });

  it("spot allTicker (opts variant): 3000 → '3000ms'", () => {
    spot.subscribeAllTickers(() => {}, { pushIntervalMs: 3000 });
    expect(lastSubscribePayload(spotWs()).pushInterval).toBe("3000ms");
  });

  it("spot allTicker without opts: pushInterval omitted", () => {
    spot.subscribeAllTickers(() => {});
    expect(lastSubscribePayload(spotWs())).not.toHaveProperty("pushInterval");
  });

  it("spot candle: 5000 → '5000ms'", () => {
    spot.subscribeCandle({ symbol: "BTC-USD", interval: "1m", pushIntervalMs: 5000 }, () => {});
    expect(lastSubscribePayload(spotWs()).pushInterval).toBe("5000ms");
  });

  it("spot l2Book: 500 → '500ms'", () => {
    spot.subscribeL2Book({ symbol: "BTC-USD", tickSize: "0.01", pushIntervalMs: 500 }, () => {});
    expect(lastSubscribePayload(spotWs()).pushInterval).toBe("500ms");
  });

  it("spot accountState: pushInterval applied to accountState only", () => {
    spot.subscribeAccountState({ user: "0xabc", pushIntervalMs: 1000 }, () => {}, {
      // Granular channels MUST NOT receive pushInterval since the server
      // doesn't honor it. Subscribing all of them lets us inspect every
      // outgoing payload.
      onBalanceUpdate: () => {},
      onOrderUpdate: () => {},
      onTrade: () => {},
    });
    const sent = spotWs().sent.map((s) => JSON.parse(s));
    const subs = sent.filter((m) => m.op === "subscribe");
    const byChannel = Object.fromEntries(subs.map((s) => [s.params.channel, s.params]));
    expect(byChannel.accountState.pushInterval).toBe("1000ms");
    expect(byChannel.accountUpdate).not.toHaveProperty("pushInterval");
    expect(byChannel.accountOrderUpdate).not.toHaveProperty("pushInterval");
    expect(byChannel.accountTrade).not.toHaveProperty("pushInterval");
  });

  it("perps markPrice: 1000 → '1000ms'", () => {
    perps.subscribeMarkPrice({ symbols: ["BTC-USD"], pushIntervalMs: 1000 }, () => {});
    expect(lastSubscribePayload(perpsWs()).pushInterval).toBe("1000ms");
  });

  it("perps allMarkPrice (opts variant): 3000 → '3000ms'", () => {
    perps.subscribeAllMarkPrices(() => {}, { pushIntervalMs: 3000 });
    expect(lastSubscribePayload(perpsWs()).pushInterval).toBe("3000ms");
  });

  it("rejects a second subscribe on the same channel with a different pushIntervalMs", () => {
    // Wire frames carry no pushInterval tag, so the transport routes by
    // channel alone. Allowing two pushIntervals on one channel/connection
    // would silently cross-deliver frames between subs. Surface it as a
    // throw at subscribe time instead of letting the throttle break quietly.
    spot.subscribeTicker({ symbols: ["BTC-USD"], pushIntervalMs: 1000 }, () => {});
    expect(() =>
      spot.subscribeTicker({ symbols: ["BTC-USD"], pushIntervalMs: 3000 }, () => {}),
    ).toThrow(/Conflicting pushInterval/);
  });

  it("allows a second subscribe on the same channel with the same pushIntervalMs", () => {
    spot.subscribeTicker({ symbols: ["BTC-USD"], pushIntervalMs: 1000 }, () => {});
    expect(() =>
      spot.subscribeTicker({ symbols: ["ETH-USD"], pushIntervalMs: 1000 }, () => {}),
    ).not.toThrow();
  });

  it("rejects mixing server-default cadence with an explicit pushIntervalMs (default → explicit)", () => {
    // Omitting pushIntervalMs means "server default cadence"; that's a
    // distinct stream from any explicit interval, so the second subscribe
    // must throw — otherwise the throttled callback silently receives the
    // default-cadence stream too.
    spot.subscribeAllTickers(() => {});
    expect(() => spot.subscribeAllTickers(() => {}, { pushIntervalMs: 1000 })).toThrow(
      /Conflicting pushInterval/,
    );
  });

  it("rejects mixing server-default cadence with an explicit pushIntervalMs (explicit → default)", () => {
    spot.subscribeAllTickers(() => {}, { pushIntervalMs: 1000 });
    expect(() => spot.subscribeAllTickers(() => {})).toThrow(/Conflicting pushInterval/);
  });

  it("allows two default-cadence subscribes on the same channel (both omit pushIntervalMs)", () => {
    spot.subscribeAllTickers(() => {});
    expect(() => spot.subscribeAllTickers(() => {})).not.toThrow();
  });
});
