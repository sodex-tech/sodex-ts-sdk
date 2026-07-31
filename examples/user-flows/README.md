# Sodex end-to-end user flows

These examples connect the public Gateway APIs, ValueChain contracts, signed
Spot/Perps actions, and WebSocket updates into the four user journeys an
integrator normally needs: deposit, withdraw, transfer, and trade.

All Gateway calls use the package's exported `UserClient`; withdrawal ABI,
permit addresses, command encoding, and EVM balance helpers come from
`@sodex/sdk/evm`.

They are executable package-consumer examples, not mocked snippets: imports
use `@sodex/sdk` and the whole `examples/` directory is included in the npm
tarball. Scripts default to mainnet. A deposit is broadcast only with
`SODEX_SEND_DEPOSIT=1`; use small amounts and a staging account first.

## Setup

```bash
pnpm install
pnpm typecheck:examples
```

From a consumer project, install the SDK plus the example runtimes, copy the
published `examples/` directory if you want to edit it, and run with `tsx`:

```bash
npm install @sodex/sdk viem ws
npm install --save-dev tsx typescript @types/node @types/ws
npx tsc -p node_modules/@sodex/sdk/examples/user-flows/tsconfig.json
```

The defaults are:

```bash
export SODEX_GATEWAY=https://mainnet-gw.sodex.dev
export SODEX_VALUECHAIN_RPC=https://mainnet.valuechain.xyz/
export SODEX_CHAIN_ID=286623
```

Do not mix a testnet Gateway with a mainnet chain ID or RPC. Gateway main
currently registers custody deposit-address creation only in non-testnet
deployments, so `getDepositAddress`, `createDepositAddress`, and batch/partner
address creation are mainnet-only even though trading and ValueChain examples
can be pointed at testnet.

`SODEX_PRIVATE_KEY` is always the master EVM wallet key. Values may include or
omit the `0x` prefix. Never commit keys to the repository.

## 1. Deposit

[`deposit.ts`](./deposit.ts) performs route discovery first, including the
external token address, minimum amount, custody/bridge availability, and the
matching Spot/Perps coin IDs when the asset is listed in the trading engines.
If transfer config omits `id` and `name`, custody/bridge can still be available,
but the corresponding Spot/Perps asset cannot be resolved safely from that
response alone; the examples report or reject that ambiguous case explicitly.

Custody discovery/address creation (creating an address now requires only the
user address and `chain`; it is not an EIP-712 operation):

```bash
export SODEX_PRIVATE_KEY=0x...
export SODEX_COIN=USDC
export SODEX_CHAIN=BASE_ETH
export SODEX_DEPOSIT_ROUTE=custody
pnpm tsx examples/user-flows/deposit.ts
```

`SODEX_USER_ADDRESS=0x...` can replace the private key for discovery. The
script queries the custody address, creates one only when absent, waits through
`Processing`, and refuses a `Suspicious` address. Partner integrations can set
`SODEX_PARTNER_API_KEY` to use `/api/v2`; the SDK also exposes
`createDepositAddresses` and `createPartnerDepositAddresses` for all-chain
batch creation. The waiting behavior comes from the exported
`waitForDepositAddress` helper, so applications can use the same timeout,
`AbortSignal`, and `onUpdate` lifecycle without copying this script's control
flow.

For an EVM source chain, the built-in path sends native value or calls ERC20
`transfer` directly to the custody address:

```bash
export SODEX_SOURCE_RPC=https://mainnet.base.org
export SODEX_SOURCE_CHAIN_ID=8453
export SODEX_SOURCE_PRIVATE_KEY=0x...       # defaults to SODEX_PRIVATE_KEY
export SODEX_AMOUNT=5
export SODEX_SEND_DEPOSIT=1                 # explicit broadcast authorization
pnpm tsx examples/user-flows/deposit.ts
```

Set `SODEX_SOURCE_NATIVE=true` for a native-token transfer. After the external
transfer, query its status with the source-chain transaction hash:

```bash
export SODEX_DEPOSIT_TX_HASH=0x...
pnpm tsx examples/user-flows/deposit.ts
```

Bridge route:

```bash
SODEX_DEPOSIT_ROUTE=bridge pnpm tsx examples/user-flows/deposit.ts
```

