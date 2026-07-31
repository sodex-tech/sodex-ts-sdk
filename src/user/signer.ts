import { keccak_256 } from "@noble/hashes/sha3";
import { type ActionPayload, hashActionPayload } from "../common/action-payload";
import { bytesToHex, concatBytes, hexToBytes, uint256BE, utf8 } from "../common/bytes";
import {
  type Eip712Domain,
  MAINNET_CHAIN_ID,
  UNIVERSAL_DOMAIN_NAME,
  addApiKeyStructHash,
  eip712Digest,
  exchangeActionStructHash,
  makeDomain,
} from "../common/eip712";
import { type NonceManager, globalNonceManager, signerNonceKey } from "../common/nonce";
import { SIG_TYPE_ADD_API_KEY, addressFromPrivateKey, signDigest } from "../common/signer";
import {
  type Eip712TypedData,
  type SignTypedDataFn,
  wireSigFromExternal,
} from "../common/typed-data-signer";
import type {
  AddUserApiKeyInput,
  ApproveBuilderInput,
  RevokeUserApiKeyInput,
  UserAddress,
  UserSignedRequest,
} from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const KEY_TYPE_EVM = 1;

const ADD_API_KEY_WITH_BUILDER_TYPE =
  "AddAPIKeyWithBuilder(uint64 chainID,uint64 nonce,uint64 accountID,string name,uint8 keyType,bytes publicKey,uint64 expiresAt,uint64 builderID,uint64 maxFeeRate)";
const ADD_PERMISSIONED_API_KEY_TYPE =
  "UserSignedAddPermissionedAPIKeyAction(uint64 chainID,uint64 nonce,uint64 accountID,string name,uint8 keyType,bytes publicKey,uint64 expiresAt,uint64 permissions)";
const APPROVE_BUILDER_FEE_TYPE =
  "ApproveBuilderFeeAction(uint64 chainID,uint64 nonce,uint64 accountID,uint64 builderID,uint64 maxFeeRate)";

export interface UserSigner {
  readonly address: UserAddress;
  readonly chainId: bigint;
  readonly nonceManager?: NonceManager;
  readonly nonceKey?: string;
  signAddApiKey(input: AddUserApiKeyInput, nonce?: bigint): Promise<UserSignedRequest>;
  signRevokeApiKey(input: RevokeUserApiKeyInput, nonce?: bigint): Promise<UserSignedRequest>;
  signApproveBuilderFee(input: ApproveBuilderInput, nonce?: bigint): Promise<UserSignedRequest>;
}

export interface LocalUserSignerOptions {
  privateKey: Uint8Array | string;
  chainId?: bigint;
  nonceManager?: NonceManager;
}

export interface TypedDataUserSignerOptions {
  address: UserAddress;
  signTypedData: SignTypedDataFn;
  chainId?: bigint;
  nonceManager?: NonceManager;
}

export class LocalUserSigner implements UserSigner {
  readonly address: UserAddress;
  readonly chainId: bigint;
  readonly nonceManager: NonceManager;
  readonly nonceKey: string;
  private readonly privateKey: Uint8Array;

  constructor(opts: LocalUserSignerOptions) {
    this.privateKey =
      typeof opts.privateKey === "string" ? hexToBytes(opts.privateKey) : opts.privateKey;
    this.address = addressFromPrivateKey(this.privateKey) as UserAddress;
    this.chainId = opts.chainId ?? MAINNET_CHAIN_ID;
    this.nonceManager = opts.nonceManager ?? globalNonceManager;
    this.nonceKey = signerNonceKey(this.chainId, this.address);
  }

  async signAddApiKey(input: AddUserApiKeyInput, nonce?: bigint): Promise<UserSignedRequest> {
    const resolvedNonce = nonce ?? this.nonceManager.next(this.nonceKey);
    validateApiKeyInput(input);
    return this.sign(addApiKeyStructHashFor(input, resolvedNonce, this.chainId), resolvedNonce);
  }

  async signRevokeApiKey(input: RevokeUserApiKeyInput, nonce?: bigint): Promise<UserSignedRequest> {
    const resolvedNonce = nonce ?? this.nonceManager.next(this.nonceKey);
    return this.sign(revokeApiKeyStructHash(input, resolvedNonce), resolvedNonce);
  }

