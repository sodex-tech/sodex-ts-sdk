import {
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

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBook {
  symbol: string;
  lastUpdateID: bigint;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface Kline {
  symbol: string;
  interval: string;
  openTime: bigint;
  closeTime: bigint;
  openPx: string;
  highPx: string;
  lowPx: string;
  closePx: string;
  volume: string;
  quoteVolume: string;
  tradeCount: number;
}

export interface Trade {
  symbol: string;
  id: bigint;
  price: string;
  quantity: string;
  quoteQuantity: string;
  time: bigint;
  isBuyerMaker: boolean;
}

export interface UserTrade {
  symbol: string;
  id: bigint;
  orderID: bigint;
  clOrdID: string;
  side: OrderSide;
  price: string;
  quantity: string;
  quoteQuantity: string;
  fee: string;
  feeCoin: string;
  isMaker: boolean;
  time: bigint;
}

export interface ApiKeyInfo {
  name: string;
  type: string;
  publicKey: string;
  expiresAt: bigint;
}

export function parseApiKey(raw: WireRecord): ApiKeyInfo {
  return {
    name: raw.name ?? "",
    type: raw.type ?? "",
    publicKey: raw.publicKey ?? "",
    expiresAt: BigInt(raw.expiresAt ?? 0),
  };
}

export interface FeeRate {
  makerFeeRate: string;
  takerFeeRate: string;
  feeTier: number;
  stakingTier: number;
  makerRebateTier: number;
}

export function parseFeeRate(raw: WireRecord): FeeRate {
  return {
    makerFeeRate: raw.makerFeeRate ?? "0",
    takerFeeRate: raw.takerFeeRate ?? "0",
    feeTier: raw.feeTier ?? 0,
    stakingTier: raw.stakingTier ?? 0,
    makerRebateTier: raw.makerRebateTier ?? 0,
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

export function parseBatchOrderReceipt(raw: WireRecord): BatchOrderReceipt {
  const rawCode = raw.code;
  const code = typeof rawCode === "bigint" ? Number(rawCode) : rawCode ?? 0;
  return {
    code,
    clOrdID: raw.clOrdID ?? "",
    orderID: raw.orderID !== undefined ? BigInt(raw.orderID) : undefined,
    error: raw.error,
  };
}

export function parseBatchCancelReceipt(raw: WireRecord): BatchCancelReceipt {
  return {
    ...parseBatchOrderReceipt(raw),
    origClOrdID: raw.origClOrdID,
  };
}

export const parseBatchReplaceReceipt = parseBatchOrderReceipt;

export function parseUserTrade(raw: WireRecord): UserTrade {
  return {
    symbol: raw.symbol ?? "",
    id: BigInt(raw.tradeID ?? raw.id ?? 0),
    orderID: BigInt(raw.orderID ?? 0),
    clOrdID: raw.clOrdID ?? "",
    side: orderSideFromName(raw.side),
    price: raw.price ?? "0",
    quantity: raw.quantity ?? "0",
    quoteQuantity: raw.quoteQuantity ?? raw.quoteQty ?? "0",
    fee: raw.fee ?? "0",
    feeCoin: raw.feeCoin ?? "",
    isMaker: raw.isMaker,
    time: BigInt(raw.time ?? raw.timestamp ?? 0),
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
