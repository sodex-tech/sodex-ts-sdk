import { secp256k1 } from "@noble/curves/secp256k1";
import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "../../src/common/bytes";
import {
  MAINNET_CHAIN_ID,
  PERPS_DOMAIN_NAME,
  SPOT_DOMAIN_NAME,
  domainSeparator,
  exchangeActionStructHash,
  makeDomain,
} from "../../src/common/eip712";
import { keccak_256 } from "@noble/hashes/sha3";
import { concatBytes } from "../../src/common/bytes";
import {
  EvmSigner,
  SIG_TYPE_EIP712,
  WIRE_SIG_LENGTH,
  addressFromPrivateKey,
} from "../../src/common/signer";
import {
  TypedDataSigner,
  wireSigFromExternal,
} from "../../src/common/typed-data-signer";
import {
  buildScheduleCancelPayload,
  buildTransferAssetPayload,
} from "../../src/spot/actions";

const TEST_PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

/**
 * Simulate an external EIP-712 signer (Privy / viem / ethers) by
 * computing the digest from the typed-data envelope and signing it with
 * a local private key. The digest formula is independent of how the SDK
 * computes it — we re-derive it from the typed-data fields so this test
 * also covers "external lib computes the same digest" parity.
 */
function makeLocalKeyTypedDataSigner(privHex: string) {
  const priv = hexToBytes(privHex);
  return async (typedData: {
    domain: { name: string; version: string; chainId: number; verifyingContract: string };
    message: Record<string, unknown>;
  }): Promise<string> => {
    const payloadHash = hexToBytes(typedData.message.payloadHash as string);
    const nonce = BigInt(typedData.message.nonce as bigint | string);

    // Reconstruct the digest the same way any EIP-712 lib would.
    const domain = {
      name: typedData.domain.name,
      version: typedData.domain.version,
      chainId: BigInt(typedData.domain.chainId),
      verifyingContract: typedData.domain.verifyingContract,
    };
    const structHash = exchangeActionStructHash(payloadHash, nonce);
    const digest = keccak_256(
      concatBytes(new Uint8Array([0x19, 0x01]), domainSeparator(domain), structHash),
    );
    const sig = secp256k1.sign(digest, priv, { lowS: true });
    // External signers return r||s||v in 65 bytes.
    const out = new Uint8Array(65);
    out.set(sig.toCompactRawBytes(), 0);
    out[64] = sig.recovery;
    return bytesToHex(out);
  };
}

describe("TypedDataSigner ↔ EvmSigner parity", () => {
  const priv = hexToBytes(TEST_PRIV_HEX);
  const address = addressFromPrivateKey(priv);
  const externalSigner = makeLocalKeyTypedDataSigner(TEST_PRIV_HEX);

  it("produces a byte-identical wire signature for spot ExchangeAction", async () => {
    const local = new EvmSigner(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID), priv);
    const wallet = new TypedDataSigner({
      address,
      domainName: SPOT_DOMAIN_NAME,
      chainId: MAINNET_CHAIN_ID,
      signTypedData: externalSigner,
    });
    const payload = buildScheduleCancelPayload({ accountId: 1001n });
    const localSig = local.signAction(payload, 1n);
    const walletSig = await wallet.sign(payload, 1n);
    expect(walletSig).toEqual(localSig);
    expect(walletSig.length).toBe(WIRE_SIG_LENGTH);
    expect(walletSig[0]).toBe(SIG_TYPE_EIP712);
  });

  it("produces a byte-identical wire signature for perps ExchangeAction", async () => {
    const local = new EvmSigner(makeDomain(PERPS_DOMAIN_NAME, MAINNET_CHAIN_ID), priv);
    const wallet = new TypedDataSigner({
      address,
      domainName: PERPS_DOMAIN_NAME,
      chainId: MAINNET_CHAIN_ID,
      signTypedData: externalSigner,
    });
    const payload = buildTransferAssetPayload({
      id: 1n,
      fromAccountId: 1001n,
      toAccountId: 1002n,
      coinId: 3n,
      amount: "1",
      kind: "INTERNAL",
    });
    const localSig = local.signAction(payload, 7n);
    const walletSig = await wallet.sign(payload, 7n);
    expect(walletSig).toEqual(localSig);
  });

  it("recovers to the wallet address", async () => {
    const local = new EvmSigner(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID), priv);
    const wallet = new TypedDataSigner({
      address,
      domainName: SPOT_DOMAIN_NAME,
      chainId: MAINNET_CHAIN_ID,
      signTypedData: externalSigner,
    });
    const payload = buildScheduleCancelPayload({ accountId: 42n });
    const walletSig = await wallet.sign(payload, 99n);
    expect(local.recoverAddress(payload, 99n, walletSig)).toBe(address);
    expect(wallet.address).toBe(address);
  });

  it("rejects malformed addresses at construction", () => {
    expect(
      () =>
        new TypedDataSigner({
          address: "not-an-address",
          domainName: SPOT_DOMAIN_NAME,
          signTypedData: externalSigner,
        }),
    ).toThrow();
  });
});

describe("wireSigFromExternal", () => {
  it("normalizes v=27/28 recovery bytes to 0/1", () => {
    const rs = new Uint8Array(64).fill(0xab);
    const sig27 = new Uint8Array([...rs, 27]);
    const sig28 = new Uint8Array([...rs, 28]);
    const wire27 = wireSigFromExternal(bytesToHex(sig27));
    const wire28 = wireSigFromExternal(bytesToHex(sig28));
    expect(wire27[65]).toBe(0);
    expect(wire28[65]).toBe(1);
    expect(wire27[0]).toBe(SIG_TYPE_EIP712);
    expect(wire27.length).toBe(WIRE_SIG_LENGTH);
  });

  it("passes through v=0/1 unchanged", () => {
    const rs = new Uint8Array(64).fill(0xcd);
    const sig0 = new Uint8Array([...rs, 0]);
    const sig1 = new Uint8Array([...rs, 1]);
    expect(wireSigFromExternal(bytesToHex(sig0))[65]).toBe(0);
    expect(wireSigFromExternal(bytesToHex(sig1))[65]).toBe(1);
  });

  it("rejects wrong-length signatures", () => {
    expect(() => wireSigFromExternal("0x" + "ab".repeat(64))).toThrow();
    expect(() => wireSigFromExternal("0x" + "ab".repeat(66))).toThrow();
  });

  it("rejects invalid recovery bytes", () => {
    const bad = new Uint8Array(65).fill(0);
    bad[64] = 5;
    expect(() => wireSigFromExternal(bytesToHex(bad))).toThrow();
  });
});
