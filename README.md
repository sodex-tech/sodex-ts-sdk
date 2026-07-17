# @sodex/sdk

Official TypeScript SDK for the Sodex exchange. Covers the REST API surface
for both the **Spark** (spot) and **Bolt** (perps) engines, with EIP-712
request signing built in.

Runs on Node 18+ and modern browsers. No `Buffer` usage; all crypto via
`@noble/curves` + `@noble/hashes`.

## Install

```bash
pnpm add @sodex/sdk
# or via a git URL during pre-release (CI and local dev)
pnpm add github:sodex-tech/sodex-ts-sdk
```

## Quickstart

```ts
import { SpotClient, SpotSigner } from "@sodex/sdk";

const signer = new SpotSigner({ privateKey: process.env.SODEX_PRIVATE_KEY! });
const client = new SpotClient({
  baseUrl: "https://mainnet-gw.sodex.dev",
  signer,
});

await client.refreshMarkets();

const { orderID, clOrdID } = await client.placeOrder({
  accountId: 1001n,
  symbol: "BTC/USDC",            // or "vBTC_vUSDC"; both resolve
  clOrdId: "my-order-1",
  side: "BUY",
  type: "LIMIT",
  timeInForce: "GTC",
  price: "50000",                // DecimalString on the wire
  quantity: "0.1",
});
```

Perps is the same shape:

```ts
import { PerpsClient, PerpsSigner } from "@sodex/sdk";

const signer = new PerpsSigner({ privateKey: process.env.SODEX_PRIVATE_KEY! });
const perps = new PerpsClient({ baseUrl: "https://mainnet-gw.sodex.dev", signer });
await perps.refreshMarkets();

await perps.placeOrders({
  accountId: 1001n,
  symbol: "BTC-USD",
  orders: [{
    clOrdId: "p-1",
    modifier: "NORMAL",
    side: "BUY",
    type: "MARKET",
    timeInForce: "IOC",
    quantity: "0.001",
    reduceOnly: false,
    positionSide: "BOTH",
  }],
});
```

## Design

- **Semantic API.** Enums are string literal types (`"BUY"`, `"LIMIT"`, `"GTC"`)
  throughout. The integer codes that the server uses are handled internally.
- **Symbol-by-name.** Users pass `"BTC/USDC"` or `"BTC-USD"`; the `SymbolRegistry`
  resolves to `symbolID` during signing. Raw `name` / `symbolId` forms are also
  accepted as escape hatches.
- **`bigint` everywhere for uint64.** `accountId`, `symbolId`, `orderId`, nonces,
  and timestamps are `bigint`. No silent 2^53 rounding.
- **`DecimalString` for decimals.** Prices, quantities, funds, amounts all flow
  as strings end-to-end; you can pass `string | number | bigint` as input.
- **Canonical JSON.** A dedicated serializer emits the exact bytes the server
  re-hashes. Every action builder fixes key order, drops unset `omitempty`
  fields, keeps zero-valued non-omitempty fields, and renders `bigint` as a
  JSON number literal.
- **Cross-engine safety.** Spot and perps use different EIP-712 domain names
  (`"spot"` vs `"futures"`). Signatures are not replayable across engines.

## Subpath exports

```
@sodex/sdk            top-level re-exports of SpotClient / PerpsClient / enums
@sodex/sdk/spot       only the spot module
@sodex/sdk/perps      only the perps module
@sodex/sdk/signer     raw signing primitives (no HTTP)
@sodex/sdk/evm        optional ClobGateway helper (requires peer `viem`)
```

The EVM helper is opt-in: viem is a **peer dependency**, so the core package
adds no viem weight to your bundle unless you import `@sodex/sdk/evm`.

## Supported endpoints

Spot (15): symbols, coins, tickers, mini tickers, book tickers, orderbook,
klines, recent trades, balances, open orders, account state, api keys, fee
rate, order history, user trades; plus signed writes: placeOrder,
placeOrders (batch), cancelOrder, cancelOrders, replaceOrders,
scheduleCancel, transferAsset, addApiKey, revokeApiKey.

Perps (~20): all of the above minus `transferAsset` swap semantics plus mark
prices, positions, position history, funding history; signed writes include
placeOrders, cancelOrders, replaceOrders, modifyOrder, scheduleCancel,
updateLeverage, updateMargin, transferAsset, addApiKey, revokeApiKey.

Gateway: `getServerTime(baseUrl)` — standalone function (the endpoint lives
at the gateway root `/api/v1/time`, outside both clients' path prefixes);
returns server time as epoch-milliseconds `bigint`.

## Using with `sodex-next` (local dev / CI / external)

Three scenarios, one SDK:

| Scenario | Recipe |
|----------|--------|
| Local dev | `cd sodex-next && pnpm link ../sodex-ts-sdk` (no package.json change) |
| sodex-next CI (pre-npm-publish) | `"@sodex/sdk": "github:sodex-tech/sodex-ts-sdk#main"` in sodex-next — `prepare` runs `tsup` after install |
| External users | `"@sodex/sdk": "^0.1.0"` after the first npm publish |

`pnpm dev` in this repo runs tsup in watch mode so your symlinked consumer
always sees fresh `dist/` output.

## Scripts

```bash
pnpm install
pnpm dev          # watch-mode build
pnpm build        # produce dist/ (ESM + CJS + d.ts)
pnpm test         # run the unit + signer test suite
pnpm test:watch   # vitest watch mode
pnpm typecheck    # tsc --noEmit across src + test
pnpm lint         # biome check
pnpm format       # biome format --write
```

To run live smoke tests against mainnet (read-only):

```bash
SODEX_LIVE=1 pnpm test test/integration
```

## Testing focus

- **Canonical JSON** — every action has a golden JSON string pinned in
  `test/signer/golden-vectors.test.ts`. If any builder changes field order or
  `omitempty` semantics, the test flips.
- **Wire format / round-trip / cross-engine / determinism / sensitivity** —
  one test file per property, mirroring the Go SDK test matrix.
- **AddAPIKey** — separate signing path is covered by a dedicated round-trip test.
- **Byte snapshots** — domain separators and representative signatures are
  captured via Vitest snapshots so unintended serialization changes produce a
  reviewable diff.

## License

MIT.
