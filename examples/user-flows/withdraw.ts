/**
 * Move funds to ValueChain when needed, sign a WithdrawToken permit, submit
 * the gas-sponsored withdrawal, and poll its external-chain status.
 *
 *   SODEX_PRIVATE_KEY=0x... SODEX_WITHDRAW_RECEIVER=0x... \
 *   SODEX_AMOUNT=10 pnpm tsx examples/user-flows/withdraw.ts
 */
import { parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PerpsClient, PerpsSigner, SpotClient, SpotSigner, UserClient } from "../../src";
import {
  CALL_FOR_PERMIT_ABI,
  CALL_FOR_PERMIT_ADDRESS,
  WITHDRAW_TOKEN_TARGET,
  encodeWithdrawCommand,
  getEvmBalance,
  waitForEvmBalanceIncrease,
} from "../../src/evm";
import {
  TREASURY_ACCOUNT_ID,
  gatewayUrl,
  optionalPrivateKey,
  parseChoice,
  requireEnv,
  requirePrivateKey,
  sleep,
  valueChainClients,
} from "./config";

const SOURCES = ["evm", "spot", "perps"] as const;
const ROUTES = ["custody", "bridge"] as const;

async function main() {
  const coin = process.env.SODEX_COIN ?? "USDC";
  const chain = process.env.SODEX_CHAIN ?? "BASE_ETH";
  const gateway = new UserClient({ baseUrl: gatewayUrl });

  const existingTxHash = process.env.SODEX_WITHDRAW_TX_HASH;
  const existingWithdrawId = process.env.SODEX_WITHDRAW_ID;
  if (existingTxHash || existingWithdrawId) {
    const status = await gateway.getWithdrawStatus(chain, {
      txHash: existingTxHash,
      withdrawId: existingWithdrawId,
    });
    console.log(`Withdrawal status matches: ${status.total}`, status.records);
    return;
  }

  const amount = requireEnv("SODEX_AMOUNT");
  const receiver = requireEnv("SODEX_WITHDRAW_RECEIVER");
  const source = parseChoice("SODEX_WITHDRAW_SOURCE", "evm", SOURCES);
  const withdrawalRoute = parseChoice("SODEX_WITHDRAW_ROUTE", "custody", ROUTES);
  const masterPrivateKey = requirePrivateKey();
  const masterAccount = privateKeyToAccount(masterPrivateKey);
  const enginePrivateKey = optionalPrivateKey("SODEX_API_KEY_PRIVATE_KEY") ?? masterPrivateKey;
  const apiKeyName = process.env.SODEX_API_KEY_NAME ?? "default";
  if (process.env.SODEX_API_KEY_PRIVATE_KEY && apiKeyName === "default") {
    throw new Error("SODEX_API_KEY_NAME is required with SODEX_API_KEY_PRIVATE_KEY");
  }

  const { asset, route } = await gateway.getTransferRoute(coin, chain);
  const valueChainAsset = asset.name;
  const rawAmount = parseUnits(amount, Number(asset.decimals));
  const rawMinimum = parseUnits(route.minWithdrawAmount || "0", Number(asset.decimals));
  if (rawAmount < rawMinimum) {
    throw new Error(`amount is below the ${route.minWithdrawAmount} ${asset.coin} minimum`);
  }
  if (withdrawalRoute === "custody" && route.custodyDisabled) {
    throw new Error(`custody withdrawal is disabled for ${asset.coin}/${route.chain}`);
  }
  if (withdrawalRoute === "bridge" && !route.bridgeAddress) {
    throw new Error(`bridge withdrawal is unavailable for ${asset.coin}/${route.chain}`);
  }
  console.log("Selected withdrawal route:", {
    coin: asset.coin,
    chain: route.chain,
    source,
    withdrawalRoute,
    amount,
    fee: withdrawalRoute === "custody" ? route.custodyWithdrawFee : route.bridgeWithdrawFee,
    minWithdrawAmount: route.minWithdrawAmount,
  });

  const { account, publicClient } = valueChainClients(masterPrivateKey);
  if (source !== "evm") {
    if (!valueChainAsset) {
      throw new Error(
        `transfer config does not publish the trading-engine mapping for ${asset.coin}`,
      );
    }
    const spot = new SpotClient({
      baseUrl: gatewayUrl,
      signer: new SpotSigner({ privateKey: enginePrivateKey }),
      apiKeyName,
    });
    const perps = new PerpsClient({
      baseUrl: gatewayUrl,
      signer: new PerpsSigner({ privateKey: enginePrivateKey }),
      apiKeyName,
    });
    await Promise.all([spot.refreshMarkets(), perps.refreshMarkets()]);
    const accountId = await resolveAccountId(spot, masterAccount.address);

    if (source === "perps") {
      const previousSpotBalance = await getSpotBalance(
        spot,
        masterAccount.address,
        valueChainAsset,
      );
      const receipt = await perps.transferAsset({
        fromAccountId: accountId,
        toAccountId: TREASURY_ACCOUNT_ID,
        coin: valueChainAsset,
        amount,
        kind: "SPOT_WITHDRAW",
      });
      console.log("Perps -> Spot transfer submitted:", receipt);
      await waitForSpotBalanceChange(
        spot,
        masterAccount.address,
        valueChainAsset,
        previousSpotBalance,
      );
    }

    const previousEvmBalance = await getEvmBalance(
      publicClient,
      account.address,
      asset.tokenAddress,
    );
    const receipt = await spot.transferAsset({
      fromAccountId: accountId,
      toAccountId: TREASURY_ACCOUNT_ID,
      coin: valueChainAsset,
      amount,
      kind: "EVM_WITHDRAW",
    });
    console.log("Spot -> ValueChain EVM transfer submitted:", receipt);
    await waitForEvmBalanceIncrease(
      publicClient,
      account.address,
      asset.tokenAddress,
      previousEvmBalance,
      Number(process.env.SODEX_WAIT_SECONDS ?? "120") * 1_000,
    );
  }

  const evmBalance = await getEvmBalance(publicClient, account.address, asset.tokenAddress);
  if (evmBalance < rawAmount) {
    throw new Error(
      `insufficient ValueChain balance: have ${evmBalance}, need ${rawAmount} raw units`,
    );
  }

  const nonceKey = BigInt(process.env.SODEX_WITHDRAW_NONCE_KEY ?? "0");
  const permitNonce = await publicClient.readContract({
    address: CALL_FOR_PERMIT_ADDRESS,
    abi: CALL_FOR_PERMIT_ABI,
    functionName: "nonces",
    args: [account.address, nonceKey],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60);
  const cmdData = encodeWithdrawCommand({
    coin: asset.coin,
    chain: route.chain,
    receiver,
    amount: rawAmount,
    withdrawalType: withdrawalRoute === "custody" ? 0 : 1,
    memo: process.env.SODEX_WITHDRAW_MEMO ?? "",
    failedBackToClob: process.env.SODEX_FAILED_BACK_TO_CLOB !== "false",
  });
  const digest = await publicClient.readContract({
    address: CALL_FOR_PERMIT_ADDRESS,
    abi: CALL_FOR_PERMIT_ABI,
    functionName: "hashCallForPermit",
    args: [WITHDRAW_TOKEN_TARGET, "WithdrawToken", cmdData, permitNonce, deadline],
  });
  const signature = await account.sign({ hash: digest });
  const submission = await gateway.submitEvmWithdraw(account.address, {
    cmdData,
    nonce: permitNonce.toString(),
    deadline: deadline.toString(),
    signature,
  });
  console.log("Withdrawal submitted (not final):", submission);
  await pollWithdrawal(gateway, route.chain, submission.txHash);
}

async function resolveAccountId(spot: SpotClient, userAddress: `0x${string}`): Promise<bigint> {
  const configured = process.env.SODEX_ACCOUNT_ID;
  if (configured) return BigInt(configured);
  const accountId = (await spot.getAccountState(userAddress)).accountId;
  if (accountId === 0n) throw new Error("Sodex account is not activated");
  return accountId;
}

async function getSpotBalance(
  spot: SpotClient,
  userAddress: `0x${string}`,
  coin: string,
): Promise<string | undefined> {
  const state = await spot.getAccountState(userAddress);
  return state.balances.find((balance) => balance.coin === coin)?.total;
}

async function waitForSpotBalanceChange(
  spot: SpotClient,
  userAddress: `0x${string}`,
  coin: string,
  previousBalance: string | undefined,
): Promise<void> {
  const deadline = Date.now() + Number(process.env.SODEX_WAIT_SECONDS ?? "120") * 1_000;
  while (Date.now() < deadline) {
    await sleep(3_000);
    const balance = await getSpotBalance(spot, userAddress, coin);
    if (balance !== previousBalance) return;
  }
  throw new Error("timed out waiting for the Perps -> Spot transfer");
}

async function pollWithdrawal(gateway: UserClient, chain: string, txHash: string) {
  const deadline = Date.now() + Number(process.env.SODEX_WAIT_SECONDS ?? "120") * 1_000;
  while (Date.now() < deadline) {
    const history = await gateway.getWithdrawStatus(chain, { txHash });
    if (history.total > 0) {
      console.log("Withdrawal progress:", history.records);
      if (history.records.some((record) => isTerminalStatus(record.status))) return;
    }
    await sleep(5_000);
  }
  console.log(
    `Withdrawal is still pending or not indexed. Re-run with SODEX_WITHDRAW_TX_HASH=${txHash}`,
  );
}

function isTerminalStatus(status: string): boolean {
  return ["success", "failed", "rejected", "cancelled", "canceled"].includes(status.toLowerCase());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
