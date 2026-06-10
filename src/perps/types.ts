import type {
  ExecType,
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  StopType,
  SymbolStatus,
  TimeInForce,
  TriggerType,
} from "../common/enums";

export interface MarginTier {
  maxNotionalValue: string;
  maintenanceMarginRate: string;
  maxLeverage: number;
  maintenanceDeduction: string;
}

export interface PerpsSymbolInfo {
  id: bigint;
  name: string;
  displayName: string;
  baseCoin: string;
  quoteCoinId: bigint;
  quoteCoin: string;
  quoteCoinPrecision: number;
  pricePrecision: number;
  tickSize: string;
  minPrice: string;
  maxPrice: string;
  quantityPrecision: number;
  openInterestCap?: string;
  openInterestCapUSD?: string;
  stepSize: string;
  minQuantity: string;
  maxQuantity: string;
  marketMinQuantity: string;
  marketMaxQuantity: string;
  minNotional: string;
  maxNotional: string;
  buyLimitUpRatio: string;
  sellLimitDownRatio: string;
  marketDeviationRatio: string;
  maxLeverage: number;
  initLeverage: number;
  /**
   * Leverage brackets. Wire schema marks this as a non-nullable array, but
   * the server can emit `null` for symbols that have no tiers configured;
   * `parsePerpsSymbol` normalizes that `null` to `[]`.
   */
  marginTiers: MarginTier[];
  fundingInterval: number;
  interestRate: string;
  maxFundingRate: string;
  minFundingRate: string;
  makerFee: string;
  takerFee: string;
  status: SymbolStatus;
}

export interface PerpsCoinInfo {
  id: bigint;
  name: string;
  precision: number;
  marginRatio: string;
  price?: string;
}

export interface MarkPriceTicker {
  symbol: string;
  fundingRate: string;
  nextFundingTime: bigint;
  indexPrice: string;
  markPrice: string;
  openInterest: string;
  /** WS-only: event timestamp in milliseconds (wire `E`). */
  eventTime?: bigint;
}

export interface PerpsTicker {
  symbol: string;
  lastPx: string;
  lastSz?: string;
  vwap?: string;
  change?: string;
  changePct?: number;
  openPx: string;
  highPx: string;
  lowPx: string;
  volume: string;
  quoteVolume: string;
  bidPx: string;
  bidSz: string;
  askPx: string;
  askSz: string;
  /** REST always provides; WS ticker channel does not — use `markPrice` stream instead. */
  fundingRate?: string;
  /** REST always provides; WS ticker channel does not. */
  nextFundingTime?: bigint;
  /** REST always provides; WS ticker channel does not. */
  indexPrice?: string;
  /** REST always provides; WS ticker channel does not. */
  markPrice?: string;
  /** REST always provides; WS ticker channel does not. */
  openInterest?: string;
  openTime: bigint;
  closeTime: bigint;
  /** WS-only: event timestamp in milliseconds (wire `E`). */
  eventTime?: bigint;
}

export interface PerpsPosition {
  id: bigint;
  symbol: string;
  marginMode: MarginMode;
  side: PositionSide;
  size: string;
  initialMargin: string;
  avgEntryPrice: string;
  cumOpenCost: string;
  cumTradingFee: string;
  cumClosedSize: string;
  avgClosePrice: string;
  maxSize: string;
  realizedPnL: string;
  leverage: number;
  active: boolean;
  isTakenOver: boolean;
  takeOverPrice: string;
  createdAt: bigint;
  updatedAt: bigint;
}

/**
 * Response of `GET /accounts/{user}/positions`. Wire shape:
 * sodex-docs/rest-v1/schema.md#perpsaccountopenposition.
 *
 * The server emits JSON `null` for empty position sets (Go `nil` slice
 * convention) even though the schema types `positions` as a non-nullable
 * array; `parsePerpsOpenPositions` normalizes that `null` to `[]`.
 */
