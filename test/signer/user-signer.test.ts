import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  type AddUserApiKeyInput,
  LocalUserSigner,
  TypedDataUserSigner,
  buildAddApiKeyTypedData,
  buildApproveBuilderFeeTypedData,
  buildRevokeApiKeyTypedData,
} from "../../src";

const PRIVATE_KEY = "0x4c0883a69102937d6231471b5dbb6204fe51296170827949f5f2a87dfd8d7f31";
const CHAIN_ID = 138565n;
const NONCE = 1780000000000n;
const ACCOUNT_ID = 101n;

function signers() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  return {
    local: new LocalUserSigner({ privateKey: PRIVATE_KEY, chainId: CHAIN_ID }),
    external: new TypedDataUserSigner({
      address: account.address,
      chainId: CHAIN_ID,
      signTypedData: (typedData) => account.signTypedData(typedData as any),
    }),
  };
}

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
  // Validates local private keys and wallet callbacks produce identical wire signatures for every API-key variant.
  it("signs plain, builder, and permissioned API keys", async () => {
    const { local, external } = signers();
    const inputs = [
      apiKeyInput(),
      apiKeyInput({ builder: { builderId: 202n, feeRate: 10n } }),
      apiKeyInput({ permissions: 2n }),
    ];

    for (const input of inputs) {
      const [localSigned, externalSigned] = await Promise.all([
        local.signAddApiKey(input, NONCE),
        external.signAddApiKey(input, NONCE),
      ]);
      expect(externalSigned).toEqual(localSigned);
      expect(localSigned.signature).toMatch(/^0x02[0-9a-f]{130}$/);
    }
  });

  // Validates builder and permission payloads remain mutually exclusive at the SDK boundary.
  it("rejects an API key with both builder and permissions", () => {
    expect(() =>
      buildAddApiKeyTypedData(
        apiKeyInput({ builder: { builderId: 202n, feeRate: 10n }, permissions: 2n }),
        NONCE,
        CHAIN_ID,
      ),
    ).toThrow(/both builder and permissions/);
  });

  // Validates universal revoke uses the generic ExchangeAction envelope accepted by both engines.
  it("signs universal API-key revoke with local and external wallets", async () => {
    const { local, external } = signers();
    const input = { accountId: ACCOUNT_ID, name: "sdk-test" };

    const [localSigned, externalSigned] = await Promise.all([
      local.signRevokeApiKey(input, NONCE),
      external.signRevokeApiKey(input, NONCE),
    ]);

    expect(externalSigned).toEqual(localSigned);
    const typedData = buildRevokeApiKeyTypedData(input, NONCE, CHAIN_ID);
    expect(typedData.primaryType).toBe("ExchangeAction");
    expect(typedData.domain.name).toBe("universal");
  });

  // Validates approve-builder typed data field order and 0x02 universal wire conversion.
  it("signs builder fee approval with local and external wallets", async () => {
    const { local, external } = signers();
    const input = { accountId: ACCOUNT_ID, builderId: 202n, maxFeeRate: 10n };

    const [localSigned, externalSigned] = await Promise.all([
      local.signApproveBuilderFee(input, NONCE),
      external.signApproveBuilderFee(input, NONCE),
    ]);

    expect(externalSigned).toEqual(localSigned);
    expect(buildApproveBuilderFeeTypedData(input, NONCE, CHAIN_ID).primaryType).toBe(
      "ApproveBuilderFeeAction",
    );
  });
});
