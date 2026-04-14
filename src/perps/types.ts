import type {
  ExecType,
  MarginMode,
  OrderModifier,
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
  fundingRate: string;
  nextFundingTime: bigint;
  indexPrice: string;
  markPrice: string;
  openInterest: string;
  openTime: bigint;
  closeTime: bigint;
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

export interface PerpsOpenPositions {
  blockTime: bigint;
  blockHeight: bigint;
  positions: PerpsPosition[];
}

export interface PerpsOrder {
  symbol: string;
  symbolId: bigint;
  accountId: bigint;
  orderID: bigint;
  clOrdID: string;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  modifier: OrderModifier;
  positionSide: PositionSide;
  reduceOnly: boolean;
  price: string;
  quantity: string;
  executedQty: string;
  cumQuoteQty: string;
  status: OrderStatus;
  stopPrice?: string;
  stopType?: StopType;
  triggerType?: TriggerType;
  createTime: bigint;
  updateTime: bigint;
}

export interface FundingPayment {
  symbol: string;
  positionId: bigint;
  positionSide: PositionSide;
  fundingFee: string;
  feeCoin: string;
  timestamp: bigint;
}

export type PerpsExecType = ExecType;

export interface PerpsAccountSnapshot {
  userAddress: string;
  accountId: bigint;
  userId: bigint;
  accountValue: string;
  availableMargin: string;
  availableMarginIsolated: string;
  availableMarginForTransfer: string;
  isolatedFrozenMargin: string;
  crossFrozenMargin: string;
  openIsolatedFrozenMargin: string;
  openCrossFrozenMargin: string;
  balances: PerpsSnapshotBalance[];
  openOrders: PerpsSnapshotOrder[];
  openPositions: PerpsSnapshotPosition[];
  symbolConfigs: PerpsSnapshotSymbolConfig[];
}

export interface PerpsSnapshotBalance {
  coinId: bigint;
  coin: string;
  walletBalance: string;
  marginRatio: string;
  oraclePrice: string;
  isolatedFrozen: string | null;
  availableForMargin: string;
  availableForWithdraw: string;
  walletMargin: string;
  availableMargin: string;
}

export interface PerpsSnapshotOrder {
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
  positionSide: PositionSide;
  reduceOnly: boolean;
  stopPrice: string | null;
  stopType: StopType | null;
  triggerType: TriggerType | null;
  positionId: bigint | null;
  primaryOrderId: bigint | null;
  attachedOrderIds: bigint[] | null;
}

export interface PerpsSnapshotPosition {
  id: bigint;
  symbol: string;
  marginMode: MarginMode;
  positionSide: PositionSide;
  size: string;
  isolatedMargin: string | null;
  avgEntryPrice: string;
  cumOpenCost: string;
  cumTradingFee: string;
  cumClosedSize: string;
  avgClosePrice: string;
  maxSize: string;
  realizedPnL: string;
  unrealizedPnL: string;
  leverage: number;
  liquidationPrice: string;
}

export interface PerpsSnapshotSymbolConfig {
  symbol: string;
  leverage: number;
  marginMode: MarginMode;
}
