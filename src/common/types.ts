import {
  type ApiKeyType,
  type ExecType,
  type OrderModifier,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type PositionSide,
  type StopType,
  type TimeInForce,
  type TransferAssetKind,
  type TriggerType,
  apiKeyTypeFromName,
  orderSideFromName,
} from "./enums";

// biome-ignore lint/suspicious/noExplicitAny: wire boundary
export type WireRecord = Record<string, any>;

export interface BookTicker {
  symbol: string;
  bidPx: string;
  bidSz: string;
  askPx: string;
  askSz: string;
}

/**
 * Parse `BookTicker` from wire (sodex-docs/rest-v1/schema.md#bookticker).
 * All 5 fields required. Spot and perps share an identical wire shape so
 * this parser lives in `common`.
 */
export function parseBookTicker(raw: WireRecord): BookTicker {
  requireWireField(raw, "parseBookTicker", "symbol");
  requireWireField(raw, "parseBookTicker", "bidPx");
  requireWireField(raw, "parseBookTicker", "bidSz");
  requireWireField(raw, "parseBookTicker", "askPx");
  requireWireField(raw, "parseBookTicker", "askSz");
  return {
    symbol: String(raw.symbol),
    bidPx: String(raw.bidPx),
    bidSz: String(raw.bidSz),
    askPx: String(raw.askPx),
    askSz: String(raw.askSz),
  };
}

export interface MiniTicker {
  symbol: string;
  lastPx: string;
  openPx: string;
  highPx: string;
  lowPx: string;
  volume: string;
  quoteVolume: string;
  openTime: bigint;
  closeTime: bigint;
}

/**
 * Parse `MiniTicker` from wire (sodex-docs/rest-v1/schema.md#miniticker).
 * All 9 fields required. Spot and perps share an identical wire shape.
 */
