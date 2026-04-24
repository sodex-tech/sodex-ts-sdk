/**
 * Low-level WebSocket transport with heartbeat, reconnect, and
 * subscription tracking.
 *
 * Design trade-offs:
 *   1. JSON deserialization uses `parseJsonBigInt` (not `JSON.parse`) so
 *      uint64 wire fields (orderID, accountId, tradeID) are not silently
 *      rounded to IEEE-754 doubles.
 *   2. Subscription state is tracked in a Map keyed by a deterministic
 *      string so reconnect can replay subscriptions automatically.
 *   3. Heartbeat sends `{"op":"ping"}` on a timer; if no `pong` arrives
 *      within `pongTimeout` the socket is force-closed to trigger
 *      reconnect.  The timer is reset on every incoming message (any
 *      message proves the connection is alive, not just pong).
 *   4. `WebSocket` constructor is injectable for Node <22 / test mocks.
 *      The type is loosened to `unknown` (cast internally) because the
 *      exact constructor signature varies across `ws`, `undici`, and the
 *      DOM global.
 *   5. Exponential backoff: 1s base, 2× growth, 30s cap, ±20% jitter.
 *      Reset to 0 on first successful message after reconnect.
 */

import { parseJsonBigInt } from "../common/json";
import type { WireRecord } from "../common/types";
import { MiniEmitter } from "./emitter";
import { WsConnectionError, WsProtocolError } from "./errors";
import type { WsLifecycleEvents } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WsState = "disconnected" | "connecting" | "connected" | "reconnecting";

type MessageHandler = (data: unknown, type: "snapshot" | "update") => void;

/**
 * Optional predicate that tests whether a data frame belongs to this
 * subscription. When provided, the transport calls it before invoking
 * listeners; when absent, all frames on the channel are delivered.
 *
 * This exists because the WS protocol tags data messages with `channel`
 * only — no params. Subscriptions with distinct params on the same
 * channel (e.g. two `candle` subscriptions for different symbols) would
 * otherwise cross-deliver.
 */
type DataMatcher = (data: unknown) => boolean;

interface Subscription {
  channel: string;
  params: Record<string, unknown>;
  listeners: Set<MessageHandler>;
  matchData?: DataMatcher;
}

export interface WsTransportOptions {
  url: string;
  WebSocket?: unknown;
  pingInterval?: number;
  pongTimeout?: number;
  autoReconnect?: boolean;
  maxReconnectDelay?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_DELAY = 1000;
const MAX_DELAY = 30_000;
const JITTER = 0.2;

function reconnectDelay(attempt: number, maxDelay: number): number {
  const exp = Math.min(BASE_DELAY * 2 ** attempt, maxDelay);
  const jitter = exp * JITTER * (Math.random() * 2 - 1);
  return Math.round(exp + jitter);
}

function subscriptionKey(channel: string, params: Record<string, unknown>): string {
  const sorted = Object.entries(params)
    .filter(([k, v]) => v !== undefined && k !== "channel")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&");
  return `${channel}?${sorted}`;
}

// ---------------------------------------------------------------------------
// WsTransport
// ---------------------------------------------------------------------------

export class WsTransport {
  readonly events = new MiniEmitter<WsLifecycleEvents>();

  private readonly url: string;
  private readonly WsCtor: { new (url: string): WebSocket };
  private readonly pingInterval: number;
  private readonly pongTimeout: number;
  private readonly autoReconnect: boolean;
  private readonly maxReconnectDelay: number;

  private ws: WebSocket | null = null;
  private state_: WsState = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;
  private connectReject: ((err: Error) => void) | null = null;
  private requestId = 0;

  private readonly subscriptions = new Map<string, Subscription>();

  constructor(opts: WsTransportOptions) {
    this.url = opts.url;
    this.pingInterval = opts.pingInterval ?? 15_000;
    this.pongTimeout = opts.pongTimeout ?? 10_000;
    this.autoReconnect = opts.autoReconnect ?? true;
    this.maxReconnectDelay = opts.maxReconnectDelay ?? MAX_DELAY;

    const ctor = opts.WebSocket ?? (globalThis as Record<string, unknown>).WebSocket;
    if (!ctor) {
      throw new WsConnectionError(
        "No WebSocket implementation found. Pass a WebSocket constructor via options " +
          "(e.g. `import WebSocket from \"ws\"; new SpotWsClient({ ..., WebSocket })`).",
      );
    }
    this.WsCtor = ctor as { new (url: string): WebSocket };
  }

  get state(): WsState {
    return this.state_;
  }

  // -------------------------------------------------------------------------
  // Connect
  // -------------------------------------------------------------------------

