import { HttpClient, type RetryOptions, type SignedHeaders } from "../common/http";
import { globalNonceManager, signerNonceKey } from "../common/nonce";
import type { UserSigner } from "./signer";
import type {
  AddUserApiKeyInput,
  ChainTransferConfig,
  CoinTransferConfig,
  CreateDepositAddressInput,
  DepositWithdrawalHistory,
  EvmWithdrawRequest,
  EvmWithdrawSubmission,
  RevokeUserApiKeyInput,
  UserAddress,
  UserDepositAddress,
  UserSignedRequest,
  UserStatus,
} from "./types";

export interface UserClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** HTTP request timeout in milliseconds. Defaults to 10 seconds; `null` disables it. */
  timeoutMs?: number | null;
  /** Optional GET-only retry policy. Signed writes are never retried. */
  retry?: boolean | RetryOptions;
}

export class UserClient {
  readonly http: HttpClient;
  private readonly partnerHttp: HttpClient;

  constructor(opts: UserClientOptions) {
    this.http = new HttpClient({
      baseUrl: `${opts.baseUrl.replace(/\/$/, "")}/api/v1`,
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      retry: opts.retry,
    });
    this.partnerHttp = new HttpClient({
      baseUrl: `${opts.baseUrl.replace(/\/$/, "")}/api/v2`,
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      retry: opts.retry,
    });
  }

  getUserStatus(userAddress: UserAddress): Promise<UserStatus> {
    return this.http.get(`/user/${userAddress}/status`);
  }

  getTransferConfigs(coin?: string): Promise<CoinTransferConfig[]> {
    return this.http.get("/asset/config", { query: { coin } });
  }

  async getTransferRoute(
    coin: string,
    chain: string,
  ): Promise<{ asset: CoinTransferConfig; route: ChainTransferConfig }> {
    const asset = (await this.getTransferConfigs(coin)).find(
      (candidate) => candidate.coin.toLowerCase() === coin.toLowerCase(),
    );
    if (!asset) throw new Error(`unsupported transfer coin: ${coin}`);
    const route = asset.chains.find(
      (candidate) => candidate.chain.toLowerCase() === chain.toLowerCase(),
    );
    if (!route) throw new Error(`unsupported transfer chain for ${asset.coin}: ${chain}`);
    return { asset, route };
  }

  getDepositAddress(userAddress: UserAddress, chain: string): Promise<UserDepositAddress> {
    return this.http.get(`/user/${userAddress}/deposit-address`, { query: { chain } });
  }

  /** Mainnet-only in current Gateway deployments. */
  createDepositAddress(
    userAddress: UserAddress,
    input: CreateDepositAddressInput,
  ): Promise<UserDepositAddress> {
    return this.http.post(`/user/${userAddress}/deposit-address`, { body: input });
  }

  /** Partner-quota V2 address creation; mainnet-only. */
  createPartnerDepositAddress(
    userAddress: UserAddress,
    input: CreateDepositAddressInput,
    partnerApiKey: string,
  ): Promise<UserDepositAddress> {
    return this.partnerHttp.post(`/user/${userAddress}/deposit-address`, {
      body: input,
      headers: { "X-API-Key": partnerApiKey },
    });
  }

  getDepositStatus(chain: string, txHash: string): Promise<DepositWithdrawalHistory> {
    return this.http.get("/user/deposit/status", { query: { chain, txHash } });
  }

  getWithdrawStatus(
    chain: string,
    reference: { withdrawId?: string; txHash?: string },
  ): Promise<DepositWithdrawalHistory> {
    if (!reference.withdrawId && !reference.txHash) {
      throw new Error("withdrawId or txHash is required");
    }
    return this.http.get("/user/withdraw/status", {
      query: { chain, withdrawId: reference.withdrawId, txHash: reference.txHash },
    });
  }

  submitEvmWithdraw(
    userAddress: UserAddress,
    request: EvmWithdrawRequest,
  ): Promise<EvmWithdrawSubmission> {
    return this.http.post(`/user/${userAddress}/evm-withdraw`, { body: request });
  }

  addApiKey(
    userAddress: UserAddress,
    input: AddUserApiKeyInput,
    signed: UserSignedRequest,
  ): Promise<void> {
    return this.http.post(`/user/${userAddress}/api-keys`, {
      body: {
        accountID: input.accountId,
        name: input.name,
        type: 1,
        publicKey: input.publicKey,
        expiresAt: input.expiresAt,
        builder: input.builder
          ? { id: input.builder.builderId, fee: input.builder.feeRate }
          : undefined,
        permissions: input.permissions,
      },
      signed: userSignedHeaders(signed),
    });
  }

  async addApiKeyWithSigner(
    userAddress: UserAddress,
    input: AddUserApiKeyInput,
    signer: UserSigner,
    nonce?: bigint,
  ): Promise<void> {
    assertUserSigner(userAddress, signer);
    if (nonce !== undefined) {
      return this.addApiKey(userAddress, input, await signer.signAddApiKey(input, nonce));
    }
    return (signer.nonceManager ?? globalNonceManager).run(
      signer.nonceKey ?? signerNonceKey(signer.chainId, signer.address),
      async (managedNonce) =>
        this.addApiKey(userAddress, input, await signer.signAddApiKey(input, managedNonce)),
    );
  }

  revokeApiKey(
    userAddress: UserAddress,
    input: RevokeUserApiKeyInput,
    signed: UserSignedRequest,
  ): Promise<void> {
    return this.http.del(`/user/${userAddress}/api-keys`, {
      body: { accountID: input.accountId, name: input.name },
      signed: userSignedHeaders(signed),
    });
  }

  async revokeApiKeyWithSigner(
    userAddress: UserAddress,
    input: RevokeUserApiKeyInput,
    signer: UserSigner,
    nonce?: bigint,
  ): Promise<void> {
    assertUserSigner(userAddress, signer);
    if (nonce !== undefined) {
      return this.revokeApiKey(userAddress, input, await signer.signRevokeApiKey(input, nonce));
    }
    return (signer.nonceManager ?? globalNonceManager).run(
      signer.nonceKey ?? signerNonceKey(signer.chainId, signer.address),
      async (managedNonce) =>
        this.revokeApiKey(userAddress, input, await signer.signRevokeApiKey(input, managedNonce)),
    );
  }
}

function assertUserSigner(userAddress: UserAddress, signer: UserSigner): void {
  if (signer.address.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error(`user signer ${signer.address} does not match ${userAddress}`);
  }
}

function userSignedHeaders(input: UserSignedRequest): SignedHeaders {
  return {
    signature: input.signature,
    nonce: input.nonce,
    chainId: input.chainId,
  };
}
