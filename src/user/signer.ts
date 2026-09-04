import { keccak_256 } from "@noble/hashes/sha3";
import { hashActionPayload } from "../common/action-payload";
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
import { SIG_TYPE_EIP712_UNIVERSAL, addressFromPrivateKey, signDigest } from "../common/signer";
import type {
  AddUserApiKeyInput,
  ApproveBuilderFeeInput,
  RevokeUserApiKeyInput,
  UserAddress,
  UserSignedRequest,
} from "./types";

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
}

export interface BuilderFeeSigner extends UserSigner {
  signApproveBuilderFee(input: ApproveBuilderFeeInput, nonce?: bigint): Promise<UserSignedRequest>;
}

export interface LocalUserSignerOptions {
  privateKey: Uint8Array | string;
  chainId?: bigint;
  nonceManager?: NonceManager;
}

export class LocalUserSigner implements BuilderFeeSigner {
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
    const payloadHash = hashActionPayload({
      type: "revokeAPIKey",
      params: { accountID: input.accountId, name: input.name },
    });
    return this.sign(exchangeActionStructHash(payloadHash, resolvedNonce), resolvedNonce);
  }

  async signApproveBuilderFee(
    input: ApproveBuilderFeeInput,
    nonce?: bigint,
  ): Promise<UserSignedRequest> {
    const resolvedNonce = nonce ?? this.nonceManager.next(this.nonceKey);
    assertUInt64("chainId", this.chainId);
    assertUInt64("nonce", resolvedNonce);
    assertUInt64("accountId", input.accountId);
    assertUInt64("builderId", input.builderId);
    assertUInt64("maxFeeRate", input.maxFeeRate);
    const structHash = keccak_256(
      concatBytes(
        keccak_256(utf8(APPROVE_BUILDER_FEE_TYPE)),
        uint256BE(this.chainId),
        uint256BE(resolvedNonce),
        uint256BE(input.accountId),
        uint256BE(input.builderId),
        uint256BE(input.maxFeeRate),
      ),
    );
    return this.sign(structHash, resolvedNonce);
  }

  private sign(structHash: Uint8Array, nonce: bigint): UserSignedRequest {
    const digest = eip712Digest(universalDomain(this.chainId), structHash);
    return {
      signature: bytesToHex(
        signDigest(digest, this.privateKey, SIG_TYPE_EIP712_UNIVERSAL),
      ) as `0x${string}`,
      nonce,
      chainId: this.chainId,
    };
  }
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

function validateApiKeyInput(input: AddUserApiKeyInput): void {
  if (input.builder && input.permissions !== undefined) {
    throw new Error("an API key cannot include both builder and permissions");
  }
}

function assertUInt64(name: string, value: bigint): void {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError(`${name} must be a uint64`);
  }
}
