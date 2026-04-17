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
// Account update (WS `accountUpdate` channel)
// ---------------------------------------------------------------------------

/** Spot balance update event (WS `accountUpdate` channel). */
export interface WsSpotAccountUpdate {
  eventTime: bigint;
  blockTime: bigint;
  blockHeight: bigint;
  balances: WsSpotBalanceUpdate[];
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
  rejectReason?: string;
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
export interface SpotAccountSubscribeOptions {
  /** Balance changes (WS `accountUpdate` channel). */
  onBalanceUpdate?: (update: WsSpotAccountUpdate) => void;
  /** Order execution events (WS `accountOrderUpdate` channel). */
  onOrderUpdate?: (order: WsSpotOrderUpdate) => void;
  /** Trade fills (WS `accountTrade` channel). */
  onTrade?: (trade: WsSpotAccountTrade) => void;
}

/** Fine-grained callbacks for perps account channels. */
export interface PerpsAccountSubscribeOptions {
  /** Balance/position changes (WS `accountUpdate` channel). */
  onBalanceUpdate?: (update: WsPerpsAccountUpdate) => void;
  /** Order execution events (WS `accountOrderUpdate` channel). */
  onOrderUpdate?: (order: WsPerpsOrderUpdate) => void;
  /** Trade fills (WS `accountTrade` channel). */
  onTrade?: (trade: WsPerpsAccountTrade) => void;
  /** Liquidation events (WS `accountEvent` channel, perps only). */
  onLiquidation?: (event: WsLiquidationEvent) => void;
}
