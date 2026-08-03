import type { ActionPayload } from "../common/action-payload";
import { payloadBody } from "../common/action-payload";
import { bytesToHex, hexToBytes } from "../common/bytes";
import {
  MAINNET_CHAIN_ID,
  UNIVERSAL_DOMAIN_NAME,
  addApiKeyStructHash,
  eip712Digest,
  makeDomain,
} from "../common/eip712";
import {
  type ApiKeyType,
  apiKeyTypeToCode,
  marginModeFromName,
  orderSideFromName,
  orderStatusFromName,
  orderTypeFromName,
  positionSideFromName,
  stopTypeFromName,
  symbolStatusFromName,
  timeInForceFromName,
  triggerTypeFromName,
} from "../common/enums";
import { HttpClient, type RetryOptions } from "../common/http";
import {
  type NonceManager,
  type NonceProvider,
  createMonotonicNonce,
  globalNonceManager,
  signerNonceKey,
} from "../common/nonce";
import {
  SIG_TYPE_ADD_API_KEY,
  type Signer,
  addressFromPrivateKey,
  signDigest,
} from "../common/signer";
import {
  type AccountTwapOrders,
  type ApiKeyInfo,
  type BatchCancelReceipt,
  type BatchOrderReceipt,
  type BatchReplaceReceipt,
  type BookTicker,
  type FeeRate,
  type Kline,
  type KlineInterval,
  type MiniTicker,
  type OrderBook,
  type PlaceOrderReceipt,
  type Trade,
  type TransferReceipt,
  type TwapOrderReceipt,
  type UserTrade,
  type WireRecord,
  optBigInt,
  optBigIntArray,
  optEnum,
  optString,
  parseAccountTwapOrders,
  parseApiKey,
  parseBatchCancelReceipt,
  parseBatchOrderReceipt as parseBatchReceipt,
  parseBatchReplaceReceipt,
  parseBookTicker,
  parseFeeRate,
  parseKline,
  parseMiniTicker,
  parseOrderBook,
  parseTrade,
  parseTwapOrderReceipt,
  parseUserTrade,
  parseWireArray,
  parseWireList,
  requireBoolean,
  requireWireField,
} from "../common/types";
import { CoinRegistry } from "../registry/coin-registry";
import { type SymbolRef, SymbolRegistry } from "../registry/symbol-registry";
// Import from the specific file (not the barrel) to avoid a cycle; see the
// matching note in spot/client.
import { parseWsTwapOrder } from "../ws/parsers/twap-order";
import {
  type CancelTwapOrderInput,
  type PerpsCancelOrderInput,
  type PerpsModifyOrderInput,
  type PerpsNewOrderInput,
  type PerpsNewTwapOrderInput,
  type ReplaceOrderInput,
  type RevokeApiKeyInput,
  type ScheduleCancelInput,
  type TransferAssetInput,
  type UpdateLeverageInput,
  type UpdateMarginInput,
  buildCancelTwapPayload,
  buildPerpsCancelOrderPayload,
  buildPerpsModifyOrderPayload,
  buildPerpsNewOrderPayload,
  buildPerpsTwapOrderPayload,
  buildReplaceOrderPayload,
  buildRevokeApiKeyPayload,
  buildScheduleCancelPayload,
  buildTransferAssetPayload,
  buildUpdateLeveragePayload,
  buildUpdateMarginPayload,
} from "./actions";
import type {
  FundingPayment,
  MarkPriceTicker,
  PerpsAccountBalance,
  PerpsAccountBalances,
  PerpsAccountSnapshot,
  PerpsCoinInfo,
  PerpsOpenPositions,
  PerpsOrder,
  PerpsPosition,
  PerpsSnapshotBalance,
  PerpsSnapshotOrder,
  PerpsSnapshotPosition,
  PerpsSnapshotSymbolConfig,
  PerpsSymbolInfo,
  PerpsTicker,
} from "./types";

const autoTransferId = createMonotonicNonce();

export interface PerpsClientOptions {
  baseUrl: string;
  chainId?: bigint;
  /**
   * Action signer. Accepts any `Signer` implementation — `PerpsSigner`
   * for local-key signing, `TypedDataSigner` for wallet flows (Privy,
   * viem, ethers, WalletConnect, hardware wallets).
   */
  signer?: Signer;
  apiKeyName?: string;
  fetch?: typeof fetch;
  /** HTTP request timeout in milliseconds. Defaults to 10 seconds; `null` disables it. */
  timeoutMs?: number | null;
  /** Optional GET-only retry policy. Signed writes are never retried. */
  retry?: boolean | RetryOptions;
  /** Legacy nonce override. When set, it takes precedence over `nonceManager`. */
  nonce?: NonceProvider;
  /** Shared nonce allocator/serializer. Defaults to the process-wide manager. */
  nonceManager?: NonceManager;
  symbols?: PerpsSymbolInfo[];
  coins?: PerpsCoinInfo[];
}

export class PerpsClient {
  readonly http: HttpClient;
  readonly symbols: SymbolRegistry;
  readonly coins: CoinRegistry;
  readonly chainId: bigint;
  private readonly signer?: Signer;
  private readonly apiKeyName: string;
  private readonly nonce?: NonceProvider;
  private readonly nonceManager: NonceManager;

  constructor(opts: PerpsClientOptions) {
    this.http = new HttpClient({
      baseUrl: `${opts.baseUrl.replace(/\/$/, "")}/api/v1/perps`,
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      retry: opts.retry,
    });
    this.chainId = opts.chainId ?? MAINNET_CHAIN_ID;
    this.signer = opts.signer;
    this.apiKeyName = opts.apiKeyName ?? "default";
    this.nonce = opts.nonce;
    this.nonceManager = opts.nonceManager ?? globalNonceManager;
    this.symbols = new SymbolRegistry(() => this.fetchSymbols());
    this.coins = new CoinRegistry(() => this.fetchCoins());
    if (opts.symbols) this.symbols.load(opts.symbols);
    if (opts.coins) this.coins.load(opts.coins);
  }

