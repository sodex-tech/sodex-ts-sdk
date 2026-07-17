export { SpotClient } from "./spot/client";
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
  PerpsNewTwapOrderInput,
  PerpsOrderItem,
  UpdateLeverageInput,
  UpdateMarginInput,
} from "./perps/actions";

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
} from "./ws";