Bridge deposits and custody deposits remain separate. A bridge integration
sets `SODEX_DEPOSIT_ADAPTER` to a module exporting `depositAdapter` (or a
default adapter) implementing `DepositAdapter`. Its `buildDeposit()` returns a
transaction with `submit()`, allowing the project to inspect/simulate or ask
for wallet confirmation before broadcast. The same adapter boundary also
supports non-EVM custody chains without hard-coding their wallet SDKs here.

Gateway does not currently publish an expected confirmation time, so the
example does not invent one.

## 2. Transfer between ValueChain, Spot, and Perps

[`transfer.ts`](./transfer.ts) executes one explicit direction per run:

```bash
export SODEX_PRIVATE_KEY=0x...
export SODEX_COIN=USDC
export SODEX_AMOUNT=10

SODEX_TRANSFER=evm-to-spot pnpm tsx examples/user-flows/transfer.ts
SODEX_TRANSFER=evm-to-perps pnpm tsx examples/user-flows/transfer.ts
SODEX_TRANSFER=spot-to-perps pnpm tsx examples/user-flows/transfer.ts
SODEX_TRANSFER=perps-to-spot pnpm tsx examples/user-flows/transfer.ts
SODEX_TRANSFER=spot-to-evm pnpm tsx examples/user-flows/transfer.ts
```

Important behavior reflected in the code:

- EVM deposits land in Spot. EVM -> Perps is therefore EVM -> Spot followed by
  a signed Spot -> Perps transfer.
- The first account deposit must be vUSDC. The current protocol charges 1
  vUSDC as the activation fee.
- ERC20 deposits call `approve` before `ClobGateway.depositERC20`.
- Native SOSO uses `token = 0x0000...0000` and `msg.value`, so it needs no
  ERC20 approval. The trading-engine asset is named `WSOSO` after deposit.
- Perps cannot transfer directly to EVM. External withdrawals from Perps must
  go Perps -> Spot -> EVM.
- All engine transfer calls use treasury account ID `999` and the SDK's named
  transfer kinds, so callers do not need to work with numeric wire enums.

For a registered API-key wallet, add these variables. `SODEX_USER_ADDRESS` is
required when the master key is omitted; the master key is only required for
an EVM-originating transfer:

```bash
export SODEX_API_KEY_NAME=sdk-example
export SODEX_API_KEY_PRIVATE_KEY=0x...
export SODEX_USER_ADDRESS=0x...
```

## 3. Withdraw

[`withdraw.ts`](./withdraw.ts) covers the full external withdrawal path:

1. Load and validate the token/chain route, minimum, route availability, and fee.
2. If the source is Perps, move Perps -> Spot -> EVM; if it is Spot, move Spot -> EVM.
3. Read the keyed permit nonce from ValueChain.
4. ABI-encode `WithdrawToken` and sign the contract-provided permit hash.
5. Submit the gas-sponsored transaction to Gateway.
6. Poll the withdrawal status until a terminal record appears or the timeout expires.

Step 6 uses the SDK's `waitForWithdrawal`; deposit indexing and Spot balance
settlement similarly use `waitForDeposit` and `waitForSpotBalanceChange`.

```bash
export SODEX_PRIVATE_KEY=0x...
export SODEX_COIN=USDC
export SODEX_CHAIN=BASE_ETH
export SODEX_AMOUNT=10
export SODEX_WITHDRAW_RECEIVER=0x...
export SODEX_WITHDRAW_SOURCE=evm       # evm | spot | perps
export SODEX_WITHDRAW_ROUTE=custody    # custody | bridge
pnpm tsx examples/user-flows/withdraw.ts
```

The Gateway submission hash is not final completion. Save it and query again
at any time without a private key:

```bash
SODEX_CHAIN=BASE_ETH SODEX_WITHDRAW_TX_HASH=0x... \
  pnpm tsx examples/user-flows/withdraw.ts
```

`SODEX_WITHDRAW_ID` can be used instead of `SODEX_WITHDRAW_TX_HASH`.

## 4. API key and trade

Trading can use the master wallet directly or a separately registered API-key
wallet. The unified endpoint registers one key for both Spot and Perps:

```bash
export SODEX_PRIVATE_KEY=0x...              # master wallet
export SODEX_API_KEY_PRIVATE_KEY=0x...      # separate trading key
export SODEX_API_KEY_NAME=sdk-example
pnpm tsx examples/user-flows/register-api-key.ts
```

