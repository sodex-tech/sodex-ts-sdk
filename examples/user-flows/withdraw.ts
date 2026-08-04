/**
 * Withdrawal lifecycle: discover/validate route -> move Spot/Perps funds to
 * ValueChain EVM -> sign the WithdrawToken permit -> submit with sponsored or
 * self-paid gas -> wait for an external terminal status.
 *
 * ValueChain submission is not final completion. Save the returned hash and
 * resume with SODEX_WITHDRAW_TX_HASH if settlement outlives this process.
 *
 *   SODEX_PRIVATE_KEY=0x... SODEX_WITHDRAW_RECEIVER=0x... \
 *   SODEX_AMOUNT=10 pnpm tsx examples/user-flows/withdraw.ts
 */
import {
  PerpsClient,
  PerpsSigner,
  SpotClient,
  SpotSigner,
  UserClient,
  WaitTimeoutError,
  isSuccessfulTransferStatus,
  waitForSpotBalanceChange,
  waitForWithdrawal,
} from "@sodex/sdk";
import {
  CALL_FOR_PERMIT_ABI,
  CALL_FOR_PERMIT_ADDRESS,
  WITHDRAW_TOKEN_TARGET,
  encodeWithdrawCommand,
  getEvmBalance,
  waitForEvmBalanceIncrease,
} from "@sodex/sdk/evm";
import { parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  TREASURY_ACCOUNT_ID,
  gatewayUrl,
  optionalPrivateKey,
  parseChoice,
  requireEnv,
  requirePrivateKey,
  valueChainClients,
} from "./config";

const SOURCES = ["evm", "spot", "perps"] as const;
const ROUTES = ["custody", "bridge"] as const;
const GAS_MODES = ["sponsored", "self-paid"] as const;

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
  const gasMode = parseChoice("SODEX_WITHDRAW_GAS_MODE", "sponsored", GAS_MODES);
  const masterPrivateKey = requirePrivateKey();
  const masterAccount = privateKeyToAccount(masterPrivateKey);
  const enginePrivateKey = optionalPrivateKey("SODEX_API_KEY_PRIVATE_KEY") ?? masterPrivateKey;
  const apiKeyName = process.env.SODEX_API_KEY_NAME ?? "default";
  if (process.env.SODEX_API_KEY_PRIVATE_KEY && apiKeyName === "default") {
    throw new Error("SODEX_API_KEY_NAME is required with SODEX_API_KEY_PRIVATE_KEY");
  }

  // Step 1: discover and validate one external withdrawal route.
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

  const { account, publicClient, walletClient } = valueChainClients(masterPrivateKey);

  // Step 2: move engine balances to ValueChain EVM before signing the withdrawal.
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
      const previousRawSpotBalance = previousSpotBalance
        ? parseUnits(previousSpotBalance, Number(asset.decimals))
        : 0n;
      const expectedRawSpotBalance = previousRawSpotBalance + rawAmount;
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
        {
          timeoutMs: waitTimeoutMs(),
          isExpectedBalance(balance) {
            return (
              balance !== undefined &&
              parseUnits(balance, Number(asset.decimals)) >= expectedRawSpotBalance
            );
          },
        },
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
      waitTimeoutMs(),
    );
  }

  const evmBalance = await getEvmBalance(publicClient, account.address, asset.tokenAddress);
  if (evmBalance < rawAmount) {
    throw new Error(
      `insufficient ValueChain balance: have ${evmBalance}, need ${rawAmount} raw units`,
    );
  }

  // Step 3: build and sign the contract-defined keyed permit.
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

  // Step 4: submit through the gas sponsor or directly from the user's wallet.
  let withdrawTxHash: `0x${string}`;
  if (gasMode === "sponsored") {
    const submission = await gateway.submitEvmWithdraw(account.address, {
      cmdData,
      nonce: permitNonce.toString(),
      deadline: deadline.toString(),
      signature,
    });
    withdrawTxHash = submission.txHash;
    console.log("Withdrawal submitted with sponsored gas (not final):", submission);
  } else {
    withdrawTxHash = await walletClient.writeContract({
      address: CALL_FOR_PERMIT_ADDRESS,
      abi: CALL_FOR_PERMIT_ABI,
      functionName: "execute",
      args: [WITHDRAW_TOKEN_TARGET, "WithdrawToken", cmdData, permitNonce, deadline, signature],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: withdrawTxHash });
    if (receipt.status !== "success") {
      throw new Error(`self-paid ValueChain withdrawal reverted: ${withdrawTxHash}`);
    }
    console.log("Withdrawal submitted with self-paid gas (not final):", withdrawTxHash);
  }

  // Step 5: wait for external settlement, retaining the hash for later resumption.
  try {
    const history = await waitForWithdrawal(
      gateway,
      route.chain,
      { txHash: withdrawTxHash },
      {
        timeoutMs: waitTimeoutMs(),
        intervalMs: 5_000,
        onUpdate(update) {
          if (update.total > 0n) console.log("Withdrawal progress:", update.records);
        },
      },
    );
    const failedRecords = history.records.filter(
      (record) => !isSuccessfulTransferStatus(record.status),
    );
    if (failedRecords.length > 0) {
      throw new Error(
        `Withdrawal failed with terminal status: ${failedRecords
          .map((record) => record.status)
          .join(", ")}`,
      );
    }
    console.log("Withdrawal succeeded:", history.records);
  } catch (error) {
    if (!(error instanceof WaitTimeoutError)) throw error;
    console.log(
      `Withdrawal is still pending or not indexed. Re-run with SODEX_WITHDRAW_TX_HASH=${withdrawTxHash}`,
    );
  }
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

function waitTimeoutMs(): number {
  return Number(process.env.SODEX_WAIT_SECONDS ?? "120") * 1_000;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
