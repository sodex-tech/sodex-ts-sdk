import { describe, expect, it } from "vitest";
import { recoverAddApiKeyAddress, signAddApiKey } from "../../src/common/add-api-key-signer";
import { hexToBytes } from "../../src/common/bytes";
import { MAINNET_CHAIN_ID, UNIVERSAL_DOMAIN_NAME, makeDomain } from "../../src/common/eip712";
import { addressFromPrivateKey } from "../../src/common/signer";

const MASTER_PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

describe("AddAPIKey signing path", () => {
  it("produces a 66-byte signature with the 0x02 type prefix that round-trips", () => {
    const priv = hexToBytes(MASTER_PRIV_HEX);
    const wantAddr = addressFromPrivateKey(priv);
    const domain = makeDomain(UNIVERSAL_DOMAIN_NAME, MAINNET_CHAIN_ID);

    const msg = {
      accountId: 1010n,
      name: "api-key-01",
      keyType: 1,
      publicKey: hexToBytes("0x3d4595c8742d0a58173a9963c05755b59a8f8256"),
      expiresAt: 0n,
      nonce: 1760373925000n,
    };
    const sig = signAddApiKey(domain, msg, priv);
    expect(sig.length).toBe(66);
    expect(sig[0]).toBe(0x02);
    expect(recoverAddApiKeyAddress(domain, msg, sig)).toBe(wantAddr);
  });
});
