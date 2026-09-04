/**
 * Typed WebSocket client for the Sodex spot engine.
 *
 * Design trade-offs:
 *   1. Market data channels each get a dedicated `subscribe*` method that
 *      returns an acknowledged, callable subscription handle.
 *   2. Account channels are consolidated behind `subscribeAccountState`.
 *      The SDK internally fans out to the relevant WS channels based on
 *      which optional callbacks the caller supplies, and the returned
 *      `subscription.unsubscribe()` tears down all of them at once.
 *   3. Data arrays from the WS (tickers, trades) are iterated and the
 *      callback is invoked per-item for `subscribeTicker` and friends.
 *      Bulk channels (`subscribeAllTickers`, `subscribeTrade`) pass the
 *      full array to the callback since the caller needs the batch.
 *   4. L4Book callback receives `WsOrderBook | WsOrderBookUpdate` — the
 *      first message is always a snapshot, subsequent ones are diffs.
 *      The caller distinguishes via `"firstUpdateId" in msg`.
 */

import type { WireRecord } from "../common/types";
import type { BookTicker, Kline, KlineInterval, MiniTicker, Trade } from "../common/types";
import type { SpotAccountSnapshot } from "../spot/types";
import type { SpotTicker } from "../spot/types";
import type { MiniEmitter } from "./emitter";
import { WsError } from "./errors";
import {
  parseSpotAccountSnapshot,
  parseWsBookTicker,
  parseWsCandle,
  parseWsMiniTicker,
  parseWsOrderBook,
  parseWsOrderBookUpdate,
  parseWsSpotAccountTrade,
  parseWsSpotAccountUpdate,
  parseWsSpotOrderUpdate,
  parseWsSpotTicker,
  parseWsTrade,
} from "./parsers";
import { type WsState, WsTransport } from "./transport";
import type {
  BookPushIntervalMs,
  CandlePushIntervalMs,
  SpotAccountSubscribeOptions,
  TickerPushIntervalMs,
  WsClientOptions,
  WsLifecycleEvents,
  WsOrderBook,
  WsOrderBookUpdate,
  WsSubscription,
  WsSubscriptionOptions,
} from "./types";

export class SpotWsClient {
  private readonly transport: WsTransport;
  private accountUser: string | null = null;
  private readonly accountSubscriptions = new Set<symbol>();

  /** Lifecycle events: `open`, `close`, `error`, `reconnect`. */
  get events(): MiniEmitter<WsLifecycleEvents> {
    return this.transport.events;
  }

  constructor(opts: WsClientOptions) {
    const url = `${toWsUrl(opts.baseUrl)}/ws/spot`;
    this.transport = new WsTransport({ ...opts, url });
  }

  connect(): Promise<void> {
    return this.transport.connect();
  }

  close(): void {
    this.transport.close();
    this.accountUser = null;
    this.accountSubscriptions.clear();
  }

  get state(): WsState {
    return this.transport.state;
  }

  // -----------------------------------------------------------------------
  // Market data channels
  // -----------------------------------------------------------------------

  subscribeTicker(
    params: { symbols: string[]; pushIntervalMs?: TickerPushIntervalMs },
    cb: (ticker: SpotTicker) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe(
      "ticker",
      { symbols: params.symbols, pushInterval: pushIntervalToWire(params.pushIntervalMs) },
      (data) => {
        for (const item of toArray(data)) {
          const rec = item as WireRecord;
          if (allowed.has(String(rec.s))) cb(parseWsSpotTicker(rec));
        }
      },
      undefined,
      options,
    );
  }

  subscribeAllTickers(
    cb: (tickers: SpotTicker[]) => void,
    opts?: WsSubscriptionOptions & { pushIntervalMs?: TickerPushIntervalMs },
  ): WsSubscription {
    return this.transport.subscribe(
      "allTicker",
      { pushInterval: pushIntervalToWire(opts?.pushIntervalMs) },
      (data) => {
        cb(toArray(data).map((d) => parseWsSpotTicker(d as WireRecord)));
      },
      undefined,
      opts,
    );
  }

