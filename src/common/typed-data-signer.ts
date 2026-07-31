import { type ActionPayload, hashActionPayload } from "./action-payload";
import { bytesToHex, hexToBytes } from "./bytes";
import { MAINNET_CHAIN_ID } from "./eip712";
import { InvalidSignatureError } from "./errors";
import { SIG_TYPE_EIP712, type Signer, WIRE_SIG_LENGTH } from "./signer";

/**
 * EIP-712 typed-data envelope handed to external `signTypedData`
 * callbacks. Shape matches what viem / ethers v6 / Privy / wagmi accept.
 *
 * `chainId` is `number` — Sodex chain IDs (mainnet 286623, testnet
 * 138565) fit safely within `Number.MAX_SAFE_INTEGER`. `nonce` in the
 * message is left as `bigint`; viem-based stacks (Privy embedded wallet
 * included) encode it as `uint64` directly.
 */
export interface Eip712TypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export type SignTypedDataFn = (typedData: Eip712TypedData) => Promise<string>;

export interface TypedDataSignerOptions {
  /** EVM address that recovers from the callback's signatures. Lower-cased on store. */
  address: string;
  /** EIP-712 domain name — `"spot"` or `"futures"`. */
  domainName: string;
  /** Sodex chain id; defaults to mainnet. */
  chainId?: bigint;
  /**
   * Caller-provided EIP-712 signer. Must return a 65-byte hex signature
   * (`0x{r}{s}{v}`). Privy, viem, ethers, wagmi, WalletConnect, and most
   * hardware-wallet bridges all expose a function with this shape.
   */
  signTypedData: SignTypedDataFn;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EXCHANGE_ACTION_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  ExchangeAction: [
    { name: "payloadHash", type: "bytes32" },
    { name: "nonce", type: "uint64" },
  ],
};

/**
 * Adapter that turns any external EIP-712 signer (Privy embedded wallet,
 * viem WalletClient, ethers Signer, WalletConnect, Ledger bridge) into a
 * Sodex `Signer`.
 *
 * Why a separate class instead of letting `SpotClient` accept a callback
 * directly: domain + chainId binding lives on the signer, not the client.
 * Per-call typed-data assembly stays here so each client method remains
 * one line.
 *
 * The callback is assumed to return a low-S signature (EIP-2). All
 * mainstream EVM signing stacks comply; if you're plugging in a legacy
 * hardware wallet that emits high-S, normalize before returning.
 */
export class TypedDataSigner implements Signer {
  readonly address: string;
  private readonly domainName: string;
  private readonly chainId: bigint;
  private readonly signTypedDataFn: SignTypedDataFn;

  constructor(opts: TypedDataSignerOptions) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(opts.address)) {
      throw new Error(`TypedDataSigner: invalid address ${opts.address}`);
    }
    this.address = opts.address.toLowerCase();
    this.domainName = opts.domainName;
    this.chainId = opts.chainId ?? MAINNET_CHAIN_ID;
    this.signTypedDataFn = opts.signTypedData;
  }

  async sign(payload: ActionPayload, nonce: bigint): Promise<Uint8Array> {
    const payloadHash = hashActionPayload(payload);
    const typedData: Eip712TypedData = {
      domain: {
        name: this.domainName,
        version: "1",
        chainId: Number(this.chainId),
        verifyingContract: ZERO_ADDRESS,
      },
      types: { ...EXCHANGE_ACTION_TYPES },
      primaryType: "ExchangeAction",
      message: {
        payloadHash: bytesToHex(payloadHash),
        nonce,
      },
    };
    const sigHex = await this.signTypedDataFn(typedData);
    return wireSigFromExternal(sigHex);
  }
}

/**
 * Convert a standard 65-byte EIP-712 signature (`r||s||v`) into the
 * 66-byte Sodex wire signature (`type||r||s||recovery`).
 *
 * Recovery normalization: external signers emit `v` as either 0/1 or
 * 27/28. Sodex wire stores 0/1.
 */
export function wireSigFromExternal(sigHex: string, signatureType = SIG_TYPE_EIP712): Uint8Array {
  const bytes = hexToBytes(sigHex);
  if (bytes.length !== 65) {
    throw new InvalidSignatureError(
      `external signature: expected 65 bytes, got ${bytes.length}`,
      "length",
    );
  }
  const v = bytes[64]!;
  let recovery: number;
  if (v === 0 || v === 1) recovery = v;
  else if (v === 27 || v === 28) recovery = v - 27;
  else {
    throw new InvalidSignatureError(
      `external signature: invalid recovery byte 0x${v.toString(16)}`,
      "type",
    );
  }
  const out = new Uint8Array(WIRE_SIG_LENGTH);
  out[0] = signatureType;
  out.set(bytes.subarray(0, 64), 1);
  out[65] = recovery;
  return out;
}
