import { hexToBytes } from "./bytes";
import {
  type AddApiKeyMessage,
  type Eip712Domain,
  addApiKeyStructHash,
  eip712Digest,
} from "./eip712";
import {
  type PrivateKeyInput,
  SIG_TYPE_ADD_API_KEY,
  recoverAddress,
  signDigest,
} from "./signer";

function asBytes(pk: PrivateKeyInput): Uint8Array {
  return typeof pk === "string" ? hexToBytes(pk) : pk;
}

export function signAddApiKey(
  domain: Eip712Domain,
  msg: AddApiKeyMessage,
  privateKey: PrivateKeyInput,
): Uint8Array {
  const structHash = addApiKeyStructHash(msg);
  const digest = eip712Digest(domain, structHash);
  return signDigest(digest, asBytes(privateKey), SIG_TYPE_ADD_API_KEY);
}

export function recoverAddApiKeyAddress(
  domain: Eip712Domain,
  msg: AddApiKeyMessage,
  wireSig: Uint8Array,
): string {
  const structHash = addApiKeyStructHash(msg);
  const digest = eip712Digest(domain, structHash);
  return recoverAddress(digest, wireSig);
}
