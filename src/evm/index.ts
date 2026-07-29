import {
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
} from "viem";

export const CLOB_GATEWAY_ADDRESS: Address = "0x0101010101010101010101010101010101010101";
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
export const CALL_FOR_PERMIT_ADDRESS: Address = "0x890B7D142841065E64E5f94a455876e6352A7801";
export const WITHDRAW_TOKEN_TARGET: Address = "0x441BDb33C7d6DC49f627a42c3d71671D50DC2e94";

export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export const CALL_FOR_PERMIT_ABI = parseAbi([
  "function nonces(address owner, uint192 key) view returns (uint256)",
  "function hashCallForPermit(address to, string cmdType, bytes cmdData, uint256 nonce, uint256 deadline) view returns (bytes32)",
]);

export interface WithdrawCommandInput {
  coin: string;
  chain: string;
  receiver: string;
  amount: bigint;
  withdrawalType: 0 | 1;
  memo?: string;
  failedBackToClob?: boolean;
}

export function encodeWithdrawCommand(input: WithdrawCommandInput): Hex {
  return encodeAbiParameters(
    parseAbiParameters("string, string, string, uint256, uint8, string, bool"),
    [
      input.coin,
      input.chain,
      input.receiver,
      input.amount,
      input.withdrawalType,
      input.memo ?? "",
      input.failedBackToClob ?? true,
    ],
  );
}

export async function getEvmBalance(
  publicClient: PublicClient,
  userAddress: Address,
  tokenAddress: Address,
): Promise<bigint> {
  if (tokenAddress.toLowerCase() === ZERO_ADDRESS) {
    return publicClient.getBalance({ address: userAddress });
  }
  return publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [userAddress],
  });
}

export async function waitForEvmBalanceIncrease(
  publicClient: PublicClient,
  userAddress: Address,
  tokenAddress: Address,
  previousBalance: bigint,
  timeoutMs = 120_000,
): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const balance = await getEvmBalance(publicClient, userAddress, tokenAddress);
    if (balance > previousBalance) return balance;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("timed out waiting for the ValueChain balance to increase");
}

export type Destination = "spot" | "perps";
export const destinationToCode = (d: Destination): bigint => (d === "spot" ? 0n : 1n);

const CLOB_GATEWAY_ABI = [
  {
    type: "function",
    name: "addAPIKey",
    stateMutability: "nonpayable",
    inputs: [
      { name: "destination", type: "uint256" },
      { name: "name", type: "string" },
      { name: "pubkey", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addAPIKey",
    stateMutability: "nonpayable",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "destination", type: "uint256" },
      { name: "name", type: "string" },
      { name: "pubkey", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeAPIKey",
    stateMutability: "nonpayable",
    inputs: [
      { name: "destination", type: "uint256" },
      { name: "name", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeAPIKey",
    stateMutability: "nonpayable",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "destination", type: "uint256" },
      { name: "name", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositERC20",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getUserId",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getAccountsByAddress",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

export interface ClobGatewayOptions {
  walletClient: WalletClient;
  address?: Address;
}

export class ClobGateway {
  readonly address: Address;
  private readonly wc: WalletClient;

  constructor(opts: ClobGatewayOptions) {
    this.wc = opts.walletClient;
    this.address = opts.address ?? CLOB_GATEWAY_ADDRESS;
  }

  async addApiKey(params: {
    destination: Destination;
    name: string;
    pubkey: `0x${string}`;
  }): Promise<Hash> {
    return this.wc.writeContract({
      address: this.address,
      abi: CLOB_GATEWAY_ABI,
      functionName: "addAPIKey",
      args: [destinationToCode(params.destination), params.name, params.pubkey],
      chain: this.wc.chain ?? null,
      account: this.wc.account ?? null,
    } as any);
  }

  async addApiKeyForSubaccount(params: {
    accountId: bigint;
    destination: Destination;
    name: string;
    pubkey: `0x${string}`;
  }): Promise<Hash> {
    return this.wc.writeContract({
      address: this.address,
      abi: CLOB_GATEWAY_ABI,
      functionName: "addAPIKey",
      args: [params.accountId, destinationToCode(params.destination), params.name, params.pubkey],
      chain: this.wc.chain ?? null,
      account: this.wc.account ?? null,
    } as any);
  }

  async revokeApiKey(params: { destination: Destination; name: string }): Promise<Hash> {
    return this.wc.writeContract({
      address: this.address,
      abi: CLOB_GATEWAY_ABI,
      functionName: "revokeAPIKey",
      args: [destinationToCode(params.destination), params.name],
      chain: this.wc.chain ?? null,
      account: this.wc.account ?? null,
    } as any);
  }

  async revokeApiKeyForSubaccount(params: {
    accountId: bigint;
    destination: Destination;
    name: string;
  }): Promise<Hash> {
    return this.wc.writeContract({
      address: this.address,
      abi: CLOB_GATEWAY_ABI,
      functionName: "revokeAPIKey",
      args: [params.accountId, destinationToCode(params.destination), params.name],
      chain: this.wc.chain ?? null,
      account: this.wc.account ?? null,
    } as any);
  }

  async depositErc20(params: { token: Address; amount: bigint; value?: bigint }): Promise<Hash> {
    return this.wc.writeContract({
      address: this.address,
      abi: CLOB_GATEWAY_ABI,
      functionName: "depositERC20",
      args: [params.token, params.amount],
      value: params.value,
      chain: this.wc.chain ?? null,
      account: this.wc.account ?? null,
    } as any);
  }
}

export const CLOB_GATEWAY_ABI_DEFINITION = CLOB_GATEWAY_ABI;
