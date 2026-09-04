export { SpotClient } from "./spot/client";
export type { SpotClientOptions } from "./spot/client";
export { SpotSigner } from "./spot/signer";
export type { SpotSignerOptions } from "./spot/signer";
export { waitForSpotBalanceChange } from "./spot/wait";
export type { WaitForSpotBalanceChangeOptions } from "./spot/wait";
export type {
  SpotAccountBalance,
  SpotAccountBalances,
  SpotAccountSnapshot,
  SpotCoinInfo,
  SpotOrder,
  SpotSnapshotBalance,
  SpotSnapshotOrder,
  SpotSymbolInfo,
  SpotTicker,
} from "./spot/types";

export { PerpsClient } from "./perps/client";
export type { PerpsClientOptions } from "./perps/client";
export { PerpsSigner } from "./perps/signer";
export type { PerpsSignerOptions } from "./perps/signer";
export { waitForPerpsBalanceChange } from "./perps/wait";
export type { WaitForPerpsBalanceChangeOptions } from "./perps/wait";
export type {
  FundingPayment,
  MarkPriceTicker,
  MarginTier,
  PerpsAccountBalance,
  PerpsAccountBalances,
  PerpsAccountSnapshot,
  PerpsCoinInfo,
  PerpsExecType,
  PerpsOpenPositions,
  PerpsOrder,
  PerpsPosition,
  PerpsSnapshotBalance,
  PerpsSnapshotOrder,
  PerpsSnapshotPosition,
  PerpsSnapshotSymbolConfig,
  PerpsSymbolInfo,
  PerpsTicker,
} from "./perps/types";
export type {
  PerpsCancelItem,
  PerpsCancelOrderInput,
  PerpsModifyOrderInput,
  PerpsNewOrderInput,
  PerpsNewTwapOrderInput,
  PerpsOrderItem,
  UpdateLeverageInput,
  UpdateMarginInput,
} from "./perps/actions";

export { UserClient } from "./user/client";
export type { UserClientOptions } from "./user/client";
export { LocalUserSigner } from "./user/signer";
export {
  isSuccessfulTransferStatus,
  isTerminalTransferStatus,
  waitForDeposit,
  waitForDepositAddress,
  waitForWithdrawal,
} from "./user/wait";
export type {
  WaitForDepositAddressOptions,
  WaitForTransferOptions,
} from "./user/wait";
export type {
  BuiltDepositTransaction,
  DepositAdapter,
  DepositBuildInput,
  DepositSubmission,
} from "./user/deposit";
export type {
  BuilderFeeSigner,
  LocalUserSignerOptions,
  UserSigner,
} from "./user/signer";
export type {
  AddUserApiKeyInput,
  ApiKeyBuilderInput,
  ApproveBuilderFeeInput,
  ChainTransferConfig,
  CoinTransferConfig,
  CreateDepositAddressInput,
  DepositWithdrawalHistory,
  DepositWithdrawalRecord,
  EvmWithdrawRequest,
  EvmWithdrawSubmission,
  HexString,
  RevokeUserApiKeyInput,
  UserAddress,
  UserApiKeyType,
  UserDepositAddress,
  UserSignedRequest,
  UserStatus,
  UserStatusCode,
} from "./user/types";

export * from "./common/enums";
export * from "./common/errors";
export type {
  AccountTwapOrders,
  ApiKeyInfo,
  BatchCancelReceipt,
  BatchOrderReceipt,
  BatchReplaceReceipt,
  BookTicker,
  FeeRate,
  Kline,
  KlineInterval,
  MiniTicker,
  OrderBook,
  PlaceOrderReceipt,
  Trade,
  TransferReceipt,
  TwapOrder,
  TwapOrderReceipt,
  UserTrade,
} from "./common/types";
export {
  klineIntervalMs,
  parseAccountTwapOrders,
  parseKline,
  parseTwapOrder,
  parseTwapOrderReceipt,
} from "./common/types";
export { getServerTime } from "./common/time";
export {
  createMonotonicNonce,
  createNonceManager,
  globalNonceManager,
  nowMillis,
  signerNonceKey,
} from "./common/nonce";
export type {
  NonceManager,
  NonceManagerOptions,
  NonceProvider,
} from "./common/nonce";
export type { RetryOptions } from "./common/http";
export {
  WaitAbortedError,
  WaitTimeoutError,
  pollUntil,
} from "./common/wait";
export type { PollOptions } from "./common/wait";
export type {
  CancelTwapOrderInput,
  ReplaceOrderInput,
  ReplaceOrderItem,
  RevokeApiKeyInput,
  ScheduleCancelInput,
  SpotNewTwapOrderInput,
  TransferAssetInput,
} from "./spot/actions";
export { MAINNET_CHAIN_ID, TESTNET_CHAIN_ID } from "./common/eip712";
export type { Signer } from "./common/signer";
export { TypedDataSigner, wireSigFromExternal } from "./common/typed-data-signer";
export type {
  Eip712TypedData,
  SignTypedDataFn,
  TypedDataSignerOptions,
} from "./common/typed-data-signer";

export { SpotWsClient, PerpsWsClient, WsError, WsConnectionError, WsProtocolError } from "./ws";
export type {
  WsClientOptions,
  WsLifecycleEvents,
  WsOrderBook,
  WsOrderBookUpdate,
  WsCoinPrice,
  WsTwapOrder,
  WsSpotAccountUpdate,
  WsPerpsAccountUpdate,
  WsSpotOrderUpdate,
  WsPerpsOrderUpdate,
  WsSpotAccountTrade,
  WsPerpsAccountTrade,
  WsLiquidationEvent,
  SpotAccountSubscribeOptions,
  PerpsAccountSubscribeOptions,
  TickerPushIntervalMs,
  CandlePushIntervalMs,
  BookPushIntervalMs,
  WsSubscription,
  WsSubscriptionOptions,
} from "./ws";
