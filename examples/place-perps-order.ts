/**
 * Signed perps order example. See `place-spot-order.ts` for the same trade-off
 * notes — this example intentionally uses the master key and a monotonic
 * timestamp nonce so it stays single-file and reproducible.
 */
import { PerpsClient, PerpsSigner } from "@sodex/sdk";

async function main() {
  const pk = requireEnv("SODEX_PRIVATE_KEY");
  const accountId = BigInt(process.env.SODEX_ACCOUNT_ID ?? "1001");

  const signer = new PerpsSigner({ privateKey: pk });
  const client = new PerpsClient({
    baseUrl: "https://mainnet-gw.sodex.dev",
    signer,
  });

  await client.refreshMarkets();

  const [receipt] = await client.placeOrders({
    accountId,
    symbol: "BTC-USD",
    orders: [
      {
        clOrdId: `demo-${Date.now()}`,
        modifier: "NORMAL",
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GTC",
        price: "100",
        quantity: "0.001",
        reduceOnly: false,
        positionSide: "BOTH",
      },
    ],
  });

  console.log("perps order placed:", receipt);
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
