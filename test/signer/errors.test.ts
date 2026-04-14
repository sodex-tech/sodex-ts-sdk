import { describe, expect, it } from "vitest";
import { hexToBytes } from "../../src/common/bytes";
import { MAINNET_CHAIN_ID, SPOT_DOMAIN_NAME, makeDomain } from "../../src/common/eip712";
import { EvmSigner, SIG_TYPE_EIP712, WIRE_SIG_LENGTH } from "../../src/common/signer";
import { buildScheduleCancelPayload } from "../../src/spot/actions";

const TEST_PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

function makeSigner() {
  return new EvmSigner(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID), hexToBytes(TEST_PRIV_HEX));
}

describe("recoverAddress error handling", () => {
  const payload = buildScheduleCancelPayload({ accountId: 1n });

  it("rejects the empty signature", () => {
    expect(() => makeSigner().recoverAddress(payload, 0n, new Uint8Array())).toThrow();
  });

  it("rejects 65-byte raw ECDSA (missing type prefix)", () => {
    expect(() => makeSigner().recoverAddress(payload, 0n, new Uint8Array(65))).toThrow();
  });

  it("rejects 67-byte signature (too long)", () => {
    expect(() => makeSigner().recoverAddress(payload, 0n, new Uint8Array(67))).toThrow();
  });

  it("rejects zeroed-out signature bytes", () => {
    const s = new Uint8Array(WIRE_SIG_LENGTH);
    expect(() => makeSigner().recoverAddress(payload, 0n, s)).toThrow();
  });

  it("accepts the documented 0x01 prefix", () => {
    const sig = makeSigner().signAction(payload, 0n);
    expect(sig[0]).toBe(SIG_TYPE_EIP712);
  });
});
