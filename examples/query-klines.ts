/**
 * Fetch recent 1h klines for spot BTC/USDC and perps BTC-USD.
 * Run with:
 *   pnpm tsx examples/query-klines.ts
 */
import { PerpsClient, SpotClient } from "../src";

function fmtTime(ms: bigint): string {
  return new Date(Number(ms)).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

async function main() {
  const baseUrl = process.env.SODEX_GATEWAY ?? "https://mainnet-gw.sodex.dev";
  const spot = new SpotClient({ baseUrl });
  const perps = new PerpsClient({ baseUrl });

  // Resolve "BTC/USDC" → wire name via the spot symbol registry.
  await spot.refreshMarkets();

  const [spotKlines, perpsKlines] = await Promise.all([
    spot.getKlines("BTC/USDC", { interval: "1h", limit: 5 }),
    perps.getKlines("BTC-USD", { interval: "1h", limit: 5 }),
  ]);

  console.log("Spot BTC/USDC — 1h klines (last 5):");
  for (const k of spotKlines) {
    console.log(
      `  ${fmtTime(k.openTime)}  O=${k.openPx}  H=${k.highPx}  L=${k.lowPx}  C=${k.closePx}  V=${k.volume}  Q=${k.quoteVolume}  n=${k.tradeCount}`,
    );
  }

  console.log("\nPerps BTC-USD — 1h klines (last 5):");
  for (const k of perpsKlines) {
    console.log(
      `  ${fmtTime(k.openTime)}  O=${k.openPx}  H=${k.highPx}  L=${k.lowPx}  C=${k.closePx}  V=${k.volume}  Q=${k.quoteVolume}  n=${k.tradeCount}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