  connect(): Promise<void> {
    if (this.state_ === "connected" || this.state_ === "connecting") {
      return Promise.resolve();
    }
    // Cancel any pending reconnect timer to avoid duplicate sockets
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closing = false;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    this.state_ = this.reconnectAttempt > 0 ? "reconnecting" : "connecting";
    return new Promise<void>((resolve, reject) => {
      this.connectReject = reject;
      try {
        const ws = new this.WsCtor(this.url);
        this.ws = ws;

        ws.onopen = () => {
          this.connectReject = null;
          this.state_ = "connected";
          this.reconnectAttempt = 0;
          this.startPing();
          this.events.emit("open", undefined);
          this.replaySubscriptions();
          resolve();
        };

        ws.onmessage = (ev: MessageEvent) => {
          this.handleMessage(ev.data);
        };

        ws.onclose = (ev: CloseEvent) => {
          this.clearTimers();
          const wasConnecting = this.connectReject !== null;
          this.state_ = "disconnected";
          this.events.emit("close", { code: ev.code, reason: ev.reason });
          // P3: reject connect() if close fires before open (e.g. failed handshake)
          if (wasConnecting) {
            const fn = this.connectReject;
            this.connectReject = null;
            fn?.(new WsConnectionError(`WebSocket closed before open (code ${ev.code})`));
            return;
          }
          if (!this.closing && this.autoReconnect) {
            this.scheduleReconnect();
          }
        };

        ws.onerror = (ev: Event) => {
          this.events.emit("error", { error: ev });
        };
      } catch (err) {
        this.connectReject = null;
        reject(new WsConnectionError("Failed to create WebSocket", err));
      }
    });
  }

  // -------------------------------------------------------------------------
  // Close
  // -------------------------------------------------------------------------

  close(): void {
    this.closing = true;
    this.clearTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Reject any pending connect() promise so callers don't hang
    if (this.connectReject) {
      const fn = this.connectReject;
      this.connectReject = null;
      fn(new WsConnectionError("close() called while connecting"));
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.state_ = "disconnected";
  }

  // -------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // -------------------------------------------------------------------------

  subscribe(
    channel: string,
    params: Record<string, unknown>,
    onMessage: MessageHandler,
    matchData?: DataMatcher,
  ): () => void {
    const fullParams = { channel, ...params };
    const key = subscriptionKey(channel, fullParams);
    let sub = this.subscriptions.get(key);
    const isNew = !sub;
    if (!sub) {
      sub = { channel, params: fullParams, listeners: new Set(), matchData };
      this.subscriptions.set(key, sub);
    }
    sub.listeners.add(onMessage);

    // Only send server subscribe for the first listener on this key
    if (isNew && this.state_ === "connected") {
      this.sendSubscribe(fullParams);
    }

    return () => {
      const s = this.subscriptions.get(key);
      if (!s) return;
      s.listeners.delete(onMessage);
      // Only send server unsubscribe when the last listener is removed
      if (s.listeners.size === 0) {
        this.subscriptions.delete(key);
        if (this.state_ === "connected") {
          this.sendUnsubscribe(fullParams);
        }
      }
    };
  }

  private sendSubscribe(params: Record<string, unknown>): void {
    this.send({ op: "subscribe", id: ++this.requestId, params });
  }

  private sendUnsubscribe(params: Record<string, unknown>): void {
    this.send({ op: "unsubscribe", id: ++this.requestId, params });
  }

  private replaySubscriptions(): void {
    for (const sub of this.subscriptions.values()) {
      this.sendSubscribe(sub.params);
    }
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private handleMessage(raw: unknown): void {
    this.resetPing();

    let msg: WireRecord;
    try {
      const text = typeof raw === "string" ? raw : String(raw);
      msg = parseJsonBigInt(text) as WireRecord;
    } catch (err) {
      this.events.emit("error", {
        error: new WsProtocolError("Failed to parse WS message", String(raw)),
      });
      return;
    }

    // Handle op-level messages
    const op = msg.op;
    if (op === "pong") return;
    if (op === "subscribe" || op === "unsubscribe") {
      // Surface failed subscribe/unsubscribe as errors
      if (msg.success === false) {
        this.events.emit("error", {
          error: new WsProtocolError(
            `WS ${String(op)} failed: ${String(msg.error ?? "unknown")}`,
            String(raw),
          ),
        });
      }
      return;
    }

    // Data message: route to subscription
    const channel = msg.channel as string | undefined;
    if (!channel) return;

    const type = (msg.type as string) ?? "update";
    const data = msg.data;

    for (const sub of this.subscriptions.values()) {
      if (sub.channel !== channel) continue;
      // Skip if subscription has a data matcher that rejects this frame
      if (sub.matchData && !sub.matchData(data)) continue;
      for (const fn of sub.listeners) {
        try {
          fn(data, type as "snapshot" | "update");
        } catch (err) {
          this.events.emit("error", { error: err });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  private startPing(): void {
    this.clearTimers();
    this.pingTimer = setTimeout(() => this.sendPing(), this.pingInterval);
  }

  private resetPing(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.pingTimer = setTimeout(() => this.sendPing(), this.pingInterval);
  }

  private sendPing(): void {
    this.send({ op: "ping" });
    this.pongTimer = setTimeout(() => {
      // No pong received — force close to trigger reconnect
      if (this.ws) {
        this.ws.close();
      }
    }, this.pongTimeout);
  }

  private clearTimers(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Reconnect
  // -------------------------------------------------------------------------

  private scheduleReconnect(): void {
    const delay = reconnectDelay(this.reconnectAttempt, this.maxReconnectDelay);
    this.reconnectAttempt++;
    this.state_ = "reconnecting";
    this.events.emit("reconnect", { attempt: this.reconnectAttempt, delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect().catch(() => {
        // doConnect rejection is already emitted via the error event;
        // schedule another retry if autoReconnect is still active.
        if (!this.closing && this.autoReconnect) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  // -------------------------------------------------------------------------
  // Send
  // -------------------------------------------------------------------------

  private send(data: unknown): void {
    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
