/**
 * Minimal read-only example. Run with:
 *   pnpm tsx examples/query-markets.ts
 */
import { PerpsClient, SpotClient } from "@sodex/sdk";

async function main() {
  const spot = new SpotClient({ baseUrl: "https://mainnet-gw.sodex.dev" });
  const perps = new PerpsClient({ baseUrl: "https://mainnet-gw.sodex.dev" });

  const [spotSymbols, perpsSymbols] = await Promise.all([spot.getSymbols(), perps.getSymbols()]);

  console.log("Spot symbols:");
  for (const s of spotSymbols.slice(0, 5)) {
    console.log(`  ${s.displayName.padEnd(12)} id=${s.id}  name=${s.name}  status=${s.status}`);
  }

  console.log("\nPerps symbols:");
  for (const s of perpsSymbols.slice(0, 5)) {
    console.log(`  ${s.displayName.padEnd(12)} id=${s.id}  maxLeverage=${s.maxLeverage}`);
  }

  if (spotSymbols[0]) {
    const book = await spot.getOrderBook(spotSymbols[0].displayName, 5);
    console.log(`\nTop of book for ${spotSymbols[0].displayName}:`);
    console.log("  bids:", book.bids.slice(0, 3));
    console.log("  asks:", book.asks.slice(0, 3));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
