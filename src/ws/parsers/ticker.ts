/**
 * WS ticker parsers (`ticker` / `allTicker` channels).
 *
 * Wire shape (sodex-docs/websocket-v1): short keys
 * `{E, s, c, Q, w, a, A, b, B, p, P, o, h, l, v, q, O, C}`.
 *
 * Spot and perps tickers share a common subset; perps adds funding/mark
 * fields that are absent in the spot wire. Each gets its own parser per
 * CLAUDE.md "one parser per wire shape" rule.
 */

import { orderSideFromName } from "../../common/enums";
import type { WireRecord } from "../../common/types";
import { optBigInt, optString, requireWireField } from "../../common/types";
import type { PerpsTicker } from "../../perps/types";
import type { SpotTicker } from "../../spot/types";

/**
 * Parse a WS spot ticker record.
 *
 * Design trade-offs:
 *   1. Wire keys differ from REST (`c` = lastPx, `p` = change, etc.).
 *      This parser handles only the WS shape; REST keeps `parseSpotTicker`.
 *   2. `changePct` (wire `P`) is a float on the wire, kept as `number`.
 *   3. `eventTime` is WS-only metadata; added as optional on `SpotTicker`.
 */
export function parseWsSpotTicker(raw: WireRecord): SpotTicker {
  for (const key of ["s", "c", "o", "h", "l", "v", "q", "p", "P", "a", "A", "b", "B", "O", "C"] as const) {
    requireWireField(raw, "parseWsSpotTicker", key);
  }
  return {
    symbol: String(raw.s),
    lastPx: String(raw.c),
    lastSz: optString(raw, "Q"),
    vwap: optString(raw, "w"),
    openPx: String(raw.o),
    highPx: String(raw.h),
    lowPx: String(raw.l),
    change: String(raw.p),
    changePct: Number(raw.P),
    volume: String(raw.v),
    quoteVolume: String(raw.q),
    askPx: String(raw.a),
    askSz: String(raw.A),
    bidPx: String(raw.b),
    bidSz: String(raw.B),
    openTime: BigInt(raw.O),
    closeTime: BigInt(raw.C),
    eventTime: optBigInt(raw, "E"),
  };
}

/**
 * Parse a WS perps ticker record.
 *
 * The WS `ticker` channel carries the same price/volume fields as spot.
 * Funding rate, mark price, index price, and open interest are NOT part
 * of the ticker wire shape — they live on the separate `markPrice`
 * channel. Per CLAUDE.md, we leave those fields `undefined` rather than
 * inventing values like `""` or `0n`.
 */
export function parseWsPerpsTicker(raw: WireRecord): PerpsTicker {
  for (const key of ["s", "c", "o", "h", "l", "v", "q", "a", "A", "b", "B", "O", "C"] as const) {
    requireWireField(raw, "parseWsPerpsTicker", key);
  }
  return {
    symbol: String(raw.s),
    lastPx: String(raw.c),
    lastSz: optString(raw, "Q"),
    vwap: optString(raw, "w"),
    change: optString(raw, "p"),
    changePct: raw.P === undefined || raw.P === null ? undefined : Number(raw.P),
    openPx: String(raw.o),
    highPx: String(raw.h),
    lowPx: String(raw.l),
    volume: String(raw.v),
    quoteVolume: String(raw.q),
    askPx: String(raw.a),
    askSz: String(raw.A),
    bidPx: String(raw.b),
    bidSz: String(raw.B),
    openTime: BigInt(raw.O),
    closeTime: BigInt(raw.C),
    eventTime: optBigInt(raw, "E"),
  };
}
