# SoDEX end-to-end user-flow examples

## Overview

These examples connect Gateway, ValueChain, the Spot/Perps engines, and account
WebSockets into the four flows an integrating project normally needs:

| Flow | Runnable example | What it proves |
| --- | --- | --- |
| Deposit | [`deposit.ts`](./deposit.ts) | Discover a route, get/create a custody address or select a bridge, submit an EVM custody transfer, and track the source-chain hash |
| Transfer | [`transfer.ts`](./transfer.ts) | Move balances between ValueChain EVM, Spot, and Perps |
| Withdraw | [`withdraw.ts`](./withdraw.ts) | Move funds to EVM when needed, submit a signed withdrawal permit, and wait for an external terminal status |
| API key | [`register-api-key.ts`](./register-api-key.ts) | Register one key that can sign both Spot and Perps actions |
| Trade | [`trade.ts`](./trade.ts) | Read market/account constraints, place an order, return its order ID, and receive order/fill updates over WebSocket |

The files are executable package-consumer examples, not mocked snippets. They
import the published `@sodex/sdk` entrypoints and ship in the npm package.

## How the flows work

From a user's perspective, deposits, internal transfers, withdrawals, and
orders are asynchronous. An accepted transaction or REST request is the start
of a lifecycle, not proof that the final balance movement or fill has finished.

### Deposit

1. **Discover** — query supported tokens/chains, route availability, token
   addresses, decimals, and minimums.
2. **Resolve a destination** — custody uses a user-specific deposit address;
   bridge uses the configured bridge contract.
3. **Submit on the source chain** — transfer the supported token through the
   selected route and save the source-chain transaction hash.
4. **Wait for Gateway indexing** — query the deposit by chain and source-chain
   hash. A source-chain receipt proves only that the source transaction
   succeeded; the Gateway record proves SoDEX has observed it.

### Transfer

1. **ValueChain EVM -> Spot** — approve ERC-20 when required, call
   `ClobGateway.depositERC20`, then wait for the Spot balance to change.
2. **Spot <-> Perps** — submit a signed engine transfer using the user's
   account ID and the SDK's named transfer kind.
3. **Spot -> ValueChain EVM** — submit `EVM_WITHDRAW`; Perps must first move to
   Spot because there is no direct Perps -> EVM route.

### Withdraw

1. **Discover and validate** — select custody or bridge, then check route
   availability, minimum amount, and fee.
2. **Prepare funds** — move Perps -> Spot -> EVM or Spot -> EVM when needed,
   waiting for each dependent balance change.
3. **Authorize** — read the keyed permit nonce, ABI-encode `WithdrawToken`, and
   sign the contract-provided permit hash.
4. **Submit** — Gateway sponsors the ValueChain transaction and returns a
   transaction hash.
5. **Wait for external completion** — poll by transaction hash or withdrawal
   ID until Gateway reports a terminal record. Submission is not completion.

### Trade

1. **Resolve common state** — load coin/symbol metadata, user/account IDs,
   balances or positions, fee rate, and order constraints.
2. **Start account subscriptions** — wait for the WebSocket subscription
   acknowledgement before placing the order.
3. **Sign and submit** — use either the master wallet or a registered API-key
   wallet.
4. **Correlate** — save the REST `orderID` and client order ID; use account
   order/fill pushes for the asynchronous execution details.

### One-liners

- Deposit: discover route -> send on source chain -> wait for Gateway indexing.
- Transfer: submit one balance movement -> wait before starting a dependent step.
- Withdraw: move to EVM -> sign and submit -> wait for external settlement.
- Trade: subscribe -> sign and place -> correlate order ID with WS updates/fills.

## Shared setup

```bash
pnpm install
pnpm typecheck:examples
```

From another project:

```bash
npm install @sodex/sdk viem ws
npm install --save-dev tsx typescript @types/node @types/ws
npx tsc -p node_modules/@sodex/sdk/examples/user-flows/tsconfig.json
```

The examples default to SoDEX mainnet:

