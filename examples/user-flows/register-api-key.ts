/**
 * API-key lifecycle: derive the master account -> resolve account ID ->
 * register or revoke one signer for both Spot and Perps. This example never
 * prints private key material.
 *
 *   SODEX_PRIVATE_KEY=0x... SODEX_API_KEY_PRIVATE_KEY=0x... \
 *   pnpm tsx examples/user-flows/register-api-key.ts
 */
import { type AddUserApiKeyInput, LocalUserSigner, SpotClient, UserClient } from "@sodex/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { gatewayUrl, parseChoice, requirePrivateKey, sodexChainId } from "./config";

const ACTIONS = ["register", "revoke"] as const;

async function main() {
  const masterPrivateKey = requirePrivateKey();
  const masterAccount = privateKeyToAccount(masterPrivateKey);
  const action = parseChoice("SODEX_API_KEY_ACTION", "register", ACTIONS);
  const accountId = process.env.SODEX_ACCOUNT_ID
    ? BigInt(process.env.SODEX_ACCOUNT_ID)
    : (await new SpotClient({ baseUrl: gatewayUrl }).getAccountState(masterAccount.address))
        .accountId;
  if (accountId === 0n) throw new Error("Sodex account is not activated");

  const name = process.env.SODEX_API_KEY_NAME ?? "sdk-example";
  const signer = new LocalUserSigner({ privateKey: masterPrivateKey, chainId: sodexChainId });
  const client = new UserClient({ baseUrl: gatewayUrl });
  if (action === "revoke") {
    await client.revokeApiKeyWithSigner(masterAccount.address, { accountId, name }, signer);
    console.log(`Unified Spot/Perps API key ${name} revoked.`);
    return;
  }

  const apiKeyAccount = privateKeyToAccount(requirePrivateKey("SODEX_API_KEY_PRIVATE_KEY"));
  const input: AddUserApiKeyInput = {
    accountId,
    name,
    type: "EVM",
    publicKey: apiKeyAccount.address,
    expiresAt: BigInt(process.env.SODEX_API_KEY_EXPIRES_AT ?? "0"),
    builder: process.env.SODEX_BUILDER_ID
      ? {
          builderId: BigInt(process.env.SODEX_BUILDER_ID),
          feeRate: BigInt(process.env.SODEX_BUILDER_FEE_RATE ?? "0"),
        }
      : undefined,
    permissions: process.env.SODEX_API_KEY_PERMISSIONS
      ? BigInt(process.env.SODEX_API_KEY_PERMISSIONS)
      : undefined,
  };
  await client.addApiKeyWithSigner(masterAccount.address, input, signer);
  console.log(`Unified Spot/Perps API key ${input.name} registered:`, apiKeyAccount.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
