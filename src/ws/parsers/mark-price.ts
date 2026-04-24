/**
 * WS mark price parser (`markPrice` / `allMarkPrice` channels, perps only).
 *
 * Wire shape: `{E, s, oi, p, i, r, T}`.
 */

import type { WireRecord } from "../../common/types";
import { optBigInt, requireWireField } from "../../common/types";
import type { MarkPriceTicker } from "../../perps/types";

export function parseWsMarkPrice(raw: WireRecord): MarkPriceTicker {
  for (const key of ["s", "p", "i", "r", "T", "oi"] as const) {
    requireWireField(raw, "parseWsMarkPrice", key);
  }
  return {
    symbol: String(raw.s),
    markPrice: String(raw.p),
    indexPrice: String(raw.i),
    fundingRate: String(raw.r),
    nextFundingTime: BigInt(raw.T),
    openInterest: String(raw.oi),
    eventTime: optBigInt(raw, "E"),
  };
}
