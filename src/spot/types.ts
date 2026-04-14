import type { OrderSide, OrderStatus, OrderType, SymbolStatus, TimeInForce } from "../common/enums";

export interface SpotSymbolInfo {
  id: bigint;
  /** Wire name, e.g. `"vBTC_vUSDC"`. */
  name: string;
  /** Display name, e.g. `"BTC/USDC"`. */
  displayName: string;
  baseCoinId: bigint;
  baseCoin: string;
  baseCoinPrecision: number;
  quoteCoinId: bigint;
  quoteCoin: string;
  quoteCoinPrecision: number;
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
}

export interface SpotAccountBalance {
  coinId: bigint;
  coin: string;
  available: string;
  locked: string;
  total: string;
}

export interface SpotAccountBalances {
  accountId: bigint;
  balances: SpotAccountBalance[];
}

export interface SpotOrder {
  symbol: string;
  symbolId: bigint;
  accountId: bigint;
  orderID: bigint;
  clOrdID: string;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  price: string;
  quantity: string;
  executedQty: string;
  cumQuoteQty: string;
  status: OrderStatus;
  createTime: bigint;
  updateTime: bigint;
}

export interface SpotAccountSnapshot {
  userAddress: string;
  accountId: bigint;
  userId: bigint;
  balances: SpotSnapshotBalance[];
  openOrders: SpotSnapshotOrder[];
}

export interface SpotSnapshotBalance {
  coinId: bigint;
  coin: string;
  total: string;
  locked: string;
}

export interface SpotSnapshotOrder {
  symbol: string;
  clOrdID: string;
  orderID: bigint;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  price: string;
  quantity: string;
  funds: string | null;
  status: OrderStatus;
  executedQty: string;
  executedQuote: string;
  marginLocked: string;
}
