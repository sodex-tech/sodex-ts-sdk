/**
 * Trade lifecycle: query market/account constraints -> establish account WS
 * subscriptions -> place one signed Spot/Perps order -> correlate the REST
 * order ID and client order ID with asynchronous order/fill pushes.
 *
 * REST acceptance is not proof of a fill.
 *
 *   SODEX_PRIVATE_KEY=0x... SODEX_ORDER_PRICE=50000 \
 *   SODEX_ORDER_QUANTITY=0.001 pnpm tsx examples/user-flows/trade.ts
 */
import {
  PerpsClient,
  PerpsSigner,
  PerpsWsClient,
  SpotClient,
  SpotSigner,
  SpotWsClient,
  UserClient,
} from "@sodex/sdk";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { WebSocket } from "ws";
import { gatewayUrl, optionalPrivateKey, parseChoice, requireEnv, sleep } from "./config";

const MARKETS = ["spot", "perps"] as const;
const ORDER_SIDES = ["BUY", "SELL"] as const;
const ORDER_TYPES = ["LIMIT", "MARKET"] as const;

async function main() {
  const market = parseChoice("SODEX_MARKET", "spot", MARKETS);
  const side = parseChoice("SODEX_ORDER_SIDE", "BUY", ORDER_SIDES);
  const orderType = parseChoice("SODEX_ORDER_TYPE", "LIMIT", ORDER_TYPES);
  const quantity = requireEnv("SODEX_ORDER_QUANTITY");
  const price =
    orderType === "LIMIT" ? requireEnv("SODEX_ORDER_PRICE") : process.env.SODEX_ORDER_PRICE;
  const apiPrivateKey = optionalPrivateKey("SODEX_API_KEY_PRIVATE_KEY");
  const masterPrivateKey = optionalPrivateKey("SODEX_PRIVATE_KEY");
  const signingPrivateKey = apiPrivateKey ?? masterPrivateKey;
  if (!signingPrivateKey) {
    throw new Error("SODEX_PRIVATE_KEY or SODEX_API_KEY_PRIVATE_KEY is required");
  }
  const signingAccount = privateKeyToAccount(signingPrivateKey);
  const userAddress = resolveUserAddress(apiPrivateKey, masterPrivateKey, signingAccount.address);
  const userStatus = await new UserClient({ baseUrl: gatewayUrl }).getUserStatus(userAddress);
  if (userStatus.status !== "Active") {
    throw new Error(`Sodex user is not active: ${userStatus.status}`);
  }
  console.log("Gateway user status:", userStatus);
  const apiKeyName = apiPrivateKey ? requireEnv("SODEX_API_KEY_NAME") : "default";
  const clOrdId = process.env.SODEX_CLIENT_ORDER_ID ?? `sdk-flow-${Date.now()}`;

  if (market === "spot") {
    await tradeSpot({
      signingPrivateKey,
      apiKeyName,
      userAddress,
      clOrdId,
      symbol: process.env.SODEX_SYMBOL ?? "BTC/USDC",
      side,
      orderType,
      price,
      quantity,
    });
  } else {
    await tradePerps({
      signingPrivateKey,
      apiKeyName,
      userAddress,
      clOrdId,
      symbol: process.env.SODEX_SYMBOL ?? "BTC-USD",
      side,
      orderType,
      price,
      quantity,
    });
  }
}

interface TradeInput {
  signingPrivateKey: Hex;
  apiKeyName: string;
  userAddress: Address;
  clOrdId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "LIMIT" | "MARKET";
  price?: string;
  quantity: string;
}

async function tradeSpot(input: TradeInput) {
  const client = new SpotClient({
    baseUrl: gatewayUrl,
    signer: new SpotSigner({ privateKey: input.signingPrivateKey }),
    apiKeyName: input.apiKeyName,
  });

  // Step 1: resolve common market/account constraints before constructing the order.
  await client.refreshMarkets();
  const account = await client.getAccountState(input.userAddress);
  const accountId = configuredAccountId(account.accountId);
  const [coins, symbols, feeRate] = await Promise.all([
    client.getCoins(),
    client.getSymbols(input.symbol),
    client.getFeeRate(input.userAddress, { accountId, symbol: input.symbol }),
  ]);
  console.log("Spot common state:", {
    userAddress: input.userAddress,
    userId: account.userId,
    accountId,
    coinCount: coins.length,
    symbol: symbols[0],
    feeRate,
    balances: account.balances,
  });

  // Step 2: establish the account stream before the REST write.
  const ws = new SpotWsClient({ baseUrl: gatewayUrl, WebSocket });
  await ws.connect();
  let resolveUpdate: () => void = () => {};
  const updateReceived = new Promise<void>((resolve) => {
    resolveUpdate = resolve;
  });
  const subscription = ws.subscribeAccountState(
    { user: input.userAddress, symbols: [symbols[0]?.name ?? input.symbol] },
    () => {},
    {
      onOrderUpdate(update) {
        if (update.clOrdID !== input.clOrdId) return;
        console.log("Spot order update:", update);
        resolveUpdate();
      },
      onTrade(trade) {
        if (trade.clOrdID === input.clOrdId) console.log("Spot fill:", trade);
      },
    },
  );

  try {
    await subscription.ready;

    // Step 3: submit and retain both orderID and clOrdID for correlation.
    const receipt = await client.placeOrder({
      accountId,
      symbol: input.symbol,
      clOrdId: input.clOrdId,
      side: input.side,
      type: input.orderType,
      timeInForce: input.orderType === "MARKET" ? "IOC" : "GTC",
      price: input.price,
      quantity: input.quantity,
    });
    assertOrderAccepted(receipt);
    console.log("Spot order accepted:", receipt);
    console.log("Spot order ID:", receipt.orderID?.toString());
    await Promise.race([updateReceived, sleep(waitMs())]);
  } finally {
    await subscription.unsubscribe();
    ws.close();
  }
}

