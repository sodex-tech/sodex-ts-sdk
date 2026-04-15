import { describe, expect, it } from "vitest";
import { parseApiKey } from "../src/common/types";

function full(): Record<string, unknown> {
  // sodex-docs/rest-v1/schema.md#apikey — all 4 fields required.
  return {
    name: "default",
    type: "PRIMARY",
    publicKey: "0xabcdef",
    expiresAt: 1_800_000_000_000n,
  };
}

describe("parseApiKey", () => {
  it("maps a complete APIKey wire record", () => {
    const info = parseApiKey(full());
    expect(info).toEqual({
      name: "default",
      type: "PRIMARY",
      publicKey: "0xabcdef",
      expiresAt: 1_800_000_000_000n,
    });
  });

  it.each(["name", "type", "publicKey", "expiresAt"] as const)(
    "throws when required field `%s` is missing",
    (key) => {
      const raw = full();
      delete raw[key];
      expect(() => parseApiKey(raw)).toThrow(
        new RegExp(`missing required field \\\`${key}\\\``),
      );
    },
  );

  it("accepts both documented `type` enum values", () => {
    expect(parseApiKey({ ...full(), type: "PRIMARY" }).type).toBe("PRIMARY");
    expect(parseApiKey({ ...full(), type: "SUBACCOUNT" }).type).toBe("SUBACCOUNT");
  });

  it("passes through unknown `type` values for forward compat", () => {
    // Matches the pattern used by orderSideFromName/orderTypeFromName — an
    // unrecognised enum value from a newer server isn't a blocker; it flows
    // through as-is for callers to handle.
    expect(parseApiKey({ ...full(), type: "FUTURE_ROLE" }).type).toBe("FUTURE_ROLE");
  });
});
