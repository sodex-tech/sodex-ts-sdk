/**
 * WS order book parsers (`l2Book` / `l4Book` channels).
 *
 * L2 snapshot wire: `{s, u, E, b, a}` (top-20 levels, snapshot only).
 * L4 snapshot wire: `{s, u, E, b, a}` (full depth).
 * L4 update wire:   `{s, U, u, E, b, a}` (`U` = firstUpdateId).
 *
 * Both `b` and `a` are arrays of `[price, size]` tuples.
 */

import type { OrderBookLevel, WireRecord } from "../../common/types";
import { optBigInt, requireWireField } from "../../common/types";
import type { WsOrderBook, WsOrderBookUpdate } from "../types";

function toOrderBookLevels(raw: unknown, parser: string, side: "bids" | "asks"): OrderBookLevel[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`${parser}: \`${side}\` must be an array or null`);
  }
  return raw.map((l, i) => {
    if (!Array.isArray(l) || l.length !== 2) {
      throw new Error(`${parser}: ${side}[${i}] must be a [price, size] tuple of length 2`);
    }
    return { price: String(l[0]), size: String(l[1]) };
  });
}

/** Parse an L2 or L4 snapshot. */
export function parseWsOrderBook(raw: WireRecord): WsOrderBook {
  requireWireField(raw, "parseWsOrderBook", "s");
  requireWireField(raw, "parseWsOrderBook", "u");
  requireWireField(raw, "parseWsOrderBook", "E");
  return {
    symbol: String(raw.s),
    updateId: BigInt(raw.u),
    eventTime: BigInt(raw.E),
    bids: toOrderBookLevels(raw.b, "parseWsOrderBook", "bids"),
    asks: toOrderBookLevels(raw.a, "parseWsOrderBook", "asks"),
  };
}

/** Parse an L4 incremental diff. */
export function parseWsOrderBookUpdate(raw: WireRecord): WsOrderBookUpdate {
  requireWireField(raw, "parseWsOrderBookUpdate", "s");
  requireWireField(raw, "parseWsOrderBookUpdate", "U");
  requireWireField(raw, "parseWsOrderBookUpdate", "u");
  requireWireField(raw, "parseWsOrderBookUpdate", "E");
  return {
    symbol: String(raw.s),
    firstUpdateId: BigInt(raw.U),
    lastUpdateId: BigInt(raw.u),
    eventTime: BigInt(raw.E),
    bids: toOrderBookLevels(raw.b, "parseWsOrderBookUpdate", "bids"),
    asks: toOrderBookLevels(raw.a, "parseWsOrderBookUpdate", "asks"),
  };
}
