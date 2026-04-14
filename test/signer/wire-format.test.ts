import { describe, expect, it } from "vitest";
import { hexToBytes } from "../../src/common/bytes";
import { MAINNET_CHAIN_ID, SPOT_DOMAIN_NAME, makeDomain } from "../../src/common/eip712";
import { EvmSigner, SIG_TYPE_EIP712, WIRE_SIG_LENGTH } from "../../src/common/signer";
import { buildScheduleCancelPayload } from "../../src/spot/actions";

const TEST_PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

describe("signer wire format", () => {
  it("produces a 66-byte signature with the correct type prefix", () => {
    const signer = new EvmSigner(
      makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID),
      hexToBytes(TEST_PRIV_HEX),
    );
    const sig = signer.signAction(buildScheduleCancelPayload({ accountId: 1001n }), 1n);
    expect(sig.length).toBe(WIRE_SIG_LENGTH);
    expect(sig[0]).toBe(SIG_TYPE_EIP712);
    // Recovery byte is either 0 or 1 (compact secp256k1 rec id).
    expect([0, 1]).toContain(sig[65]);
  });
});