  async signApproveBuilderFee(
    input: ApproveBuilderInput,
    nonce?: bigint,
  ): Promise<UserSignedRequest> {
    const resolvedNonce = nonce ?? this.nonceManager.next(this.nonceKey);
    return this.sign(
      approveBuilderFeeStructHash(input, resolvedNonce, this.chainId),
      resolvedNonce,
    );
  }

  private sign(structHash: Uint8Array, nonce: bigint): UserSignedRequest {
    const digest = eip712Digest(universalDomain(this.chainId), structHash);
    return {
      signature: bytesToHex(
        signDigest(digest, this.privateKey, SIG_TYPE_ADD_API_KEY),
      ) as `0x${string}`,
      nonce,
      chainId: this.chainId,
    };
  }
}

export class TypedDataUserSigner implements UserSigner {
  readonly address: UserAddress;
  readonly chainId: bigint;
  readonly nonceManager: NonceManager;
  readonly nonceKey: string;
  private readonly signTypedDataFn: SignTypedDataFn;

  constructor(opts: TypedDataUserSignerOptions) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(opts.address)) {
      throw new Error(`TypedDataUserSigner: invalid address ${opts.address}`);
    }
    this.address = opts.address.toLowerCase() as UserAddress;
    this.chainId = opts.chainId ?? MAINNET_CHAIN_ID;
    this.nonceManager = opts.nonceManager ?? globalNonceManager;
    this.nonceKey = signerNonceKey(this.chainId, this.address);
    this.signTypedDataFn = opts.signTypedData;
  }

  async signAddApiKey(input: AddUserApiKeyInput, nonce?: bigint): Promise<UserSignedRequest> {
    const resolvedNonce = nonce ?? this.nonceManager.next(this.nonceKey);
    validateApiKeyInput(input);
    return this.sign(buildAddApiKeyTypedData(input, resolvedNonce, this.chainId), resolvedNonce);
  }

  async signRevokeApiKey(input: RevokeUserApiKeyInput, nonce?: bigint): Promise<UserSignedRequest> {
    const resolvedNonce = nonce ?? this.nonceManager.next(this.nonceKey);
    return this.sign(buildRevokeApiKeyTypedData(input, resolvedNonce, this.chainId), resolvedNonce);
  }

  async signApproveBuilderFee(
    input: ApproveBuilderInput,
    nonce?: bigint,
  ): Promise<UserSignedRequest> {
    const resolvedNonce = nonce ?? this.nonceManager.next(this.nonceKey);
    return this.sign(
      buildApproveBuilderFeeTypedData(input, resolvedNonce, this.chainId),
      resolvedNonce,
    );
  }

  private async sign(typedData: Eip712TypedData, nonce: bigint): Promise<UserSignedRequest> {
    const externalSignature = await this.signTypedDataFn(typedData);
    return {
      signature: bytesToHex(
        wireSigFromExternal(externalSignature, SIG_TYPE_ADD_API_KEY),
      ) as `0x${string}`,
      nonce,
      chainId: this.chainId,
    };
  }
}

export function buildAddApiKeyTypedData(
  input: AddUserApiKeyInput,
  nonce: bigint,
  chainId: bigint,
): Eip712TypedData {
  validateApiKeyInput(input);
  if (input.builder) {
    return typedData(
      chainId,
      "AddAPIKeyWithBuilder",
      [
        field("chainID", "uint64"),
        field("nonce", "uint64"),
        field("accountID", "uint64"),
        field("name", "string"),
        field("keyType", "uint8"),
        field("publicKey", "bytes"),
        field("expiresAt", "uint64"),
        field("builderID", "uint64"),
        field("maxFeeRate", "uint64"),
      ],
      {
        chainID: chainId,
        nonce,
        ...apiKeyMessage(input),
        builderID: input.builder.builderId,
        maxFeeRate: input.builder.feeRate,
      },
    );
  }
  if (input.permissions !== undefined) {
    return typedData(
      chainId,
      "UserSignedAddPermissionedAPIKeyAction",
      [
        field("chainID", "uint64"),
        field("nonce", "uint64"),
        field("accountID", "uint64"),
        field("name", "string"),
        field("keyType", "uint8"),
        field("publicKey", "bytes"),
        field("expiresAt", "uint64"),
        field("permissions", "uint64"),
      ],
      { chainID: chainId, nonce, ...apiKeyMessage(input), permissions: input.permissions },
    );
  }
  return typedData(
    chainId,
    "AddAPIKey",
    [
      field("accountID", "uint64"),
      field("name", "string"),
      field("keyType", "uint8"),
      field("publicKey", "bytes"),
      field("expiresAt", "uint64"),
      field("nonce", "uint64"),
    ],
    { ...apiKeyMessage(input), nonce },
  );
}

