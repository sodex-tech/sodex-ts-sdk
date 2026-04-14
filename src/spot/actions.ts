/**
 * Spot action builders. Field order must match the Go struct definition
 * exactly — the server re-hashes the canonical JSON for signature verification.
 */
import type { ActionPayload } from "../common/action-payload";
import { type DecimalInput, toDecimalString } from "../common/decimal";
import {
  type OrderSide,
  type OrderType,
  type TimeInForce,
  type TransferAssetKind,
  orderSideToCode,
  orderTypeToCode,
  timeInForceToCode,
  transferKindToCode,
} from "../common/enums";


export const ACTION_NEW_ORDER = "newOrder";
export const ACTION_BATCH_NEW_ORDER = "batchNewOrder";
export const ACTION_CANCEL_ORDER = "cancelOrder";
export const ACTION_BATCH_CANCEL_ORDER = "batchCancelOrder";
export const ACTION_REPLACE_ORDER = "replaceOrder";
export const ACTION_SCHEDULE_CANCEL = "scheduleCancel";
export const ACTION_TRANSFER_ASSET = "transferAsset";
export const ACTION_REVOKE_API_KEY = "revokeAPIKey";


export interface SpotNewOrderInput {
  accountId: bigint;
  symbolId: bigint;
  clOrdId: string;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  price?: DecimalInput;
  quantity?: DecimalInput;
  funds?: DecimalInput;
}

export function buildNewOrderPayload(i: SpotNewOrderInput): ActionPayload {
  return {
    type: ACTION_NEW_ORDER,
    params: {
      accountID: i.accountId,
      symbolID: i.symbolId,
      clOrdID: i.clOrdId,
      side: orderSideToCode(i.side),
      type: orderTypeToCode(i.type),
      timeInForce: timeInForceToCode(i.timeInForce),
      price: i.price !== undefined ? toDecimalString(i.price, "price") : undefined,
      quantity: i.quantity !== undefined ? toDecimalString(i.quantity, "quantity") : undefined,
      funds: i.funds !== undefined ? toDecimalString(i.funds, "funds") : undefined,
    },
  };
}


export interface SpotBatchNewOrderItem {
  symbolId: bigint;
  clOrdId: string;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  price?: DecimalInput;
  quantity?: DecimalInput;
  funds?: DecimalInput;
}

export interface SpotBatchNewOrderInput {
  accountId: bigint;
  orders: SpotBatchNewOrderItem[];
}

export function buildBatchNewOrderPayload(i: SpotBatchNewOrderInput): ActionPayload {
  return {
    type: ACTION_BATCH_NEW_ORDER,
    params: {
      accountID: i.accountId,
      orders: i.orders.map((o) => ({
        symbolID: o.symbolId,
        clOrdID: o.clOrdId,
        side: orderSideToCode(o.side),
        type: orderTypeToCode(o.type),
        timeInForce: timeInForceToCode(o.timeInForce),
        price: o.price !== undefined ? toDecimalString(o.price, "price") : undefined,
        quantity: o.quantity !== undefined ? toDecimalString(o.quantity, "quantity") : undefined,
        funds: o.funds !== undefined ? toDecimalString(o.funds, "funds") : undefined,
      })),
    },
  };
}


export interface SpotCancelOrderInput {
  accountId: bigint;
  symbolId: bigint;
  clOrdId: string;
  orderId?: bigint;
  origClOrdId?: string;
}

export function buildCancelOrderPayload(i: SpotCancelOrderInput): ActionPayload {
  return {
    type: ACTION_CANCEL_ORDER,
    params: {
      accountID: i.accountId,
      symbolID: i.symbolId,
      clOrdID: i.clOrdId,
      orderID: i.orderId,
      origClOrdID: i.origClOrdId,
    },
  };
}


export interface SpotBatchCancelItem {
  symbolId: bigint;
  clOrdId: string;
  orderId?: bigint;
  origClOrdId?: string;
}

export interface SpotBatchCancelInput {
  accountId: bigint;
  cancels: SpotBatchCancelItem[];
}

export function buildBatchCancelPayload(i: SpotBatchCancelInput): ActionPayload {
  return {
    type: ACTION_BATCH_CANCEL_ORDER,
    params: {
      accountID: i.accountId,
      cancels: i.cancels.map((c) => ({
        symbolID: c.symbolId,
        clOrdID: c.clOrdId,
        orderID: c.orderId,
        origClOrdID: c.origClOrdId,
      })),
    },
  };
}


export interface ReplaceOrderItem {
  symbolId: bigint;
  clOrdId: string;
  origOrderId?: bigint;
  origClOrdId?: string;
  price?: DecimalInput;
  quantity?: DecimalInput;
}

export interface ReplaceOrderInput {
  accountId: bigint;
  orders: ReplaceOrderItem[];
}

export function buildReplaceOrderPayload(i: ReplaceOrderInput): ActionPayload {
  return {
    type: ACTION_REPLACE_ORDER,
    params: {
      accountID: i.accountId,
      orders: i.orders.map((o) => ({
        symbolID: o.symbolId,
        clOrdID: o.clOrdId,
        origOrderID: o.origOrderId,
        origClOrdID: o.origClOrdId,
        price: o.price !== undefined ? toDecimalString(o.price, "price") : undefined,
        quantity: o.quantity !== undefined ? toDecimalString(o.quantity, "quantity") : undefined,
      })),
    },
  };
}


export interface ScheduleCancelInput {
  accountId: bigint;
  scheduledTimestamp?: bigint;
}

export function buildScheduleCancelPayload(i: ScheduleCancelInput): ActionPayload {
  return {
    type: ACTION_SCHEDULE_CANCEL,
    params: {
      accountID: i.accountId,
      scheduledTimestamp: i.scheduledTimestamp,
    },
  };
}


export interface TransferAssetInput {
  id: bigint;
  fromAccountId: bigint;
  toAccountId: bigint;
  coinId: bigint;
  amount: DecimalInput;
  kind: TransferAssetKind;
}

export function buildTransferAssetPayload(i: TransferAssetInput): ActionPayload {
  return {
    type: ACTION_TRANSFER_ASSET,
    params: {
      id: i.id,
      fromAccountID: i.fromAccountId,
      toAccountID: i.toAccountId,
      coinID: i.coinId,
      amount: toDecimalString(i.amount, "amount"),
      type: transferKindToCode(i.kind),
    },
  };
}


export interface RevokeApiKeyInput {
  accountId: bigint;
  name: string;
}

export function buildRevokeApiKeyPayload(i: RevokeApiKeyInput): ActionPayload {
  return {
    type: ACTION_REVOKE_API_KEY,
    params: {
      accountID: i.accountId,
      name: i.name,
    },
  };
}
