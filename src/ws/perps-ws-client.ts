/**
 * Typed WebSocket client for the Sodex perps engine.
 *
 * Same patterns as `SpotWsClient` — see that file for design trade-offs.
 * Perps adds `subscribeMarkPrice` / `subscribeAllMarkPrices` and uses
 * perps-specific types for account channels (positions, liquidations).
 */

import type { WireRecord } from "../common/types";
import type { BookTicker, Kline, KlineInterval, MiniTicker, Trade } from "../common/types";
import type { MarkPriceTicker, PerpsAccountSnapshot, PerpsTicker } from "../perps/types";
import type { MiniEmitter } from "./emitter";
import { WsError } from "./errors";
import {
  parsePerpsAccountSnapshot,
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
  parseWsPerpsTicker,
  parseWsTrade,
} from "./parsers";
import { type WsState, WsTransport } from "./transport";
import type {
  BookPushIntervalMs,
  CandlePushIntervalMs,
  PerpsAccountSubscribeOptions,
  TickerPushIntervalMs,
  WsClientOptions,
  WsCoinPrice,
  WsLifecycleEvents,
  WsOrderBook,
  WsOrderBookUpdate,
  WsSubscription,
  WsSubscriptionOptions,
} from "./types";

export class PerpsWsClient {
  private readonly transport: WsTransport;
  private accountUser: string | null = null;
  private readonly accountSubscriptions = new Set<symbol>();

  get events(): MiniEmitter<WsLifecycleEvents> {
    return this.transport.events;
  }

  constructor(opts: WsClientOptions) {
    const url = `${toWsUrl(opts.baseUrl)}/ws/perps`;
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
    cb: (ticker: PerpsTicker) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe(
      "ticker",
      { symbols: params.symbols, pushInterval: pushIntervalToWire(params.pushIntervalMs) },
      (data) => {
        for (const item of toArray(data)) {
          const rec = item as WireRecord;
          if (allowed.has(String(rec.s))) cb(parseWsPerpsTicker(rec));
        }
      },
      undefined,
      options,
    );
  }

  subscribeAllTickers(
    cb: (tickers: PerpsTicker[]) => void,
    opts?: WsSubscriptionOptions & { pushIntervalMs?: TickerPushIntervalMs },
  ): WsSubscription {
    return this.transport.subscribe(
      "allTicker",
      { pushInterval: pushIntervalToWire(opts?.pushIntervalMs) },
      (data) => {
        cb(toArray(data).map((d) => parseWsPerpsTicker(d as WireRecord)));
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

  /** Subscribe to mark price for specific symbols (perps only). */
  subscribeMarkPrice(
    params: { symbols: string[]; pushIntervalMs?: TickerPushIntervalMs },
    cb: (price: MarkPriceTicker) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe(
      "markPrice",
      { symbols: params.symbols, pushInterval: pushIntervalToWire(params.pushIntervalMs) },
      (data) => {
        for (const item of toArray(data)) {
          const rec = item as WireRecord;
          if (allowed.has(String(rec.s))) cb(parseWsMarkPrice(rec));
        }
      },
      undefined,
      options,
    );
  }

  /** Subscribe to mark prices for all symbols (perps only). */
  subscribeAllMarkPrices(
    cb: (prices: MarkPriceTicker[]) => void,
    opts?: WsSubscriptionOptions & { pushIntervalMs?: TickerPushIntervalMs },
  ): WsSubscription {
    return this.transport.subscribe(
      "allMarkPrice",
      { pushInterval: pushIntervalToWire(opts?.pushIntervalMs) },
      (data) => {
        cb(toArray(data).map((d) => parseWsMarkPrice(d as WireRecord)));
      },
      undefined,
      opts,
    );
  }

  /**
   * Subscribe to oracle coin price + margin ratio for specific coins
   * (`coinPrice` channel, perps only). Identify coins by name, e.g. `vBTC`.
   *
   * The stream pushes a snapshot followed by updates; the callback fires once
   * per coin record in each frame. Server cadence is at most once per second
   * per block and only when price or margin ratio changes — there is no
   * client `pushInterval`.
   */
  subscribeCoinPrice(
    params: { coins: string[] },
    cb: (price: WsCoinPrice) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    const allowed = new Set(params.coins);
    return this.transport.subscribe(
      "coinPrice",
      { coins: params.coins },
      (data) => {
        for (const item of toArray(data)) {
          const rec = item as WireRecord;
          if (allowed.has(String(rec.a))) cb(parseWsCoinPrice(rec));
        }
      },
      undefined,
      options,
    );
  }

  /**
   * Subscribe to oracle coin price + margin ratio for all coins
   * (`allCoinPrice` channel, perps only). Each update frame contains only the
   * coins whose price or margin ratio changed, so the callback receives a
   * partial list per push (the initial snapshot carries every coin).
   */
  subscribeAllCoinPrices(
    cb: (prices: WsCoinPrice[]) => void,
    options?: WsSubscriptionOptions,
  ): WsSubscription {
    return this.transport.subscribe(
      "allCoinPrice",
      {},
      (data) => {
        cb(toArray(data).map((d) => parseWsCoinPrice(d as WireRecord)));
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

  subscribeAccountState(
    params: {
      user: string;
      symbols?: string[];
      /** Push throttling for the `accountState` snapshot stream only.
       *  Granular event channels (`accountUpdate`, `accountOrderUpdate`,
       *  `accountTrade`, `accountEvent`) do not honor `pushInterval`
       *  server-side. */
      pushIntervalMs?: BookPushIntervalMs;
    },
    onSnapshot: (snapshot: PerpsAccountSnapshot) => void,
    opts?: PerpsAccountSubscribeOptions,
  ): WsSubscription {
    if (this.accountUser && this.accountUser !== params.user) {
      throw new WsError(
        `Cannot subscribe to account for "${params.user}" — this client already has an account subscription for "${this.accountUser}". Use a separate PerpsWsClient per user.`,
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

    subscriptions.push(
      this.transport.subscribe(
        "accountState",
        { user: params.user, pushInterval: pushIntervalToWire(params.pushIntervalMs) },
        (data) => {
          onSnapshot(parsePerpsAccountSnapshot(data as WireRecord));
        },
        undefined,
        lifecycleOptions,
      ),
    );

    // TWAP and balances/positions ride the same accountUpdate frame: subscribe
    // when either callback is set, parse once, dispatch to both.
    if (opts?.onBalanceUpdate || opts?.onTwapUpdate) {
      const onBalance = opts.onBalanceUpdate;
      const onTwap = opts.onTwapUpdate;
      subscriptions.push(
        this.transport.subscribe(
          "accountUpdate",
          { user: params.user },
          (data) => {
            const update = parseWsPerpsAccountUpdate(data as WireRecord);
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
              cb(parseWsPerpsOrderUpdate(item as WireRecord));
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
              cb(parseWsPerpsAccountTrade(item as WireRecord));
            }
          },
          undefined,
          lifecycleOptions,
        ),
      );
    }

    if (opts?.onLiquidation) {
      const cb = opts.onLiquidation;
      subscriptions.push(
        this.transport.subscribe(
          "accountEvent",
          { user: params.user },
          (data) => {
            const rec = data as WireRecord;
            if (rec.type === "liquidation") {
              cb(parseWsLiquidationEvent(rec));
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
