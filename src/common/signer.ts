import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { type ActionPayload, hashActionPayload } from "./action-payload";
import { bytesToHex, hexToBytes } from "./bytes";
import { type Eip712Domain, eip712Digest, exchangeActionStructHash } from "./eip712";
import { InvalidSignatureError } from "./errors";

export const SIG_TYPE_EIP712 = 0x01;
export const SIG_TYPE_EIP712_UNIVERSAL = 0x02;
export const SIG_TYPE_ADD_API_KEY = SIG_TYPE_EIP712_UNIVERSAL;
export const WIRE_SIG_LENGTH = 66;

export type PrivateKeyInput = Uint8Array | string;

function normalizePrivateKey(pk: PrivateKeyInput): Uint8Array {
  const bytes = typeof pk === "string" ? hexToBytes(pk) : pk;
  if (bytes.length !== 32) {
    throw new Error(`privateKey: expected 32 bytes, got ${bytes.length}`);
  }
  return bytes;
}

export function addressFromPrivateKey(pk: PrivateKeyInput): string {
  const priv = normalizePrivateKey(pk);
  const pub = secp256k1.getPublicKey(priv, false);
  return addressFromUncompressedPubkey(pub);
}

function addressFromUncompressedPubkey(pub: Uint8Array): string {
  const body = pub[0] === 0x04 ? pub.subarray(1) : pub;
  const hash = keccak_256(body);
  return bytesToHex(hash.subarray(12));
}

/**
 * Abstract signer interface for ExchangeAction signing.
 *
 * Two built-in implementations:
 * - `EvmSigner` (and its `SpotSigner` / `PerpsSigner` subclasses) — local
 *   private-key holder; produces wire signatures synchronously.
 * - `TypedDataSigner` — adapter for external EIP-712 signers (Privy,
 *   wagmi, viem, ethers, WalletConnect, hardware wallets) that expose a
 *   `signTypedData` callback but never reveal the private key.
 *
 * The interface is intentionally minimal: it only commits to "produce a
 * 66-byte wire sig for this (payload, nonce)". Domain/chainId binding is
 * an implementation detail, set at construction time.
 */
export interface Signer {
  /** Lowercase 0x-prefixed 20-byte hex address that recovers from `sign()` output. */
  readonly address: string;

  /**
   * Sign an ExchangeAction and return the 66-byte wire signature.
   * Async to accommodate wallet RPC round-trips; local-key implementations
   * may resolve synchronously.
   */
  sign(payload: ActionPayload, nonce: bigint): Promise<Uint8Array>;
}

export class EvmSigner implements Signer {
  constructor(
    public readonly domain: Eip712Domain,
    private readonly privateKey: Uint8Array,
  ) {}

  get address(): string {
    return addressFromPrivateKey(this.privateKey);
  }

  /**
   * Synchronous local-key signing path. Kept stable for callers that hold
   * an `EvmSigner` directly (tests, deterministic CLIs); `Signer.sign` is
   * the interface SDK clients consume.
   */
  signAction(payload: ActionPayload, nonce: bigint): Uint8Array {
    const payloadHash = hashActionPayload(payload);
    const structHash = exchangeActionStructHash(payloadHash, nonce);
    const digest = eip712Digest(this.domain, structHash);
    return signDigest(digest, this.privateKey, SIG_TYPE_EIP712);
  }

  async sign(payload: ActionPayload, nonce: bigint): Promise<Uint8Array> {
    return this.signAction(payload, nonce);
  }

  recoverAddress(payload: ActionPayload, nonce: bigint, wireSig: Uint8Array): string {
    const payloadHash = hashActionPayload(payload);
    const structHash = exchangeActionStructHash(payloadHash, nonce);
    const digest = eip712Digest(this.domain, structHash);
    return recoverAddress(digest, wireSig);
  }
}

export function signDigest(
  digest: Uint8Array,
  privateKey: Uint8Array,
  sigTypeByte: number,
): Uint8Array {
  const sig = secp256k1.sign(digest, privateKey, { lowS: true });
  const rs = sig.toCompactRawBytes();
  const out = new Uint8Array(WIRE_SIG_LENGTH);
  out[0] = sigTypeByte;
  out.set(rs, 1);
  out[65] = sig.recovery;
  return out;
}

export function checkWireSig(wireSig: Uint8Array, expectedType: number): void {
  if (wireSig.length !== WIRE_SIG_LENGTH) {
    throw new InvalidSignatureError(
      `signature: expected ${WIRE_SIG_LENGTH} bytes, got ${wireSig.length}`,
      "length",
    );
  }
  if (wireSig[0] !== expectedType) {
    throw new InvalidSignatureError(
      `signature: expected type prefix 0x${expectedType.toString(16)}, got 0x${wireSig[0]!.toString(16)}`,
      "type",
    );
  }
}

export function recoverAddress(digest: Uint8Array, wireSig: Uint8Array): string {
  const r = wireSig.subarray(1, 33);
  const s = wireSig.subarray(33, 65);
  const recovery = wireSig[65]!;
  const sig = secp256k1.Signature.fromCompact(mergeRS(r, s)).addRecoveryBit(recovery);
  const pub = sig.recoverPublicKey(digest).toRawBytes(false);
  const body = pub[0] === 0x04 ? pub.subarray(1) : pub;
  const hash = keccak_256(body);
  const addr = bytesToHex(hash.subarray(12));
  if (addr === "0x0000000000000000000000000000000000000000") {
    throw new InvalidSignatureError("signature recovered to zero address", "public-key");
  }
  return addr;
}

function mergeRS(r: Uint8Array, s: Uint8Array): Uint8Array {
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return out;
}
