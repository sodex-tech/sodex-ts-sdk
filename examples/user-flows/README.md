# Sodex end-to-end user flows

These examples connect the public Gateway APIs, ValueChain contracts, signed
Spot/Perps actions, and WebSocket updates into the four user journeys an
integrator normally needs: deposit, withdraw, transfer, and trade.

All Gateway calls use the package's exported `UserClient`; withdrawal ABI,
permit addresses, command encoding, and EVM balance helpers come from
`@sodex/sdk/evm`.

They are executable examples, not mocked snippets. Every script defaults to
mainnet and may submit real transactions when the required private key and
amount variables are present. Test with a small account and testnet settings
before using mainnet.

## Setup

```bash
pnpm install
pnpm typecheck:examples
```

The defaults are:

```bash
export SODEX_GATEWAY=https://mainnet-gw.sodex.dev
export SODEX_VALUECHAIN_RPC=https://mainnet.valuechain.xyz/
export SODEX_CHAIN_ID=286623
```

For testnet, set all three variables to the corresponding testnet values. Do
not mix a testnet Gateway with a mainnet chain ID or RPC.

`SODEX_PRIVATE_KEY` is always the master EVM wallet key. Values may include or
omit the `0x` prefix. Never commit keys to the repository.

## 1. Deposit

[`deposit.ts`](./deposit.ts) performs route discovery first, including the
external token address, minimum amount, custody/bridge availability, and the
matching Spot/Perps coin IDs when the asset is listed in the trading engines.
If transfer config omits `id` and `name`, custody/bridge can still be available,
but the corresponding Spot/Perps asset cannot be resolved safely from that
response alone; the examples report or reject that ambiguous case explicitly.

Custody route:

```bash
export SODEX_PRIVATE_KEY=0x...
export SODEX_COIN=USDC
export SODEX_CHAIN=BASE_ETH
export SODEX_DEPOSIT_ROUTE=custody
pnpm tsx examples/user-flows/deposit.ts
```

The script queries the user's custody address, signs and creates one only when
it is absent, waits through `Processing`, and refuses to use a `Suspicious`
address. After the external transfer, query its status with the source-chain
transaction hash:

```bash
export SODEX_DEPOSIT_TX_HASH=0x...
pnpm tsx examples/user-flows/deposit.ts
```

Bridge route:

```bash
SODEX_DEPOSIT_ROUTE=bridge pnpm tsx examples/user-flows/deposit.ts
```

Bridge deposits and custody deposits are deliberately separate. The script
prints the configured bridge contract for a bridge route; constructing the
source-chain bridge transaction requires that bridge's chain-specific ABI and
wallet and is not currently part of `@sodex/sdk`.

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
wallet. Register one for Spot, Perps, or both:

```bash
export SODEX_PRIVATE_KEY=0x...              # master wallet
export SODEX_API_KEY_PRIVATE_KEY=0x...      # separate trading key
export SODEX_API_KEY_NAME=sdk-example
export SODEX_API_KEY_DESTINATION=both       # spot | perps | both
pnpm tsx examples/user-flows/register-api-key.ts
```

[`trade.ts`](./trade.ts) loads coin metadata, symbol constraints, account
state, balances/positions, and the user's fee rate before it submits an order.
It then prints the returned order ID and listens for order updates and fills on
WebSocket.

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
| Deposit status by transaction hash | `deposit.ts` |
| Spot/Perps -> EVM before withdrawal | `withdraw.ts` |
| Submit and track withdrawal | `withdraw.ts` |
| EVM -> Spot/Perps and Spot <-> Perps | `transfer.ts` |
| SOSO vs WSOSO and activation fee | `transfer.ts` plus notes above |
| Master-wallet or API-key trading | `trade.ts`, `register-api-key.ts` |
| Order ID plus WS order/fill details | `trade.ts` |

The current transfer-config response does not contain expected confirmation
times, an explicit `bridgeDisabled` field, or route-specific minimum amounts.
Bridge availability is therefore determined only by a non-empty
`bridgeAddress`; a non-zero bridge fee alone is not treated as availability.
