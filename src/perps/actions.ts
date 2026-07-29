/** Perps action builders. Field order must match the Go struct definition. */
import type { ActionPayload } from "../common/action-payload";
import { type DecimalInput, toDecimalString } from "../common/decimal";
import {
  type MarginMode,
  type OrderModifier,
  type OrderSide,
  type OrderType,
  type PositionSide,
  type StopType,
  type TimeInForce,
  type TriggerType,
  marginModeToCode,
  orderModifierToCode,
  orderSideToCode,
  orderTypeToCode,
  positionSideToCode,
  stopTypeToCode,
  timeInForceToCode,
  triggerTypeToCode,
} from "../common/enums";
import { ACTION_TWAP_ORDER } from "../spot/actions";

export const ACTION_PERPS_NEW_ORDER = "newOrder";
export const ACTION_PERPS_CANCEL_ORDER = "cancelOrder";
export const ACTION_PERPS_MODIFY_ORDER = "modifyOrder";
export const ACTION_PERPS_UPDATE_LEVERAGE = "updateLeverage";
export const ACTION_PERPS_UPDATE_MARGIN = "updateMargin";
export const ACTION_PERPS_UPDATE_COLLATERAL = "updateCollateral";

export interface PerpsOrderItem {
  clOrdId: string;
  modifier: OrderModifier;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  price?: DecimalInput;
  quantity?: DecimalInput;
  funds?: DecimalInput;
  stopPrice?: DecimalInput;
  stopType?: StopType;
  triggerType?: TriggerType;
  reduceOnly: boolean;
  positionSide: PositionSide;
}

export interface PerpsNewOrderInput {
  accountId: bigint;
  symbolId: bigint;
  orders: PerpsOrderItem[];
}

export function buildPerpsNewOrderPayload(i: PerpsNewOrderInput): ActionPayload {
  return {
    type: ACTION_PERPS_NEW_ORDER,
    params: {
      accountID: i.accountId,
      symbolID: i.symbolId,
      orders: i.orders.map((o) => ({
        clOrdID: o.clOrdId,
        modifier: orderModifierToCode(o.modifier),
        side: orderSideToCode(o.side),
        type: orderTypeToCode(o.type),
        timeInForce: timeInForceToCode(o.timeInForce),
        price: o.price !== undefined ? toDecimalString(o.price, "price") : undefined,
        quantity: o.quantity !== undefined ? toDecimalString(o.quantity, "quantity") : undefined,
        funds: o.funds !== undefined ? toDecimalString(o.funds, "funds") : undefined,
        stopPrice:
          o.stopPrice !== undefined ? toDecimalString(o.stopPrice, "stopPrice") : undefined,
        stopType: o.stopType !== undefined ? stopTypeToCode(o.stopType) : undefined,
        triggerType: o.triggerType !== undefined ? triggerTypeToCode(o.triggerType) : undefined,
        reduceOnly: o.reduceOnly,
        positionSide: positionSideToCode(o.positionSide),
      })),
    },
  };
}

export interface PerpsCancelItem {
  symbolId: bigint;
  orderId?: bigint;
  clOrdId?: string;
}

export interface PerpsCancelOrderInput {
  accountId: bigint;
  cancels: PerpsCancelItem[];
}

export function buildPerpsCancelOrderPayload(i: PerpsCancelOrderInput): ActionPayload {
  return {
    type: ACTION_PERPS_CANCEL_ORDER,
    params: {
      accountID: i.accountId,
      cancels: i.cancels.map((c) => ({
        symbolID: c.symbolId,
        orderID: c.orderId,
        clOrdID: c.clOrdId,
      })),
    },
  };
}

export interface PerpsModifyOrderInput {
  accountId: bigint;
  symbolId: bigint;
  orderId?: bigint;
  clOrdId?: string;
  price?: DecimalInput;
  quantity?: DecimalInput;
  stopPrice?: DecimalInput;
}

export function buildPerpsModifyOrderPayload(i: PerpsModifyOrderInput): ActionPayload {
  return {
    type: ACTION_PERPS_MODIFY_ORDER,
    params: {
      accountID: i.accountId,
      symbolID: i.symbolId,
      orderID: i.orderId,
      clOrdID: i.clOrdId,
      price: i.price !== undefined ? toDecimalString(i.price, "price") : undefined,
      quantity: i.quantity !== undefined ? toDecimalString(i.quantity, "quantity") : undefined,
      stopPrice: i.stopPrice !== undefined ? toDecimalString(i.stopPrice, "stopPrice") : undefined,
    },
  };
}

export interface UpdateLeverageInput {
  accountId: bigint;
  symbolId: bigint;
  leverage: number;
  marginMode: MarginMode;
}

export function buildUpdateLeveragePayload(i: UpdateLeverageInput): ActionPayload {
  return {
    type: ACTION_PERPS_UPDATE_LEVERAGE,
    params: {
      accountID: i.accountId,
      symbolID: i.symbolId,
      leverage: i.leverage,
      marginMode: marginModeToCode(i.marginMode),
    },
  };
}

export interface UpdateMarginInput {
  accountId: bigint;
  symbolId: bigint;
  amount: DecimalInput;
}

export function buildUpdateMarginPayload(i: UpdateMarginInput): ActionPayload {
  return {
    type: ACTION_PERPS_UPDATE_MARGIN,
    params: {
      accountID: i.accountId,
      symbolID: i.symbolId,
      amount: toDecimalString(i.amount, "amount"),
    },
  };
}

export interface UpdateCollateralInput {
  accountId: bigint;
  coinId: bigint;
  amount: DecimalInput;
}

export function buildUpdateCollateralPayload(i: UpdateCollateralInput): ActionPayload {
  return {
    type: ACTION_PERPS_UPDATE_COLLATERAL,
    params: {
      accountID: i.accountId,
      coinID: i.coinId,
      amount: toDecimalString(i.amount, "amount"),
    },
  };
}

export interface PerpsNewTwapOrderInput {
  accountId: bigint;
  symbolId: bigint;
  side: OrderSide;
  quantity: DecimalInput;
  minutes: number;
  // Required: always emitted into the signed payload (even when false), per
  // schema PerpsNewTwapOrderRequest.
  reduceOnly: boolean;
  randomize: boolean;
}

export function buildPerpsTwapOrderPayload(i: PerpsNewTwapOrderInput): ActionPayload {
  return {
    type: ACTION_TWAP_ORDER,
    params: {
      accountID: i.accountId,
      symbolID: i.symbolId,
      side: orderSideToCode(i.side),
      quantity: toDecimalString(i.quantity, "quantity"),
      minutes: i.minutes,
      randomize: i.randomize,
      reduceOnly: i.reduceOnly,
    },
  };
}

export {
  ACTION_REPLACE_ORDER,
  ACTION_SCHEDULE_CANCEL,
  ACTION_TRANSFER_ASSET,
  ACTION_REVOKE_API_KEY,
  ACTION_TWAP_ORDER,
  ACTION_CANCEL_TWAP_ORDER,
  buildReplaceOrderPayload,
  buildRevokeApiKeyPayload,
  buildScheduleCancelPayload,
  buildTransferAssetPayload,
  buildCancelTwapPayload,
  type ReplaceOrderInput,
  type ReplaceOrderItem,
  type RevokeApiKeyInput,
  type ScheduleCancelInput,
  type TransferAssetInput,
  type CancelTwapOrderInput,
} from "../spot/actions";
