/**
 * WS mini ticker parser (`miniTicker` / `allMiniTicker` channels).
 *
 * Wire shape: `{E, s, c, o, h, l, v, q}`.
 *
 * The WS mini ticker does not carry `openTime`/`closeTime` (those are
 * REST-only fields on `MiniTicker`). Per CLAUDE.md we leave them
 * `undefined` rather than inventing `0n`. Callers who need the rolling
 * window boundaries should use the full `ticker` channel instead.
 */

import type { WireRecord } from "../../common/types";
import { optBigInt, requireWireField } from "../../common/types";
import type { MiniTicker } from "../../common/types";

export function parseWsMiniTicker(raw: WireRecord): MiniTicker {
  for (const key of ["s", "c", "o", "h", "l", "v", "q"] as const) {
    requireWireField(raw, "parseWsMiniTicker", key);
  }
  return {
    symbol: String(raw.s),
    lastPx: String(raw.c),
    openPx: String(raw.o),
    highPx: String(raw.h),
    lowPx: String(raw.l),
    volume: String(raw.v),
    quoteVolume: String(raw.q),
    eventTime: optBigInt(raw, "E"),
  };
}
