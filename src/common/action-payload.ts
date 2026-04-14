import { keccak_256 } from "@noble/hashes/sha3";
import { utf8 } from "./bytes";
import { canonicalStringify } from "./canonical-json";

export interface ActionPayload<P = unknown> {
  type: string;
  params: P;
}

export function hashActionPayload(payload: ActionPayload): Uint8Array {
  const json = canonicalStringify(payload);
  return keccak_256(utf8(json));
}

export function payloadBody<P>(payload: ActionPayload<P>): string {
  return canonicalStringify(payload.params);
}
