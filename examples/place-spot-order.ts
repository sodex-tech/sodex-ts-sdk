/**
 * Signed spot order example. Requires SODEX_PRIVATE_KEY in the environment;
 * uses the test account id from SODEX_ACCOUNT_ID (defaults to 1001).
 *
 *   SODEX_PRIVATE_KEY=0x… SODEX_ACCOUNT_ID=1001 pnpm tsx examples/place-spot-order.ts
 *
 * Design trade-offs on this example (intentional simplifications):
 *
 *   1. It uses the master wallet's key directly — in production you'd use an
 *      API-key wallet signed in via `ClobGateway.addAPIKey`, but using the
 *      master key keeps the example free of the two-step bootstrap.
 *   2. Nonce defaults to monotonic ms — fine for a single-process demo, not
 *      safe to share across processes without external coordination.
 *   3. clOrdId is timestamped to avoid collisions on repeat runs.
 */
import { SpotClient, SpotSigner } from "@sodex/sdk";

async function main() {
  const pk = requireEnv("SODEX_PRIVATE_KEY");
  const accountId = BigInt(process.env.SODEX_ACCOUNT_ID ?? "1001");

  const signer = new SpotSigner({ privateKey: pk });
  const client = new SpotClient({
    baseUrl: "https://mainnet-gw.sodex.dev",
    signer,
  });

  await client.refreshMarkets();

  const receipt = await client.placeOrder({
    accountId,
    symbol: "BTC/USDC",
    clOrdId: `demo-${Date.now()}`,
    side: "BUY",
    type: "LIMIT",
    timeInForce: "GTC",
    price: "100", // intentionally far from the book so it sits
    quantity: "0.00001",
  });

  console.log("order placed:", receipt);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
