/**
 * WS market trade parser (`trade` channel).
 *
 * Wire shape: `{E, T, t, s, S, p, q, bi, si}` — identical keys to the
 * REST `Trade` wire shape (`parseTrade`), plus `E` (event time).
 *
 * We reuse `parseTrade` from `src/common/types.ts` and add `eventTime`.
 */

import type { Trade, WireRecord } from "../../common/types";
import { optBigInt, parseTrade } from "../../common/types";

export function parseWsTrade(raw: WireRecord): Trade {
  const trade = parseTrade(raw);
  trade.eventTime = optBigInt(raw, "E");
  return trade;
}
