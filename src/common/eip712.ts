import { keccak_256 } from "@noble/hashes/sha3";
import { concatBytes, hexToBytes, leftPad, uint256BE, utf8 } from "./bytes";

export const SPOT_DOMAIN_NAME = "spot";
export const PERPS_DOMAIN_NAME = "futures";
export const UNIVERSAL_DOMAIN_NAME = "universal";

export const MAINNET_CHAIN_ID = 286623n;
export const TESTNET_CHAIN_ID = 138565n;

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function makeDomain(name: string, chainId: bigint): Eip712Domain {
  return { name, version: "1", chainId, verifyingContract: ZERO_ADDRESS };
}

const EIP712_DOMAIN_TYPE_HASH = keccak_256(
  utf8("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

export function domainSeparator(domain: Eip712Domain): Uint8Array {
  return keccak_256(
    concatBytes(
      EIP712_DOMAIN_TYPE_HASH,
      keccak_256(utf8(domain.name)),
      keccak_256(utf8(domain.version)),
      uint256BE(domain.chainId),
      leftPad(hexToBytes(domain.verifyingContract), 32),
    ),
  );
}

export const EXCHANGE_ACTION_TYPE_HASH = keccak_256(
  utf8("ExchangeAction(bytes32 payloadHash,uint64 nonce)"),
);

export function exchangeActionStructHash(payloadHash: Uint8Array, nonce: bigint): Uint8Array {
  return keccak_256(concatBytes(EXCHANGE_ACTION_TYPE_HASH, payloadHash, uint256BE(nonce)));
}

export function eip712Digest(domain: Eip712Domain, structHash: Uint8Array): Uint8Array {
  return keccak_256(concatBytes(new Uint8Array([0x19, 0x01]), domainSeparator(domain), structHash));
}

export const ADD_API_KEY_TYPE_HASH = keccak_256(
  utf8(
    "AddAPIKey(uint64 accountID,string name,uint8 keyType,bytes publicKey,uint64 expiresAt,uint64 nonce)",
  ),
);

export interface AddApiKeyMessage {
  accountId: bigint;
  name: string;
  keyType: number;
  /** Bytes of the new API key's public key (for EVM addresses: the 20-byte address). */
  publicKey: Uint8Array;
  expiresAt: bigint;
  nonce: bigint;
}

export function addApiKeyStructHash(msg: AddApiKeyMessage): Uint8Array {
  return keccak_256(
    concatBytes(
      ADD_API_KEY_TYPE_HASH,
      uint256BE(msg.accountId),
      keccak_256(utf8(msg.name)),
      uint256BE(BigInt(msg.keyType)),
      keccak_256(msg.publicKey),
      uint256BE(msg.expiresAt),
      uint256BE(msg.nonce),
    ),
  );
}
