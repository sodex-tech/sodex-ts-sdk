/**
 * Raw WebSocket debug script — bypasses the SDK to log exact wire messages.
 *
 * Use this to verify:
 *   1. Whether the subscribe message format is accepted
 *   2. Whether the server pushes markPrice data at all
 *   3. What the raw message shape looks like
 *
 * Run with:
 *   pnpm tsx examples/ws-mark-price-raw.ts
 *
 * Override gateway:
 *   SODEX_GATEWAY=wss://my-gw.example.com pnpm tsx examples/ws-mark-price-raw.ts
 */

// Use `ws` so this script runs on Node 18/20 (no global `WebSocket`);
// on Node 22+ the global would also work. Importing `ws` keeps both paths.
import { WebSocket } from "ws";

const baseUrl = process.env.SODEX_GATEWAY ?? "wss://mainnet-gw.sodex.dev";
const url = `${baseUrl.replace(/\/$/, "")}/ws/perps`;

console.log(`Connecting to ${url} …\n`);

const ws = new WebSocket(url);
const t0 = Date.now();
const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;

ws.onopen = () => {
  console.log(`${ts()} CONNECTED\n`);

  // 1. Subscribe to markPrice for BTC-USD
  const sub1 = { op: "subscribe", id: 1, params: { channel: "markPrice", symbols: ["BTC-USD"] } };
  console.log(`${ts()} >>> ${JSON.stringify(sub1)}`);
  ws.send(JSON.stringify(sub1));

  // 2. Subscribe to allMarkPrice (no filter)
  const sub2 = { op: "subscribe", id: 2, params: { channel: "allMarkPrice" } };
  console.log(`${ts()} >>> ${JSON.stringify(sub2)}`);
  ws.send(JSON.stringify(sub2));

  // 3. Subscribe to ticker as a control group
  const sub3 = { op: "subscribe", id: 3, params: { channel: "ticker", symbols: ["BTC-USD"] } };
  console.log(`${ts()} >>> ${JSON.stringify(sub3)}`);
  ws.send(JSON.stringify(sub3));

  console.log("");
};

const counts: Record<string, number> = {};
let total = 0;

ws.onmessage = (e) => {
  total++;
  const text = typeof e.data === "string" ? e.data : String(e.data);

  // Parse to identify channel
  try {
    const msg = JSON.parse(text);
    const ch = msg.channel ?? msg.op ?? "unknown";
    counts[ch] = (counts[ch] ?? 0) + 1;

    // Always log subscribe/unsubscribe responses and first few data pushes
    if (msg.op === "subscribe" || msg.op === "unsubscribe") {
      console.log(`${ts()} <<< [${ch}] ${text}`);
    } else if (ch === "markPrice" || ch === "allMarkPrice") {
      // Always log mark price (the channel under test)
      console.log(`${ts()} <<< [${ch} #${counts[ch]}] ${text.slice(0, 400)}`);
    } else if (counts[ch]! <= 3) {
      // Log first 3 messages per channel
      console.log(`${ts()} <<< [${ch} #${counts[ch]}] ${text.slice(0, 300)}`);
    } else if (counts[ch]! % 20 === 0) {
      // Then log every 20th
      console.log(`${ts()} <<< [${ch} #${counts[ch]}] ${text.slice(0, 200)} …`);
    }
  } catch {
    console.log(`${ts()} <<< (unparseable) ${text.slice(0, 200)}`);
  }
};

ws.onerror = (e) => {
  console.log(`${ts()} ERR:`, (e as { message?: string; type?: string }).message ?? e.type);
};

ws.onclose = (e) => {
  console.log(`\n${ts()} CLOSED code=${e.code} reason=${e.reason}`);
  printSummary();
  process.exit(e.code === 1000 ? 0 : 1);
};

// Run for 30 seconds
setTimeout(() => {
  printSummary();
  ws.close(1000, "done");
}, 30_000);

function printSummary() {
  console.log(`\n--- summary (${total} messages total) ---`);
  for (const [ch, n] of Object.entries(counts).sort()) {
    console.log(`  ${ch.padEnd(20)} ${n}`);
  }
  const markN = (counts["markPrice"] ?? 0) + (counts["allMarkPrice"] ?? 0);
  if (markN === 0) {
    console.log("\n  ⚠ No markPrice pushes received. Possible causes:");
    console.log("    - Server may not push markPrice on this endpoint");
    console.log("    - Channel name may differ from what the SDK sends");
    console.log("    - Subscribe may have failed (check subscribe response above)");
  }
}
