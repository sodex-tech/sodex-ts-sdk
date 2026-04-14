import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "../../src/common/bytes";
import { MAINNET_CHAIN_ID, SPOT_DOMAIN_NAME, makeDomain } from "../../src/common/eip712";
import { EvmSigner } from "../../src/common/signer";
import { buildScheduleCancelPayload } from "../../src/spot/actions";

const TEST_PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

describe("determinism", () => {
  it("identical (key, payload, nonce) produces identical signatures (RFC 6979)", () => {
    const signer = new EvmSigner(
      makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID),
      hexToBytes(TEST_PRIV_HEX),
    );
    const payload = buildScheduleCancelPayload({ accountId: 1001n });
    const sig1 = signer.signAction(payload, 3n);
    const sig2 = signer.signAction(payload, 3n);
    expect(bytesToHex(sig1)).toBe(bytesToHex(sig2));
  });
});