```bash
export SODEX_GATEWAY=https://mainnet-gw.sodex.dev
export SODEX_VALUECHAIN_RPC=https://mainnet.valuechain.xyz/
export SODEX_CHAIN_ID=286623
```

Do not mix a testnet Gateway with a mainnet ValueChain RPC or chain ID.
`SODEX_PRIVATE_KEY` is the master EVM wallet key and may include or omit `0x`.
Never commit keys. Start with read-only discovery, then use a staging account
and small amounts before allowing real writes.

## Examples

### 1. Deposit into SoDEX

**User flow:** discover supported route -> get/create custody address or select
bridge -> send token -> query the source-chain transaction hash.

Custody and bridge are separate routes:

- **Custody** sends to the user-specific address returned by Gateway. Address
  creation can be asynchronous (`Processing` -> `Enabled`). Never send to a
  `Suspicious` address.
- **Bridge** sends through `bridgeAddress`. Because each bridge/chain has its
  own transaction shape, the example requires an explicit `DepositAdapter`
  instead of guessing a contract call.

Read-only route and address discovery:

```bash
export SODEX_USER_ADDRESS=0x...
export SODEX_COIN=USDC
export SODEX_CHAIN=BASE_ETH
export SODEX_DEPOSIT_ROUTE=custody
pnpm tsx examples/user-flows/deposit.ts
```

If no custody address exists, the script creates one and uses the SDK's
`waitForDepositAddress` helper until it becomes usable. Deposit-address APIs
are currently mainnet-only. Partner integrations may set
`SODEX_PARTNER_API_KEY` for partner-quota address creation.

Submit an EVM custody transfer:

```bash
export SODEX_PRIVATE_KEY=0x...
export SODEX_SOURCE_RPC=https://mainnet.base.org
export SODEX_SOURCE_CHAIN_ID=8453
export SODEX_AMOUNT=5
export SODEX_SEND_DEPOSIT=1
pnpm tsx examples/user-flows/deposit.ts
```

`SODEX_SEND_DEPOSIT=1` is an explicit broadcast guard. Set
`SODEX_SOURCE_NATIVE=true` only when the configured route accepts the source
chain's native asset; otherwise the example performs an ERC-20 transfer.

Resume tracking later without signing:

```bash
export SODEX_CHAIN=BASE_ETH
export SODEX_DEPOSIT_TX_HASH=0x...
pnpm tsx examples/user-flows/deposit.ts
```

For a bridge or non-EVM source chain, set `SODEX_DEPOSIT_ADAPTER` to a module
exporting `depositAdapter` (or a default export) that implements
`DepositAdapter`. `buildDeposit()` returns a transaction with `submit()`, so an
integrator can simulate it or request wallet confirmation before broadcast.

**Success means:** the source receipt confirms the external transaction; a
non-empty `getDepositStatus` result confirms Gateway has indexed it. Inspect
the returned record's status before treating the trading balance as available.

### 2. Transfer between ValueChain, Spot, and Perps

**User flow:** choose one direction -> validate the asset mapping -> sign and
submit -> wait before running a dependent movement.

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

Important constraints:

- EVM deposits land in Spot. `evm-to-perps` therefore executes EVM -> Spot,
  waits for the Spot credit, then submits Spot -> Perps.
- The first account deposit must use `vUSDC`; the protocol currently charges a
  1 vUSDC activation fee.
- ERC-20 deposits require `approve` before `depositERC20`.
- Native SOSO uses the zero token address and `msg.value`; after deposit it is
  represented as `WSOSO` in the trading engines.
- Perps cannot move directly to EVM.

A registered API-key wallet can sign engine transfers:

```bash
export SODEX_USER_ADDRESS=0x...             # master wallet
export SODEX_API_KEY_NAME=sdk-example
export SODEX_API_KEY_PRIVATE_KEY=0x...
```

The master key is still required for an EVM-originating transfer.

**Success means:** an engine transfer receipt proves acceptance. A later step
must wait for the corresponding destination balance; the combined
`evm-to-perps` path already waits at its dependency boundary.

### 3. Withdraw from SoDEX

