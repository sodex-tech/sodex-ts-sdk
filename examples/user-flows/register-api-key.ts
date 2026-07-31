/**
 * Register one unified API-key wallet for both Spot and Perps.
 *
 *   SODEX_PRIVATE_KEY=0x... SODEX_API_KEY_PRIVATE_KEY=0x... \
 *   pnpm tsx examples/user-flows/register-api-key.ts
 */
import { type AddUserApiKeyInput, LocalUserSigner, SpotClient, UserClient } from "@sodex/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { gatewayUrl, requirePrivateKey, sodexChainId } from "./config";

async function main() {
  const masterPrivateKey = requirePrivateKey();
  const masterAccount = privateKeyToAccount(masterPrivateKey);
  const apiKeyAccount = privateKeyToAccount(requirePrivateKey("SODEX_API_KEY_PRIVATE_KEY"));
  const accountId = process.env.SODEX_ACCOUNT_ID
    ? BigInt(process.env.SODEX_ACCOUNT_ID)
    : (await new SpotClient({ baseUrl: gatewayUrl }).getAccountState(masterAccount.address))
        .accountId;
  if (accountId === 0n) throw new Error("Sodex account is not activated");

  const input: AddUserApiKeyInput = {
    accountId,
    name: process.env.SODEX_API_KEY_NAME ?? "sdk-example",
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
  const signer = new LocalUserSigner({ privateKey: masterPrivateKey, chainId: sodexChainId });
  const client = new UserClient({ baseUrl: gatewayUrl });
  await client.addApiKeyWithSigner(masterAccount.address, input, signer);
  console.log(`Unified Spot/Perps API key ${input.name} registered:`, apiKeyAccount.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
