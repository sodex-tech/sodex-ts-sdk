import type { OrderSide, OrderStatus, OrderType, SymbolStatus, TimeInForce } from "../common/enums";

/**
 * Spot symbol metadata. Wire shape:
 * sodex-docs/rest-v1/schema.md#spotsymbol.
 *
 * `baseCoin`, `baseCoinPrecision`, `quoteCoin`, `quoteCoinPrecision` are
 * spec-optional (the server may elide them when the coin-denorm is not
 * required for the caller). They are exposed as `?` so consumers can tell
 * "server did not report" from an explicit value.
 */
export interface SpotSymbolInfo {
  id: bigint;
  /** Wire name, e.g. `"vBTC_vUSDC"`. */
  name: string;
  /** Display name, e.g. `"BTC/USDC"`. */
  displayName: string;
  baseCoinId: bigint;
  quoteCoinId: bigint;
  pricePrecision: number;
  tickSize: string;
  minPrice: string;
  maxPrice: string;
  quantityPrecision: number;
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
  makerFee: string;
  takerFee: string;
  status: SymbolStatus;
  baseCoin?: string;
  baseCoinPrecision?: number;
  quoteCoin?: string;
  quoteCoinPrecision?: number;
}

export interface SpotCoinInfo {
  id: bigint;
  name: string;
  precision: number;
}

export interface SpotTicker {
  symbol: string;
  lastPx: string;
  lastSz?: string;
  openPx: string;
  highPx: string;
  lowPx: string;
  vwap?: string;
  change: string;
  changePct: number;
  volume: string;
  quoteVolume: string;
  bidPx: string;
  bidSz: string;
  askPx: string;
  askSz: string;
  openTime: bigint;
  closeTime: bigint;
  /** WS-only: event timestamp in milliseconds (wire `E`). */
  eventTime?: bigint;
}

/**
 * One coin's balance in a spot account. Wire shape:
 * sodex-docs/rest-v1/schema.md#spotbalance (`{id, coin, total, locked}`).
 */
export interface SpotAccountBalance {
  /** Coin ID (wire `id`). Renamed for call-site clarity. */
  coinId: bigint;
  coin: string;
  /** Total balance including locked. */
  total: string;
  /** Locked balance in open orders. */
  locked: string;
}

/**
 * Response of `GET /accounts/{user}/balances`. Wire shape:
 * sodex-docs/rest-v1/schema.md#spotaccountbalances
 * (`{blockTime, blockHeight, balances[]}`).
 *
 * The server emits JSON `null` for empty balance sets (Go `nil` slice
 * convention) even though the schema types `balances` as a non-nullable
 * array; `parseSpotBalances` normalizes that `null` to `[]`.
 */
export interface SpotAccountBalances {
  blockTime: bigint;
  blockHeight: bigint;
  balances: SpotAccountBalance[];
}

/**
 * Spot order as returned by `GET /accounts/{user}/orders` (open orders) and
 * `GET /accounts/{user}/orders/history`. Wire shape:
 * sodex-docs/rest-v1/schema.md#spotorder.
 */
export interface SpotOrder {
  orderID: bigint;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  executedQty: string;
  /** Cumulative executed quote quantity (wire `executedValue`). */
  executedValue: string;
  /** Margin frozen by this order (wire `marginFrozen`). */
  marginFrozen: string;
  clOrdID?: string;
  timeInForce?: TimeInForce;
  price?: string;
  /** Original order quantity (wire `origQty`). Absent for funds-denominated orders. */
  origQty?: string;
  /** Original funds (wire `funds`). Absent for quantity-denominated orders. */
  funds?: string;
  createdAt?: bigint;
  updatedAt?: bigint;
}

/**
 * Frontend-state snapshot returned by `GET /accounts/{user}/state`. Wire
 * shape: sodex-docs/rest-v1/schema.md#wsspotstate (`{user, aid, uid, B, O}`).
 *
 * Fields are renamed from the single-letter wire keys for call-site clarity;
 * this is pure derivation (no value invention).
 *
 * `balances` / `openOrders` are documented as non-nullable arrays but the
 * server emits JSON `null` for empty collections (Go `nil` slice
 * convention); `parseSpotAccountSnapshot` normalizes those `null`s to `[]`
 * so the SDK shape stays `T[]`.
 */
export interface SpotAccountSnapshot {
  /** User EVM address (wire `user`). */
  userAddress: string;
  /** Account ID (wire `aid`). */
  accountId: bigint;
  /** User ID (wire `uid`). */
  userId: bigint;
  /** Balances (wire `B`). Empty when the server sends `null`. */
  balances: SpotSnapshotBalance[];
  /** Latest up-to-100 open orders (wire `O`). Empty when the server sends `null`. */
  openOrders: SpotSnapshotOrder[];
}

/**
 * One balance entry inside a spot snapshot. Wire shape:
 * sodex-docs/rest-v1/schema.md#wsspotbalance (`{i, a, t, l}`).
 */
export interface SpotSnapshotBalance {
  /** Coin ID (wire `i`). */
  coinId: bigint;
  /** Coin name (wire `a`). */
  coin: string;
  /** Wallet balance including locked (wire `t`). */
  total: string;
  /** Locked balance in open orders (wire `l`). */
  locked: string;
}

/**
 * One open order inside a spot snapshot. Wire shape:
 * sodex-docs/rest-v1/schema.md#wsspotorder
 * (`{s, c, i, S, o, f, p, q, F, X, z, v, M}`).
 *
 * Field names are unified with REST `SpotOrder` (`origQty`, `executedValue`,
 * `marginFrozen`) so call-site code that switches between the two endpoints
 * reads the same property names.
 */
export interface SpotSnapshotOrder {
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
  /** Original funds (wire `F`). `null` on the wire collapses to `undefined` for SDK style consistency. */
  funds?: string;
  /** Order creation time in milliseconds (wire `ct`). Optional on WS pushes. */
  createdAt?: bigint;
  /** Order last-update time in milliseconds (wire `ut`). Optional on WS pushes. */
  updatedAt?: bigint;
}
