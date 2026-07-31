/**
 * Demonstrates `pushIntervalMs` — server-side throttling — on the
 * `allMiniTicker` channel for both spot and perps. Three throttle levels
 * (default / 1000ms / 3000ms) per market, one WS connection each.
 *
 * Why one connection per throttle level?
 * The gateway scopes `pushInterval` per channel on a single connection —
 * one channel can carry only one effective `pushInterval`, regardless of
 * symbol filter. To compare three throttle levels we therefore open three
 * separate connections.
 *
 * `pushIntervalMs` for ticker family (`ticker` / `allTicker` / `miniTicker`
 * / `allMiniTicker` / `markPrice` / `allMarkPrice`) accepts `1000 | 3000`.
 * See `TickerPushIntervalMs`, `CandlePushIntervalMs`, `BookPushIntervalMs`
 * for the per-channel literal-union types.
 *
 * Run with:
 *   pnpm tsx examples/ws-push-interval.ts
 *   SODEX_GATEWAY=wss://my-gw.example.com pnpm tsx examples/ws-push-interval.ts
 */
import { WebSocket } from "ws";
import { PerpsWsClient, SpotWsClient, type TickerPushIntervalMs } from "@sodex/sdk";

const baseUrl = process.env.SODEX_GATEWAY ?? "wss://mainnet-gw.sodex.dev";

const LEVELS: { name: string; pushIntervalMs?: TickerPushIntervalMs }[] = [
  { name: "default" },
  { name: "1000ms", pushIntervalMs: 1000 },
  { name: "3000ms", pushIntervalMs: 3000 },
];

interface Bucket {
  close: () => void;
  count: number;
}

async function main() {
  console.log(`Connecting to ${baseUrl}\n`);

  const spotBuckets = await Promise.all(LEVELS.map((lvl) => openSpot(lvl)));
  const perpsBuckets = await Promise.all(LEVELS.map((lvl) => openPerps(lvl)));

  const fmt = (buckets: Bucket[]) =>
    LEVELS.map((l, i) => `${l.name}=${buckets[i]!.count}`).join("  ");

  const tick = setInterval(() => {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] spot   ${fmt(spotBuckets)}`);
    console.log(`[${ts}] perps  ${fmt(perpsBuckets)}`);
  }, 5_000);

  setTimeout(() => {
    clearInterval(tick);
    console.log("\n--- 30s totals ---");
    console.log(`  spot   ${fmt(spotBuckets)}`);
    console.log(`  perps  ${fmt(perpsBuckets)}`);
    for (const b of [...spotBuckets, ...perpsBuckets]) b.close();
  }, 30_000);
}

async function openSpot(lvl: {
  name: string;
  pushIntervalMs?: TickerPushIntervalMs;
}): Promise<Bucket> {
  const client = new SpotWsClient({ baseUrl, WebSocket });
  client.events.on("error", (e) => console.log(`[spot ${lvl.name}] error`, e.error));
  await client.connect();
  const bucket = { count: 0 } as Bucket;
  const unsub = client.subscribeAllMiniTickers(
    () => {
      bucket.count++;
    },
    lvl.pushIntervalMs === undefined ? undefined : { pushIntervalMs: lvl.pushIntervalMs },
  );
  bucket.close = () => {
    unsub();
    client.close();
  };
  return bucket;
}

async function openPerps(lvl: {
  name: string;
  pushIntervalMs?: TickerPushIntervalMs;
}): Promise<Bucket> {
  const client = new PerpsWsClient({ baseUrl, WebSocket });
  client.events.on("error", (e) => console.log(`[perps ${lvl.name}] error`, e.error));
  await client.connect();
  const bucket = { count: 0 } as Bucket;
  const unsub = client.subscribeAllMiniTickers(
    () => {
      bucket.count++;
    },
    lvl.pushIntervalMs === undefined ? undefined : { pushIntervalMs: lvl.pushIntervalMs },
  );
  bucket.close = () => {
    unsub();
    client.close();
  };
  return bucket;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
