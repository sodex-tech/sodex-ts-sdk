import type {
  ExecType,
  MarginMode,
  OrderBookLevel,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  StopType,
  TimeInForce,
  TriggerType,
} from "../common";

// ---------------------------------------------------------------------------
// Push throttling
// ---------------------------------------------------------------------------

// The gateway accepts a `pushInterval` string (e.g. `"1000ms"`) on a subset
// of channels, and only a discrete set of values per channel. The SDK
// surfaces these as numeric-ms literal unions so misuse is caught at compile
// time; the wire conversion happens inside the client.
//
// Channels NOT listed here (`bookTicker`, `allBookTicker`, `l4Book`, `trade`,
// `coinPrice`, `allCoinPrice`, `accountUpdate`, `accountOrderUpdate`,
// `accountTrade`, `accountEvent`) do not honor `pushInterval` server-side, so
// the SDK does not expose it on those subscriptions. (`coinPrice` /
// `allCoinPrice` push on each block, at most once per second when the price or
// margin ratio changes — that cadence is server-controlled, not a client
// `pushInterval`.)

/** Allowed `pushInterval` values (ms) for ticker/miniTicker/markPrice family. */
export type TickerPushIntervalMs = 1000 | 3000;

/** Allowed `pushInterval` values (ms) for the `candle` channel. */
export type CandlePushIntervalMs = 2000 | 5000;

/** Allowed `pushInterval` values (ms) for `l2Book` and `accountState`. */
export type BookPushIntervalMs = 500 | 1000 | 3000;

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface WsClientOptions {
  /** Full WS base URL, e.g. `"wss://mainnet-gw.sodex.dev"`. The client appends `/ws/spot` or `/ws/perps`. */
  baseUrl: string;
  /** Inject a `WebSocket` constructor for Node.js <22 or testing. Defaults to `globalThis.WebSocket`. */
  WebSocket?: unknown;
  /** Ping interval in ms. Default `15_000`. */
  pingInterval?: number;
  /** Enable auto-reconnect on close/error. Default `true`. */
  autoReconnect?: boolean;
  /** Max reconnect backoff delay in ms. Default `30_000`. */
  maxReconnectDelay?: number;
  /** Timeout for subscribe/unsubscribe acknowledgements. Default `10_000`. */
  requestTimeout?: number;
}

export interface WsSubscriptionOptions {
  /** Abort registration and remove this listener. */
  signal?: AbortSignal;
  /** Called when an acknowledged subscription later fails or cannot be restored. */
  onError?: (error: Error) => void;
}

/**
 * Backward-compatible subscription handle.
 *
 * Calling the handle still performs an immediate best-effort unsubscribe.
 * New integrations should await `ready` before depending on the stream and
 * await `unsubscribe()` during graceful shutdown.
 */