export interface PerpsOpenPositions {
  blockTime: bigint;
  blockHeight: bigint;
  positions: PerpsPosition[];
}

/**
 * Perps order as returned by `GET /accounts/{user}/orders` (open orders) and
 * `GET /accounts/{user}/orders/history`. Wire shape:
 * sodex-docs/rest-v1/schema.md#perpsorder (a superset of `SpotOrder`).
 *
 * Note: `modifier` (NORMAL/STOP/BRACKET/ATTACHED_STOP) is a request-side
 * concept used when placing orders. The spec's `PerpsOrder` response shape
 * does not list it, so the SDK does not expose it here. If the server
 * actually echoes it and a caller needs it, request a spec update and this
 * interface will grow an `modifier?: OrderModifier` field.
 */
export interface PerpsOrder {
  orderID: bigint;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  positionSide: PositionSide;
  reduceOnly: boolean;
  executedQty: string;
  /** Cumulative executed quote quantity (wire `executedValue`). */
  executedValue: string;
  /** Margin frozen by this order (wire `marginFrozen`). */
  marginFrozen: string;
  clOrdID?: string;
  timeInForce?: TimeInForce;
  price?: string;
  /** Original order quantity (wire `origQty`). */
  origQty?: string;
  /** Original funds (wire `funds`). */
  funds?: string;
  createdAt?: bigint;
  updatedAt?: bigint;
  stopPrice?: string;
  stopType?: StopType;
  triggerType?: TriggerType;
  /** Position ID this order is attached to (for position TP/SL). */
  positionID?: bigint;
  /** Primary order ID this stop is attached to (for attached stops). */
  primaryOrderID?: bigint;
  /** Order IDs of stops attached to this order (TP/SL). */
  attachedOrderIDs?: bigint[];
}

/**
 * Historical funding payment. Wire shape:
 * sodex-docs/rest-v1/schema.md#perpsuserfunding.
 */
export interface FundingPayment {
  symbol: string;
  /** Position ID (wire `positionID`). Aligned with REST `PerpsOrder.positionID`. */
  positionID: bigint;
  positionSide: PositionSide;
  /** Funding fee; negative means received. */
  fundingFee: string;
  feeCoin: string;
  /** Funding time in milliseconds. */
  timestamp: bigint;
}

export type PerpsExecType = ExecType;

/**
 * One coin's balance in a perps account. Wire shape:
 * sodex-docs/rest-v1/schema.md#perpsbalance
 * (`{id, coin, total, marginRatio, price?}`).
 *
 * Perps balances do not carry a `locked` field — locked margin is tracked
 * via the account-wide frozen margin totals on `PerpsAccountSnapshot`, not
 * per coin. Previous SDK versions exposed `available`/`locked` here; both
 * were invented and have been removed.
 */
export interface PerpsAccountBalance {
  /** Coin ID (wire `id`). Renamed for call-site clarity. */
  coinId: bigint;
  coin: string;
  /** Wallet balance. */
  total: string;
  /** Margin ratio of this coin. */
  marginRatio: string;
  /** Oracle price of this coin in USD. Optional per spec. */
  price?: string;
}

/**
 * Response of `GET /accounts/{user}/balances`. Wire shape:
 * sodex-docs/rest-v1/schema.md#perpsaccountbalance
 * (`{blockTime, blockHeight, balances[]}`).
 *
 * The server emits JSON `null` for empty balance sets (Go `nil` slice
 * convention) even though the schema types `balances` as a non-nullable
 * array; `parsePerpsBalances` normalizes that `null` to `[]` so the SDK
 * field stays `T[]`.
 */
export interface PerpsAccountBalances {
  blockTime: bigint;
  blockHeight: bigint;
  balances: PerpsAccountBalance[];
}

