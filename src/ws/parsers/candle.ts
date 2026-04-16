/**
 * WS candle/kline parser (`candle` channel).
 *
 * Wire shape: `{t, T, s, i, o, h, l, c, v, q, n, x}`.
 *
 * The WS candle provides `T` (closeTime), `s` (symbol), `i` (interval),
 * and `x` (isClosed) that the REST kline wire omits. These are added as
 * optional fields on the shared `Kline` type — the server said them, so
 * the SDK reports them (derivation, not invention).
 */

import type { Kline, KlineInterval, WireRecord } from "../../common/types";
import { optBigInt, requireWireField } from "../../common/types";

export function parseWsCandle(raw: WireRecord): Kline {
  for (const key of ["t", "s", "i", "o", "h", "l", "c", "v", "q"] as const) {
    requireWireField(raw, "parseWsCandle", key);
  }
  const n = raw.n;
  const x = raw.x;
  return {
    symbol: String(raw.s),
    interval: String(raw.i) as KlineInterval,
    openTime: BigInt(raw.t),
    openPx: String(raw.o),
    highPx: String(raw.h),
    lowPx: String(raw.l),
    closePx: String(raw.c),
    volume: String(raw.v),
    quoteVolume: String(raw.q),
    tradeCount: n === undefined || n === null ? undefined : Number(n),
    closeTime: optBigInt(raw, "T"),
    isClosed: x === undefined || x === null ? undefined : Boolean(x),
  };
}