  async refreshMarkets(): Promise<void> {
    await Promise.all([this.symbols.refresh(), this.coins.refresh()]);
  }

  async getSymbols(symbol?: string): Promise<PerpsSymbolInfo[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/symbols", { query: { symbol } });
    return parseWireList(raw, "getSymbols", parsePerpsSymbol);
  }

  async getCoins(coin?: string): Promise<PerpsCoinInfo[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/coins", { query: { coin } });
    return parseWireList(raw, "getCoins", parsePerpsCoin);
  }

  async getTickers(symbol?: string): Promise<PerpsTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/tickers", { query: { symbol } });
    return parseWireList(raw, "getTickers", parsePerpsTicker);
  }

  async getMiniTickers(symbol?: string): Promise<MiniTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/miniTickers", { query: { symbol } });
    return parseWireList(raw, "getMiniTickers", parseMiniTicker);
  }

  async getMarkPrices(symbol?: string): Promise<MarkPriceTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/mark-prices", { query: { symbol } });
    return parseWireList(raw, "getMarkPrices", parseMarkPrice);
  }

  async getBookTickers(symbol?: string): Promise<BookTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/bookTickers", { query: { symbol } });
    return parseWireList(raw, "getBookTickers", parseBookTicker);
  }

  async getOrderBook(symbol: SymbolRef, limit?: number): Promise<OrderBook> {
    const name = await this.resolveWireName(symbol);
    const raw = await this.http.get<WireRecord>(`/markets/${encodeURIComponent(name)}/orderbook`, {
      query: { limit },
    });
    return parseOrderBook(raw, { symbol: name });
  }

  async getKlines(
    symbol: SymbolRef,
    params: { interval: KlineInterval; startTime?: bigint; endTime?: bigint; limit?: number },
    options?: { signal?: AbortSignal },
  ): Promise<Kline[]> {
    const name = await this.resolveWireName(symbol);
    const raw = await this.http.get<WireRecord[]>(`/markets/${encodeURIComponent(name)}/klines`, {
      query: { ...params },
      signal: options?.signal,
    });
    return parseWireList(raw, "getKlines", (r) =>
      parseKline(r, { symbol: name, interval: params.interval }),
    );
  }

  async getRecentTrades(symbol: SymbolRef, limit?: number): Promise<Trade[]> {
    const name = await this.resolveWireName(symbol);
    const raw = await this.http.get<WireRecord[]>(`/markets/${encodeURIComponent(name)}/trades`, {
      query: { limit },
    });
    return parseWireList(raw, "getRecentTrades", parseTrade);
  }

  async getBalances(userAddress: string, accountId?: bigint): Promise<PerpsAccountBalances> {
    const raw = await this.http.get<any>(`/accounts/${userAddress}/balances`, {
      query: { accountID: accountId },
    });
    return parsePerpsBalances(raw);
  }

  async getOpenOrders(
    userAddress: string,
    params: { symbol?: string; accountId?: bigint } = {},
  ): Promise<PerpsOrder[]> {
    // Wire: `PerpsAccountOpenOrder` envelope `{blockTime, blockHeight, orders}`
    // per sodex-docs/rest-v1/schema.md#perpsaccountopenorder. We surface only
    // the `orders` list for now; block metadata is intentionally dropped.
    //
    // Server emits `"orders": null` for accounts with no open orders (Go
    // `nil` slice convention); `parseWireArray` normalizes that to `[]`.
    const raw = await this.http.get<WireRecord>(`/accounts/${userAddress}/orders`, {
      query: { symbol: params.symbol, accountID: params.accountId },
    });
    return parseWireArray(raw, "getOpenOrders", "orders", parsePerpsOrder);
  }

  async getOpenPositions(
    userAddress: string,
    params: { symbol?: string; accountId?: bigint } = {},
  ): Promise<PerpsOpenPositions> {
    const raw = await this.http.get<any>(`/accounts/${userAddress}/positions`, {
      query: { symbol: params.symbol, accountID: params.accountId },
    });
    return parsePerpsOpenPositions(raw);
  }

  async getAccountState(userAddress: string, accountId?: bigint): Promise<PerpsAccountSnapshot> {
    const raw = await this.http.get<any>(`/accounts/${userAddress}/state`, {
      query: { accountID: accountId },
    });
    return parsePerpsAccountSnapshot(raw);
  }

  async getApiKeys(
    userAddress: string,
    params: { accountId?: bigint; name?: string } = {},
  ): Promise<ApiKeyInfo[]> {
    // Server may send `data: null` for an account with no API keys; the
    // HttpClient unwraps that to `undefined`, which `parseWireList`
    // normalizes to `[]` (rather than crashing on `raw.map`).
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/api-keys`, {
      query: { accountID: params.accountId, name: params.name },
    });
    return parseWireList(raw, "getApiKeys", parseApiKey);
  }

  async getFeeRate(
    userAddress: string,
    params: { accountId?: bigint; symbol?: string } = {},
  ): Promise<FeeRate> {
    const raw = await this.http.get<any>(`/accounts/${userAddress}/fee-rate`, {
      query: { accountID: params.accountId, symbol: params.symbol },
    });
    return parseFeeRate(raw);
  }

  async getOrderHistory(
    userAddress: string,
    params: {
      accountId?: bigint;
      symbol?: string;
      startTime?: bigint;
      endTime?: bigint;
      limit?: number;
    } = {},
  ): Promise<PerpsOrder[]> {
    // Returns `[]` when the server sends `data: null` (no history).
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/orders/history`, {
      query: {
        accountID: params.accountId,
        symbol: params.symbol,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return parseWireList(raw, "getOrderHistory", parsePerpsOrder);
  }

  async getPositionHistory(
    userAddress: string,
    params: {
      accountId?: bigint;
      symbol?: string;
      startTime?: bigint;
      endTime?: bigint;
      limit?: number;
    } = {},
  ): Promise<PerpsPosition[]> {
    // Returns `[]` when the server sends `data: null` (no history).
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/positions/history`, {
      query: {
        accountID: params.accountId,
        symbol: params.symbol,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return parseWireList(raw, "getPositionHistory", parsePerpsPosition);
  }

  async getUserTrades(
    userAddress: string,
    params: {
      accountId?: bigint;
      symbol?: string;
      orderId?: bigint;
      startTime?: bigint;
      endTime?: bigint;
      limit?: number;
    } = {},
  ): Promise<UserTrade[]> {
    // Returns `[]` when the server sends `data: null` (no trades).
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/trades`, {
      query: {
        accountID: params.accountId,
        symbol: params.symbol,
        orderID: params.orderId,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return parseWireList(raw, "getUserTrades", parseUserTrade);
  }

  async getFundingHistory(
    userAddress: string,
    params: {
      accountId?: bigint;
      symbol?: string;
      startTime?: bigint;
      endTime?: bigint;
      limit?: number;
    } = {},
  ): Promise<FundingPayment[]> {
    // Returns `[]` when the server sends `data: null` (no history).
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/fundings`, {
      query: {
        accountID: params.accountId,
        symbol: params.symbol,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return parseWireList(raw, "getFundingHistory", parseFunding);
  }

  async placeOrders(
    input: Omit<PerpsNewOrderInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<BatchOrderReceipt[]> {
    const { symbol, ...rest } = input;
    const payload = buildPerpsNewOrderPayload({
      ...rest,
      symbolId: this.symbols.resolveId(symbol),
    });
    const raw = await this.signedPost<any[]>("/trade/orders", payload);
    return raw.map(parseBatchReceipt);
  }

  async placeOrder(
    input: { accountId: bigint; symbol: SymbolRef } & PerpsNewOrderInput["orders"][number],
  ): Promise<PlaceOrderReceipt> {
    const { accountId, symbol, ...order } = input;
    const [receipt] = await this.placeOrders({
      accountId,
      symbol,
      orders: [order],
    });
    if (!receipt) throw new Error("PerpsClient.placeOrder: server returned empty batch receipt");
    return receipt;
  }

  async cancelOrders(
    input: Omit<PerpsCancelOrderInput, "cancels"> & {
      cancels: Array<
        Omit<PerpsCancelOrderInput["cancels"][number], "symbolId"> & {
          symbol: SymbolRef;
        }
      >;
    },
  ): Promise<BatchCancelReceipt[]> {
    const payload = buildPerpsCancelOrderPayload({
      accountId: input.accountId,
      cancels: input.cancels.map(({ symbol, ...r }) => ({
        ...r,
        symbolId: this.symbols.resolveId(symbol),
      })),
    });
    const raw = await this.signedDelete<any[]>("/trade/orders", payload);
    return raw.map(parseBatchCancelReceipt);
  }

  async placeTwapOrder(
    input: Omit<PerpsNewTwapOrderInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<TwapOrderReceipt> {
    const { symbol, ...rest } = input;
    const payload = buildPerpsTwapOrderPayload({
      ...rest,
      symbolId: this.symbols.resolveId(symbol),
    });
    const raw = await this.signedPost<WireRecord>("/trade/twaps", payload);
    return parseTwapOrderReceipt(raw);
  }

  async cancelTwapOrder(
    input: Omit<CancelTwapOrderInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<TwapOrderReceipt> {
    const { symbol, ...rest } = input;
    const payload = buildCancelTwapPayload({ ...rest, symbolId: this.symbols.resolveId(symbol) });
    const raw = await this.signedDelete<WireRecord>("/trade/twaps", payload);
    return parseTwapOrderReceipt(raw);
  }

  async getTwapOrders(
    userAddress: string,
    params: { symbol?: string; accountId?: bigint } = {},
  ): Promise<AccountTwapOrders> {
    const raw = await this.http.get<WireRecord>(`/accounts/${userAddress}/twaps`, {
      query: { symbol: params.symbol, accountID: params.accountId },
    });
    return parseAccountTwapOrders(raw);
  }

  async replaceOrders(
    input: Omit<ReplaceOrderInput, "orders"> & {
      orders: Array<Omit<ReplaceOrderInput["orders"][number], "symbolId"> & { symbol: SymbolRef }>;
    },
  ): Promise<BatchReplaceReceipt[]> {
    const payload = buildReplaceOrderPayload({
      accountId: input.accountId,
      orders: input.orders.map(({ symbol, ...r }) => ({
        ...r,
        symbolId: this.symbols.resolveId(symbol),
      })),
    });
    const raw = await this.signedPost<any[]>("/trade/orders/replace", payload);
    return raw.map(parseBatchReplaceReceipt);
  }

  async modifyOrder(
    input: Omit<PerpsModifyOrderInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<void> {
    const { symbol, ...rest } = input;
    const payload = buildPerpsModifyOrderPayload({
      ...rest,
      symbolId: this.symbols.resolveId(symbol),
    });
    await this.signedPost("/trade/orders/modify", payload);
  }

  async scheduleCancel(input: ScheduleCancelInput): Promise<void> {
    await this.signedPost("/trade/orders/schedule-cancel", buildScheduleCancelPayload(input));
  }

  async updateLeverage(
    input: Omit<UpdateLeverageInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<void> {
    const { symbol, ...rest } = input;
    const payload = buildUpdateLeveragePayload({
      ...rest,
      symbolId: this.symbols.resolveId(symbol),
    });
    await this.signedPost("/trade/leverage", payload);
  }

  async updateMargin(
    input: Omit<UpdateMarginInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<void> {
    const { symbol, ...rest } = input;
    const payload = buildUpdateMarginPayload({
      ...rest,
      symbolId: this.symbols.resolveId(symbol),
    });
    await this.signedPost("/trade/margin", payload);
  }

  async transferAsset(
    input: Omit<TransferAssetInput, "coinId" | "id"> & { coin: string | bigint; id?: bigint },
  ): Promise<TransferReceipt> {
    const { coin, id, ...rest } = input;
    const coinId = typeof coin === "bigint" ? coin : this.coins.resolveId(coin);
    const payload = buildTransferAssetPayload({ ...rest, coinId, id: id ?? autoTransferId() });
    const raw = await this.signedPost<WireRecord>("/accounts/transfers", payload);
    requireWireField(raw, "transferAsset", "id");
    return { id: BigInt(raw.id) };
  }

  async revokeApiKey(input: RevokeApiKeyInput): Promise<void> {
    await this.signedDelete("/accounts/api-keys", buildRevokeApiKeyPayload(input));
  }

  async addApiKey(
    input: {
      accountId: bigint;
      name: string;
      type: ApiKeyType;
      publicKey: Uint8Array;
      expiresAt: bigint;
    },
    opts: {
      masterPrivateKey: Uint8Array | string;
      chainId?: bigint;
      apiKeyName?: string;
    },
  ): Promise<void> {
    const chainId = opts.chainId ?? this.chainId;
    const keyBytes =
      typeof opts.masterPrivateKey === "string"
        ? hexToBytes(opts.masterPrivateKey)
        : opts.masterPrivateKey;
    await this.withNonce(
      signerNonceKey(chainId, addressFromPrivateKey(keyBytes)),
      async (nonce) => {
        const domain = makeDomain(UNIVERSAL_DOMAIN_NAME, chainId);
        const structHash = addApiKeyStructHash({
          accountId: input.accountId,
          name: input.name,
          keyType: apiKeyTypeToCode(input.type),
          publicKey: input.publicKey,
          expiresAt: input.expiresAt,
          nonce,
        });
        const digest = eip712Digest(domain, structHash);
        const wireSig = signDigest(digest, keyBytes, SIG_TYPE_ADD_API_KEY);
        await this.http.post("/accounts/api-keys", {
          body: {
            accountID: input.accountId,
            name: input.name,
            type: apiKeyTypeToCode(input.type),
            publicKey: bytesToHex(input.publicKey),
            expiresAt: input.expiresAt,
          },
          signed: {
            key: opts.apiKeyName ?? "default",
            signature: bytesToHex(wireSig),
            nonce,
            chainId,
          },
        });
      },
    );
  }

  private async signedPost<T>(path: string, payload: ActionPayload): Promise<T> {
    return this.sign("POST", path, payload);
  }

  private async signedDelete<T>(path: string, payload: ActionPayload): Promise<T> {
    return this.sign("DELETE", path, payload);
  }

  private async sign<T>(
    method: "POST" | "DELETE",
    path: string,
    payload: ActionPayload,
  ): Promise<T> {
    if (!this.signer) {
      throw new Error("PerpsClient: signer not configured — pass `signer` in constructor options");
    }
    return this.withNonce(signerNonceKey(this.chainId, this.signer.address), async (nonce) => {
      const wireSig = await this.signer!.sign(payload, nonce);
      const bodyText = payloadBody(payload);
      const opts = {
        bodyText,
        signed: {
          key: this.apiKeyName,
          signature: bytesToHex(wireSig),
          nonce,
        },
      };
      return method === "POST" ? this.http.post<T>(path, opts) : this.http.del<T>(path, opts);
    });
  }

  private withNonce<T>(key: string, task: (nonce: bigint) => Promise<T>): Promise<T> {
    return this.nonce ? task(this.nonce()) : this.nonceManager.run(key, task);
  }

  private async resolveWireName(ref: SymbolRef): Promise<string> {
    if (typeof ref === "bigint") {
      if (!this.symbols.isLoaded()) await this.symbols.refresh();
      return this.symbols.find(ref).name;
    }
    if (this.symbols.isLoaded()) return this.symbols.find(ref).name;
    return ref;
  }

  private async fetchSymbols(): Promise<PerpsSymbolInfo[]> {
    return this.getSymbols();
  }

  private async fetchCoins(): Promise<PerpsCoinInfo[]> {
    return this.getCoins();
  }
}

/**
 * Parse `PerpsSymbol` from wire (sodex-docs/rest-v1/schema.md#perpssymbol).
 * 29 required scalar fields + `marginTiers` (spec-required array,
 * server-observed nullable) + 2 optional (`openInterestCap`,
 * `openInterestCapUSD`). Wire `null` on `marginTiers` is normalized to
 * `[]` so the SDK shape stays `MarginTier[]`.
 */
export function parsePerpsSymbol(raw: WireRecord): PerpsSymbolInfo {
  for (const key of [
    "id",
    "name",
    "displayName",
    "baseCoin",
    "quoteCoinID",
    "quoteCoin",
    "quoteCoinPrecision",
    "pricePrecision",
    "tickSize",
    "minPrice",
    "maxPrice",
    "quantityPrecision",
    "stepSize",
    "minQuantity",
    "maxQuantity",
    "marketMinQuantity",
    "marketMaxQuantity",
    "minNotional",
    "maxNotional",
    "buyLimitUpRatio",
    "sellLimitDownRatio",
    "marketDeviationRatio",
    "maxLeverage",
    "initLeverage",
    "fundingInterval",
    "interestRate",
    "maxFundingRate",
    "minFundingRate",
    "makerFee",
    "takerFee",
    "status",
  ] as const) {
    requireWireField(raw, "parsePerpsSymbol", key);
  }
  return {
    id: BigInt(raw.id),
    name: String(raw.name),
    displayName: String(raw.displayName),
    baseCoin: String(raw.baseCoin),
    quoteCoinId: BigInt(raw.quoteCoinID),
    quoteCoin: String(raw.quoteCoin),
    quoteCoinPrecision: Number(raw.quoteCoinPrecision),
    pricePrecision: Number(raw.pricePrecision),
    tickSize: String(raw.tickSize),
    minPrice: String(raw.minPrice),
    maxPrice: String(raw.maxPrice),
    quantityPrecision: Number(raw.quantityPrecision),
    stepSize: String(raw.stepSize),
    minQuantity: String(raw.minQuantity),
    maxQuantity: String(raw.maxQuantity),
    marketMinQuantity: String(raw.marketMinQuantity),
    marketMaxQuantity: String(raw.marketMaxQuantity),
    minNotional: String(raw.minNotional),
    maxNotional: String(raw.maxNotional),
    buyLimitUpRatio: String(raw.buyLimitUpRatio),
    sellLimitDownRatio: String(raw.sellLimitDownRatio),
    marketDeviationRatio: String(raw.marketDeviationRatio),
    maxLeverage: Number(raw.maxLeverage),
    initLeverage: Number(raw.initLeverage),
    marginTiers: parseWireArray(raw, "parsePerpsSymbol", "marginTiers", parseMarginTier),
    fundingInterval: Number(raw.fundingInterval),
    interestRate: String(raw.interestRate),
    maxFundingRate: String(raw.maxFundingRate),
    minFundingRate: String(raw.minFundingRate),
    makerFee: String(raw.makerFee),
    takerFee: String(raw.takerFee),
    status: symbolStatusFromName(raw.status),
    openInterestCap: optString(raw, "openInterestCap"),
    openInterestCapUSD: optString(raw, "openInterestCapUSD"),
  };
}

/**
 * Parse `MarginTier` from wire
 * (sodex-docs/rest-v1/schema.md#margintier). All 4 fields required.
 */
function parseMarginTier(t: WireRecord) {
  requireWireField(t, "parseMarginTier", "maxNotionalValue");
  requireWireField(t, "parseMarginTier", "maintenanceMarginRate");
  requireWireField(t, "parseMarginTier", "maxLeverage");
  requireWireField(t, "parseMarginTier", "maintenanceDeduction");
  return {
    maxNotionalValue: String(t.maxNotionalValue),
    maintenanceMarginRate: String(t.maintenanceMarginRate),
    maxLeverage: Number(t.maxLeverage),
    maintenanceDeduction: String(t.maintenanceDeduction),
  };
}

/**
 * Parse `PerpsCoin` from wire (sodex-docs/rest-v1/schema.md#perpscoin).
 * 4 required + 1 optional (`price`).
 */
export function parsePerpsCoin(raw: WireRecord): PerpsCoinInfo {
  requireWireField(raw, "parsePerpsCoin", "id");
  requireWireField(raw, "parsePerpsCoin", "name");
  requireWireField(raw, "parsePerpsCoin", "precision");
  requireWireField(raw, "parsePerpsCoin", "marginRatio");
  return {
    id: BigInt(raw.id),
    name: String(raw.name),
    precision: Number(raw.precision),
    marginRatio: String(raw.marginRatio),
    price: optString(raw, "price"),
  };
}

/**
 * Parse `PerpsTicker` from wire (sodex-docs/rest-v1/schema.md#perpsticker).
 * 18 required + 4 optional (`lastSz`, `vwap`, `change`, `changePct`).
 */
export function parsePerpsTicker(raw: WireRecord): PerpsTicker {
  for (const key of [
    "symbol",
    "lastPx",
    "openPx",
    "highPx",
    "lowPx",
    "volume",
    "quoteVolume",
    "bidPx",
    "bidSz",
    "askPx",
    "askSz",
    "fundingRate",
    "nextFundingTime",
    "indexPrice",
    "markPrice",
    "openInterest",
    "openTime",
    "closeTime",
  ] as const) {
    requireWireField(raw, "parsePerpsTicker", key);
  }
  const changePct = raw.changePct;
  return {
    symbol: String(raw.symbol),
    lastPx: String(raw.lastPx),
    openPx: String(raw.openPx),
    highPx: String(raw.highPx),
    lowPx: String(raw.lowPx),
    volume: String(raw.volume),
    quoteVolume: String(raw.quoteVolume),
    bidPx: String(raw.bidPx),
    bidSz: String(raw.bidSz),
    askPx: String(raw.askPx),
    askSz: String(raw.askSz),
    fundingRate: String(raw.fundingRate),
    nextFundingTime: BigInt(raw.nextFundingTime),
    indexPrice: String(raw.indexPrice),
    markPrice: String(raw.markPrice),
    openInterest: String(raw.openInterest),
    openTime: BigInt(raw.openTime),
    closeTime: BigInt(raw.closeTime),
    lastSz: optString(raw, "lastSz"),
    vwap: optString(raw, "vwap"),
    change: optString(raw, "change"),
    changePct: changePct === undefined || changePct === null ? undefined : Number(changePct),
  };
}

/**
 * Parse `MarkPriceTicker` from wire
 * (sodex-docs/rest-v1/schema.md#markpriceticker). All 6 fields required.
 */
export function parseMarkPrice(raw: WireRecord): MarkPriceTicker {
  for (const key of [
    "symbol",
    "fundingRate",
    "nextFundingTime",
    "indexPrice",
    "markPrice",
    "openInterest",
  ] as const) {
    requireWireField(raw, "parseMarkPrice", key);
  }
  return {
    symbol: String(raw.symbol),
    fundingRate: String(raw.fundingRate),
    nextFundingTime: BigInt(raw.nextFundingTime),
    indexPrice: String(raw.indexPrice),
    markPrice: String(raw.markPrice),
    openInterest: String(raw.openInterest),
  };
}

/**
 * Parse `PerpsAccountBalance` (the response envelope) from wire
 * (sodex-docs/rest-v1/schema.md#perpsaccountbalance): `{blockTime,
 * blockHeight, balances[]}`, inner shape `{id, coin, total, marginRatio,
 * price?}`.
 *
 * `balances` is documented as a non-nullable array but the server emits
 * `null` for empty accounts (Go `nil` slice); we normalize that to `[]`
 * so the SDK shape stays `T[]`. Inner fields remain strictly required
 * except `price` (spec-optional).
 */
export function parsePerpsBalances(raw: WireRecord): PerpsAccountBalances {
  requireWireField(raw, "parsePerpsBalances", "blockTime");
  requireWireField(raw, "parsePerpsBalances", "blockHeight");
  return {
    blockTime: BigInt(raw.blockTime),
    blockHeight: BigInt(raw.blockHeight),
    balances: parseWireArray(
      raw,
      "parsePerpsBalances",
      "balances",
      (b: WireRecord): PerpsAccountBalance => {
        requireWireField(b, "parsePerpsBalances.balance", "id");
        requireWireField(b, "parsePerpsBalances.balance", "coin");
        requireWireField(b, "parsePerpsBalances.balance", "total");
        requireWireField(b, "parsePerpsBalances.balance", "marginRatio");
        return {
          coinId: BigInt(b.id),
          coin: String(b.coin),
          total: String(b.total),
          marginRatio: String(b.marginRatio),
          price: optString(b, "price"),
        };
      },
    ),
  };
}

/**
 * Parse `WsPerpsState` from wire (sodex-docs/rest-v1/schema.md#wsperpsstate).
 *
 * Design trade-offs and observed-server-vs-spec deviations:
 * 1. Collection fields `B`, `O`, `P`, `S` are documented as non-nullable
 *    `Array<T>` in the schema, but the production REST server emits JSON
 *    `null` when the underlying Go slice is `nil` (i.e. for empty
 *    collections). Before this change the parser called `requireWireField`
 *    for those keys, which treats `null` as "missing required" and throws
 *    — meaning an empty account made `getAccountState()` reject outright.
 * 2. Wire `null` on a collection field is normalized to `[]` (not
 *    `undefined`). Rationale: for an array-typed SDK field, the difference
 *    between "server sent null" and "server sent []" is not load-bearing
 *    for any caller — both mean "no items" — and keeping the SDK type as
 *    `T[]` lets callers iterate with for/of and .map without `?? []`
 *    guards. The wire-level distinction is preserved in tests and in the
 *    parser, so schema drift (e.g. the field becoming an object) still
 *    throws. This is a deliberate, narrow invention scoped to
 *    array-typed collection fields, justified by the ergonomics win over
 *    a strict `T[] | undefined` shape.
 * 3. The 11 scalar envelope fields (`user`…`ocm`) remain strictly required:
 *    they are not observed to come back as `null` even for empty users,
 *    and accepting `null`/missing silently for e.g. `av` would risk a
 *    `BigInt(null)` NaN-style coercion bug later.
 * 4. Each collection element is still parsed by the same strict
 *    per-element parser (`parsePerpsSnapshotBalance` et al.); `null` is
 *    only accepted at the whole-collection level, not per-item.
 * 5. We keep one parser per wire shape. If a WS client later needs
 *    `WsPerpsState` via push, it gets its own parser; this one is
 *    documented to match the REST `/accounts/{user}/state` response
 *    (including the null-for-empty quirk) and must not be widened into a
 *    union parser.
 *
 * Short wire keys are renamed for call-site clarity (derivation, not
 * invention).
 */
export function parsePerpsAccountSnapshot(raw: WireRecord): PerpsAccountSnapshot {
  for (const key of [
    "user",
    "aid",
    "uid",
    "av",
    "am",
    "ami",
    "amw",
    "im",
    "cm",
    "oim",
    "ocm",
  ] as const) {
    requireWireField(raw, "parsePerpsAccountSnapshot", key);
  }
  return {
    userAddress: String(raw.user),
    accountId: BigInt(raw.aid),
    userId: BigInt(raw.uid),
    accountValue: String(raw.av),
    availableMargin: String(raw.am),
    availableMarginIsolated: String(raw.ami),
    availableMarginForTransfer: String(raw.amw),
    isolatedFrozenMargin: String(raw.im),
    crossFrozenMargin: String(raw.cm),
    openIsolatedFrozenMargin: String(raw.oim),
    openCrossFrozenMargin: String(raw.ocm),
    balances: parseWireArray(raw, "parsePerpsAccountSnapshot", "B", parsePerpsSnapshotBalance),
    openOrders: parseWireArray(raw, "parsePerpsAccountSnapshot", "O", parsePerpsSnapshotOrder),
    openPositions: parseWireArray(
      raw,
      "parsePerpsAccountSnapshot",
      "P",
      parsePerpsSnapshotPosition,
    ),
    symbolConfigs: parseWireArray(
      raw,
      "parsePerpsAccountSnapshot",
      "S",
      parsePerpsSnapshotSymbolConfig,
    ),
    twaps: parseWireArray(raw, "parsePerpsAccountSnapshot", "TO", parseWsTwapOrder),
  };
}

/**
 * Parse `WsPerpsBalanceDetailed` from wire
 * (sodex-docs/rest-v1/schema.md#wsperpsbalancedetailed).
 * Required: `{i, a, wb, mr, px, aw, at, wm, am}`; nullable-required: `iw`
 * (wire `null` → SDK `undefined`).
 */
export function parsePerpsSnapshotBalance(b: WireRecord): PerpsSnapshotBalance {
  for (const key of ["i", "a", "wb", "mr", "px", "aw", "at", "wm", "am"] as const) {
    requireWireField(b, "parsePerpsSnapshotBalance", key);
  }
  return {
    coinId: BigInt(b.i),
    coin: String(b.a),
    walletBalance: String(b.wb),
    marginRatio: String(b.mr),
    oraclePrice: String(b.px),
    availableForMargin: String(b.aw),
    availableForWithdraw: String(b.at),
    walletMargin: String(b.wm),
    availableMargin: String(b.am),
    collateral: optString(b, "co"),
    isolatedFrozen: optString(b, "iw"),
  };
}

/**
 * Parse `WsPerpsOrder` from wire (sodex-docs/rest-v1/schema.md#wsperpsorder).
 * Required scalars: spot-base plus `{ps, R}`. Nullable-required (wire `null`
 * → SDK `undefined`): `{F, sp, st, tt, pid, poid, aoids}`.
 */
export function parsePerpsSnapshotOrder(o: WireRecord): PerpsSnapshotOrder {
  for (const key of [
    "s",
    "c",
    "i",
    "S",
    "o",
    "f",
    "p",
    "q",
    "X",
    "z",
    "v",
    "M",
    "ps",
    "R",
  ] as const) {
    requireWireField(o, "parsePerpsSnapshotOrder", key);
  }
  return {
    orderID: BigInt(o.i),
    symbol: String(o.s),
    clOrdID: String(o.c),
    side: orderSideFromName(o.S),
    type: orderTypeFromName(o.o),
    timeInForce: timeInForceFromName(o.f),
    status: orderStatusFromName(o.X),
    price: String(o.p),
    origQty: String(o.q),
    executedQty: String(o.z),
    executedValue: String(o.v),
    marginFrozen: String(o.M),
    positionSide: positionSideFromName(o.ps),
    reduceOnly: requireBoolean(o, "parsePerpsSnapshotOrder", "R"),
    funds: optString(o, "F"),
    stopPrice: optString(o, "sp"),
    stopType: optEnum(o, "st", stopTypeFromName),
    triggerType: optEnum(o, "tt", triggerTypeFromName),
    positionID: optBigInt(o, "pid"),
    primaryOrderID: optBigInt(o, "poid"),
    attachedOrderIDs: optBigIntArray(o, "parsePerpsSnapshotOrder", "aoids"),
    createdAt: optBigInt(o, "ct"),
    updatedAt: optBigInt(o, "ut"),
  };
}

/**
 * Parse `WsPerpsPosition` from wire
 * (sodex-docs/rest-v1/schema.md#wsperpsposition). Required:
 * `{i, s, m, ps, sz, ep, co, cf, cc, cp, ms, cr, ur, l, lp}`;
 * nullable-required: `iw`.
 */
export function parsePerpsSnapshotPosition(p: WireRecord): PerpsSnapshotPosition {
  for (const key of [
    "i",
    "s",
    "m",
    "ps",
    "sz",
    "ep",
    "co",
    "cf",
    "cc",
    "cp",
    "ms",
    "cr",
    "ur",
    "l",
    "lp",
  ] as const) {
    requireWireField(p, "parsePerpsSnapshotPosition", key);
  }
  return {
    id: BigInt(p.i),
    symbol: String(p.s),
    marginMode: marginModeFromName(p.m),
    positionSide: positionSideFromName(p.ps),
    size: String(p.sz),
    avgEntryPrice: String(p.ep),
    cumOpenCost: String(p.co),
    cumTradingFee: String(p.cf),
    cumClosedSize: String(p.cc),
    avgClosePrice: String(p.cp),
    maxSize: String(p.ms),
    realizedPnL: String(p.cr),
    unrealizedPnL: String(p.ur),
    leverage: Number(p.l),
    liquidationPrice: String(p.lp),
    isolatedMargin: optString(p, "iw"),
    createdAt: optBigInt(p, "ct"),
    updatedAt: optBigInt(p, "ut"),
  };
}

/**
 * Parse `WsPerpsSymbolConfig` from wire
 * (sodex-docs/rest-v1/schema.md#wsperpssymbolconfig). All 3 fields required.
 */
export function parsePerpsSnapshotSymbolConfig(s: WireRecord): PerpsSnapshotSymbolConfig {
  requireWireField(s, "parsePerpsSnapshotSymbolConfig", "s");
  requireWireField(s, "parsePerpsSnapshotSymbolConfig", "l");
  requireWireField(s, "parsePerpsSnapshotSymbolConfig", "m");
  return {
    symbol: String(s.s),
    leverage: Number(s.l),
    marginMode: marginModeFromName(s.m),
  };
}

/**
 * Parse `PerpsAccountOpenPosition` from wire
 * (sodex-docs/rest-v1/schema.md#perpsaccountopenposition):
 * `{blockTime, blockHeight, positions}`.
 *
 * `positions` is documented as a non-nullable array but the server emits
 * `null` for accounts with no open positions (Go `nil` slice); we
 * normalize that to `[]` so the SDK shape stays `T[]`.
 */
export function parsePerpsOpenPositions(raw: WireRecord): PerpsOpenPositions {
  requireWireField(raw, "parsePerpsOpenPositions", "blockTime");
  requireWireField(raw, "parsePerpsOpenPositions", "blockHeight");
  return {
    blockTime: BigInt(raw.blockTime),
    blockHeight: BigInt(raw.blockHeight),
    positions: parseWireArray(raw, "parsePerpsOpenPositions", "positions", parsePerpsPosition),
  };
}

/**
 * Parse `Position` from wire (sodex-docs/rest-v1/schema.md#position). All 19
 * fields are required; the dead `realizedPnl` camelCase alias is gone
 * (docs confirm only `realizedPnL` is emitted).
 */
export function parsePerpsPosition(raw: WireRecord): PerpsPosition {
  requireWireField(raw, "parsePerpsPosition", "id");
  requireWireField(raw, "parsePerpsPosition", "symbol");
  requireWireField(raw, "parsePerpsPosition", "marginMode");
  requireWireField(raw, "parsePerpsPosition", "side");
  requireWireField(raw, "parsePerpsPosition", "size");
  requireWireField(raw, "parsePerpsPosition", "initialMargin");
  requireWireField(raw, "parsePerpsPosition", "avgEntryPrice");
  requireWireField(raw, "parsePerpsPosition", "cumOpenCost");
  requireWireField(raw, "parsePerpsPosition", "cumTradingFee");
  requireWireField(raw, "parsePerpsPosition", "cumClosedSize");
  requireWireField(raw, "parsePerpsPosition", "avgClosePrice");
  requireWireField(raw, "parsePerpsPosition", "maxSize");
  requireWireField(raw, "parsePerpsPosition", "realizedPnL");
  requireWireField(raw, "parsePerpsPosition", "leverage");
  requireWireField(raw, "parsePerpsPosition", "active");
  requireWireField(raw, "parsePerpsPosition", "isTakenOver");
  requireWireField(raw, "parsePerpsPosition", "takeOverPrice");
  requireWireField(raw, "parsePerpsPosition", "createdAt");
  requireWireField(raw, "parsePerpsPosition", "updatedAt");
  return {
    id: BigInt(raw.id),
    symbol: String(raw.symbol),
    marginMode: marginModeFromName(raw.marginMode),
    side: positionSideFromName(raw.side),
    size: String(raw.size),
    initialMargin: String(raw.initialMargin),
    avgEntryPrice: String(raw.avgEntryPrice),
    cumOpenCost: String(raw.cumOpenCost),
    cumTradingFee: String(raw.cumTradingFee),
    cumClosedSize: String(raw.cumClosedSize),
    avgClosePrice: String(raw.avgClosePrice),
    maxSize: String(raw.maxSize),
    realizedPnL: String(raw.realizedPnL),
    leverage: Number(raw.leverage),
    active: requireBoolean(raw, "parsePerpsPosition", "active"),
    isTakenOver: requireBoolean(raw, "parsePerpsPosition", "isTakenOver"),
    takeOverPrice: String(raw.takeOverPrice),
    createdAt: BigInt(raw.createdAt),
    updatedAt: BigInt(raw.updatedAt),
  };
}

/**
 * Parse `PerpsOrder` from wire (sodex-docs/rest-v1/schema.md#perpsorder).
 * Required: orderID, symbol, side, type, status, positionSide, reduceOnly,
 * executedQty, executedValue, marginFrozen. Optional fields return
 * `undefined` when the server omits them.
 */
export function parsePerpsOrder(raw: WireRecord): PerpsOrder {
  requireWireField(raw, "parsePerpsOrder", "orderID");
  requireWireField(raw, "parsePerpsOrder", "symbol");
  requireWireField(raw, "parsePerpsOrder", "side");
  requireWireField(raw, "parsePerpsOrder", "type");
  requireWireField(raw, "parsePerpsOrder", "status");
  requireWireField(raw, "parsePerpsOrder", "positionSide");
  requireWireField(raw, "parsePerpsOrder", "reduceOnly");
  requireWireField(raw, "parsePerpsOrder", "executedQty");
  requireWireField(raw, "parsePerpsOrder", "executedValue");
  requireWireField(raw, "parsePerpsOrder", "marginFrozen");
  const tif = raw.timeInForce;
  const st = raw.stopType;
  const tt = raw.triggerType;
  return {
    orderID: BigInt(raw.orderID),
    symbol: String(raw.symbol),
    side: orderSideFromName(raw.side),
    type: orderTypeFromName(raw.type),
    status: orderStatusFromName(raw.status),
    positionSide: positionSideFromName(raw.positionSide),
    reduceOnly: requireBoolean(raw, "parsePerpsOrder", "reduceOnly"),
    executedQty: String(raw.executedQty),
    executedValue: String(raw.executedValue),
    marginFrozen: String(raw.marginFrozen),
    clOrdID: optString(raw, "clOrdID"),
    timeInForce: tif === undefined || tif === null ? undefined : timeInForceFromName(tif),
    price: optString(raw, "price"),
    origQty: optString(raw, "origQty"),
    funds: optString(raw, "funds"),
    createdAt: optBigInt(raw, "createdAt"),
    updatedAt: optBigInt(raw, "updatedAt"),
    stopPrice: optString(raw, "stopPrice"),
    stopType: st === undefined || st === null ? undefined : stopTypeFromName(st),
    triggerType: tt === undefined || tt === null ? undefined : triggerTypeFromName(tt),
    positionID: optBigInt(raw, "positionID"),
    primaryOrderID: optBigInt(raw, "primaryOrderID"),
    attachedOrderIDs: optBigIntArray(raw, "parsePerpsOrder", "attachedOrderIDs"),
  };
}

/**
 * Parse `PerpsUserFunding` from wire
 * (sodex-docs/rest-v1/schema.md#perpsuserfunding). All 6 fields required.
 */
export function parseFunding(raw: WireRecord): FundingPayment {
  for (const key of [
    "symbol",
    "positionID",
    "positionSide",
    "fundingFee",
    "feeCoin",
    "timestamp",
  ] as const) {
    requireWireField(raw, "parseFunding", key);
  }
  return {
    symbol: String(raw.symbol),
    positionID: BigInt(raw.positionID),
    positionSide: positionSideFromName(raw.positionSide),
    fundingFee: String(raw.fundingFee),
    feeCoin: String(raw.feeCoin),
    timestamp: BigInt(raw.timestamp),
  };
}
