import { HttpClient, type RetryOptions, type SignedHeaders } from "../common/http";
import { globalNonceManager, signerNonceKey } from "../common/nonce";
import type { UserSigner } from "./signer";
import type {
  AddUserApiKeyInput,
  AnnouncementDetail,
  AnnouncementLanguage,
  AnnouncementList,
  ApiKeyEligibility,
  ApproveBuilderInput,
  ChainTransferConfig,
  CoinTransferConfig,
  CreateDepositAddressInput,
  DepositWithdrawalHistory,
  EvmWithdrawRequest,
  EvmWithdrawSubmission,
  RevokeUserApiKeyInput,
  TransferHistoryFilters,
  UserAddress,
  UserApiKeys,
  UserBuilders,
  UserDepositAddress,
  UserDepositAddresses,
  UserFeeRate,
  UserSignedRequest,
  UserStatus,
  UserSubaccounts,
  UserTransactionQuota,
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

  getSystemStatus(): Promise<string> {
    return this.http.get("/status");
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

  /** Create custody addresses for every supported chain; mainnet-only. */
  createDepositAddresses(userAddress: UserAddress): Promise<UserDepositAddresses> {
    return this.http.post(`/user/${userAddress}/deposit-addresses`);
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

  /** Partner-quota V2 all-chain address creation; mainnet-only. */
  createPartnerDepositAddresses(
    userAddress: UserAddress,
    partnerApiKey: string,
  ): Promise<UserDepositAddresses> {
    return this.partnerHttp.post(`/user/${userAddress}/deposit-addresses`, {
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

  getTransferHistory(
    userAddress: UserAddress,
    filters: TransferHistoryFilters = {},
  ): Promise<DepositWithdrawalHistory> {
    return this.http.get(`/user/${userAddress}/deposit-withdrawals`, {
      query: {
        start: filters.start,
        startTime: filters.startTime,
        endTime: filters.endTime,
        limit: filters.limit,
        side: filters.side,
        token: filters.token,
        pending: filters.pending,
        chain: filters.chain,
        coinSymbol: filters.coinSymbol,
      },
    });
  }

  submitEvmWithdraw(
    userAddress: UserAddress,
    request: EvmWithdrawRequest,
  ): Promise<EvmWithdrawSubmission> {
    return this.http.post(`/user/${userAddress}/evm-withdraw`, { body: request });
  }

  getApiKeys(userAddress: UserAddress, name?: string): Promise<UserApiKeys> {
    return this.http.get(`/user/${userAddress}/api-keys`, { query: { name } });
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

  getBuilders(userAddress: UserAddress): Promise<UserBuilders> {
    return this.http.get(`/user/${userAddress}/builders`);
  }

  approveBuilderFee(
    userAddress: UserAddress,
    input: ApproveBuilderInput,
    signed: UserSignedRequest,
  ): Promise<void> {
    return this.http.post(`/user/${userAddress}/builders`, {
      body: {
        accountID: input.accountId,
        builderID: input.builderId,
        maxFeeRate: input.maxFeeRate,
      },
      signed: userSignedHeaders(signed),
    });
  }

  async approveBuilderFeeWithSigner(
    userAddress: UserAddress,
    input: ApproveBuilderInput,
    signer: UserSigner,
    nonce?: bigint,
  ): Promise<void> {
    assertUserSigner(userAddress, signer);
    if (nonce !== undefined) {
      return this.approveBuilderFee(
        userAddress,
        input,
        await signer.signApproveBuilderFee(input, nonce),
      );
    }
    return (signer.nonceManager ?? globalNonceManager).run(
      signer.nonceKey ?? signerNonceKey(signer.chainId, signer.address),
      async (managedNonce) =>
        this.approveBuilderFee(
          userAddress,
          input,
          await signer.signApproveBuilderFee(input, managedNonce),
        ),
    );
  }

  getApiKeyEligibility(userAddress: UserAddress): Promise<ApiKeyEligibility> {
    return this.http.get(`/user/${userAddress}/api-key-eligibility`);
  }

  getFeeRate(
    userAddress: UserAddress,
    market: "spot" | "perps",
    symbol?: string,
  ): Promise<UserFeeRate> {
    return this.http.get(`/user/${userAddress}/fee-rate`, { query: { market, symbol } });
  }

  getRateLimit(userAddress: UserAddress): Promise<UserTransactionQuota> {
    return this.http.get(`/user/${userAddress}/ratelimit`);
  }

  getSubaccounts(userAddress: UserAddress): Promise<UserSubaccounts> {
    return this.http.get(`/user/${userAddress}/subaccounts`);
  }

  getAnnouncements(
    params: { page?: number; size?: number; lang?: AnnouncementLanguage } = {},
  ): Promise<AnnouncementList> {
    return this.http.get("/announcements", { query: params });
  }

  getAnnouncementDetail(
    id: bigint | number | string,
    params: { lang?: AnnouncementLanguage; plainText?: boolean } = {},
  ): Promise<AnnouncementDetail> {
    return this.http.get(`/announcements/detail/${encodeURIComponent(id.toString())}`, {
      query: params,
    });
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
