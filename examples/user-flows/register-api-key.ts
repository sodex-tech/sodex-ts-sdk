/**
 * Register an API-key wallet on ValueChain for Spot, Perps, or both engines.
 *
 *   SODEX_PRIVATE_KEY=0x... SODEX_API_KEY_PRIVATE_KEY=0x... \
 *   pnpm tsx examples/user-flows/register-api-key.ts
 */
import { privateKeyToAccount } from "viem/accounts";
import { ClobGateway, type Destination } from "../../src/evm";
import { parseChoice, requirePrivateKey, valueChainClients } from "./config";

async function main() {
  const masterPrivateKey = requirePrivateKey();
  const apiKeyPrivateKey = requirePrivateKey("SODEX_API_KEY_PRIVATE_KEY");
  const apiKeyAccount = privateKeyToAccount(apiKeyPrivateKey);
  const apiKeyName = process.env.SODEX_API_KEY_NAME ?? "sdk-example";
  const selected = parseChoice("SODEX_API_KEY_DESTINATION", "both", ["spot", "perps", "both"]);
  const destinations: Destination[] = selected === "both" ? ["spot", "perps"] : [selected];
  const { account, publicClient, walletClient } = valueChainClients(masterPrivateKey);
  const gateway = new ClobGateway({ walletClient });

  console.log(`Registering ${apiKeyAccount.address} for master wallet ${account.address}`);
  for (const destination of destinations) {
    const hash = await gateway.addApiKey({
      destination,
      name: apiKeyName,
      pubkey: apiKeyAccount.address,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`${destination} API key registered:`, hash);
  }
  console.log(`Use SODEX_API_KEY_NAME=${apiKeyName} with SODEX_API_KEY_PRIVATE_KEY to trade.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