export function parseMiniTicker(raw: WireRecord): MiniTicker {
  for (const key of [
    "symbol",
    "lastPx",
    "openPx",
    "highPx",
    "lowPx",
    "volume",
    "quoteVolume",
    "openTime",
    "closeTime",
  ] as const) {
    requireWireField(raw, "parseMiniTicker", key);
  }
  return {
    symbol: String(raw.symbol),
    lastPx: String(raw.lastPx),
    openPx: String(raw.openPx),
    highPx: String(raw.highPx),
    lowPx: String(raw.lowPx),
    volume: String(raw.volume),
    quoteVolume: String(raw.quoteVolume),
    openTime: BigInt(raw.openTime),
    closeTime: BigInt(raw.closeTime),
  };
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBook {
  symbol: string;
  /** Monotonic sequence number (wire `updateID`). */
  updateID: bigint;
  /** Chain block time in milliseconds (wire `blockTime`). */
  blockTime: bigint;
  /** Chain block height (wire `blockHeight`). */
  blockHeight: bigint;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

/**
 * Parse a REST `OrderBook` record.
 *
 * Strict wire shape: `{blockTime, blockHeight, updateID, bids, asks}`. `symbol`
 * is taken from the caller's request context because the REST wire omits it.
 * Levels must be `[price, size]` tuples of length exactly 2 — a longer tuple
 * signals a schema change we want to surface, not ignore.
 */
export function parseOrderBook(raw: WireRecord, ctx: { symbol: string }): OrderBook {
  requireWireField(raw, "parseOrderBook", "updateID");
  requireWireField(raw, "parseOrderBook", "blockTime");
  requireWireField(raw, "parseOrderBook", "blockHeight");
  requireWireField(raw, "parseOrderBook", "bids");
  requireWireField(raw, "parseOrderBook", "asks");
  return {
    symbol: ctx.symbol,
    updateID: BigInt(raw.updateID),
    blockTime: BigInt(raw.blockTime),
    blockHeight: BigInt(raw.blockHeight),
    bids: toOrderBookLevels(raw.bids, "bids"),
    asks: toOrderBookLevels(raw.asks, "asks"),
  };
}

function toOrderBookLevels(raw: unknown, side: "bids" | "asks"): OrderBookLevel[] {
  if (!Array.isArray(raw)) {
    throw new Error(`parseOrderBook: \`${side}\` must be an array`);
  }
  return raw.map((l, i) => {
    if (!Array.isArray(l) || l.length !== 2) {
      throw new Error(
        `parseOrderBook: ${side}[${i}] must be a [price, size] tuple of length 2`,
      );
    }
    return { price: String(l[0]), size: String(l[1]) };
  });
}

/**
 * Candle/kline bucket width. The REST server accepts the union below; note
 * that spot supports the full set while perps omits `8h`, `12h`, and `3D`.
 * Passing an unsupported interval to a given engine returns a server error.
 *
 * Source: sodex-docs/rest-v1/sodex-rest-{spot,perps}-api.md
 */
export type KlineInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "8h"
  | "12h"
  | "1D"
  | "3D"
  | "1W"
  | "1M";

/**
 * Fixed-duration interval lookup in milliseconds. `1M` (calendar month) is
 * intentionally absent — month length varies (28–31 days), so computing a
 * reliable closeTime for monthly klines requires calendar math that callers
 * should perform themselves.
 */
const KLINE_INTERVAL_MS: Partial<Record<KlineInterval, bigint>> = {
  "1m": 60_000n,
  "5m": 300_000n,
  "15m": 900_000n,
  "30m": 1_800_000n,
  "1h": 3_600_000n,
  "4h": 14_400_000n,
  "8h": 28_800_000n,
  "12h": 43_200_000n,
  "1D": 86_400_000n,
  "3D": 259_200_000n,
  "1W": 604_800_000n,
};

/** Returns interval duration in milliseconds, or undefined for `1M`. */
export function klineIntervalMs(interval: KlineInterval): bigint | undefined {
  return KLINE_INTERVAL_MS[interval];
}

export interface Kline {
  symbol: string;
  interval: KlineInterval | string;
  openTime: bigint;
  openPx: string;
  highPx: string;
  lowPx: string;
  closePx: string;
  /** Base-asset volume. */
  volume: string;
  /** Quote-asset volume. */
  quoteVolume: string;
  /** Undefined when the server omits `n` — do not read as "zero trades". */
  tradeCount?: number;
}

/**
 * Parse a REST `RPCKline` record into a `Kline`.
 *
 * Design trade-offs:
 *   1. Strict wire-shape match. The REST endpoint documents exactly
 *      `{t, o, h, l, c, v, q, n?}` (sodex-docs/rest-v1/schema.md#rpckline).
 *      We do not accept verbose aliases (`openTime`, `open`, ...) or the
 *      WebSocket `candle` shape (`s, i, T, x`). Mixing shapes into one
 *      parser hides schema drift; when a WS client lands it will get its
 *      own parser.
 *   2. No default values for required fields. Missing `t/o/h/l/c/v/q`
 *      throws — fabricating `"0"` would render a plausible but wrong
 *      candle downstream (a needle to zero, or a silent type confusion
 *      between base and quote volume). We prefer loud failure.
 *   3. `tradeCount` is optional on the wire (`n`), so it is optional on
 *      the returned object too. Missing → `undefined`, never `0`.
 *   4. `symbol` and `interval` are taken from the caller's request
 *      context because the REST wire omits them. This is derivation,
 *      not invention — the caller asked for a specific symbol/interval
 *      and the whole response is about that tuple.
 *   5. `closeTime` is intentionally absent from `Kline`. The REST wire
 *      does not return it, and computing `openTime + intervalMs - 1`
 *      would assume an exclusive-end bucket convention that the server
 *      may not share. Callers who need a close time can call
 *      `klineIntervalMs(interval)` and do that arithmetic themselves.
 */
export function parseKline(
  raw: WireRecord,
  ctx: { symbol: string; interval: KlineInterval | string },
): Kline {
  requireWireField(raw, "parseKline", "t");
  requireWireField(raw, "parseKline", "o");
  requireWireField(raw, "parseKline", "h");
  requireWireField(raw, "parseKline", "l");
  requireWireField(raw, "parseKline", "c");
  requireWireField(raw, "parseKline", "v");
  requireWireField(raw, "parseKline", "q");
  const n = raw.n;
  return {
    symbol: ctx.symbol,
    interval: ctx.interval,
    openTime: BigInt(raw.t),
    openPx: String(raw.o),
    highPx: String(raw.h),
    lowPx: String(raw.l),
    closePx: String(raw.c),
    volume: String(raw.v),
    quoteVolume: String(raw.q),
    tradeCount: n === undefined || n === null ? undefined : Number(n),
  };
}

/**
 * Throws if `raw[key]` is missing or `null`. Use at the top of any parser for
 * each required wire field, so schema violations fail loud instead of being
 * papered over with sentinel defaults downstream.
 */
export function requireWireField(raw: WireRecord, parser: string, key: string): void {
  const v = raw[key];
  if (v === undefined || v === null) {
    throw new Error(`${parser}: wire record missing required field \`${key}\``);
  }
}

/**
 * Coerce an optional wire field to `string | undefined`. Returns `undefined`
 * when the field is missing or `null` — never falls back to `""`. Intended
 * for schema fields marked `required: false`, so callers can distinguish
 * "server did not report" from "server reported empty string".
 */
export function optString(raw: WireRecord, key: string): string | undefined {
  const v = raw[key];
  return v === undefined || v === null ? undefined : String(v);
}

/**
 * Coerce an optional wire field to `bigint | undefined`. Returns `undefined`
 * when the field is missing or `null`.
 */
export function optBigInt(raw: WireRecord, key: string): bigint | undefined {
  const v = raw[key];
  return v === undefined || v === null ? undefined : BigInt(v);
}

/**
 * Coerce an optional array-of-uint64 wire field to `bigint[] | undefined`.
 * Returns `undefined` when the field is missing or `null`; throws when the
 * field is present but not an array (schema drift).
 */
export function optBigIntArray(
  raw: WireRecord,
  parser: string,
  key: string,
): bigint[] | undefined {
  const v = raw[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    throw new Error(`${parser}: wire field \`${key}\` must be an array of uint64`);
  }
  return v.map((x) => BigInt(x));
}

/**
 * Coerce an optional wire boolean to `boolean | undefined`. Strict: throws if
 * the field is present but not a JS boolean (guards against `0`/`1`/`"true"`
 * creeping in from a different shape — we want those to be surfaced, not
 * silently coerced via `Boolean(x)`).
 */
export function optBoolean(raw: WireRecord, parser: string, key: string): boolean | undefined {
  const v = raw[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") {
    throw new Error(`${parser}: wire field \`${key}\` must be a boolean, got ${typeof v}`);
  }
  return v;
}

/**
 * Coerce a required wire boolean. Throws if absent, null, or not a boolean.
 */
export function requireBoolean(raw: WireRecord, parser: string, key: string): boolean {
  requireWireField(raw, parser, key);
  const v = raw[key];
  if (typeof v !== "boolean") {
    throw new Error(`${parser}: wire field \`${key}\` must be a boolean, got ${typeof v}`);
  }
  return v;
}

/**
 * Coerce an optional enum-valued wire field via the supplied name→enum
 * projector. Returns `undefined` when the field is missing or `null`. Use
 * for WS snapshot shapes that declare `T | null` for stop types, trigger
 * types, etc.
 */
export function optEnum<T>(
  raw: WireRecord,
  key: string,
  fromName: (s: string) => T,
): T | undefined {
  const v = raw[key];
  return v === undefined || v === null ? undefined : fromName(String(v));
}

export interface Trade {
  /** Trade ID (wire `t`). */
  id: bigint;
  /** Trade time in milliseconds (wire `T`). */
  time: bigint;
  symbol: string;
  side: OrderSide;
  price: string;
  quantity: string;
  /** Buyer account ID (wire `bi`). Undefined when the server does not report it. */
  buyerAccountId?: bigint;
  /** Seller account ID (wire `si`). Undefined when the server does not report it. */
  sellerAccountId?: bigint;
}

/**
 * Parse a REST `Trade` record (sodex-docs/rest-v1/schema.md#trade).
 *
 * Strict wire shape: `{t, T, s, S, p, q, bi?, si?}`. Required fields throw on
 * absence; `bi`/`si` stay `undefined` when the server omits them. No notional
 * (`price × quantity`) or maker/taker inference — callers who need either can
 * compute it themselves from `price`, `quantity`, `side`, and the account IDs.
 */
export function parseTrade(raw: WireRecord): Trade {
  requireWireField(raw, "parseTrade", "t");
  requireWireField(raw, "parseTrade", "T");
  requireWireField(raw, "parseTrade", "s");
  requireWireField(raw, "parseTrade", "S");
  requireWireField(raw, "parseTrade", "p");
  requireWireField(raw, "parseTrade", "q");
  return {
    id: BigInt(raw.t),
    time: BigInt(raw.T),
    symbol: String(raw.s),
    side: orderSideFromName(raw.S),
    price: String(raw.p),
    quantity: String(raw.q),
    buyerAccountId:
      raw.bi === undefined || raw.bi === null ? undefined : BigInt(raw.bi),
    sellerAccountId:
      raw.si === undefined || raw.si === null ? undefined : BigInt(raw.si),
  };
}

/**
 * A fill attributable to the authenticated user, as returned by
 * `GET /accounts/{user}/trades`. Wire shape:
 * sodex-docs/rest-v1/schema.md#usertrade.
 *
 * The wire field `tradeID` is surfaced as `id` — same derivation pattern we
 * use for `Trade.id` (wire `t`). The type name `UserTrade` already carries
 * the "trade" semantic, so the shorter property name reads better at call
 * sites.
 */
export interface UserTrade {
  /** Trade ID (wire `tradeID`). */
  id: bigint;
  orderID: bigint;
  clOrdID: string;
  symbol: string;
  side: OrderSide;
  price: string;
  quantity: string;
  time: bigint;
  fee?: string;
  feeCoin?: string;
  /** Whether this fill was the maker side (from the user's perspective). */
  isMaker?: boolean;
}

export interface ApiKeyInfo {
  name: string;
  /** Wire `APIKeyTypeEnum` — `"PRIMARY"` or `"SUBACCOUNT"`. */
  type: ApiKeyType;
  /** Hex-encoded public key. */
  publicKey: string;
  /** Expiration timestamp in milliseconds. */
  expiresAt: bigint;
}

/**
 * Parse `APIKey` from wire (sodex-docs/rest-v1/schema.md#apikey). All four
 * fields are required; missing/null throws.
 */
export function parseApiKey(raw: WireRecord): ApiKeyInfo {
  requireWireField(raw, "parseApiKey", "name");
  requireWireField(raw, "parseApiKey", "type");
  requireWireField(raw, "parseApiKey", "publicKey");
  requireWireField(raw, "parseApiKey", "expiresAt");
  return {
    name: String(raw.name),
    type: apiKeyTypeFromName(String(raw.type)),
    publicKey: String(raw.publicKey),
    expiresAt: BigInt(raw.expiresAt),
  };
}

export interface FeeRate {
  makerFeeRate: string;
  takerFeeRate: string;
  feeTier: number;
  stakingTier: number;
  makerRebateTier: number;
}

/**
 * Parse `FeeRate` from wire (sodex-docs/rest-v1/schema.md#feerate). All five
 * fields are required; missing/null throws so we never mask a missing tier
 * as tier 0 (which is a valid distinct value).
 */
export function parseFeeRate(raw: WireRecord): FeeRate {
  requireWireField(raw, "parseFeeRate", "makerFeeRate");
  requireWireField(raw, "parseFeeRate", "takerFeeRate");
  requireWireField(raw, "parseFeeRate", "feeTier");
  requireWireField(raw, "parseFeeRate", "stakingTier");
  requireWireField(raw, "parseFeeRate", "makerRebateTier");
  return {
    makerFeeRate: String(raw.makerFeeRate),
    takerFeeRate: String(raw.takerFeeRate),
    feeTier: Number(raw.feeTier),
    stakingTier: Number(raw.stakingTier),
    makerRebateTier: Number(raw.makerRebateTier),
  };
}

export interface TransferReceipt {
  id: bigint;
}

export interface BatchOrderReceipt {
  code: number;
  clOrdID: string;
  orderID?: bigint;
  error?: string;
}

export interface PlaceOrderReceipt {
  code: number;
  clOrdID: string;
  orderID?: bigint;
  error?: string;
}

export interface BatchCancelReceipt extends BatchOrderReceipt {
  origClOrdID?: string;
}

export type BatchReplaceReceipt = BatchOrderReceipt;

export interface ReplaceOrderReceipt {
  symbolID: bigint;
  clOrdID: string;
  origOrderID?: bigint;
  origClOrdID?: string;
}

/**
 * Parse a batch order / cancel receipt entry. Wire shape:
 * `{code (req), clOrdID (req), error?, orderID?}` per
 * sodex-docs/rest-v1/sodex-rest-spot-api.md (Place batch / Cancel batch
 * response tables). Required fields throw on absence — `0` is a valid
 * success code and must not be conflated with "missing code".
 */
export function parseBatchOrderReceipt(raw: WireRecord): BatchOrderReceipt {
  requireWireField(raw, "parseBatchOrderReceipt", "code");
  requireWireField(raw, "parseBatchOrderReceipt", "clOrdID");
  return {
    code: Number(raw.code),
    clOrdID: String(raw.clOrdID),
    orderID: optBigInt(raw, "orderID"),
    error: optString(raw, "error"),
  };
}

export function parseBatchCancelReceipt(raw: WireRecord): BatchCancelReceipt {
  return {
    ...parseBatchOrderReceipt(raw),
    origClOrdID: optString(raw, "origClOrdID"),
  };
}

export const parseBatchReplaceReceipt = parseBatchOrderReceipt;

export function parseUserTrade(raw: WireRecord): UserTrade {
  requireWireField(raw, "parseUserTrade", "tradeID");
  requireWireField(raw, "parseUserTrade", "orderID");
  requireWireField(raw, "parseUserTrade", "clOrdID");
  requireWireField(raw, "parseUserTrade", "symbol");
  requireWireField(raw, "parseUserTrade", "side");
  requireWireField(raw, "parseUserTrade", "price");
  requireWireField(raw, "parseUserTrade", "quantity");
  requireWireField(raw, "parseUserTrade", "time");
  return {
    id: BigInt(raw.tradeID),
    orderID: BigInt(raw.orderID),
    clOrdID: String(raw.clOrdID),
    symbol: String(raw.symbol),
    side: orderSideFromName(raw.side),
    price: String(raw.price),
    quantity: String(raw.quantity),
    time: BigInt(raw.time),
    fee: optString(raw, "fee"),
    feeCoin: optString(raw, "feeCoin"),
    isMaker: optBoolean(raw, "parseUserTrade", "isMaker"),
  };
}

export type {
  ExecType,
  OrderModifier,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  StopType,
  TimeInForce,
  TransferAssetKind,
  TriggerType,
};
