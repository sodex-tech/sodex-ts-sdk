/**
 * Internal balance lifecycle: choose one direction -> resolve the trading
 * asset -> sign and submit -> wait before starting a dependent movement.
 *
 * EVM -> Perps is implemented as EVM -> Spot, wait for credit, then Spot ->
 * Perps. Perps -> EVM requires two explicit runs: Perps -> Spot, then Spot ->
 * EVM after the first transfer settles.
 *
 *   SODEX_PRIVATE_KEY=0x... SODEX_TRANSFER=spot-to-perps \
 *   SODEX_AMOUNT=10 pnpm tsx examples/user-flows/transfer.ts
 */
import {
  PerpsClient,
  PerpsSigner,
  SpotClient,
  SpotSigner,
  UserClient,
  waitForSpotBalanceChange,
} from "@sodex/sdk";
import { ClobGateway, ERC20_ABI } from "@sodex/sdk/evm";
import { formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CLOB_GATEWAY_ADDRESS,
  TREASURY_ACCOUNT_ID,
  ZERO_ADDRESS,
  gatewayUrl,
  optionalPrivateKey,
  parseChoice,
  requireEnv,
  valueChainClients,
} from "./config";

const TRANSFERS = [
  "evm-to-spot",
  "evm-to-perps",
  "spot-to-perps",
  "perps-to-spot",
  "spot-to-evm",
] as const;

async function main() {
  const transfer = parseChoice("SODEX_TRANSFER", "spot-to-perps", TRANSFERS);
  const amount = requireEnv("SODEX_AMOUNT");
  const coin = process.env.SODEX_COIN ?? "USDC";
  const masterPrivateKey = optionalPrivateKey("SODEX_PRIVATE_KEY");
  const apiPrivateKey = optionalPrivateKey("SODEX_API_KEY_PRIVATE_KEY");
  const enginePrivateKey = apiPrivateKey ?? masterPrivateKey;
  if (!enginePrivateKey) {
    throw new Error("SODEX_PRIVATE_KEY or SODEX_API_KEY_PRIVATE_KEY is required");
  }
  const apiKeyName = process.env.SODEX_API_KEY_NAME ?? "default";
  if (apiPrivateKey && apiKeyName === "default") {
    throw new Error("SODEX_API_KEY_NAME is required with SODEX_API_KEY_PRIVATE_KEY");
  }
  const userAddress = process.env.SODEX_USER_ADDRESS
    ? (process.env.SODEX_USER_ADDRESS as `0x${string}`)
    : masterPrivateKey
      ? privateKeyToAccount(masterPrivateKey).address
      : undefined;
  if (!userAddress) {
    throw new Error("SODEX_USER_ADDRESS is required when only an API key is configured");
  }

  const gateway = new UserClient({ baseUrl: gatewayUrl });
  const [assets, spot, perps] = await Promise.all([
    gateway.getTransferConfigs(coin),
    Promise.resolve(makeSpotClient(enginePrivateKey, apiKeyName)),
    Promise.resolve(makePerpsClient(enginePrivateKey, apiKeyName)),
  ]);
  const asset = assets.find((candidate) => candidate.coin.toLowerCase() === coin.toLowerCase());
  if (!asset) throw new Error(`unsupported transfer coin: ${coin}`);
  const valueChainAsset = asset.name;
  if (!valueChainAsset) {
    throw new Error(
      `transfer config does not publish the trading-engine mapping for ${asset.coin}`,
    );
  }
  await Promise.all([spot.refreshMarkets(), perps.refreshMarkets()]);

  if (transfer === "evm-to-spot" || transfer === "evm-to-perps") {
    if (!masterPrivateKey) {
      throw new Error("SODEX_PRIVATE_KEY is required for an EVM-originating transfer");
    }
    const previousSpotState = await spot.getAccountState(userAddress);
    const previousSpotBalance = previousSpotState.balances.find(
      (balance) => balance.coin === valueChainAsset,
    )?.total;
    const creditedAmount = await depositFromEvm({
      masterPrivateKey,
      tokenAddress: asset.tokenAddress,
      decimals: Number(asset.decimals),
      valueChainAsset,
      amount,
      accountActivated: previousSpotState.accountId !== 0n,
    });
    const previousRawBalance = previousSpotBalance
      ? parseUnits(previousSpotBalance, Number(asset.decimals))
      : 0n;
    const expectedRawBalance =
      previousRawBalance + parseUnits(creditedAmount, Number(asset.decimals));
    const state = await waitForSpotBalanceChange(
      spot,
      userAddress,
      valueChainAsset,
      previousSpotBalance,
      {
        timeoutMs: Number(process.env.SODEX_WAIT_SECONDS ?? "120") * 1_000,
        requireActiveAccount: true,
        isExpectedBalance(balance) {
          return (
            balance !== undefined &&
            parseUnits(balance, Number(asset.decimals)) >= expectedRawBalance
          );
        },
      },
    );
    console.log("Deposit credited to Spot:", {
      accountId: state.accountId,
      balance: state.balances.find((balance) => balance.coin === valueChainAsset),
    });
    if (transfer === "evm-to-spot") return;

    const receipt = await spot.transferAsset({
      fromAccountId: state.accountId,
      toAccountId: TREASURY_ACCOUNT_ID,
      coin: valueChainAsset,
      amount: creditedAmount,
      kind: "PERPS_WITHDRAW",
    });
    console.log("Spot -> Perps transfer submitted:", receipt);
    return;
  }

  const accountId = await resolveAccountId(spot, userAddress);
  if (transfer === "spot-to-perps") {
    const receipt = await spot.transferAsset({
      fromAccountId: accountId,
      toAccountId: TREASURY_ACCOUNT_ID,
      coin: valueChainAsset,
      amount,
      kind: "PERPS_WITHDRAW",
    });
    console.log("Spot -> Perps transfer submitted:", receipt);
    return;
  }
  if (transfer === "perps-to-spot") {
    const receipt = await perps.transferAsset({
      fromAccountId: accountId,
      toAccountId: TREASURY_ACCOUNT_ID,
      coin: valueChainAsset,
      amount,
      kind: "SPOT_WITHDRAW",
    });
    console.log("Perps -> Spot transfer submitted:", receipt);
    return;
  }

  const receipt = await spot.transferAsset({
    fromAccountId: accountId,
    toAccountId: TREASURY_ACCOUNT_ID,
    coin: valueChainAsset,
    amount,
    kind: "EVM_WITHDRAW",
  });
  console.log("Spot -> ValueChain EVM transfer submitted:", receipt);
}

