/**
 * Spot TWAP example: place a TWAP order, list active TWAPs, and stream
 * live TWAP progress over WebSocket. Requires SODEX_PRIVATE_KEY.
 *
 *   SODEX_PRIVATE_KEY=0x… SODEX_ACCOUNT_ID=1001 pnpm tsx examples/twap.ts
 *
 * TWAP inputs are just three knobs — total quantity, duration (minutes),
 * and whether to randomize slices. The engine executes the slicing; the SDK
 * only submits, queries, and observes. Historical (finished) TWAPs are NOT
 * served here (gateway keeps only active ones) — see the trading-market-api
 * path for history.
 */
import { SpotClient, SpotSigner, SpotWsClient } from "@sodex/sdk";

async function main() {
  const pk = requireEnv("SODEX_PRIVATE_KEY");
  const accountId = BigInt(process.env.SODEX_ACCOUNT_ID ?? "1001");
  const userAddress = requireEnv("SODEX_USER_ADDRESS");

  const client = new SpotClient({
    baseUrl: "https://mainnet-gw.sodex.dev",
    signer: new SpotSigner({ privateKey: pk }),
  });
  await client.refreshMarkets();

  // Place a TWAP: buy 0.5 vBTC over 10 minutes, no slice randomization.
  const receipt = await client.placeTwapOrder({
    accountId,
    symbol: "vBTC_vUSDC",
    side: "BUY",
    quantity: "0.5",
    minutes: 10,
    randomize: false,
  });
  console.log("TWAP placed, orderId:", receipt.orderId);

  // List currently active TWAPs (Memory-backed; finished ones drop off).
  const { twaps, blockHeight } = await client.getTwapOrders(userAddress, { symbol: "vBTC_vUSDC" });
  console.log(`active TWAPs @ block ${blockHeight}:`, twaps.length);

  // Stream live progress: onTwapUpdate fires on each block that mutates a TWAP.
  const ws = new SpotWsClient({ baseUrl: "wss://mainnet-gw.sodex.dev" });
  await ws.connect();
  const unsub = ws.subscribeAccountState({ user: userAddress }, () => {}, {
    onTwapUpdate: (updated) => {
      for (const t of updated) {
        console.log(
          `TWAP ${t.orderId}: executed ${t.executedQty}/${t.quantity}, active=${t.active}`,
        );
      }
    },
  });

  // Cancel after 30s for demo purposes.
  setTimeout(() => {
    void client.cancelTwapOrder({ accountId, symbol: "vBTC_vUSDC", orderId: receipt.orderId });
    unsub();
    ws.close();
  }, 30_000);
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
