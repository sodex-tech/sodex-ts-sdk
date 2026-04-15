/**
 * String-literal enum types plus bidirectional maps to wire integer codes.
 * Signing payloads use integer codes (`*ToCode`); responses use string names
 * (`*FromName`). Unknown values from newer server versions pass through as-is.
 */

export type OrderSide = "BUY" | "SELL";

const ORDER_SIDE_CODE: Record<OrderSide, number> = { BUY: 1, SELL: 2 };
export const orderSideToCode = (v: OrderSide): number => ORDER_SIDE_CODE[v];
export const orderSideFromCode = (n: number): OrderSide => {
  if (n === 1) return "BUY";
  if (n === 2) return "SELL";
  return String(n) as OrderSide;
};
export const orderSideFromName = (s: string): OrderSide => {
  if (s === "BUY" || s === "SELL") return s;
  return s as OrderSide;
};

export type OrderType = "LIMIT" | "MARKET";

const ORDER_TYPE_CODE: Record<OrderType, number> = { LIMIT: 1, MARKET: 2 };
export const orderTypeToCode = (v: OrderType): number => ORDER_TYPE_CODE[v];
export const orderTypeFromCode = (n: number): OrderType => {
  if (n === 1) return "LIMIT";
  if (n === 2) return "MARKET";
  return String(n) as OrderType;
};
export const orderTypeFromName = (s: string): OrderType => {
  if (s === "LIMIT" || s === "MARKET") return s;
  return s as OrderType;
};

export type TimeInForce = "GTC" | "FOK" | "IOC" | "GTX";

const TIF_CODE: Record<TimeInForce, number> = { GTC: 1, FOK: 2, IOC: 3, GTX: 4 };
export const timeInForceToCode = (v: TimeInForce): number => TIF_CODE[v];
export const timeInForceFromCode = (n: number): TimeInForce => {
  switch (n) {
    case 1:
      return "GTC";
    case 2:
      return "FOK";
    case 3:
      return "IOC";
    case 4:
      return "GTX";
    default:
      return String(n) as TimeInForce;
  }
};
export const timeInForceFromName = (s: string): TimeInForce => {
  if (s === "GTC" || s === "FOK" || s === "IOC" || s === "GTX") return s;
  return s as TimeInForce;
};


export type OrderModifier = "NORMAL" | "STOP" | "BRACKET" | "ATTACHED_STOP";

const MODIFIER_CODE: Record<OrderModifier, number> = {
  NORMAL: 1,
  STOP: 2,
  BRACKET: 3,
  ATTACHED_STOP: 4,
};
export const orderModifierToCode = (v: OrderModifier): number => MODIFIER_CODE[v];
export const orderModifierFromCode = (n: number): OrderModifier => {
  switch (n) {
    case 1:
      return "NORMAL";
    case 2:
      return "STOP";
    case 3:
      return "BRACKET";
    case 4:
      return "ATTACHED_STOP";
    default:
      return String(n) as OrderModifier;
  }
};
export const orderModifierFromName = (s: string): OrderModifier => {
  switch (s) {
    case "NORMAL":
    case "STOP":
    case "BRACKET":
    case "ATTACHED_STOP":
      return s;
    default:
      return s as OrderModifier;
  }
};


export type PositionSide = "BOTH" | "LONG" | "SHORT";

const POSITION_SIDE_CODE: Record<PositionSide, number> = { BOTH: 1, LONG: 2, SHORT: 3 };
export const positionSideToCode = (v: PositionSide): number => POSITION_SIDE_CODE[v];
export const positionSideFromCode = (n: number): PositionSide => {
  switch (n) {
    case 1:
      return "BOTH";
    case 2:
      return "LONG";
    case 3:
      return "SHORT";
    default:
      return String(n) as PositionSide;
  }
};
export const positionSideFromName = (s: string): PositionSide => {
  if (s === "BOTH" || s === "LONG" || s === "SHORT") return s;
  return s as PositionSide;
};


export type StopType = "STOP_LOSS" | "TAKE_PROFIT";

const STOP_TYPE_CODE: Record<StopType, number> = { STOP_LOSS: 1, TAKE_PROFIT: 2 };
export const stopTypeToCode = (v: StopType): number => STOP_TYPE_CODE[v];
export const stopTypeFromCode = (n: number): StopType => {
  if (n === 1) return "STOP_LOSS";
  if (n === 2) return "TAKE_PROFIT";
  return String(n) as StopType;
};
export const stopTypeFromName = (s: string): StopType => {
  if (s === "STOP_LOSS" || s === "TAKE_PROFIT") return s;
  return s as StopType;
};


export type TriggerType = "LAST_PRICE" | "MARK_PRICE" | "INDEX_PRICE";

