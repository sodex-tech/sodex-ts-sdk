/**
 * WS account update parsers (`accountUpdate` channel).
 *
 * Spot wire shape:  `{E, T, h, B: [{i, a, t, l}]}`.
 * Perps wire shape: `{E, T, h, B: [{i, a, wb}], P: [{i, s, sz, ep, iw, ps}]}`.
 */

import { positionSideFromName } from "../../common/enums";
import type { WireRecord } from "../../common/types";
import { optBigInt, optString, parseWireArray, requireWireField } from "../../common/types";
import type {
  WsPerpsAccountUpdate,
  WsPerpsBalanceUpdate,
  WsPerpsPositionUpdate,
  WsSpotAccountUpdate,
  WsSpotBalanceUpdate,
} from "../types";
import { parseWsTwapOrder } from "./twap-order";

function parseSpotBalanceUpdate(b: WireRecord): WsSpotBalanceUpdate {
  requireWireField(b, "parseSpotBalanceUpdate", "i");
  requireWireField(b, "parseSpotBalanceUpdate", "a");
  requireWireField(b, "parseSpotBalanceUpdate", "t");
  requireWireField(b, "parseSpotBalanceUpdate", "l");
  return {
    coinId: BigInt(b.i),
    coin: String(b.a),
    total: String(b.t),
    locked: String(b.l),
  };
}

export function parseWsSpotAccountUpdate(raw: WireRecord): WsSpotAccountUpdate {
  requireWireField(raw, "parseWsSpotAccountUpdate", "E");
  requireWireField(raw, "parseWsSpotAccountUpdate", "T");
  requireWireField(raw, "parseWsSpotAccountUpdate", "h");
  return {
    eventTime: BigInt(raw.E),
    blockTime: BigInt(raw.T),
    blockHeight: BigInt(raw.h),
    balances: parseWireArray(raw, "parseWsSpotAccountUpdate", "B", parseSpotBalanceUpdate),
    twaps: parseWireArray(raw, "parseWsSpotAccountUpdate", "TO", parseWsTwapOrder),
  };
}

function parsePerpsBalanceUpdate(b: WireRecord): WsPerpsBalanceUpdate {
  requireWireField(b, "parsePerpsBalanceUpdate", "i");
  requireWireField(b, "parsePerpsBalanceUpdate", "a");
  requireWireField(b, "parsePerpsBalanceUpdate", "wb");
  return {
    coinId: BigInt(b.i),
    coin: String(b.a),
    walletBalance: String(b.wb),
  };
}

function parsePerpsPositionUpdate(p: WireRecord): WsPerpsPositionUpdate {
  requireWireField(p, "parsePerpsPositionUpdate", "i");
  requireWireField(p, "parsePerpsPositionUpdate", "s");
  requireWireField(p, "parsePerpsPositionUpdate", "sz");
  requireWireField(p, "parsePerpsPositionUpdate", "ep");
  requireWireField(p, "parsePerpsPositionUpdate", "ps");
  return {
    id: BigInt(p.i),
    symbol: String(p.s),
    size: String(p.sz),
    avgEntryPrice: String(p.ep),
    positionSide: positionSideFromName(p.ps),
    isolatedMargin: optString(p, "iw"),
    createdAt: optBigInt(p, "ct"),
    updatedAt: optBigInt(p, "ut"),
  };
}

export function parseWsPerpsAccountUpdate(raw: WireRecord): WsPerpsAccountUpdate {
  requireWireField(raw, "parseWsPerpsAccountUpdate", "E");
  requireWireField(raw, "parseWsPerpsAccountUpdate", "T");
  requireWireField(raw, "parseWsPerpsAccountUpdate", "h");
  return {
    eventTime: BigInt(raw.E),
    blockTime: BigInt(raw.T),
    blockHeight: BigInt(raw.h),
    balances: parseWireArray(raw, "parseWsPerpsAccountUpdate", "B", parsePerpsBalanceUpdate),
    positions: parseWireArray(raw, "parseWsPerpsAccountUpdate", "P", parsePerpsPositionUpdate),
    twaps: parseWireArray(raw, "parseWsPerpsAccountUpdate", "TO", parseWsTwapOrder),
  };
}
