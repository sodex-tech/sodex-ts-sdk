import { describe, expect, it } from "vitest";
import { type AddUserApiKeyInput, LocalUserSigner } from "../../src";

const PRIVATE_KEY = "0x4c0883a69102937d6231471b5dbb6204fe51296170827949f5f2a87dfd8d7f31";
const CHAIN_ID = 138565n;
const NONCE = 1780000000000n;
const ACCOUNT_ID = 101n;

function apiKeyInput(extra: Partial<AddUserApiKeyInput> = {}): AddUserApiKeyInput {
  return {
    accountId: ACCOUNT_ID,
    name: "sdk-test",
    type: "EVM",
    publicKey: "0x2222222222222222222222222222222222222222",
    expiresAt: 0n,
    ...extra,
  };
}

describe("unified user signer", () => {
  // Validates the runnable registration flow can sign plain, builder-bound, and permissioned API keys.
  it("signs plain, builder, and permissioned API keys", async () => {
    const signer = new LocalUserSigner({ privateKey: PRIVATE_KEY, chainId: CHAIN_ID });
    const inputs = [
      apiKeyInput(),
      apiKeyInput({ builder: { builderId: 202n, feeRate: 10n } }),
      apiKeyInput({ permissions: 2n }),
    ];

    for (const input of inputs) {
      const signed = await signer.signAddApiKey(input, NONCE);
      expect(signed.signature).toMatch(/^0x02[0-9a-f]{130}$/);
      expect(signed.nonce).toBe(NONCE);
    }
  });

  // Validates builder and permission payloads remain mutually exclusive at the SDK boundary.
  it("rejects an API key with both builder and permissions", async () => {
    const signer = new LocalUserSigner({ privateKey: PRIVATE_KEY, chainId: CHAIN_ID });
    await expect(
      signer.signAddApiKey(
        apiKeyInput({ builder: { builderId: 202n, feeRate: 10n }, permissions: 2n }),
        NONCE,
      ),
    ).rejects.toThrow(/both builder and permissions/);
  });
});