**User flow:** discover route -> move funds to ValueChain EVM -> sign permit ->
submit -> poll by hash/ID until external completion.

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

The script uses `waitForSpotBalanceChange`, `waitForEvmBalanceIncrease`, and
`waitForWithdrawal` rather than fixed sleeps. Configure the maximum wait with
`SODEX_WAIT_SECONDS`.

Resume a previous withdrawal without a private key:

```bash
SODEX_CHAIN=BASE_ETH SODEX_WITHDRAW_TX_HASH=0x... \
  pnpm tsx examples/user-flows/withdraw.ts
```

`SODEX_WITHDRAW_ID` can be used instead of the transaction hash.

**Success means:** Gateway submission returns a ValueChain transaction hash,
but funds are not final until the status record reaches a terminal state such
as `Success`/`Succeeded`, `Failed`, `Rejected`, or `Cancelled`.

### 4. Register an API key

**User flow:** derive the master account -> resolve its account ID -> register
a separate signing wallet -> store that private key securely -> use it for
Spot/Perps actions.

```bash
export SODEX_PRIVATE_KEY=0x...              # master wallet
export SODEX_API_KEY_PRIVATE_KEY=0x...      # separate trading key
export SODEX_API_KEY_NAME=sdk-example
pnpm tsx examples/user-flows/register-api-key.ts
```

`SODEX_BUILDER_ID` plus `SODEX_BUILDER_FEE_RATE` registers a builder-bound
key. `SODEX_API_KEY_PERMISSIONS` registers a permissioned key. These modes are
mutually exclusive.

The example uses `LocalUserSigner` and never exposes the master key outside the
local signing process.

**Success means:** registration completed for both Spot and Perps. The example
never prints or persists private key material.

### 5. Place a Spot or Perps order

**User flow:** query common state -> subscribe to account events -> place one
signed order -> save `orderID` -> receive order/fill details.

Master-wallet signing:

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
export SODEX_USER_ADDRESS=0x...             # master wallet
export SODEX_API_KEY_NAME=sdk-example
export SODEX_API_KEY_PRIVATE_KEY=0x...
pnpm tsx examples/user-flows/trade.ts
```

The example prints symbol metadata before submitting. Price and quantity must
satisfy `tickSize`, `stepSize`, quantity bounds, notional bounds, and price
limits. It awaits `subscription.ready` before the REST write and awaits
`unsubscribe()` during shutdown, so a fast execution cannot race an
unacknowledged subscription.

**Success means:** the REST receipt has `code === 0` and an `orderID`.
Acceptance does not imply a fill; `accountOrderUpdate` and `accountTrade` are
the execution source of truth.

## Coverage and known boundaries

| Requirement | Coverage |
| --- | --- |
| Supported deposit/withdraw tokens and chains | `getTransferConfigs` / `getTransferRoute` in deposit and withdrawal examples |
| Custody vs bridge | Selected and validated independently |
| Query/create custody address | Deposit example plus partner-quota creation |
| Deposit status by source-chain hash | Deposit example and `waitForDeposit` |
| Spot/Perps -> EVM before withdrawal | Withdrawal example |
| Submit and resume withdrawal tracking | Withdrawal example and `waitForWithdrawal` |
| EVM -> Spot/Perps and Spot <-> Perps | Transfer example |
| Master wallet or API key trading | API-key and trade examples |
| Order ID plus WS order/fill details | Trade example |

Gateway transfer config currently does not publish expected confirmation
times, an explicit `bridgeDisabled` flag, or route-specific minimums. Bridge
availability is therefore derived from a non-empty `bridgeAddress`; examples
do not invent timing or contract behavior that Gateway does not expose.

## Opt-in staging E2E

The default test suite never moves funds. Real staging reads require
`SODEX_STAGING_E2E=1`. Writes additionally require
`SODEX_STAGING_ALLOW_WRITES=I_UNDERSTAND` and an explicit comma-separated
`SODEX_STAGING_FLOWS` list such as `deposit,transfer`. Every selected flow must
still provide its normal key, amount, route, and receiver variables.
