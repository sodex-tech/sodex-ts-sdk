/**
 * Discover a deposit route, create/query a custody address, and optionally
 * look up the resulting deposit by its source-chain transaction hash.
 *
 *   SODEX_PRIVATE_KEY=0x... pnpm tsx examples/user-flows/deposit.ts
 *   SODEX_DEPOSIT_ROUTE=bridge pnpm tsx examples/user-flows/deposit.ts
 */
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PerpsClient, SpotClient, UserClient, type UserDepositAddress } from "../../src";
import {
  CLOB_GATEWAY_ADDRESS,
  gatewayUrl,
  optionalPrivateKey,
  parseChoice,
  sleep,
  sodexChainId,
} from "./config";

const ADDRESS_STATUSES = ["Enabled", "Processing", "Suspicious"] as const;

async function main() {
  const coin = process.env.SODEX_COIN ?? "USDC";
  const chain = process.env.SODEX_CHAIN ?? "BASE_ETH";
  const routeType = parseChoice("SODEX_DEPOSIT_ROUTE", "custody", ["custody", "bridge"]);
  const gateway = new UserClient({ baseUrl: gatewayUrl });
  const { asset, route } = await gateway.getTransferRoute(coin, chain);

  const spot = new SpotClient({ baseUrl: gatewayUrl });
  const perps = new PerpsClient({ baseUrl: gatewayUrl });
  const [spotCoins, perpsCoins] = await Promise.all([spot.getCoins(), perps.getCoins()]);
  const spotCoin = asset.name
    ? spotCoins.find((candidate) => candidate.name === asset.name)
    : undefined;
  const perpsCoin = asset.name
    ? perpsCoins.find((candidate) => candidate.name === asset.name)
    : undefined;

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
    spotCoinId: spotCoin?.id,
    perpsCoinId: perpsCoin?.id,
  });

  if (routeType === "bridge") {
    if (!route.bridgeAddress) {
      throw new Error(`bridge deposit is unavailable for ${asset.coin}/${route.chain}`);
    }
    console.log(
      `Bridge route selected. Send ${asset.coin} through ${route.bridgeAddress} on ` +
        `${route.chain}; source-chain transaction construction is owned by that bridge, not this SDK.`,
    );
  } else {
    if (route.custodyDisabled) {
      throw new Error(`custody deposit is disabled for ${asset.coin}/${route.chain}`);
    }
    const address = await ensureCustodyAddress(gateway, route.chain);
    console.log("Custody deposit address:", address);
  }

  const txHash = process.env.SODEX_DEPOSIT_TX_HASH;
  if (txHash) {
    const status = await gateway.getDepositStatus(route.chain, txHash);
    console.log(`Deposit status matches: ${status.total}`, status.records);
  } else {
    console.log("Set SODEX_DEPOSIT_TX_HASH after sending funds to query deposit status.");
  }
}

async function ensureCustodyAddress(
  gateway: UserClient,
  chain: string,
): Promise<UserDepositAddress> {
  const privateKey = optionalPrivateKey("SODEX_PRIVATE_KEY");
  const signer = privateKey ? privateKeyToAccount(privateKey) : undefined;
  const userAddress = (process.env.SODEX_USER_ADDRESS ?? signer?.address) as Address | undefined;
  if (!userAddress) {
    throw new Error("SODEX_USER_ADDRESS or SODEX_PRIVATE_KEY is required for custody deposits");
  }
  if (signer && signer.address.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error("SODEX_USER_ADDRESS must match SODEX_PRIVATE_KEY when creating an address");
  }

  let address = await gateway.getDepositAddress(userAddress, chain);
  if (!address.address && !address.status) {
    if (!signer) {
      throw new Error("deposit address does not exist; set SODEX_PRIVATE_KEY to create it");
    }
    const nonce = BigInt(Date.now());
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60);
    const signature = await signer.signTypedData({
      domain: {
        name: "universal",
        version: "1",
        chainId: sodexChainId,
        verifyingContract: CLOB_GATEWAY_ADDRESS,
      },
      types: {
        CreateDepositAddress: [
          { name: "nonce", type: "uint64" },
          { name: "deadline", type: "uint64" },
          { name: "chain", type: "string" },
        ],
      },
      primaryType: "CreateDepositAddress",
      message: { nonce, deadline, chain },
    });
    address = await gateway.createDepositAddress(userAddress, {
      chain,
      nonce,
      deadline,
      signature,
    });
  }

  if (address.status === "Processing") {
    address = await waitForDepositAddress(gateway, userAddress, chain);
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

async function waitForDepositAddress(
  gateway: UserClient,
  userAddress: Address,
  chain: string,
): Promise<UserDepositAddress> {
  const timeoutMs = Number(process.env.SODEX_WAIT_SECONDS ?? "120") * 1_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(3_000);
    const address = await gateway.getDepositAddress(userAddress, chain);
    if (address.status !== "Processing") return address;
  }
  throw new Error(`timed out waiting for the ${chain} custody deposit address`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