  subscribeMiniTicker(
    params: { symbols: string[]; pushIntervalMs?: TickerPushIntervalMs },
    cb: (ticker: MiniTicker) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe(
      "miniTicker",
      { symbols: params.symbols, pushInterval: pushIntervalToWire(params.pushIntervalMs) },
      (data) => {
        for (const item of toArray(data)) {
          const rec = item as WireRecord;
          if (allowed.has(String(rec.s))) cb(parseWsMiniTicker(rec));
        }
      },
      undefined,
      options,
    );
  }

  subscribeAllMiniTickers(
    cb: (tickers: MiniTicker[]) => void,
    opts?: WsSubscriptionOptions & { pushIntervalMs?: TickerPushIntervalMs },
  ): WsSubscription {
    return this.transport.subscribe(
      "allMiniTicker",
      { pushInterval: pushIntervalToWire(opts?.pushIntervalMs) },
      (data) => {
        cb(toArray(data).map((d) => parseWsMiniTicker(d as WireRecord)));
      },
      undefined,
      opts,
    );
  }

  subscribeBookTicker(
    params: { symbols: string[] },
    cb: (ticker: BookTicker) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe(
      "bookTicker",
      { symbols: params.symbols },
      (data) => {
        for (const item of toArray(data)) {
          const rec = item as WireRecord;
          if (allowed.has(String(rec.s))) cb(parseWsBookTicker(rec));
        }
      },
      undefined,
      options,
    );
  }

  subscribeAllBookTickers(
    cb: (tickers: BookTicker[]) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    return this.transport.subscribe(
      "allBookTicker",
      {},
      (data) => {
        cb(toArray(data).map((d) => parseWsBookTicker(d as WireRecord)));
      },
      undefined,
      options,
    );
  }

  subscribeL2Book(
    params: { symbol: string; tickSize: string; pushIntervalMs?: BookPushIntervalMs },
    cb: (book: WsOrderBook) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const sym = params.symbol;
    return this.transport.subscribe(
      "l2Book",
      {
        symbol: sym,
        tickSize: params.tickSize,
        pushInterval: pushIntervalToWire(params.pushIntervalMs),
      },
      (data) => {
        cb(parseWsOrderBook(data as WireRecord));
      },
      (data) => String((data as WireRecord).s) === sym,
      options,
    );
  }

  subscribeL4Book(
    params: { symbol: string; level?: number },
    cb: (book: WsOrderBook | WsOrderBookUpdate, type: "snapshot" | "update") => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const sym = params.symbol;
    return this.transport.subscribe(
      "l4Book",
      { symbol: sym, level: params.level },
      (data, type) => {
        const rec = data as WireRecord;
        if (type === "snapshot") cb(parseWsOrderBook(rec), type);
        else cb(parseWsOrderBookUpdate(rec), type);
      },
      (data) => String((data as WireRecord).s) === sym,
      options,
    );
  }

  subscribeCandle(
    params: { symbol: string; interval: KlineInterval; pushIntervalMs?: CandlePushIntervalMs },
    cb: (kline: Kline) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const sym = params.symbol;
    const ivl = params.interval;
    return this.transport.subscribe(
      "candle",
      {
        symbol: sym,
        interval: ivl,
        pushInterval: pushIntervalToWire(params.pushIntervalMs),
      },
      (data) => {
        cb(parseWsCandle(data as WireRecord));
      },
      (data) => {
        const rec = data as WireRecord;
        return String(rec.s) === sym && String(rec.i) === ivl;
      },
      options,
    );
  }

  subscribeTrade(
    params: { symbols: string[] },
    cb: (trades: Trade[]) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe(
      "trade",
      { symbols: params.symbols },
      (data) => {
        const filtered = toArray(data)
          .filter((d) => allowed.has(String((d as WireRecord).s)))
          .map((d) => parseWsTrade(d as WireRecord));
        if (filtered.length > 0) cb(filtered);
      },
      undefined,
      options,
    );
  }

  // -----------------------------------------------------------------------
  // Account (consolidated subscription)
  // -----------------------------------------------------------------------

