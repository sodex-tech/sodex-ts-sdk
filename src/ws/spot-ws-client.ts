/**
 * Typed WebSocket client for the Sodex spot engine.
 *
 * Design trade-offs:
 *   1. Market data channels each get a dedicated `subscribe*` method that
 *      returns an unsubscribe function — clean for `useEffect` cleanup.
 *   2. Account channels are consolidated behind `subscribeAccountState`.
 *      The SDK internally fans out to the relevant WS channels based on
 *      which optional callbacks the caller supplies, and the returned
 *      `unsub()` tears down all of them at once.
 *   3. Data arrays from the WS (tickers, trades) are iterated and the
 *      callback is invoked per-item for `subscribeTicker` and friends.
 *      Bulk channels (`subscribeAllTickers`, `subscribeTrade`) pass the
 *      full array to the callback since the caller needs the batch.
 *   4. L4Book callback receives `WsOrderBook | WsOrderBookUpdate` — the
 *      first message is always a snapshot, subsequent ones are diffs.
 *      The caller distinguishes via `"firstUpdateId" in msg`.
 */

import type { WireRecord } from "../common/types";
import type {
  BookTicker,
  Kline,
  KlineInterval,
  MiniTicker,
  Trade,
} from "../common/types";
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
import { WsTransport, type WsState } from "./transport";
import type {
  SpotAccountSubscribeOptions,
  WsClientOptions,
  WsLifecycleEvents,
  WsOrderBook,
  WsOrderBookUpdate,
} from "./types";

export class SpotWsClient {
  private readonly transport: WsTransport;
  private accountUser: string | null = null;

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
  }

  get state(): WsState {
    return this.transport.state;
  }

  // -----------------------------------------------------------------------
  // Market data channels
  // -----------------------------------------------------------------------

  subscribeTicker(
    params: { symbols: string[] },
    cb: (ticker: SpotTicker) => void,
  ): () => void {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe("ticker", { symbols: params.symbols }, (data) => {
      for (const item of toArray(data)) {
        const rec = item as WireRecord;
        if (allowed.has(String(rec.s))) cb(parseWsSpotTicker(rec));
      }
    });
  }

  subscribeAllTickers(cb: (tickers: SpotTicker[]) => void): () => void {
    return this.transport.subscribe("allTicker", {}, (data) => {
      cb(toArray(data).map((d) => parseWsSpotTicker(d as WireRecord)));
    });
  }

  subscribeMiniTicker(
    params: { symbols: string[] },
    cb: (ticker: MiniTicker) => void,
  ): () => void {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe("miniTicker", { symbols: params.symbols }, (data) => {
      for (const item of toArray(data)) {
        const rec = item as WireRecord;
        if (allowed.has(String(rec.s))) cb(parseWsMiniTicker(rec));
      }
    });
  }

  subscribeAllMiniTickers(cb: (tickers: MiniTicker[]) => void): () => void {
    return this.transport.subscribe("allMiniTicker", {}, (data) => {
      cb(toArray(data).map((d) => parseWsMiniTicker(d as WireRecord)));
    });
  }

  subscribeBookTicker(
    params: { symbols: string[] },
    cb: (ticker: BookTicker) => void,
  ): () => void {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe("bookTicker", { symbols: params.symbols }, (data) => {
      for (const item of toArray(data)) {
        const rec = item as WireRecord;
        if (allowed.has(String(rec.s))) cb(parseWsBookTicker(rec));
      }
    });
  }

  subscribeAllBookTickers(cb: (tickers: BookTicker[]) => void): () => void {
    return this.transport.subscribe("allBookTicker", {}, (data) => {
      cb(toArray(data).map((d) => parseWsBookTicker(d as WireRecord)));
    });
  }

  subscribeL2Book(
    params: { symbol: string; tickSize: string },
    cb: (book: WsOrderBook) => void,
  ): () => void {
    const sym = params.symbol;
    return this.transport.subscribe(
      "l2Book",
      { symbol: sym, tickSize: params.tickSize },
      (data) => { cb(parseWsOrderBook(data as WireRecord)); },
      (data) => String((data as WireRecord).s) === sym,
    );
  }

  subscribeL4Book(
    params: { symbol: string; level?: number },
    cb: (book: WsOrderBook | WsOrderBookUpdate, type: "snapshot" | "update") => void,
  ): () => void {
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
    );
  }

  subscribeCandle(
    params: { symbol: string; interval: KlineInterval },
    cb: (kline: Kline) => void,
  ): () => void {
    const sym = params.symbol;
    const ivl = params.interval;
    return this.transport.subscribe(
      "candle",
      { symbol: sym, interval: ivl },
      (data) => { cb(parseWsCandle(data as WireRecord)); },
      (data) => {
        const rec = data as WireRecord;
        return String(rec.s) === sym && String(rec.i) === ivl;
      },
    );
  }

  subscribeTrade(
    params: { symbols: string[] },
    cb: (trades: Trade[]) => void,
  ): () => void {
    const allowed = new Set(params.symbols);
    return this.transport.subscribe("trade", { symbols: params.symbols }, (data) => {
      const filtered = toArray(data)
        .filter((d) => allowed.has(String((d as WireRecord).s)))
        .map((d) => parseWsTrade(d as WireRecord));
      if (filtered.length > 0) cb(filtered);
    });
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
   * Returns a single unsubscribe function that tears down all channels.
   */
  subscribeAccountState(
    params: { user: string; symbols?: string[] },
    onSnapshot: (snapshot: SpotAccountSnapshot) => void,
    opts?: SpotAccountSubscribeOptions,
  ): () => void {
    // Guard: account data messages don't include `user`, so mixing users
    // on one connection would cross-deliver. Reject early.
    if (this.accountUser && this.accountUser !== params.user) {
      throw new WsError(
        `Cannot subscribe to account for "${params.user}" — this client already ` +
          `has an account subscription for "${this.accountUser}". Use a separate ` +
          `SpotWsClient per user.`,
      );
    }
    this.accountUser = params.user;

    const unsubs: Array<() => void> = [];

    // Always subscribe to accountState
    unsubs.push(
      this.transport.subscribe("accountState", { user: params.user }, (data) => {
        onSnapshot(parseSpotAccountSnapshot(data as WireRecord));
      }),
    );

    if (opts?.onBalanceUpdate) {
      const cb = opts.onBalanceUpdate;
      unsubs.push(
        this.transport.subscribe("accountUpdate", { user: params.user }, (data) => {
          cb(parseWsSpotAccountUpdate(data as WireRecord));
        }),
      );
    }

    if (opts?.onOrderUpdate) {
      const cb = opts.onOrderUpdate;
      unsubs.push(
        this.transport.subscribe(
          "accountOrderUpdate",
          { user: params.user, symbols: params.symbols },
          (data) => {
            for (const item of toArray(data)) {
              cb(parseWsSpotOrderUpdate(item as WireRecord));
            }
          },
        ),
      );
    }

    if (opts?.onTrade) {
      const cb = opts.onTrade;
      unsubs.push(
        this.transport.subscribe(
          "accountTrade",
          { user: params.user, symbols: params.symbols },
          (data) => {
            for (const item of toArray(data)) {
              cb(parseWsSpotAccountTrade(item as WireRecord));
            }
          },
        ),
      );
    }

    return () => {
      for (const unsub of unsubs) unsub();
      this.accountUser = null;
    };
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
