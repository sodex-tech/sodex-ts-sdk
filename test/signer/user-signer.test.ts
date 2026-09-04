import { keccak_256 } from "@noble/hashes/sha3";
import { describe, expect, it } from "vitest";
import { type AddUserApiKeyInput, LocalUserSigner } from "../../src";
import { hashActionPayload } from "../../src/common/action-payload";
import { concatBytes, hexToBytes, uint256BE, utf8 } from "../../src/common/bytes";
import {
  UNIVERSAL_DOMAIN_NAME,
  eip712Digest,
  exchangeActionStructHash,
  makeDomain,
} from "../../src/common/eip712";
import { addressFromPrivateKey, recoverAddress } from "../../src/common/signer";

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

  // Validates unified revoke signs the canonical revokeAPIKey action in the universal domain.
  it("signs API-key revocation for both engines", async () => {
    const signer = new LocalUserSigner({ privateKey: PRIVATE_KEY, chainId: CHAIN_ID });
    const input = { accountId: ACCOUNT_ID, name: "sdk-test" };
    const signed = await signer.signRevokeApiKey(input, NONCE);
    const payloadHash = hashActionPayload({
      type: "revokeAPIKey",
      params: { accountID: input.accountId, name: input.name },
    });
    const digest = eip712Digest(
      makeDomain(UNIVERSAL_DOMAIN_NAME, CHAIN_ID),
      exchangeActionStructHash(payloadHash, NONCE),
    );

    expect(signed.signature).toMatch(/^0x02[0-9a-f]{130}$/);
    expect(recoverAddress(digest, hexToBytes(signed.signature))).toBe(
      addressFromPrivateKey(PRIVATE_KEY),
    );
  });

  // Validates builder approval signs the dedicated action fields in Gateway's exact universal EIP-712 order.
  it("signs builder fee approval for both engines", async () => {
    const signer = new LocalUserSigner({ privateKey: PRIVATE_KEY, chainId: CHAIN_ID });
    const input = { accountId: ACCOUNT_ID, builderId: 202n, maxFeeRate: 10n };
    const signed = await signer.signApproveBuilderFee(input, NONCE);
    const structHash = keccak_256(
      concatBytes(
        keccak_256(
          utf8(
            "ApproveBuilderFeeAction(uint64 chainID,uint64 nonce,uint64 accountID,uint64 builderID,uint64 maxFeeRate)",
          ),
        ),
        uint256BE(CHAIN_ID),
        uint256BE(NONCE),
        uint256BE(input.accountId),
        uint256BE(input.builderId),
        uint256BE(input.maxFeeRate),
      ),
    );
    const digest = eip712Digest(makeDomain(UNIVERSAL_DOMAIN_NAME, CHAIN_ID), structHash);

    expect(signed.signature).toMatch(/^0x02[0-9a-f]{130}$/);
    expect(recoverAddress(digest, hexToBytes(signed.signature))).toBe(
      addressFromPrivateKey(PRIVATE_KEY),
    );
  });

  // Validates every dedicated builder approval integer rejects negative and overflowing uint64 values before signing.
  it.each([
    [
      "chainId",
      { chainId: -1n },
      { accountId: ACCOUNT_ID, builderId: 202n, maxFeeRate: 10n },
      NONCE,
    ],
    ["nonce", {}, { accountId: ACCOUNT_ID, builderId: 202n, maxFeeRate: 10n }, -1n],
    ["accountId", {}, { accountId: -1n, builderId: 202n, maxFeeRate: 10n }, NONCE],
    ["builderId", {}, { accountId: ACCOUNT_ID, builderId: 1n << 64n, maxFeeRate: 10n }, NONCE],
    ["maxFeeRate", {}, { accountId: ACCOUNT_ID, builderId: 202n, maxFeeRate: -1n }, NONCE],
  ])("rejects an invalid %s", async (field, signerOverrides, input, nonce) => {
    const signer = new LocalUserSigner({
      privateKey: PRIVATE_KEY,
      chainId: CHAIN_ID,
      ...signerOverrides,
    });

    await expect(signer.signApproveBuilderFee(input, nonce)).rejects.toThrow(
      `${field} must be a uint64`,
    );
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
