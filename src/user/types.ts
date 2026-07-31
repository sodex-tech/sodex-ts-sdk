export type UserAddress = `0x${string}`;
export type HexString = `0x${string}`;
export type UserApiKeyType = "EVM";
export type UserStatusCode = "Active" | "UserNotFound";

export interface UserStatus {
  status: UserStatusCode;
  userID: bigint;
}

export interface ChainTransferConfig {
  chain: string;
  coinAddress: string;
  bridgeAddress: string;
  custodyWithdrawFee: string;
  bridgeWithdrawFee: string;
  minDepositAmount: string;
  minWithdrawAmount: string;
  custodyDisabled: boolean;
}

export interface CoinTransferConfig {
  /** Gateway may omit trading-engine metadata for an otherwise valid transfer asset. */
  id?: bigint;
  /** Gateway may omit trading-engine metadata for an otherwise valid transfer asset. */
  name?: string;
  coin: string;
  tokenAddress: UserAddress;
  decimals: bigint;
  chains: ChainTransferConfig[];
}

export interface UserDepositAddress {
  chain: string;
  address: string;
  status: string;
}

export interface CreateDepositAddressInput {
  chain: string;
}

export interface UserDepositAddresses {
  accountAddresses: UserDepositAddress[];
}

export interface DepositWithdrawalRecord {
  account: string;
  amount: string;
  chain: string;
  coin: string;
  decimals: bigint;
  failCode: string;
  failReason: string;
  n: string;
  receiver: string;
  reportAmount: string;
  sender: string;
  status: string;
  statusTime: bigint;
  stmp: bigint;
  token: string;
  txHash: string;
  originTxHash?: string;
  type: string;
  withdrawFee?: string;
  withdrawId?: bigint;
}

export interface DepositWithdrawalHistory {
  records: DepositWithdrawalRecord[];
  total: bigint;
}

export interface TransferHistoryFilters {
  start?: number;
  startTime?: bigint;
  endTime?: bigint;
  limit?: number;
  side?: "deposit" | "withdraw";
  token?: string;
  pending?: boolean;
  chain?: string;
  coinSymbol?: string;
}

export interface EvmWithdrawRequest {
  cmdData: HexString;
  nonce: string;
  deadline: string;
  signature: HexString;
}

export interface EvmWithdrawSubmission {
  txHash: HexString;
  senderAddress: UserAddress;
  senderNonce: bigint;
}

export interface UserApiKey {
  name: string;
  type: string;
  publicKey: string;
  expiresAt: bigint;
  permissions?: bigint;
}

export interface UserApiKeys {
  spot: UserApiKey[];
  perps: UserApiKey[];
}

export interface ApiKeyBuilderInput {
  builderId: bigint;
  feeRate: bigint;
}

export interface AddUserApiKeyInput {
  accountId: bigint;
  name: string;
  type: UserApiKeyType;
  publicKey: UserAddress;
  expiresAt: bigint;
  builder?: ApiKeyBuilderInput;
  permissions?: bigint;
}

export interface RevokeUserApiKeyInput {
  accountId: bigint;
  name: string;
}

export interface UserSignedRequest {
  signature: HexString;
  nonce: bigint;
  chainId?: bigint;
}

export interface UserBuilder {
  userID: bigint;
  builderID: bigint;
  feeRate: bigint;
}

export interface UserBuilders {
  spot: UserBuilder[];
  perps: UserBuilder[];
}

export interface ApproveBuilderInput {
  accountId: bigint;
  builderId: bigint;
  maxFeeRate: bigint;
}

export interface ApiKeyEligibility {
  eligible: boolean;
  accountValue: string;
}

export interface UserFeeRate {
  makerFeeRate: string;
  takerFeeRate: string;
  feeDiscount?: string;
  feeTier: bigint;
  stakingTier: bigint;
  makerRebateTier: bigint;
}

export interface UserTransactionQuota {
  userID: bigint;
  cumulativeTxNum: bigint;
  cumulativeCancelNum: bigint;
  cumulativeVolume: string;
  transactionQuota: bigint;
  transactionQuotaUsed: bigint;
  transactionQuotaRemaining: bigint;
  transactionQuotaOverridden: boolean;
  cancelQuota: bigint;
  cancelQuotaUsed: bigint;
  cancelQuotaRemaining: bigint;
}

export interface UserSubaccount {
  id: bigint;
  evmAddress: UserAddress;
}

export interface UserSubaccounts {
  userID: bigint;
  primaryAccountID: bigint;
  subaccounts: UserSubaccount[];
}

export type AnnouncementLanguage = "en" | "zh" | "ja" | "ko";

export interface AnnouncementArticle {
  id: bigint;
  externalId: string;
  style: string;
  title: string;
  label_names: string[];
  startTime: bigint;
  endTime: bigint;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface AnnouncementList {
  articles: AnnouncementArticle[];
  page: bigint;
  size: bigint;
  count: bigint;
}

export interface AnnouncementDetail extends AnnouncementArticle {
  body: string;
}
