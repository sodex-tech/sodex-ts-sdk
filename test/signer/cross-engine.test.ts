import { describe, expect, it } from "vitest";
import { hexToBytes } from "../../src/common/bytes";
import {
  MAINNET_CHAIN_ID,
  PERPS_DOMAIN_NAME,
  SPOT_DOMAIN_NAME,
  makeDomain,
} from "../../src/common/eip712";
import { EvmSigner, addressFromPrivateKey } from "../../src/common/signer";
import { buildScheduleCancelPayload } from "../../src/spot/actions";

const TEST_PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

describe("cross-engine isolation", () => {
  it("a spot signature does NOT recover to the correct address under the perps domain", () => {
    const priv = hexToBytes(TEST_PRIV_HEX);
    const wantAddr = addressFromPrivateKey(priv);

    const spotSigner = new EvmSigner(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID), priv);
    const perpsSigner = new EvmSigner(makeDomain(PERPS_DOMAIN_NAME, MAINNET_CHAIN_ID), priv);

    const payload = buildScheduleCancelPayload({ accountId: 1001n });
    const spotSig = spotSigner.signAction(payload, 5n);

    // The signature is well-formed so recovery succeeds, but it recovers to
    // a DIFFERENT address under the perps domain because the domain separator
    // is baked into the EIP-712 digest.
    const recovered = perpsSigner.recoverAddress(payload, 5n, spotSig);
    expect(recovered).not.toBe(wantAddr);
  });
});
