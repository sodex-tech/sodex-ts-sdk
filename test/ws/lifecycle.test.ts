import { describe, expect, it, vi } from "vitest";
import { SpotWsClient } from "../../src/ws/spot-ws-client";
import { WsTransport } from "../../src/ws/transport";

class LifecycleWebSocket {
  static instances: LifecycleWebSocket[] = [];

  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(public readonly url: string) {
    LifecycleWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1_000, reason: "normal" });
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function createConnectedTransport(): Promise<{
  transport: WsTransport;
  socket: LifecycleWebSocket;
}> {
  LifecycleWebSocket.instances = [];
  const transport = new WsTransport({
    url: "wss://gateway.example/ws/spot",
    WebSocket: LifecycleWebSocket,
    autoReconnect: false,
    pingInterval: 60_000,
    requestTimeout: 1_000,
  });
  return transport.connect().then(() => ({
    transport,
    socket: LifecycleWebSocket.instances[0]!,
  }));
}

describe("WsTransport subscription lifecycle", () => {
  // Validates that `ready` resolves only after the Gateway acknowledges the exact subscribe request ID.
  it("waits for subscribe acknowledgement", async () => {
    const { transport, socket } = await createConnectedTransport();
    const subscription = transport.subscribe("ticker", { symbols: ["BTC-USD"] }, vi.fn());
    const request = JSON.parse(socket.sent[0]!);
    let ready = false;
    void subscription.ready.then(() => {
      ready = true;
    });

    await Promise.resolve();
    expect(ready).toBe(false);
    socket.receive({ op: "subscribe", id: request.id, success: true });
    await subscription.ready;
    expect(ready).toBe(true);
    transport.close();
  });

  // Validates that a rejected Gateway acknowledgement is exposed through the subscription handle.
  it("rejects ready when the Gateway rejects a subscription", async () => {
    const { transport, socket } = await createConnectedTransport();
    const subscription = transport.subscribe("ticker", {}, vi.fn());
    const request = JSON.parse(socket.sent[0]!);

    socket.receive({
      op: "subscribe",
      id: request.id,
      success: false,
      error: "unsupported channel",
    });

    await expect(subscription.ready).rejects.toThrow(/unsupported channel/);
    transport.close();
  });

  // Validates that async unsubscribe does not complete until the matching server acknowledgement arrives.
  it("waits for unsubscribe acknowledgement", async () => {
    const { transport, socket } = await createConnectedTransport();
    const subscription = transport.subscribe("ticker", {}, vi.fn());
    const subscribeRequest = JSON.parse(socket.sent[0]!);
    socket.receive({ op: "subscribe", id: subscribeRequest.id, success: true });
    await subscription.ready;

    const unsubscribe = subscription.unsubscribe();
    const unsubscribeRequest = JSON.parse(socket.sent.at(-1)!);
    let settled = false;
    void unsubscribe.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    socket.receive({ op: "unsubscribe", id: unsubscribeRequest.id, success: true });
    await unsubscribe;
    expect(settled).toBe(true);
    transport.close();
  });

  // Validates backward compatibility: the returned handle remains callable as the original fire-and-forget unsubscribe function.
  it("keeps the legacy callable unsubscribe API", async () => {
    const { transport, socket } = await createConnectedTransport();
    const onMessage = vi.fn();
    const subscription = transport.subscribe("ticker", {}, onMessage);

    expect(typeof subscription).toBe("function");
    subscription();
    socket.receive({ channel: "ticker", type: "update", data: [] });
    expect(onMessage).not.toHaveBeenCalled();
    transport.close();
  });

  // Validates that multiple same-user account handles keep the cross-user guard active until the final registration is removed.
  it("tracks consolidated account subscription ownership", async () => {
    LifecycleWebSocket.instances = [];
    const client = new SpotWsClient({
      baseUrl: "https://gateway.example",
      WebSocket: LifecycleWebSocket,
      autoReconnect: false,
      pingInterval: 60_000,
      requestTimeout: 1_000,
    });
    await client.connect();
    const socket = LifecycleWebSocket.instances[0]!;
    const first = client.subscribeAccountState({ user: "0xaaa" }, vi.fn());
    const second = client.subscribeAccountState({ user: "0xaaa" }, vi.fn());
    const subscribeRequest = JSON.parse(socket.sent[0]!);
    socket.receive({ op: "subscribe", id: subscribeRequest.id, success: true });
    await Promise.all([first.ready, second.ready]);

    await first.unsubscribe();
    expect(() => client.subscribeAccountState({ user: "0xbbb" }, vi.fn())).toThrow(
      /separate SpotWsClient/,
    );

    const finalUnsubscribe = second.unsubscribe();
    const unsubscribeRequest = JSON.parse(socket.sent.at(-1)!);
    socket.receive({ op: "unsubscribe", id: unsubscribeRequest.id, success: true });
    await finalUnsubscribe;

    expect(() => client.subscribeAccountState({ user: "0xbbb" }, vi.fn())).not.toThrow();
    client.close();
  });
});