const TRIGGER_TYPE_CODE: Record<TriggerType, number> = {
  LAST_PRICE: 1,
  MARK_PRICE: 2,
  INDEX_PRICE: 3,
};
export const triggerTypeToCode = (v: TriggerType): number => TRIGGER_TYPE_CODE[v];
export const triggerTypeFromCode = (n: number): TriggerType => {
  switch (n) {
    case 1:
      return "LAST_PRICE";
    case 2:
      return "MARK_PRICE";
    case 3:
      return "INDEX_PRICE";
    default:
      return String(n) as TriggerType;
  }
};
export const triggerTypeFromName = (s: string): TriggerType => {
  if (s === "LAST_PRICE" || s === "MARK_PRICE" || s === "INDEX_PRICE") return s;
  return s as TriggerType;
};


export type MarginMode = "ISOLATED" | "CROSS";

const MARGIN_MODE_CODE: Record<MarginMode, number> = { ISOLATED: 1, CROSS: 2 };
export const marginModeToCode = (v: MarginMode): number => MARGIN_MODE_CODE[v];
export const marginModeFromCode = (n: number): MarginMode => {
  if (n === 1) return "ISOLATED";
  if (n === 2) return "CROSS";
  return String(n) as MarginMode;
};
export const marginModeFromName = (s: string): MarginMode => {
  if (s === "ISOLATED" || s === "CROSS") return s;
  return s as MarginMode;
};


export type TransferAssetKind =
  | "EVM_DEPOSIT"
  | "PERPS_DEPOSIT"
  | "EVM_WITHDRAW"
  | "PERPS_WITHDRAW"
  | "INTERNAL"
  | "SPOT_WITHDRAW"
  | "SPOT_DEPOSIT";

const TRANSFER_CODE: Record<TransferAssetKind, number> = {
  EVM_DEPOSIT: 0,
  PERPS_DEPOSIT: 1,
  EVM_WITHDRAW: 2,
  PERPS_WITHDRAW: 3,
  INTERNAL: 4,
  SPOT_WITHDRAW: 5,
  SPOT_DEPOSIT: 6,
};
export const transferKindToCode = (v: TransferAssetKind): number => TRANSFER_CODE[v];
export const transferKindFromCode = (n: number): TransferAssetKind => {
  switch (n) {
    case 0:
      return "EVM_DEPOSIT";
    case 1:
      return "PERPS_DEPOSIT";
    case 2:
      return "EVM_WITHDRAW";
    case 3:
      return "PERPS_WITHDRAW";
    case 4:
      return "INTERNAL";
    case 5:
      return "SPOT_WITHDRAW";
    case 6:
      return "SPOT_DEPOSIT";
    default:
      return String(n) as TransferAssetKind;
  }
};
export const transferKindFromName = (s: string): TransferAssetKind => {
  if (
    s === "EVM_DEPOSIT" ||
    s === "PERPS_DEPOSIT" ||
    s === "EVM_WITHDRAW" ||
    s === "PERPS_WITHDRAW" ||
    s === "INTERNAL" ||
    s === "SPOT_WITHDRAW" ||
    s === "SPOT_DEPOSIT"
  )
    return s;
  return s as TransferAssetKind;
};

export type ApiKeyType = "PRIMARY" | "SUBACCOUNT";

const API_KEY_TYPE_CODE: Record<ApiKeyType, number> = { PRIMARY: 1, SUBACCOUNT: 2 };
export const apiKeyTypeToCode = (v: ApiKeyType): number => API_KEY_TYPE_CODE[v];
export const apiKeyTypeFromName = (s: string): ApiKeyType => {
  if (s === "PRIMARY" || s === "SUBACCOUNT") return s;
  return s as ApiKeyType;
};


export type OrderStatus =
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED"
  | "PENDING_NEW"
  | "PENDING_CANCEL"
  | "PENDING_MODIFY"
  | "TRIGGERED"
  | "REPLACED"
  | "PENDING_REPLACE";

const ORDER_STATUSES = new Set<OrderStatus>([
  "NEW",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELED",
  "REJECTED",
  "EXPIRED",
  "PENDING_NEW",
  "PENDING_CANCEL",
  "PENDING_MODIFY",
  "TRIGGERED",
  "REPLACED",
  "PENDING_REPLACE",
]);
export const orderStatusFromName = (s: string): OrderStatus => {
  if (ORDER_STATUSES.has(s as OrderStatus)) return s as OrderStatus;
  return s as OrderStatus;
};


export type ExecType =
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "MODIFIED"
  | "EXPIRED"
  | "REPLACED";

const EXEC_TYPES = new Set<ExecType>([
  "NEW",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELED",
  "REJECTED",
  "MODIFIED",
  "EXPIRED",
  "REPLACED",
]);
export const execTypeFromName = (s: string): ExecType => {
  if (EXEC_TYPES.has(s as ExecType)) return s as ExecType;
  return s as ExecType;
};


export type SymbolStatus = "TRADING" | "HALT";
export const symbolStatusFromName = (s: string): SymbolStatus => {
  if (s === "TRADING" || s === "HALT") return s;
  return s as SymbolStatus;
};
