export { SpotClient, createMonotonicNonce, type NonceProvider } from "./spot/client";
export type { SpotClientOptions } from "./spot/client";
export { SpotSigner } from "./spot/signer";
export type { SpotSignerOptions } from "./spot/signer";
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
  PerpsOrderItem,
  UpdateLeverageInput,
  UpdateMarginInput,
} from "./perps/actions";

export * from "./common/enums";
export * from "./common/errors";
export type {
  ApiKeyInfo,
  BatchCancelReceipt,
  BatchOrderReceipt,
  BatchReplaceReceipt,
  BookTicker,
  FeeRate,
  Kline,
  MiniTicker,
  OrderBook,
  PlaceOrderReceipt,
  Trade,
  TransferReceipt,
  UserTrade,
} from "./common/types";
export type {
  ReplaceOrderInput,
  ReplaceOrderItem,
  RevokeApiKeyInput,
  ScheduleCancelInput,
  TransferAssetInput,
} from "./spot/actions";
export { MAINNET_CHAIN_ID, TESTNET_CHAIN_ID } from "./common/eip712";