/**
 * Frontend-state snapshot returned by `GET /accounts/{user}/state`. Wire
 * shape: sodex-docs/rest-v1/schema.md#wsperpsstate.
 *
 * Short wire keys are renamed for call-site clarity (derivation); the
 * four collection fields (`balances`, `openOrders`, `openPositions`,
 * `symbolConfigs`) are documented as non-nullable arrays on the wire but
 * the server emits JSON `null` for empty collections (Go `nil` slice
 * convention). `parsePerpsAccountSnapshot` normalizes those `null`s to
 * `[]`, keeping the SDK shape a clean `T[]` so callers can iterate
 * without `?? []` guards.
 */
export interface PerpsAccountSnapshot {
  /** User EVM address (wire `user`). */
  userAddress: string;
  /** Account ID (wire `aid`). */
  accountId: bigint;
  /** User ID (wire `uid`). */
  userId: bigint;
  /** Cross account value (wire `av`). */
  accountValue: string;
  /** Available margin for cross positions (wire `am`). */
  availableMargin: string;
  /** Available margin for isolated positions (wire `ami`). */
  availableMarginIsolated: string;
  /** Available margin for transfer (wire `amw`). */
  availableMarginForTransfer: string;
  /** Isolated frozen margin for positions (wire `im`). */
  isolatedFrozenMargin: string;
  /** Cross frozen margin for positions (wire `cm`). */
  crossFrozenMargin: string;
  /** Isolated frozen margin for open orders (wire `oim`). */
  openIsolatedFrozenMargin: string;
  /** Cross frozen margin for open orders (wire `ocm`). */
  openCrossFrozenMargin: string;
  /** Balances (wire `B`). Empty when the server sends `null`. */
  balances: PerpsSnapshotBalance[];
  /** Latest up-to-100 open orders (wire `O`). Empty when the server sends `null`. */
  openOrders: PerpsSnapshotOrder[];
  /** Open positions (wire `P`). Empty when the server sends `null`. */
  openPositions: PerpsSnapshotPosition[];
  /** Touched symbol configs (wire `S`). Empty when the server sends `null`. */
  symbolConfigs: PerpsSnapshotSymbolConfig[];
}

/**
 * One balance inside a perps snapshot. Wire shape:
 * sodex-docs/rest-v1/schema.md#wsperpsbalancedetailed
 * (`WsPerpsBalance` + `{iw, aw, at, wm, am}`).
 */
export interface PerpsSnapshotBalance {
  /** Coin ID (wire `i`). */
  coinId: bigint;
  /** Coin name (wire `a`). */
  coin: string;
  /** Wallet balance (wire `wb`). */
  walletBalance: string;
  /** Margin ratio of this coin (wire `mr`, percentage). */
  marginRatio: string;
  /** Oracle price of this coin in USD (wire `px`). */
  oraclePrice: string;
  /** Available wallet balance for margin (wire `aw`). */
  availableForMargin: string;
  /** Available wallet balance for withdrawal (wire `at`). */
  availableForWithdraw: string;
  /** Wallet balance corresponding margin (wire `wm`). */
  walletMargin: string;
  /** Available wallet balance corresponding margin (wire `am`). */
  availableMargin: string;
  /**
   * Amount of this coin counted as margin collateral (wire `co`).
   * `walletBalance − collateral` is the idle/over-cap portion.
   * Optional: absent on gateways predating multi-asset margin.
   */
  collateral?: string;
  /** Isolated frozen margin for position or open orders (wire `iw`, only for vUSDC). */
  isolatedFrozen?: string;
}

/**
 * One open order inside a perps snapshot. Wire shape:
 * sodex-docs/rest-v1/schema.md#wsperpsorder — a superset of `WsSpotOrder`
 * with perps-specific `{ps, R, sp, st, tt, pid, poid, aoids}` additions.
 *
 * Field names unified with REST `PerpsOrder` (`origQty`, `executedValue`,
 * `marginFrozen`, `positionID`, `primaryOrderID`, `attachedOrderIDs`).
 */
