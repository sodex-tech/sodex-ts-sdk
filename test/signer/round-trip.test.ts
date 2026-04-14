import { describe, expect, it } from "vitest";
import { hexToBytes } from "../../src/common/bytes";
import {
  MAINNET_CHAIN_ID,
  PERPS_DOMAIN_NAME,
  SPOT_DOMAIN_NAME,
  makeDomain,
} from "../../src/common/eip712";
import { EvmSigner, addressFromPrivateKey } from "../../src/common/signer";
import {
  buildReplaceOrderPayload,
  buildScheduleCancelPayload,
  buildTransferAssetPayload,
} from "../../src/spot/actions";

const TEST_PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

describe("sign → recover round trip", () => {
  const priv = hexToBytes(TEST_PRIV_HEX);
  const expectedAddr = addressFromPrivateKey(priv);

  it("recovers the signer address for the spot domain", () => {
    const signer = new EvmSigner(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID), priv);
    const payload = buildScheduleCancelPayload({ accountId: 1001n });
    const sig = signer.signAction(payload, 1n);
    expect(signer.recoverAddress(payload, 1n, sig)).toBe(expectedAddr);
  });

  it("recovers the signer address for the perps domain", () => {
    const signer = new EvmSigner(makeDomain(PERPS_DOMAIN_NAME, MAINNET_CHAIN_ID), priv);
    const payload = buildScheduleCancelPayload({ accountId: 2002n });
    const sig = signer.signAction(payload, 7n);
    expect(signer.recoverAddress(payload, 7n, sig)).toBe(expectedAddr);
  });

  it("recovers across multiple action types", () => {
    const signer = new EvmSigner(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID), priv);
    const payloads = [
      buildScheduleCancelPayload({ accountId: 1001n }),
      buildScheduleCancelPayload({ accountId: 1001n, scheduledTimestamp: 9999999n }),
      buildReplaceOrderPayload({
        accountId: 1001n,
        orders: [{ symbolId: 1n, clOrdId: "r-1", price: "50000" }],
      }),
      buildTransferAssetPayload({
        id: 1n,
        fromAccountId: 1001n,
        toAccountId: 1002n,
        coinId: 3n,
        amount: "1",
        kind: "INTERNAL",
      }),
    ];
    for (const p of payloads) {
      const sig = signer.signAction(p, 42n);
      expect(signer.recoverAddress(p, 42n, sig)).toBe(expectedAddr);
    }
  });
});
