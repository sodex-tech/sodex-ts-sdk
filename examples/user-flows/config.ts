import {
  http,
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const DEFAULT_GATEWAY = "https://mainnet-gw.sodex.dev";
export const DEFAULT_VALUECHAIN_RPC = "https://mainnet.valuechain.xyz/";
export const DEFAULT_CHAIN_ID = 286623n;
export const CLOB_GATEWAY_ADDRESS: Address = "0x0101010101010101010101010101010101010101";
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
export const TREASURY_ACCOUNT_ID = 999n;

export const gatewayUrl = process.env.SODEX_GATEWAY ?? DEFAULT_GATEWAY;
export const valueChainRpcUrl = process.env.SODEX_VALUECHAIN_RPC ?? DEFAULT_VALUECHAIN_RPC;
export const sodexChainId = BigInt(process.env.SODEX_CHAIN_ID ?? DEFAULT_CHAIN_ID);

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

export function optionalPrivateKey(name: string): Hex | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${name} must be a 32-byte hex private key`);
  }
  return normalized as Hex;
}

export function requirePrivateKey(name = "SODEX_PRIVATE_KEY"): Hex {
  const key = optionalPrivateKey(name);
  if (!key) throw new Error(`missing env ${name}`);
  return key;
}

export function parseChoice<T extends string>(name: string, fallback: T, choices: readonly T[]): T {
  const value = (process.env[name] ?? fallback) as T;
  if (!choices.includes(value)) {
    throw new Error(`${name} must be one of: ${choices.join(", ")}`);
  }
  return value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function valueChainClients(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  const chain = defineChain({
    id: Number(sodexChainId),
    name: "ValueChain",
    nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
    rpcUrls: { default: { http: [valueChainRpcUrl] } },
  });
  const transport = http(valueChainRpcUrl);
  return {
    account,
    chain,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
}

export function sourceChainClients(privateKey: Hex) {
  const rpcUrl = requireEnv("SODEX_SOURCE_RPC");
  const chainId = Number(requireEnv("SODEX_SOURCE_CHAIN_ID"));
  const account = privateKeyToAccount(privateKey);
  const chain = defineChain({
    id: chainId,
    name: process.env.SODEX_SOURCE_CHAIN_NAME ?? `Source Chain ${chainId}`,
    nativeCurrency: {
      name: process.env.SODEX_SOURCE_NATIVE_NAME ?? "Native Token",
      symbol: process.env.SODEX_SOURCE_NATIVE_SYMBOL ?? "ETH",
      decimals: Number(process.env.SODEX_SOURCE_NATIVE_DECIMALS ?? "18"),
    },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const transport = http(rpcUrl);
  return {
    account,
    chain,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
}
