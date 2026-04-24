/**
 * WS book ticker parser (`bookTicker` / `allBookTicker` channels).
 *
 * Wire shape: `{E, s, u, a, A, b, B}`.
 */

import type { WireRecord } from "../../common/types";
import { optBigInt, requireWireField } from "../../common/types";
import type { BookTicker } from "../../common/types";

export function parseWsBookTicker(raw: WireRecord): BookTicker {
  for (const key of ["s", "a", "A", "b", "B"] as const) {
    requireWireField(raw, "parseWsBookTicker", key);
  }
  return {
    symbol: String(raw.s),
    askPx: String(raw.a),
    askSz: String(raw.A),
    bidPx: String(raw.b),
    bidSz: String(raw.B),
    updateId: optBigInt(raw, "u"),
    eventTime: optBigInt(raw, "E"),
  };
}
