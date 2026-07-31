/**
 * Discover and execute a custody/bridge deposit, then query its source-chain
 * transaction hash until Gateway sees it.
 *
 * Discovery only:
 *   SODEX_USER_ADDRESS=0x... pnpm tsx examples/user-flows/deposit.ts
 * Execute EVM custody transfer:
 *   SODEX_PRIVATE_KEY=0x... SODEX_SOURCE_RPC=https://... \
 *   SODEX_SOURCE_CHAIN_ID=8453 SODEX_AMOUNT=5 SODEX_SEND_DEPOSIT=1 \
 *   pnpm tsx examples/user-flows/deposit.ts
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type DepositAdapter,
  type DepositBuildInput,
  PerpsClient,
  SpotClient,
  UserClient,
  type UserDepositAddress,
  WaitTimeoutError,
  waitForDeposit,
  waitForDepositAddress,
} from "@sodex/sdk";
import { ZERO_ADDRESS, sendEvmCustodyDeposit } from "@sodex/sdk/evm";
import { type Address, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  gatewayUrl,
  optionalPrivateKey,
  parseChoice,
  requireEnv,
  sourceChainClients,
} from "./config";

const ADDRESS_STATUSES = ["Enabled", "Processing", "Suspicious"] as const;

async function main() {
  const coin = process.env.SODEX_COIN ?? "USDC";
  const chain = process.env.SODEX_CHAIN ?? "BASE_ETH";
  const routeType = parseChoice("SODEX_DEPOSIT_ROUTE", "custody", ["custody", "bridge"]);
  const gateway = new UserClient({ baseUrl: gatewayUrl });
  const { asset, route } = await gateway.getTransferRoute(coin, chain);
  const [spotCoins, perpsCoins] = await Promise.all([
    new SpotClient({ baseUrl: gatewayUrl }).getCoins(),
    new PerpsClient({ baseUrl: gatewayUrl }).getCoins(),
  ]);

  console.log("Selected deposit route:", {
    coin: asset.coin,
    valueChainAsset: asset.name,
    valueChainTradingMetadataAvailable: asset.id !== undefined && asset.name !== undefined,
    valueChainToken: asset.tokenAddress,
    decimals: asset.decimals,
    externalChain: route.chain,
    externalToken: route.coinAddress,
    minDepositAmount: route.minDepositAmount,
    custodyAvailable: !route.custodyDisabled,
    bridgeAvailable: route.bridgeAddress !== "",
    bridgeAddress: route.bridgeAddress || undefined,
    spotCoinId: asset.name
      ? spotCoins.find((candidate) => candidate.name === asset.name)?.id
      : undefined,
    perpsCoinId: asset.name
      ? perpsCoins.find((candidate) => candidate.name === asset.name)?.id
      : undefined,
  });

  const existingTxHash = process.env.SODEX_DEPOSIT_TX_HASH;
  if (existingTxHash) {
    await printDepositStatus(gateway, route.chain, existingTxHash);
    return;
  }

  const userAddress = resolveUserAddress();
  let userDepositAddress: UserDepositAddress | undefined;
  let destination: string;
  if (routeType === "custody") {
    if (route.custodyDisabled) {
      throw new Error(`custody deposit is disabled for ${asset.coin}/${route.chain}`);
    }
    userDepositAddress = await ensureCustodyAddress(gateway, userAddress, route.chain);
    destination = userDepositAddress.address;
    console.log("Custody deposit address:", userDepositAddress);
  } else {
    if (!route.bridgeAddress) {
      throw new Error(`bridge deposit is unavailable for ${asset.coin}/${route.chain}`);
    }
    destination = route.bridgeAddress;
    console.log("Bridge contract:", destination);
  }

  const amount = process.env.SODEX_AMOUNT;
  if (!amount) {
    console.log("Set SODEX_AMOUNT and SODEX_SEND_DEPOSIT=1 to submit the source-chain transfer.");
    return;
  }
  if (process.env.SODEX_SEND_DEPOSIT !== "1") {
    throw new Error("set SODEX_SEND_DEPOSIT=1 to authorize broadcasting the deposit transaction");
  }

  const rawAmount = parseUnits(amount, Number(asset.decimals));
  const minimum = parseUnits(route.minDepositAmount || "0", Number(asset.decimals));
  if (rawAmount < minimum) {
    throw new Error(`amount is below the ${route.minDepositAmount} ${asset.coin} minimum`);
  }
  const buildInput: DepositBuildInput = {
    asset,
    route,
    routeType,
    amount,
    rawAmount,
    destination,
    userDepositAddress,
  };
  const txHash = process.env.SODEX_DEPOSIT_ADAPTER
    ? await submitWithAdapter(buildInput)
    : await submitBuiltInEvmCustody(buildInput);
  console.log("Source-chain deposit submitted:", txHash);
  await printDepositStatus(gateway, route.chain, txHash, true);
}

async function ensureCustodyAddress(
  gateway: UserClient,
  userAddress: Address,
  chain: string,
): Promise<UserDepositAddress> {
  let address = await gateway.getDepositAddress(userAddress, chain);
  if (!address.address && !address.status) {
    const partnerApiKey = process.env.SODEX_PARTNER_API_KEY;
    address = partnerApiKey
      ? await gateway.createPartnerDepositAddress(userAddress, { chain }, partnerApiKey)
      : await gateway.createDepositAddress(userAddress, { chain });
  }
  if (address.status === "Processing") {
    address = await waitForDepositAddress(gateway, userAddress, chain, {
      timeoutMs: waitTimeoutMs(),
    });
  }
  if (address.status === "Suspicious") {
    throw new Error("custody deposit address is Suspicious and must not be used");
  }
  if (
    address.status &&
    !ADDRESS_STATUSES.includes(address.status as (typeof ADDRESS_STATUSES)[number])
  ) {
    console.warn(`Gateway returned an unknown deposit address status: ${address.status}`);
  }
  if (address.status !== "Enabled" || !address.address) {
    throw new Error(`custody address is not ready: ${JSON.stringify(address)}`);
  }
  return address;
}

async function submitBuiltInEvmCustody(input: DepositBuildInput): Promise<string> {
  if (input.routeType !== "custody") {
    throw new Error(
      "bridge execution requires SODEX_DEPOSIT_ADAPTER; see DepositAdapter in @sodex/sdk/user",
    );
  }
  const sourcePrivateKey =
    optionalPrivateKey("SODEX_SOURCE_PRIVATE_KEY") ?? optionalPrivateKey("SODEX_PRIVATE_KEY");
  if (!sourcePrivateKey) {
    throw new Error("SODEX_SOURCE_PRIVATE_KEY or SODEX_PRIVATE_KEY is required");
  }
  const tokenAddress =
    process.env.SODEX_SOURCE_NATIVE === "true"
      ? ZERO_ADDRESS
      : asAddress(input.route.coinAddress, "transfer config coinAddress");
  const depositAddress = asAddress(input.destination, "custody deposit address");
  const { publicClient, walletClient } = sourceChainClients(sourcePrivateKey);
  const txHash = await sendEvmCustodyDeposit({
    walletClient,
    depositAddress,
    tokenAddress,
    amount: input.rawAmount,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`source-chain transaction reverted: ${txHash}`);
  return txHash;
}

async function submitWithAdapter(input: DepositBuildInput): Promise<string> {
  const specifier = requireEnv("SODEX_DEPOSIT_ADAPTER");
  const moduleSpecifier =
    specifier.startsWith(".") || specifier.startsWith("/")
      ? pathToFileURL(resolve(specifier)).href
      : specifier;
  const loaded = await import(moduleSpecifier);
  const adapter = (loaded.depositAdapter ?? loaded.default) as DepositAdapter | undefined;
  if (!adapter || typeof adapter.buildDeposit !== "function") {
    throw new Error(
      "deposit adapter must export default or named depositAdapter with buildDeposit()",
    );
  }
  const transaction = await adapter.buildDeposit(input);
  const submission = await transaction.submit();
  return submission.txHash;
}

async function printDepositStatus(
  gateway: UserClient,
  chain: string,
  txHash: string,
  poll = false,
): Promise<void> {
  if (!poll) {
    const status = await gateway.getDepositStatus(chain, txHash);
    console.log(`Deposit status matches: ${status.total}`, status.records);
    return;
  }
  try {
    const status = await waitForDeposit(gateway, chain, txHash, {
      timeoutMs: waitTimeoutMs(),
      intervalMs: 5_000,
    });
    console.log(`Deposit status matches: ${status.total}`, status.records);
  } catch (error) {
    if (!(error instanceof WaitTimeoutError)) throw error;
    console.log(`Deposit is not indexed yet. Re-run with SODEX_DEPOSIT_TX_HASH=${txHash}`);
  }
}

function waitTimeoutMs(): number {
  return Number(process.env.SODEX_WAIT_SECONDS ?? "120") * 1_000;
}

function resolveUserAddress(): Address {
  const configured = process.env.SODEX_USER_ADDRESS;
  if (configured) return asAddress(configured, "SODEX_USER_ADDRESS");
  const privateKey = optionalPrivateKey("SODEX_PRIVATE_KEY");
  if (!privateKey) throw new Error("SODEX_USER_ADDRESS or SODEX_PRIVATE_KEY is required");
  return privateKeyToAccount(privateKey).address;
}

function asAddress(value: string, name: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be an EVM address`);
  return value as Address;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
