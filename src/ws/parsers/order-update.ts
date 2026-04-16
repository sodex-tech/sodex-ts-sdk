/**
 * WS order update parsers (`accountOrderUpdate` channel).
 *
 * Spot wire shape: `{E, T, s, c, i, S, o, f, p, q, F, X, z, v, M, t, l, L, n, m, x, r}`.
 * Perps adds: `{ps, R, sp, st, tt, pid, poid, aoids}`.
 */

import {
  execTypeFromName,
  orderSideFromName,
  orderStatusFromName,
  orderTypeFromName,
  positionSideFromName,
  stopTypeFromName,
  timeInForceFromName,
  triggerTypeFromName,
} from "../../common/enums";
import type { WireRecord } from "../../common/types";
import {
  optBigInt,
  optBigIntArray,
  optBoolean,
  optEnum,
  optString,
  requireBoolean,
  requireWireField,
} from "../../common/types";
import type { WsPerpsOrderUpdate, WsSpotOrderUpdate } from "../types";

export function parseWsSpotOrderUpdate(raw: WireRecord): WsSpotOrderUpdate {
  for (const key of ["E", "T", "s", "c", "i", "S", "o", "f", "p", "q", "X", "z", "v", "M", "x"] as const) {
    requireWireField(raw, "parseWsSpotOrderUpdate", key);
  }
  return {
    eventTime: BigInt(raw.E),
    blockTime: BigInt(raw.T),
    symbol: String(raw.s),
    clOrdID: String(raw.c),
    orderID: BigInt(raw.i),
    side: orderSideFromName(raw.S),
    type: orderTypeFromName(raw.o),
    timeInForce: timeInForceFromName(raw.f),
    price: String(raw.p),
    origQty: String(raw.q),
    funds: optString(raw, "F"),
    status: orderStatusFromName(raw.X),
    executedQty: String(raw.z),
    executedValue: String(raw.v),
    marginFrozen: String(raw.M),
    execType: execTypeFromName(raw.x),
    tradeID: optBigInt(raw, "t"),
    lastQty: optString(raw, "l"),
    lastPrice: optString(raw, "L"),
    fee: optString(raw, "n"),
    isMaker: optBoolean(raw, "parseWsSpotOrderUpdate", "m"),
    rejectReason: optString(raw, "r"),
  };
}

export function parseWsPerpsOrderUpdate(raw: WireRecord): WsPerpsOrderUpdate {
  const base = parseWsSpotOrderUpdate(raw);
  requireWireField(raw, "parseWsPerpsOrderUpdate", "ps");
  requireWireField(raw, "parseWsPerpsOrderUpdate", "R");
  return {
    ...base,
    positionSide: positionSideFromName(raw.ps),
    reduceOnly: requireBoolean(raw, "parseWsPerpsOrderUpdate", "R"),
    stopPrice: optString(raw, "sp"),
    stopType: optEnum(raw, "st", stopTypeFromName),
    triggerType: optEnum(raw, "tt", triggerTypeFromName),
    positionID: optBigInt(raw, "pid"),
    primaryOrderID: optBigInt(raw, "poid"),
    attachedOrderIDs: optBigIntArray(raw, "parseWsPerpsOrderUpdate", "aoids"),
  };
}