function makeSpotClient(privateKey: `0x${string}`, apiKeyName: string) {
  return new SpotClient({
    baseUrl: gatewayUrl,
    signer: new SpotSigner({ privateKey }),
    apiKeyName,
  });
}

function makePerpsClient(privateKey: `0x${string}`, apiKeyName: string) {
  return new PerpsClient({
    baseUrl: gatewayUrl,
    signer: new PerpsSigner({ privateKey }),
    apiKeyName,
  });
}

async function resolveAccountId(spot: SpotClient, userAddress: `0x${string}`): Promise<bigint> {
  const configured = process.env.SODEX_ACCOUNT_ID;
  if (configured) return BigInt(configured);
  const accountId = (await spot.getAccountState(userAddress)).accountId;
  if (accountId === 0n) {
    throw new Error("account is not activated; deposit vUSDC from EVM first");
  }
  return accountId;
}

async function depositFromEvm(input: {
  masterPrivateKey: `0x${string}`;
  tokenAddress: `0x${string}`;
  decimals: number;
  valueChainAsset: string;
  amount: string;
  accountActivated: boolean;
}): Promise<string> {
  const { publicClient, walletClient } = valueChainClients(input.masterPrivateKey);
  const rawAmount = parseUnits(input.amount, input.decimals);
  let creditedAmount = rawAmount;

  if (!input.accountActivated) {
    if (input.valueChainAsset !== "vUSDC") {
      throw new Error("the first ValueChain deposit must use vUSDC to activate the account");
    }
    const activationFee = parseUnits("1", input.decimals);
    if (rawAmount <= activationFee) {
      throw new Error("the first deposit must exceed the 1 vUSDC account activation fee");
    }
    creditedAmount -= activationFee;
    console.log("New account: 1 vUSDC will be charged as the activation fee.");
  }

  if (input.tokenAddress.toLowerCase() !== ZERO_ADDRESS) {
    const approveHash = await walletClient.writeContract({
      address: input.tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CLOB_GATEWAY_ADDRESS, rawAmount],
    });
    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
    if (approveReceipt.status !== "success") {
      throw new Error(`ERC20 approval reverted: ${approveHash}`);
    }
    console.log("ERC20 approval confirmed:", approveHash);
  } else {
    console.log("SOSO uses the native token path; no ERC20 approval is required.");
  }

  const clobGateway = new ClobGateway({ walletClient });
  const depositHash = await clobGateway.depositErc20({
    token: input.tokenAddress,
    amount: rawAmount,
    value: input.tokenAddress.toLowerCase() === ZERO_ADDRESS ? rawAmount : undefined,
  });
  const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
  if (depositReceipt.status !== "success") {
    throw new Error(`EVM -> Spot deposit reverted: ${depositHash}`);
  }
  console.log("EVM -> Spot deposit confirmed on ValueChain:", depositHash);
  console.log(
    input.tokenAddress.toLowerCase() === ZERO_ADDRESS
      ? "Native SOSO is represented as WSOSO after it reaches the trading engines."
      : `Deposited ${input.valueChainAsset} to Spot.`,
  );
  return formatUnits(creditedAmount, input.decimals);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
