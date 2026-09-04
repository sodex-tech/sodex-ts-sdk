/**
 * Example: subscribe to oracle coin prices via WebSocket (perps only).
 *
 * Subscribes to `coinPrice` for a specific coin (vBTC) and to `allCoinPrice`
 * for the full set, and prints each push. Coin price + margin ratio are the
 * streaming counterpart of the REST `PerpsClient.getCoins()` endpoint.
 *
 * Run with:
 *   pnpm tsx examples/ws-coin-price.ts
 *
 * Override gateway:
 *   SODEX_GATEWAY=wss://my-gw.example.com pnpm tsx examples/ws-coin-price.ts
 */
import { WebSocket } from "ws";
import { PerpsWsClient } from "@sodex/sdk";

const baseUrl = process.env.SODEX_GATEWAY ?? "wss://mainnet-gw.sodex.dev";

// Perps coin names as reported by GET /markets/coins. Note the exact casing:
// gold is `vXAUt` (lowercase `t`) and SOSO trades as `WSOSO` (no `v` prefix).
const COINS = ["vBTC", "vETH", "vSOL", "vXAUt", "WSOSO"];

async function main() {
  console.log(`Connecting to ${baseUrl} …`);

  // Inject `ws` for Node <22 (no global `WebSocket`). On Node 22+ the global
  // exists and you can omit this; injecting is harmless either way.
  const client = new PerpsWsClient({ baseUrl, WebSocket });

  client.events.on("open", () => console.log("[ws] connected"));
  client.events.on("close", (e) => console.log("[ws] closed", e));
  client.events.on("error", (e) => console.log("[ws] error", e));
  client.events.on("reconnect", (e) => console.log("[ws] reconnect", e));

  await client.connect();

  // --- coinPrice: a fixed set of coins, callback fires once per coin record ---
  let coinCount = 0;
  const unsubCoin = client.subscribeCoinPrice({ coins: COINS }, (c) => {
    coinCount++;
    console.log(
      `[coinPrice #${coinCount}] ${c.coin}  price=${c.price}  ` +
        `marginRatio=${c.marginRatio}  E=${c.eventTime}`,
    );
  });

  // --- allCoinPrice: snapshot carries every coin, updates only the changed ---
  let allCount = 0;
  const unsubAll = client.subscribeAllCoinPrices((prices) => {
    allCount++;
    if (allCount <= 3 || allCount % 10 === 0) {
      console.log(
        `[allCoinPrice #${allCount}] ${prices.length} coins:`,
        prices.map((p) => `${p.coin}=${p.price}`).join(", "),
      );
    }
  });

  setTimeout(() => {
    console.log("\n--- 30s summary ---");
    console.log(`  coinPrice pushes:    ${coinCount}`);
    console.log(`  allCoinPrice pushes: ${allCount}`);
    unsubCoin();
    unsubAll();
    client.close();
  }, 30_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
