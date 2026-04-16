/**
 * WS account trade parsers (`accountTrade` channel).
 *
 * Spot wire shape: `{E, T, t, s, i, c, S, p, q, f, m}`.
 * Perps adds: `{d}` (direction display).
 */

import { orderSideFromName } from "../../common/enums";
import type { WireRecord } from "../../common/types";
import { optString, requireBoolean, requireWireField } from "../../common/types";
import type { WsPerpsAccountTrade, WsSpotAccountTrade } from "../types";

export function parseWsSpotAccountTrade(raw: WireRecord): WsSpotAccountTrade {
  for (const key of ["E", "T", "t", "s", "i", "c", "S", "p", "q", "f", "m"] as const) {
    requireWireField(raw, "parseWsSpotAccountTrade", key);
  }
  return {
    eventTime: BigInt(raw.E),
    tradeTime: BigInt(raw.T),
    tradeID: BigInt(raw.t),
    symbol: String(raw.s),
    orderID: BigInt(raw.i),
    clOrdID: String(raw.c),
    side: orderSideFromName(raw.S),
    price: String(raw.p),
    quantity: String(raw.q),
    fee: String(raw.f),
    isMaker: requireBoolean(raw, "parseWsSpotAccountTrade", "m"),
  };
}

export function parseWsPerpsAccountTrade(raw: WireRecord): WsPerpsAccountTrade {
  const base = parseWsSpotAccountTrade(raw);
  return {
    ...base,
    direction: optString(raw, "d"),
  };
}