export function buildRevokeApiKeyTypedData(
  input: RevokeUserApiKeyInput,
  nonce: bigint,
  chainId: bigint,
): Eip712TypedData {
  const payloadHash = hashActionPayload(revokePayload(input));
  return typedData(
    chainId,
    "ExchangeAction",
    [field("payloadHash", "bytes32"), field("nonce", "uint64")],
    { payloadHash: bytesToHex(payloadHash), nonce },
  );
}

export function buildApproveBuilderFeeTypedData(
  input: ApproveBuilderInput,
  nonce: bigint,
  chainId: bigint,
): Eip712TypedData {
  return typedData(
    chainId,
    "ApproveBuilderFeeAction",
    [
      field("chainID", "uint64"),
      field("nonce", "uint64"),
      field("accountID", "uint64"),
      field("builderID", "uint64"),
      field("maxFeeRate", "uint64"),
    ],
    {
      chainID: chainId,
      nonce,
      accountID: input.accountId,
      builderID: input.builderId,
      maxFeeRate: input.maxFeeRate,
    },
  );
}

function addApiKeyStructHashFor(
  input: AddUserApiKeyInput,
  nonce: bigint,
  chainId: bigint,
): Uint8Array {
  if (!input.builder && input.permissions === undefined) {
    return addApiKeyStructHash({
      accountId: input.accountId,
      name: input.name,
      keyType: KEY_TYPE_EVM,
      publicKey: hexToBytes(input.publicKey),
      expiresAt: input.expiresAt,
      nonce,
    });
  }
  const typeHash = keccak_256(
    utf8(input.builder ? ADD_API_KEY_WITH_BUILDER_TYPE : ADD_PERMISSIONED_API_KEY_TYPE),
  );
  const common = [
    typeHash,
    uint256BE(chainId),
    uint256BE(nonce),
    uint256BE(input.accountId),
    keccak_256(utf8(input.name)),
    uint256BE(BigInt(KEY_TYPE_EVM)),
    keccak_256(hexToBytes(input.publicKey)),
    uint256BE(input.expiresAt),
  ];
  return keccak_256(
    input.builder
      ? concatBytes(...common, uint256BE(input.builder.builderId), uint256BE(input.builder.feeRate))
      : concatBytes(...common, uint256BE(input.permissions!)),
  );
}

function revokeApiKeyStructHash(input: RevokeUserApiKeyInput, nonce: bigint): Uint8Array {
  return exchangeActionStructHash(hashActionPayload(revokePayload(input)), nonce);
}

function approveBuilderFeeStructHash(
  input: ApproveBuilderInput,
  nonce: bigint,
  chainId: bigint,
): Uint8Array {
  return keccak_256(
    concatBytes(
      keccak_256(utf8(APPROVE_BUILDER_FEE_TYPE)),
      uint256BE(chainId),
      uint256BE(nonce),
      uint256BE(input.accountId),
      uint256BE(input.builderId),
      uint256BE(input.maxFeeRate),
    ),
  );
}

function revokePayload(input: RevokeUserApiKeyInput): ActionPayload {
  return { type: "revokeAPIKey", params: { accountID: input.accountId, name: input.name } };
}

function apiKeyMessage(input: AddUserApiKeyInput): Record<string, unknown> {
  return {
    accountID: input.accountId,
    name: input.name,
    keyType: KEY_TYPE_EVM,
    publicKey: input.publicKey,
    expiresAt: input.expiresAt,
  };
}

function universalDomain(chainId: bigint): Eip712Domain {
  return makeDomain(UNIVERSAL_DOMAIN_NAME, chainId);
}

function typedData(
  chainId: bigint,
  primaryType: string,
  fields: Array<{ name: string; type: string }>,
  message: Record<string, unknown>,
): Eip712TypedData {
  return {
    domain: {
      name: UNIVERSAL_DOMAIN_NAME,
      version: "1",
      chainId: Number(chainId),
      verifyingContract: ZERO_ADDRESS,
    },
    types: { [primaryType]: fields },
    primaryType,
    message,
  };
}

function field(name: string, type: string): { name: string; type: string } {
  return { name, type };
}

function validateApiKeyInput(input: AddUserApiKeyInput): void {
  if (input.builder && input.permissions !== undefined) {
    throw new Error("an API key cannot include both builder and permissions");
  }
}
