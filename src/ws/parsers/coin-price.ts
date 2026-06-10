/**
 * WS coin price parser (`coinPrice` / `allCoinPrice` channels, perps only).
 *
 * Wire shape: `{i, a, p, mr, E}` — all five fields required per
 * sodex-docs/rest-v1/schema.md#wscoinpricedata.
 */

import type { WireRecord } from "../../common/types";
import { requireWireField } from "../../common/types";
import type { WsCoinPrice } from "../types";

export function parseWsCoinPrice(raw: WireRecord): WsCoinPrice {
  for (const key of ["i", "a", "p", "mr", "E"] as const) {
    requireWireField(raw, "parseWsCoinPrice", key);
  }
  return {
    coinId: BigInt(raw.i),
    coin: String(raw.a),
    price: String(raw.p),
    marginRatio: String(raw.mr),
    eventTime: BigInt(raw.E),
  };
}