export interface WsSubscription {
  (): void;
  /** Resolves only after Gateway acknowledges the subscribe request. */
  readonly ready: Promise<void>;
  /** Remove the listener and await Gateway's final unsubscribe ack when needed. */
  unsubscribe(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------

export interface WsLifecycleEvents {
  open: undefined;
  close: { code: number; reason: string };
  error: { error: unknown };
  reconnect: { attempt: number; delay: number };
}

// ---------------------------------------------------------------------------
// Order book (WS-specific shapes)
// ---------------------------------------------------------------------------

/** L2/L4 order book snapshot from WS. */
export interface WsOrderBook {
  symbol: string;
  updateId: bigint;
  eventTime: bigint;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

/** L4 incremental order book diff. */
export interface WsOrderBookUpdate {
  symbol: string;
  firstUpdateId: bigint;
  lastUpdateId: bigint;
  eventTime: bigint;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

// ---------------------------------------------------------------------------
// Coin price (WS `coinPrice` / `allCoinPrice` channels, perps only)
// ---------------------------------------------------------------------------

/**
 * Oracle coin price + margin ratio update (WS `coinPrice` / `allCoinPrice`
 * channels, perps only). Wire shape: `{i, a, p, mr, E}` — all fields required.
 *
 * The REST equivalent is `PerpsClient.getCoins()` (`PerpsCoinInfo`); this is
 * the streaming counterpart, keyed per coin rather than per symbol.
 */
export interface WsCoinPrice {
  /** Coin ID (wire `i`). */
  coinId: bigint;
  /** Coin name, e.g. `vBTC` (wire `a`). */
  coin: string;
  /** Current oracle coin price (wire `p`). */
  price: string;
  /** Current margin ratio of this coin (wire `mr`). */
  marginRatio: string;
  /** Event timestamp in milliseconds (wire `E`). */
  eventTime: bigint;
}

// ---------------------------------------------------------------------------
// Account update (WS `accountUpdate` channel)
// ---------------------------------------------------------------------------

/**
 * TWAP order snapshot carried on the WS `accountUpdate` / `accountState`
 * `TO` field. Distinct wire shape from the REST `TwapOrder` (short single-
 * letter keys, no userID/accountID; symbol name instead of symbolID) — parsed
 * by `parseWsTwapOrder`, never merged with the REST parser.
 */
export interface WsTwapOrder {
  /** Symbol name (wire `s`). */
  symbol: string;
  /** TWAP order ID (wire `i`). */
  orderId: bigint;
  /** Order side (wire `S`). */
  side: OrderSide;
  /** TWAP total quantity (wire `q`). */
  quantity: string;
  /** TWAP duration in minutes (wire `m`). */
  minutes: bigint;
  /** Whether slices are randomized (wire `r`). */
  randomize: boolean;
  /** Reduce-only flag (wire `R`). */
  reduceOnly: boolean;
  /** Executed quantity (wire `z`). */
  executedQty: string;
  /** Executed notional value (wire `v`). */
  executedValue: string;
  /** Creation time in milliseconds (wire `ct`). */
  createdAt: bigint;
  /** Next activation time in milliseconds (wire `nt`). */
  nextActiveAt: bigint;
  /** Whether this TWAP is active (wire `a`). */
  active: boolean;
}

/** Spot balance update event (WS `accountUpdate` channel). */
export interface WsSpotAccountUpdate {
  eventTime: bigint;
  blockTime: bigint;
  blockHeight: bigint;
  balances: WsSpotBalanceUpdate[];
  /** Updated TWAP orders (wire `TO`). */
  twaps: WsTwapOrder[];
}

export interface WsSpotBalanceUpdate {
  coinId: bigint;
  coin: string;
  total: string;
  locked: string;
}

/** Perps balance+position update event (WS `accountUpdate` channel). */
export interface WsPerpsAccountUpdate {
  eventTime: bigint;
  blockTime: bigint;
  blockHeight: bigint;
  balances: WsPerpsBalanceUpdate[];
  positions: WsPerpsPositionUpdate[];
  /** Updated TWAP orders (wire `TO`). */
  twaps: WsTwapOrder[];
}

export interface WsPerpsBalanceUpdate {
  coinId: bigint;
  coin: string;
  walletBalance: string;
}

export interface WsPerpsPositionUpdate {
  id: bigint;
  symbol: string;
  size: string;
  avgEntryPrice: string;
  positionSide: PositionSide;
  isolatedMargin?: string;
  /** Position creation time in milliseconds (wire `ct`). Optional on WS pushes. */
  createdAt?: bigint;
  /** Position last-update time in milliseconds (wire `ut`). Optional on WS pushes. */
  updatedAt?: bigint;
}

// ---------------------------------------------------------------------------
// Order update (WS `accountOrderUpdate` channel)
// ---------------------------------------------------------------------------

/** Spot order execution event. */
export interface WsSpotOrderUpdate {
  eventTime: bigint;
  blockTime: bigint;
  symbol: string;
  clOrdID: string;
  orderID: bigint;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  price: string;
  origQty: string;
  funds?: string;
  status: OrderStatus;
  executedQty: string;
  executedValue: string;
  marginFrozen: string;
  execType: ExecType;
  tradeID?: bigint;
  lastQty?: string;
  lastPrice?: string;
  fee?: string;
  isMaker?: boolean;
  reason?: string;
}

/** Perps order execution event — extends spot with perps-specific fields. */
export interface WsPerpsOrderUpdate extends WsSpotOrderUpdate {
  positionSide: PositionSide;
  reduceOnly: boolean;
  stopPrice?: string;
  stopType?: StopType;
  triggerType?: TriggerType;
  positionID?: bigint;
  primaryOrderID?: bigint;
  attachedOrderIDs?: bigint[];
}

// ---------------------------------------------------------------------------
// Account trade (WS `accountTrade` channel)
// ---------------------------------------------------------------------------

/** Spot account trade fill event. */
export interface WsSpotAccountTrade {
  eventTime: bigint;
  tradeTime: bigint;
  tradeID: bigint;
  symbol: string;
  orderID: bigint;
  clOrdID: string;
  side: OrderSide;
  price: string;
  quantity: string;
  fee: string;
  isMaker: boolean;
}

/** Perps account trade fill event — adds direction display. */
export interface WsPerpsAccountTrade extends WsSpotAccountTrade {
  direction?: string;
}

// ---------------------------------------------------------------------------
// Account event (WS `accountEvent` channel, perps only)
// ---------------------------------------------------------------------------

export interface WsLiquidationBalance {
  coinId: bigint;
  coin: string;
  walletBalance: string;
}

export interface WsLiquidationPosition {
  symbol: string;
  positionSide: PositionSide;
  size: string;
  markPrice: string;
  /** Nullable on the wire — undefined when the server does not report it. */
  liquidationPrice?: string;
}

export interface WsLiquidationEvent {
  eventTime: bigint;
  liquidatorId: bigint;
  accountId: bigint;
  accountValue: string;
  marginMode: MarginMode;
  balances: WsLiquidationBalance[];
  positions: WsLiquidationPosition[];
}

// ---------------------------------------------------------------------------
// Account subscribe options (consolidated subscription pattern)
// ---------------------------------------------------------------------------

/** Fine-grained callbacks for spot account channels. Only channels with
 *  a provided callback are subscribed. */
export interface SpotAccountSubscribeOptions extends WsSubscriptionOptions {
  /** Balance changes (WS `accountUpdate` channel). */
  onBalanceUpdate?: (update: WsSpotAccountUpdate) => void;
  /** TWAP order updates (WS `accountUpdate` channel, `TO` field). */
  onTwapUpdate?: (twaps: WsTwapOrder[]) => void;
  /** Order execution events (WS `accountOrderUpdate` channel). */
  onOrderUpdate?: (order: WsSpotOrderUpdate) => void;
  /** Trade fills (WS `accountTrade` channel). */
  onTrade?: (trade: WsSpotAccountTrade) => void;
}

/** Fine-grained callbacks for perps account channels. */
export interface PerpsAccountSubscribeOptions extends WsSubscriptionOptions {
  /** Balance/position changes (WS `accountUpdate` channel). */
  onBalanceUpdate?: (update: WsPerpsAccountUpdate) => void;
  /** TWAP order updates (WS `accountUpdate` channel, `TO` field). */
  onTwapUpdate?: (twaps: WsTwapOrder[]) => void;
  /** Order execution events (WS `accountOrderUpdate` channel). */
  onOrderUpdate?: (order: WsPerpsOrderUpdate) => void;
  /** Trade fills (WS `accountTrade` channel). */
  onTrade?: (trade: WsPerpsAccountTrade) => void;
  /** Liquidation events (WS `accountEvent` channel, perps only). */
  onLiquidation?: (event: WsLiquidationEvent) => void;
}