async function tradePerps(input: TradeInput) {
  const client = new PerpsClient({
    baseUrl: gatewayUrl,
    signer: new PerpsSigner({ privateKey: input.signingPrivateKey }),
    apiKeyName: input.apiKeyName,
  });

  // Step 1: resolve common market/account constraints before constructing the order.
  await client.refreshMarkets();
  const account = await client.getAccountState(input.userAddress);
  const accountId = configuredAccountId(account.accountId);
  const [coins, symbols, feeRate] = await Promise.all([
    client.getCoins(),
    client.getSymbols(input.symbol),
    client.getFeeRate(input.userAddress, { accountId, symbol: input.symbol }),
  ]);
  console.log("Perps common state:", {
    userAddress: input.userAddress,
    userId: account.userId,
    accountId,
    coinCount: coins.length,
    symbol: symbols[0],
    feeRate,
    balances: account.balances,
    positions: account.openPositions,
  });

  // Step 2: establish the account stream before the REST write.
  const ws = new PerpsWsClient({ baseUrl: gatewayUrl, WebSocket });
  await ws.connect();
  let resolveUpdate: () => void = () => {};
  const updateReceived = new Promise<void>((resolve) => {
    resolveUpdate = resolve;
  });
  const subscription = ws.subscribeAccountState(
    { user: input.userAddress, symbols: [symbols[0]?.name ?? input.symbol] },
    () => {},
    {
      onOrderUpdate(update) {
        if (update.clOrdID !== input.clOrdId) return;
        console.log("Perps order update:", update);
        resolveUpdate();
      },
      onTrade(trade) {
        if (trade.clOrdID === input.clOrdId) console.log("Perps fill:", trade);
      },
    },
  );

  try {
    await subscription.ready;

    // Step 3: submit and retain both orderID and clOrdID for correlation.
    const receipt = await client.placeOrder({
      accountId,
      symbol: input.symbol,
      clOrdId: input.clOrdId,
      modifier: "NORMAL",
      side: input.side,
      type: input.orderType,
      timeInForce: input.orderType === "MARKET" ? "IOC" : "GTC",
      price: input.price,
      quantity: input.quantity,
      reduceOnly: process.env.SODEX_REDUCE_ONLY === "true",
      positionSide: "BOTH",
    });
    assertOrderAccepted(receipt);
    console.log("Perps order accepted:", receipt);
    console.log("Perps order ID:", receipt.orderID?.toString());
    await Promise.race([updateReceived, sleep(waitMs())]);
  } finally {
    await subscription.unsubscribe();
    ws.close();
  }
}

function resolveUserAddress(
  apiPrivateKey: Hex | undefined,
  masterPrivateKey: Hex | undefined,
  signingAddress: Address,
): Address {
  const configured = process.env.SODEX_USER_ADDRESS as Address | undefined;
  if (configured) return configured;
  if (apiPrivateKey) {
    if (!masterPrivateKey) {
      throw new Error("SODEX_USER_ADDRESS is required when trading with only an API key");
    }
    return privateKeyToAccount(masterPrivateKey).address;
  }
  return signingAddress;
}

function configuredAccountId(discovered: bigint): bigint {
  const accountId = process.env.SODEX_ACCOUNT_ID
    ? BigInt(process.env.SODEX_ACCOUNT_ID)
    : discovered;
  if (accountId === 0n) throw new Error("Sodex account is not activated");
  return accountId;
}

function assertOrderAccepted(receipt: { code: number; orderID?: bigint; error?: string }) {
  if (receipt.code !== 0 || receipt.orderID === undefined) {
    throw new Error(receipt.error ?? `order rejected with code ${receipt.code}`);
  }
}

function waitMs(): number {
  return Number(process.env.SODEX_WAIT_SECONDS ?? "30") * 1_000;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
