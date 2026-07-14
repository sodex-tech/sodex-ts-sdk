/**
 * WS TWAP order parser (`TO` field on `accountUpdate` / `accountState`).
 *
 * Wire shape `WsTwapOrder`: `{s, i, S, q, m, r, R, z, v, ct, nt, a}` per
 * sodex-docs/rest-v1/schema.md#wstwaporder. All fields required. Distinct
 * from the REST `TwapOrder` shape — a separate parser per the one-parser-
 * per-wire-shape rule.
 */
import { orderSideFromName } from "../../common/enums";
import type { WireRecord } from "../../common/types";
import { requireBoolean, requireWireField } from "../../common/types";
import type { WsTwapOrder } from "../types";

export function parseWsTwapOrder(raw: WireRecord): WsTwapOrder {
  requireWireField(raw, "parseWsTwapOrder", "s");
  requireWireField(raw, "parseWsTwapOrder", "i");
  requireWireField(raw, "parseWsTwapOrder", "S");
  requireWireField(raw, "parseWsTwapOrder", "q");
  requireWireField(raw, "parseWsTwapOrder", "m");
  requireWireField(raw, "parseWsTwapOrder", "z");
  requireWireField(raw, "parseWsTwapOrder", "v");
  requireWireField(raw, "parseWsTwapOrder", "ct");
  requireWireField(raw, "parseWsTwapOrder", "nt");
  return {
    symbol: String(raw.s),
    orderId: BigInt(raw.i),
    side: orderSideFromName(raw.S),
    quantity: String(raw.q),
    minutes: BigInt(raw.m),
    randomize: requireBoolean(raw, "parseWsTwapOrder", "r"),
    reduceOnly: requireBoolean(raw, "parseWsTwapOrder", "R"),
    executedQty: String(raw.z),
    executedValue: String(raw.v),
    createdAt: BigInt(raw.ct),
    nextActiveAt: BigInt(raw.nt),
    active: requireBoolean(raw, "parseWsTwapOrder", "a"),
  };
}
