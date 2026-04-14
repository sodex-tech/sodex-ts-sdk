import type { Address, Hash, WalletClient } from "viem";

export const CLOB_GATEWAY_ADDRESS: Address = "0x0101010101010101010101010101010101010101";
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

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
