import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "../../src/common/bytes";
import { MAINNET_CHAIN_ID, SPOT_DOMAIN_NAME, makeDomain } from "../../src/common/eip712";
import { EvmSigner } from "../../src/common/signer";
import { buildScheduleCancelPayload, buildTransferAssetPayload } from "../../src/spot/actions";

const TEST_PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

function signer() {
  return new EvmSigner(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID), hexToBytes(TEST_PRIV_HEX));
}

describe("signature sensitivity", () => {
  it("changing the nonce changes the signature", () => {
    const s = signer();
    const p = buildScheduleCancelPayload({ accountId: 1001n });
    expect(bytesToHex(s.signAction(p, 0n))).not.toBe(bytesToHex(s.signAction(p, 1n)));
  });

  it("changing the action type changes the signature", () => {
    const s = signer();
    const sigCancel = s.signAction(buildScheduleCancelPayload({ accountId: 1001n }), 0n);
    const sigTransfer = s.signAction(
      buildTransferAssetPayload({
        id: 1n,
        fromAccountId: 1001n,
        toAccountId: 1002n,
        coinId: 3n,
        amount: "1",
        kind: "INTERNAL",
      }),
      0n,
    );
    expect(bytesToHex(sigCancel)).not.toBe(bytesToHex(sigTransfer));
  });

  it("changing a parameter value changes the signature", () => {
    const s = signer();
    const a = s.signAction(buildScheduleCancelPayload({ accountId: 1001n }), 0n);
    const b = s.signAction(buildScheduleCancelPayload({ accountId: 9999n }), 0n);
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});
