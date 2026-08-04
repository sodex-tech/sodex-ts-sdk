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