export interface PerpsSnapshotOrder {
  /** Order ID (wire `i`). */
  orderID: bigint;
  /** Symbol (wire `s`). */
  symbol: string;
  /** Client order ID (wire `c`). */
  clOrdID: string;
  /** Side (wire `S`). */
  side: OrderSide;
  /** Order type (wire `o`). */
  type: OrderType;
  /** Time in force (wire `f`). */
  timeInForce: TimeInForce;
  /** Current status (wire `X`). */
  status: OrderStatus;
  /** Price (wire `p`). */
  price: string;
  /** Original order quantity (wire `q`). */
  origQty: string;
  /** Cumulative filled quantity (wire `z`). */
  executedQty: string;
  /** Cumulative filled value (wire `v`). */
  executedValue: string;
  /** Margin locked by this order (wire `M`). */
  marginFrozen: string;
  /** Position side (wire `ps`). */
  positionSide: PositionSide;
  /** Reduce-only flag (wire `R`). */
  reduceOnly: boolean;
  /** Original funds (wire `F`). Nullable on the wire; SDK uses undefined. */
  funds?: string;
  /** Stop price (wire `sp`). */
  stopPrice?: string;
  /** Stop type (wire `st`). */
  stopType?: StopType;
  /** Trigger type (wire `tt`). */
  triggerType?: TriggerType;
  /** Position ID this order is attached to (wire `pid`). */
  positionID?: bigint;
  /** Primary order ID this stop is attached to (wire `poid`). */
  primaryOrderID?: bigint;
  /** Order IDs of stops attached to this order (wire `aoids`). */
  attachedOrderIDs?: bigint[];
  /** Order creation time in milliseconds (wire `ct`). Optional on WS pushes. */
  createdAt?: bigint;
  /** Order last-update time in milliseconds (wire `ut`). Optional on WS pushes. */
  updatedAt?: bigint;
}

/**
 * One open position inside a perps snapshot. Wire shape:
 * sodex-docs/rest-v1/schema.md#wsperpsposition.
 */
export interface PerpsSnapshotPosition {
  /** Position ID (wire `i`). */
  id: bigint;
  /** Symbol (wire `s`). */
  symbol: string;
  /** Margin mode (wire `m`). */
  marginMode: MarginMode;
  /** Position side (wire `ps`). */
  positionSide: PositionSide;
  /** Position size (wire `sz`). */
  size: string;
  /** Average entry price (wire `ep`). */
  avgEntryPrice: string;
  /** Cumulative open cost (wire `co`). */
  cumOpenCost: string;
  /** Cumulative trading fee (wire `cf`). */
  cumTradingFee: string;
  /** Total closed size during the position lifetime (wire `cc`). */
  cumClosedSize: string;
  /** Average close price (wire `cp`). */
  avgClosePrice: string;
  /** Max position size during the position lifetime (wire `ms`). */
  maxSize: string;
  /** Realized P&L including fees and liquidation loss (wire `cr`). */
  realizedPnL: string;
  /** Unrealized P&L (wire `ur`). */
  unrealizedPnL: string;
  /** Position leverage (wire `l`). */
  leverage: number;
  /** Liquidation price (wire `lp`). */
  liquidationPrice: string;
  /** Isolated margin (wire `iw`). Nullable on the wire for cross positions; SDK uses undefined. */
  isolatedMargin?: string;
  /** Position creation time in milliseconds (wire `ct`). Optional on WS pushes. */
  createdAt?: bigint;
  /** Position last-update time in milliseconds (wire `ut`). Optional on WS pushes. */
  updatedAt?: bigint;
}

/**
 * Per-symbol leverage/margin config touched by the account. Wire shape:
 * sodex-docs/rest-v1/schema.md#wsperpssymbolconfig (`{s, l, m}`).
 */
export interface PerpsSnapshotSymbolConfig {
  /** Symbol (wire `s`). */
  symbol: string;
  /** Leverage (wire `l`). */
  leverage: number;
  /** Margin mode (wire `m`). */
  marginMode: MarginMode;
}
