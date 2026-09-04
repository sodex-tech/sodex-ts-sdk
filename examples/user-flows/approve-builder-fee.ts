/**
 * Builder fee approval: derive the master account -> resolve its primary
 * account ID -> approve one builder's maximum fee rate on Spot and Perps.
 *
 *   SODEX_PRIVATE_KEY=0x... SODEX_BUILDER_ID=9 \
 *   SODEX_BUILDER_FEE_RATE=20 \
 *   pnpm tsx examples/user-flows/approve-builder-fee.ts
 */
import { type ApproveBuilderFeeInput, LocalUserSigner, SpotClient, UserClient } from "@sodex/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { gatewayUrl, requireEnv, requirePrivateKey, sodexChainId } from "./config";

async function main() {
  const masterPrivateKey = requirePrivateKey();
  const masterAccount = privateKeyToAccount(masterPrivateKey);
  const accountId = process.env.SODEX_ACCOUNT_ID
    ? BigInt(process.env.SODEX_ACCOUNT_ID)
    : (await new SpotClient({ baseUrl: gatewayUrl }).getAccountState(masterAccount.address))
        .accountId;
  if (accountId === 0n) throw new Error("Sodex account is not activated");

  const input: ApproveBuilderFeeInput = {
    accountId,
    builderId: BigInt(requireEnv("SODEX_BUILDER_ID")),
    maxFeeRate: BigInt(requireEnv("SODEX_BUILDER_FEE_RATE")),
  };
  const signer = new LocalUserSigner({ privateKey: masterPrivateKey, chainId: sodexChainId });
  const client = new UserClient({ baseUrl: gatewayUrl });

  await client.approveBuilderFeeWithSigner(masterAccount.address, input, signer);
  console.log(
    `Builder ${input.builderId} approved with max fee rate ${input.maxFeeRate} ` +
      `for account ${input.accountId} on Spot and Perps.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
