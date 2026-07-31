/**
 * Smoke-test `getRecentTrades` against mainnet.
 * Run with: pnpm tsx examples/query-trades.ts
 */
import { PerpsClient, SpotClient } from "@sodex/sdk";

function fmtTime(ms: bigint): string {
  return new Date(Number(ms)).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

async function main() {
  const baseUrl = process.env.SODEX_GATEWAY ?? "https://mainnet-gw.sodex.dev";
  const spot = new SpotClient({ baseUrl });
  const perps = new PerpsClient({ baseUrl });

  await spot.refreshMarkets();

  const [spotTrades, perpsTrades] = await Promise.all([
    spot.getRecentTrades("BTC/USDC", 3),
    perps.getRecentTrades("BTC-USD", 3),
  ]);

  console.log("Spot BTC/USDC — last 3 trades:");
  for (const t of spotTrades) {
    console.log(
      `  ${fmtTime(t.time)}  ${t.side.padEnd(4)}  ${t.symbol}  id=${t.id}  ${t.quantity} @ ${t.price}  bi=${t.buyerAccountId ?? "-"}  si=${t.sellerAccountId ?? "-"}`,
    );
  }

  console.log("\nPerps BTC-USD — last 3 trades:");
  for (const t of perpsTrades) {
    console.log(
      `  ${fmtTime(t.time)}  ${t.side.padEnd(4)}  ${t.symbol}  id=${t.id}  ${t.quantity} @ ${t.price}  bi=${t.buyerAccountId ?? "-"}  si=${t.sellerAccountId ?? "-"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