Optional `SODEX_BUILDER_ID`/`SODEX_BUILDER_FEE_RATE` create a builder-bound
key; `SODEX_API_KEY_PERMISSIONS` creates a permissioned key. These two modes
are mutually exclusive. `LocalUserSigner` covers a held private key, while
browser/custody wallets use `TypedDataUserSigner`:

```ts
const signer = new TypedDataUserSigner({
  address: walletAddress,
  chainId: 286623n,
  signTypedData: (typedData) => walletClient.signTypedData(typedData),
});
await userClient.addApiKeyWithSigner(walletAddress, input, signer);
await userClient.revokeApiKeyWithSigner(walletAddress, { accountId, name }, signer);
await userClient.approveBuilderFeeWithSigner(walletAddress, approval, signer);
```

The typed-data builders are also exported for projects that own their signing
transport. All unified signatures use the `universal` domain, include
`X-API-Chain`, and are converted to Sodex's `0x02 || r || s || recovery` wire
format by the signer classes.

[`trade.ts`](./trade.ts) loads coin metadata, symbol constraints, account
state, balances/positions, and the user's fee rate before it submits an order.
It then prints the returned order ID and listens for order updates and fills on
WebSocket. The script awaits `subscription.ready` before placing the order and
awaits `subscription.unsubscribe()` during shutdown, so a fast execution
cannot race ahead of an unacknowledged subscription.

Master wallet signing:

```bash
export SODEX_PRIVATE_KEY=0x...
export SODEX_MARKET=spot                    # spot | perps
export SODEX_SYMBOL=BTC/USDC                # use BTC-USD for perps
export SODEX_ORDER_SIDE=BUY
export SODEX_ORDER_TYPE=LIMIT               # LIMIT | MARKET
export SODEX_ORDER_PRICE=50000              # required for LIMIT
export SODEX_ORDER_QUANTITY=0.001
pnpm tsx examples/user-flows/trade.ts
```

API-key signing:

```bash
export SODEX_USER_ADDRESS=0x...             # master wallet address
export SODEX_API_KEY_NAME=sdk-example
export SODEX_API_KEY_PRIVATE_KEY=0x...
pnpm tsx examples/user-flows/trade.ts
```

The chosen price and quantity must satisfy the symbol metadata printed by the
script (`tickSize`, quantity bounds, notional bounds, and price limits). A
successful REST receipt contains `orderID`; execution details arrive
asynchronously through `accountOrderUpdate` and `accountTrade`.

## Coverage and current boundaries

| User requirement | Example coverage |
| --- | --- |
| Supported deposit/withdraw coins and chains | `deposit.ts`, `withdraw.ts` call `/api/v1/asset/config` |
| Custody vs bridge route | Selected and validated explicitly in both scripts |
| Query/create custody address | `deposit.ts` |
| Batch/partner deposit address creation | `UserClient` v1 batch and partner v2 methods |
| Execute custody transfer / plug in bridge | EVM helper plus `DepositAdapter` |
| Deposit status by transaction hash | `deposit.ts` |
| Spot/Perps -> EVM before withdrawal | `withdraw.ts` |
| Submit and track withdrawal | `withdraw.ts` |
| EVM -> Spot/Perps and Spot <-> Perps | `transfer.ts` |
| SOSO vs WSOSO and activation fee | `transfer.ts` plus notes above |
| Master-wallet or API-key trading | `trade.ts`, `register-api-key.ts` |
| Order ID plus WS order/fill details | `trade.ts` |

## Staging E2E

The default test suite never moves funds. Real staging reads are enabled with
`SODEX_STAGING_E2E=1`. Known deposit/withdraw hashes can be supplied to verify
indexing. Real writes require both
`SODEX_STAGING_ALLOW_WRITES=I_UNDERSTAND` and a comma-separated explicit list,
for example `SODEX_STAGING_FLOWS=deposit,transfer`. Each selected flow still
requires all normal key, amount, route, and receiver variables.

The current transfer-config response does not contain expected confirmation
times, an explicit `bridgeDisabled` field, or route-specific minimum amounts.
Bridge availability is therefore determined only by a non-empty
`bridgeAddress`; a non-zero bridge fee alone is not treated as availability.
