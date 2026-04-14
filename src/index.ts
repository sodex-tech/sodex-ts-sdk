export { SpotClient, createMonotonicNonce, type NonceProvider } from "./spot/client";
export { SpotSigner } from "./spot/signer";
export type {
  SpotAccountBalance,
  SpotAccountBalances,
  SpotCoinInfo,
  SpotOrder,
  SpotSymbolInfo,
  SpotTicker,
} from "./spot/types";

export { PerpsClient } from "./perps/client";
export { PerpsSigner } from "./perps/signer";
export type {
  FundingPayment,
  MarkPriceTicker,
  MarginTier,
  PerpsCoinInfo,
  PerpsOrder,
  PerpsPosition,
  PerpsSymbolInfo,
  PerpsTicker,
} from "./perps/types";

export * from "./common/enums";
export * from "./common/errors";
export type { BookTicker, Kline, MiniTicker, OrderBook, Trade, UserTrade } from "./common/types";
export { MAINNET_CHAIN_ID, TESTNET_CHAIN_ID } from "./common/eip712";
