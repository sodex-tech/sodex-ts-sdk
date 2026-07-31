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
import type { WsLifecycleEvents, WsSubscription, WsSubscriptionOptions } from "./types";

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
  listeners: Map<
    MessageHandler,
    {
      handler: MessageHandler;
      onError?: (error: Error) => void;
      removeAbort?: () => void;
    }
  >;
  matchData?: DataMatcher;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  confirmed: boolean;
  everConfirmed: boolean;
  pendingRequestId?: number;
}

interface PendingRequest {
  op: "subscribe" | "unsubscribe";
  subscriptionKey?: string;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface WsTransportOptions {
  url: string;
  WebSocket?: unknown;
  pingInterval?: number;
  pongTimeout?: number;
  autoReconnect?: boolean;
  maxReconnectDelay?: number;
  requestTimeout?: number;
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

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function raceWithAbort(
  promise: Promise<void>,
  signal: AbortSignal,
  onAbort: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new WsConnectionError("WebSocket subscription was aborted"),
      );
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
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
  private readonly requestTimeout: number;

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
  private readonly pendingRequests = new Map<number, PendingRequest>();

  constructor(opts: WsTransportOptions) {
    this.url = opts.url;
    this.pingInterval = opts.pingInterval ?? 15_000;
    this.pongTimeout = opts.pongTimeout ?? 10_000;
    this.autoReconnect = opts.autoReconnect ?? true;
    this.maxReconnectDelay = opts.maxReconnectDelay ?? MAX_DELAY;
    this.requestTimeout = opts.requestTimeout ?? 10_000;

    const ctor = opts.WebSocket ?? (globalThis as Record<string, unknown>).WebSocket;
    if (!ctor) {
      throw new WsConnectionError(
        "No WebSocket implementation found. Pass a WebSocket constructor via options " +
          '(e.g. `import WebSocket from "ws"; new SpotWsClient({ ..., WebSocket })`).',
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
          this.handleDisconnect();
          // P3: reject connect() if close fires before open (e.g. failed handshake)
          if (wasConnecting) {
            const fn = this.connectReject;
            this.connectReject = null;
            fn?.(new WsConnectionError(`WebSocket closed before open (code ${ev.code})`));
            if (!this.closing && this.autoReconnect) {
              this.scheduleReconnect();
            } else if (!this.closing) {
              this.failSubscriptions(
                new WsConnectionError(`WebSocket connection closed (code ${ev.code})`),
              );
            }
            return;
          }
          if (!this.closing && this.autoReconnect) {
            this.scheduleReconnect();
          } else if (!this.closing) {
            this.failSubscriptions(
              new WsConnectionError(`WebSocket connection closed (code ${ev.code})`),
            );
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
    this.rejectPendingRequests(new WsConnectionError("WebSocket client closed"));
    this.failSubscriptions(new WsConnectionError("WebSocket client closed"), false);
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
    options: WsSubscriptionOptions = {},
  ): WsSubscription {
    if (options.signal?.aborted) {
      throw new WsConnectionError("WebSocket subscription was aborted before registration");
    }
    const fullParams = { channel, ...params };
    const key = subscriptionKey(channel, fullParams);
    // Reject conflicting pushInterval on the same channel: incoming frames
    // carry no pushInterval tag, so handleMessage routes by channel alone.
    // Two active subs on the same channel with different pushIntervals
    // would cross-deliver, silently breaking the throttle contract.
    // `undefined` (server default cadence) is treated as a distinct value
    // from any explicit interval — mixing default with explicit on one
    // channel still cross-delivers.
    const incomingInterval = params.pushInterval;
    for (const existing of this.subscriptions.values()) {
      if (existing.channel !== channel) continue;
      const existingInterval = existing.params.pushInterval;
      if (existingInterval === incomingInterval) continue;
      throw new WsProtocolError(
        `Conflicting pushInterval for channel "${channel}": existing=${String(existingInterval)}, new=${String(incomingInterval)}. Per connection, each channel supports a single pushInterval (omitted = server default).`,
      );
    }
    let sub = this.subscriptions.get(key);
    const isNew = !sub;
    if (!sub) {
      const deferred = createDeferred();
      sub = {
        channel,
        params: fullParams,
        listeners: new Map(),
        matchData,
        ready: deferred.promise,
        resolveReady: deferred.resolve,
        rejectReady: deferred.reject,
        confirmed: false,
        everConfirmed: false,
      };
      // Legacy callers may never inspect `ready`; avoid unhandled rejections.
      sub.ready.catch(() => {});
      this.subscriptions.set(key, sub);
    }
    const registration = {
      handler: onMessage,
      onError: options.onError,
      removeAbort: undefined as (() => void) | undefined,
    };
    sub.listeners.set(onMessage, registration);

    // Only send server subscribe for the first listener on this key
    if (isNew && this.state_ === "connected") {
      this.sendSubscribe(key, sub);
    }

    let removed = false;
    const unsubscribe = async (): Promise<void> => {
      if (removed) return;
      removed = true;
      registration.removeAbort?.();
      const s = this.subscriptions.get(key);
      if (!s) return;
      s.listeners.delete(onMessage);
      // Only send server unsubscribe when the last listener is removed
      if (s.listeners.size === 0) {
        this.subscriptions.delete(key);
        if (!s.confirmed) {
          s.rejectReady(
            new WsConnectionError("WebSocket subscription was removed before confirmation"),
          );
        }
        if (this.state_ === "connected") {
          await this.sendUnsubscribe(fullParams);
        }
      }
    };

    const ready = options.signal
      ? raceWithAbort(sub.ready, options.signal, () => {
          void unsubscribe();
        })
      : sub.ready;
    ready.catch(() => {});
    if (options.signal) {
      const onAbort = () => {
        void unsubscribe();
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      registration.removeAbort = () => options.signal?.removeEventListener("abort", onAbort);
    }

    const handle = (() => {
      void unsubscribe().catch((error) => this.events.emit("error", { error }));
    }) as WsSubscription;
    Object.defineProperties(handle, {
      ready: { value: ready, enumerable: true },
      unsubscribe: { value: unsubscribe, enumerable: true },
    });
    return handle;
  }

  private sendSubscribe(key: string, sub: Subscription): void {
    if (sub.pendingRequestId !== undefined) return;
    const { id, promise } = this.sendRequest("subscribe", sub.params, key);
    sub.pendingRequestId = id;
    promise
      .then(() => {
        if (this.subscriptions.get(key) !== sub) return;
        sub.pendingRequestId = undefined;
        sub.confirmed = true;
        sub.everConfirmed = true;
        sub.resolveReady();
      })
      .catch((error) => {
        if (this.subscriptions.get(key) !== sub) return;
        sub.pendingRequestId = undefined;
        this.failSubscription(key, sub, error);
      });
  }

  private sendUnsubscribe(params: Record<string, unknown>): Promise<void> {
    const { promise } = this.sendRequest("unsubscribe", params);
    promise.catch((error) => this.events.emit("error", { error }));
    return promise;
  }

  private replaySubscriptions(): void {
    for (const [key, sub] of this.subscriptions) {
      this.sendSubscribe(key, sub);
    }
  }

  private sendRequest(
    op: "subscribe" | "unsubscribe",
    params: Record<string, unknown>,
    key?: string,
  ): { id: number; promise: Promise<void> } {
    const id = ++this.requestId;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => {});
    const timer = setTimeout(() => {
      const pending = this.pendingRequests.get(id);
      if (!pending) return;
      this.pendingRequests.delete(id);
      pending.reject(
        new WsProtocolError(`WS ${op} acknowledgement timed out after ${this.requestTimeout} ms`),
      );
    }, this.requestTimeout);
    this.pendingRequests.set(id, {
      op,
      subscriptionKey: key,
      resolve,
      reject,
      timer,
    });
    this.send({ op, id, params });
    return { id, promise };
  }

  private handleDisconnect(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
      if (pending.op === "unsubscribe") {
        pending.resolve();
        continue;
      }
      const key = pending.subscriptionKey;
      if (key) {
        const sub = this.subscriptions.get(key);
        if (sub?.pendingRequestId === id) sub.pendingRequestId = undefined;
        if (sub) sub.confirmed = false;
      }
    }
  }

  private rejectPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
      pending.reject(error);
    }
  }

  private failSubscription(key: string, sub: Subscription, error: Error, notify = true): void {
    if (this.subscriptions.get(key) !== sub) return;
    this.subscriptions.delete(key);
    sub.rejectReady(error);
    for (const registration of sub.listeners.values()) {
      registration.removeAbort?.();
      if (!notify || !sub.everConfirmed) continue;
      try {
        registration.onError?.(error);
      } catch {
        // One consumer error must not interfere with other listeners.
      }
    }
    if (notify) this.events.emit("error", { error });
  }

  private failSubscriptions(error: Error, notify = true): void {
    for (const [key, sub] of [...this.subscriptions]) {
      this.failSubscription(key, sub, error, notify);
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
      const id = Number(msg.id);
      const pending = Number.isFinite(id) ? this.pendingRequests.get(id) : undefined;
      const error =
        msg.success === false
          ? new WsProtocolError(
              `WS ${String(op)} failed: ${String(msg.error ?? "unknown")}`,
              String(raw),
            )
          : undefined;
      if (!pending) {
        if (error) this.events.emit("error", { error });
        return;
      }
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
      if (error) pending.reject(error);
      else pending.resolve();
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
      for (const registration of sub.listeners.values()) {
        try {
          registration.handler(data, type as "snapshot" | "update");
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
