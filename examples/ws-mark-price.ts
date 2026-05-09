/**
 * Debug example: subscribe to BTC-USD mark price & ticker via WebSocket.
 *
 * Subscribes to both `markPrice` and `ticker` for BTC-USD so we can compare
 * whether the issue is channel-specific or connection-wide.
 *
 * Run with:
 *   pnpm tsx examples/ws-mark-price.ts
 *
 * Override gateway:
 *   SODEX_GATEWAY=wss://my-gw.example.com pnpm tsx examples/ws-mark-price.ts
 */
import { WebSocket } from "ws";
import { PerpsWsClient } from "../src";

const baseUrl = process.env.SODEX_GATEWAY ?? "wss://mainnet-gw.sodex.dev";

async function main() {
  console.log(`Connecting to ${baseUrl} …`);

  // Inject `ws` for Node <22 (no global `WebSocket`). On Node 22+ the global
  // exists and you can omit this; injecting is harmless either way.
  const client = new PerpsWsClient({ baseUrl, WebSocket });

  // --- lifecycle logging ---
  client.events.on("open", () => console.log("[ws] connected"));
  client.events.on("close", (e) => console.log("[ws] closed", e));
  client.events.on("error", (e) => console.log("[ws] error", e));
  client.events.on("reconnect", (e) => console.log("[ws] reconnect", e));

  await client.connect();

  // --- markPrice (the channel under test) ---
  let markCount = 0;
  const unsubMark = client.subscribeMarkPrice({ symbols: ["BTC-USD"] }, (price) => {
    markCount++;
    console.log(
      `[markPrice #${markCount}] symbol=${price.symbol}  mark=${price.markPrice}  ` +
        `index=${price.indexPrice}  funding=${price.fundingRate}  oi=${price.openInterest}`,
    );
  });

  // --- allMarkPrice (for comparison) ---
  let allMarkCount = 0;
  const unsubAllMark = client.subscribeAllMarkPrices((prices) => {
    allMarkCount++;
    console.log(
      `[allMarkPrice #${allMarkCount}] ${prices.length} symbols:`,
      prices.map((p) => `${p.symbol}=${p.markPrice}`).join(", "),
    );
  });

  // --- ticker (control group — should push frequently) ---
  let tickerCount = 0;
  const unsubTicker = client.subscribeTicker({ symbols: ["BTC-USD"] }, (t) => {
    tickerCount++;
    if (tickerCount <= 3 || tickerCount % 10 === 0) {
      console.log(
        `[ticker #${tickerCount}] symbol=${t.symbol}  last=${t.lastPx}  bid=${t.bidPx}  ask=${t.askPx}`,
      );
    }
  });

  // --- summary & teardown after 30s ---
  setTimeout(() => {
    console.log("\n--- 30s summary ---");
    console.log(`  ticker pushes:       ${tickerCount}`);
    console.log(`  markPrice pushes:    ${markCount}`);
    console.log(`  allMarkPrice pushes: ${allMarkCount}`);
    unsubMark();
    unsubAllMark();
    unsubTicker();
    client.close();
  }, 30_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