  /**
   * Subscribe to account state and optionally to granular account events.
   *
   * The SDK subscribes to `accountState` for the snapshot, and conditionally
   * to `accountUpdate`, `accountOrderUpdate`, and `accountTrade` based on
   * which callbacks are provided in `opts`.
   *
   * Returns a single acknowledged handle that tears down all channels.
   */
  subscribeAccountState(
    params: {
      user: string;
      symbols?: string[];
      /** Push throttling for the `accountState` snapshot stream only.
       *  Granular event channels (`accountUpdate`, `accountOrderUpdate`,
       *  `accountTrade`) do not honor `pushInterval` server-side. */
      pushIntervalMs?: BookPushIntervalMs;
    },
    onSnapshot: (snapshot: SpotAccountSnapshot) => void,
    opts?: SpotAccountSubscribeOptions,
  ): WsSubscription {
    // Guard: account data messages don't include `user`, so mixing users
    // on one connection would cross-deliver. Reject early.
    if (this.accountUser && this.accountUser !== params.user) {
      throw new WsError(
        `Cannot subscribe to account for "${params.user}" — this client already has an account subscription for "${this.accountUser}". Use a separate SpotWsClient per user.`,
      );
    }
    this.accountUser = params.user;
    const accountRegistration = Symbol();
    this.accountSubscriptions.add(accountRegistration);

    const subscriptions: WsSubscription[] = [];
    const releaseAccount = () => {
      if (!this.accountSubscriptions.delete(accountRegistration)) return;
      if (this.accountSubscriptions.size === 0) this.accountUser = null;
    };
    let lifecycleFailed = false;
    const lifecycleOptions: WsSubscriptionOptions = {
      signal: opts?.signal,
      onError: (error) => {
        releaseAccount();
        if (lifecycleFailed) return;
        lifecycleFailed = true;
        opts?.onError?.(error);
      },
    };

    // Always subscribe to accountState
    subscriptions.push(
      this.transport.subscribe(
        "accountState",
        { user: params.user, pushInterval: pushIntervalToWire(params.pushIntervalMs) },
        (data) => {
          onSnapshot(parseSpotAccountSnapshot(data as WireRecord));
        },
        undefined,
        lifecycleOptions,
      ),
    );

    // TWAP and balances ride the same accountUpdate frame: subscribe when
    // either callback is set, parse once, dispatch to both.
    if (opts?.onBalanceUpdate || opts?.onTwapUpdate) {
      const onBalance = opts.onBalanceUpdate;
      const onTwap = opts.onTwapUpdate;
      subscriptions.push(
        this.transport.subscribe(
          "accountUpdate",
          { user: params.user },
          (data) => {
            const update = parseWsSpotAccountUpdate(data as WireRecord);
            if (onBalance) onBalance(update);
            if (onTwap) onTwap(update.twaps);
          },
          undefined,
          lifecycleOptions,
        ),
      );
    }

    if (opts?.onOrderUpdate) {
      const cb = opts.onOrderUpdate;
      subscriptions.push(
        this.transport.subscribe(
          "accountOrderUpdate",
          { user: params.user, symbols: params.symbols },
          (data) => {
            for (const item of toArray(data)) {
              cb(parseWsSpotOrderUpdate(item as WireRecord));
            }
          },
          undefined,
          lifecycleOptions,
        ),
      );
    }

    if (opts?.onTrade) {
      const cb = opts.onTrade;
      subscriptions.push(
        this.transport.subscribe(
          "accountTrade",
          { user: params.user, symbols: params.symbols },
          (data) => {
            for (const item of toArray(data)) {
              cb(parseWsSpotAccountTrade(item as WireRecord));
            }
          },
          undefined,
          lifecycleOptions,
        ),
      );
    }

    const unsubscribe = async (): Promise<void> => {
      try {
        await Promise.all(subscriptions.map((subscription) => subscription.unsubscribe()));
      } finally {
        releaseAccount();
      }
    };
    const handle = (() => {
      void unsubscribe().catch((error) => this.transport.events.emit("error", { error }));
    }) as WsSubscription;
    const ready = Promise.all(subscriptions.map((subscription) => subscription.ready))
      .then(() => undefined)
      .catch((error) => {
        releaseAccount();
        throw error;
      });
    ready.catch(() => {});
    Object.defineProperties(handle, {
      ready: { value: ready, enumerable: true },
      unsubscribe: { value: unsubscribe, enumerable: true },
    });
    return handle;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toArray(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [data];
}

/** Normalize `https://` → `wss://`, strip trailing slash. */
function toWsUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "").replace(/^https:\/\//, "wss://");
}

/** Convert a numeric ms to the gateway's `"<n>ms"` wire form, or undefined. */
function pushIntervalToWire(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : `${ms}ms`;
}
