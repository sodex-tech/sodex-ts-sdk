/**
 * WS liquidation event parser (`accountEvent` channel, perps only).
 *
 * Wire shape: `{type: "liquidation", E, lid, aid, av, mm, B: [{i, a, wb}], P: [{s, ps, sz, mp, lp}]}`.
 */

import { marginModeFromName, positionSideFromName } from "../../common/enums";
import type { WireRecord } from "../../common/types";
import { optString, parseWireArray, requireWireField } from "../../common/types";
import type { WsLiquidationBalance, WsLiquidationEvent, WsLiquidationPosition } from "../types";

function parseLiquidationBalance(b: WireRecord): WsLiquidationBalance {
  requireWireField(b, "parseLiquidationBalance", "i");
  requireWireField(b, "parseLiquidationBalance", "a");
  requireWireField(b, "parseLiquidationBalance", "wb");
  return {
    coinId: BigInt(b.i),
    coin: String(b.a),
    walletBalance: String(b.wb),
  };
}

function parseLiquidationPosition(p: WireRecord): WsLiquidationPosition {
  requireWireField(p, "parseLiquidationPosition", "s");
  requireWireField(p, "parseLiquidationPosition", "ps");
  requireWireField(p, "parseLiquidationPosition", "sz");
  requireWireField(p, "parseLiquidationPosition", "mp");
  return {
    symbol: String(p.s),
    positionSide: positionSideFromName(p.ps),
    size: String(p.sz),
    markPrice: String(p.mp),
    liquidationPrice: optString(p, "lp"),
  };
}

export function parseWsLiquidationEvent(raw: WireRecord): WsLiquidationEvent {
  requireWireField(raw, "parseWsLiquidationEvent", "E");
  requireWireField(raw, "parseWsLiquidationEvent", "lid");
  requireWireField(raw, "parseWsLiquidationEvent", "aid");
  requireWireField(raw, "parseWsLiquidationEvent", "av");
  requireWireField(raw, "parseWsLiquidationEvent", "mm");
  return {
    eventTime: BigInt(raw.E),
    liquidatorId: BigInt(raw.lid),
    accountId: BigInt(raw.aid),
    accountValue: String(raw.av),
    marginMode: marginModeFromName(raw.mm),
    balances: parseWireArray(raw, "parseWsLiquidationEvent", "B", parseLiquidationBalance),
    positions: parseWireArray(raw, "parseWsLiquidationEvent", "P", parseLiquidationPosition),
  };
}
