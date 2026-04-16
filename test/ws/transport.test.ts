import { describe, expect, it, vi, beforeEach } from "vitest";
import { WsTransport } from "../../src/ws/transport";
import { WsConnectionError } from "../../src/ws/errors";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

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
    // Auto-open on next tick
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

  // Test helpers
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WsTransport", () => {
  it("throws when no WebSocket is available", () => {
    const saved = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = undefined;
    try {
      expect(() => new WsTransport({ url: "wss://test" })).toThrow(WsConnectionError);
    } finally {
      (globalThis as Record<string, unknown>).WebSocket = saved;
    }
  });

  it("connects and resolves", async () => {
    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await transport.connect();
    expect(transport.state).toBe("connected");
    transport.close();
    expect(transport.state).toBe("disconnected");
  });

  it("subscribe sends subscribe message", async () => {
    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await transport.connect();

    const cb = vi.fn();
    transport.subscribe("ticker", { symbols: ["BTC-USD"] }, cb);

    // Find the mock
    const ws = (transport as unknown as { ws: MockWebSocket }).ws;
    expect(ws.sent.length).toBeGreaterThan(0);

    const msg = JSON.parse(ws.sent[0]!);
    expect(msg.op).toBe("subscribe");
    expect(msg.params.channel).toBe("ticker");
    expect(msg.params.symbols).toEqual(["BTC-USD"]);

    transport.close();
  });

  it("routes data messages to subscriptions", async () => {
    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await transport.connect();

    const cb = vi.fn();
    transport.subscribe("ticker", { symbols: ["BTC-USD"] }, cb);

    const ws = (transport as unknown as { ws: MockWebSocket }).ws;
    ws.simulateMessage({
      channel: "ticker",
      type: "update",
      data: [{ s: "BTC-USD", c: "100000" }],
    });

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]![1]).toBe("update");

    transport.close();
  });

  it("unsubscribe stops receiving messages", async () => {
    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await transport.connect();

    const cb = vi.fn();
    const unsub = transport.subscribe("ticker", { symbols: ["BTC-USD"] }, cb);
    unsub();

    const ws = (transport as unknown as { ws: MockWebSocket }).ws;
    ws.simulateMessage({
      channel: "ticker",
      type: "update",
      data: [{ s: "BTC-USD" }],
    });

    expect(cb).not.toHaveBeenCalled();
    transport.close();
  });

  it("pong messages are silently consumed", async () => {
    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await transport.connect();

    const cb = vi.fn();
    transport.subscribe("ticker", {}, cb);

    const ws = (transport as unknown as { ws: MockWebSocket }).ws;
    ws.simulateMessage({ op: "pong" });

    expect(cb).not.toHaveBeenCalled();
    transport.close();
  });

  it("emits lifecycle events", async () => {
    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });

    const openFn = vi.fn();
    const closeFn = vi.fn();
    transport.events.on("open", openFn);
    transport.events.on("close", closeFn);

    await transport.connect();
    expect(openFn).toHaveBeenCalledOnce();

    transport.close();
    // close() nulls handlers, so close event is not emitted via onclose
    // This is by design — close() is a graceful teardown
  });

  it("P2: multiple listeners on same key both receive data", async () => {
    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await transport.connect();

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    transport.subscribe("allTicker", {}, cb1);
    transport.subscribe("allTicker", {}, cb2);

    const ws = (transport as unknown as { ws: MockWebSocket }).ws;

    // Only one subscribe message should be sent (shared subscription)
    const subMessages = ws.sent.filter((s) => JSON.parse(s).op === "subscribe");
    expect(subMessages).toHaveLength(1);

    ws.simulateMessage({
      channel: "allTicker",
      type: "update",
      data: [{ s: "BTC-USD", c: "100000" }],
    });

    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();

    transport.close();
  });

  it("P2: unsubscribing one listener keeps the other active", async () => {
    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: MockWebSocket,
      pingInterval: 60_000,
      autoReconnect: false,
    });
    await transport.connect();

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = transport.subscribe("allTicker", {}, cb1);
    transport.subscribe("allTicker", {}, cb2);

    unsub1();

    const ws = (transport as unknown as { ws: MockWebSocket }).ws;

    // No unsubscribe sent — cb2 still active
    const unsubMessages = ws.sent.filter((s) => JSON.parse(s).op === "unsubscribe");
    expect(unsubMessages).toHaveLength(0);

    ws.simulateMessage({
      channel: "allTicker",
      type: "update",
      data: [{ s: "BTC-USD" }],
    });

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledOnce();

    transport.close();
  });

  it("P3: connect() rejects if socket closes before opening", async () => {
    // Mock that closes immediately without opening
    class FailSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      readyState = 0;
      onopen: ((ev: unknown) => void) | null = null;
      onclose: ((ev: unknown) => void) | null = null;
      onmessage: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      sent: string[] = [];
      constructor(_url: string) {
        setTimeout(() => {
          this.readyState = 3;
          this.onclose?.({ code: 1006, reason: "handshake failed" });
        }, 0);
      }
      send(d: string) { this.sent.push(d); }
      close() {}
    }

    const transport = new WsTransport({
      url: "wss://test/ws/spot",
      WebSocket: FailSocket,
      autoReconnect: false,
    });

    await expect(transport.connect()).rejects.toThrow(WsConnectionError);
  });
});
