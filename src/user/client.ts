import { HttpClient, type SignedHeaders } from "../common/http";
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
  UserFeeRate,
  UserSignedRequest,
  UserSubaccounts,
  UserTransactionQuota,
} from "./types";

export interface UserClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export class UserClient {
  readonly http: HttpClient;

  constructor(opts: UserClientOptions) {
    this.http = new HttpClient({
      baseUrl: `${opts.baseUrl.replace(/\/$/, "")}/api/v1`,
      fetch: opts.fetch,
    });
  }

  getSystemStatus(): Promise<string> {
    return this.http.get("/status");
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

  createDepositAddress(
    userAddress: UserAddress,
    input: CreateDepositAddressInput,
  ): Promise<UserDepositAddress> {
    return this.http.post(`/user/${userAddress}/deposit-address`, { body: input });
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

function userSignedHeaders(input: UserSignedRequest): SignedHeaders {
  return {
    signature: input.signature,
    nonce: input.nonce,
    chainId: input.chainId,
  };
}
