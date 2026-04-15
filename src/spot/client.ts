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
  orderSideFromName,
  orderStatusFromName,
  orderTypeFromName,
  symbolStatusFromName,
  timeInForceFromName,
} from "../common/enums";
import { HttpClient } from "../common/http";
import { SIG_TYPE_ADD_API_KEY, signDigest } from "../common/signer";
import {
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
  type UserTrade,
  type WireRecord,
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
  parseUserTrade,
  optBigInt,
  optString,
  requireWireField,
} from "../common/types";
import { CoinRegistry } from "../registry/coin-registry";
import { type SymbolRef, SymbolRegistry } from "../registry/symbol-registry";
import {
  type ReplaceOrderInput,
  type RevokeApiKeyInput,
  type ScheduleCancelInput,
  type SpotBatchCancelInput,
  type SpotBatchNewOrderInput,
  type SpotCancelOrderInput,
  type SpotNewOrderInput,
  type TransferAssetInput,
  buildBatchCancelPayload,
  buildBatchNewOrderPayload,
  buildReplaceOrderPayload,
  buildRevokeApiKeyPayload,
  buildScheduleCancelPayload,
  buildTransferAssetPayload,
} from "./actions";
import type { SpotSigner } from "./signer";
import type {
  SpotAccountBalances,
  SpotCoinInfo,
  SpotSnapshotBalance,
  SpotSnapshotOrder,
  SpotAccountSnapshot,
  SpotOrder,
  SpotSymbolInfo,
  SpotTicker,
} from "./types";

export type NonceProvider = () => bigint;

export function createMonotonicNonce(): NonceProvider {
  let last = 0n;
  return () => {
    const now = BigInt(Date.now());
    last = now > last ? now : last + 1n;
    return last;
  };
}

export interface SpotClientOptions {
  baseUrl: string;
  chainId?: bigint;
  signer?: SpotSigner;
  apiKeyName?: string;
  fetch?: typeof fetch;
  nonce?: NonceProvider;
  symbols?: SpotSymbolInfo[];
  coins?: SpotCoinInfo[];
}

export class SpotClient {
  readonly http: HttpClient;
  readonly symbols: SymbolRegistry;
  readonly coins: CoinRegistry;
  readonly chainId: bigint;
  private readonly signer?: SpotSigner;
  private readonly apiKeyName: string;
  private readonly nonce: NonceProvider;

  constructor(opts: SpotClientOptions) {
    this.http = new HttpClient({
      baseUrl: `${opts.baseUrl.replace(/\/$/, "")}/api/v1/spot`,
      fetch: opts.fetch,
    });
    this.chainId = opts.chainId ?? MAINNET_CHAIN_ID;
    this.signer = opts.signer;
    this.apiKeyName = opts.apiKeyName ?? "default";
    this.nonce = opts.nonce ?? createMonotonicNonce();
    this.symbols = new SymbolRegistry(() => this.fetchSymbols());
    this.coins = new CoinRegistry(() => this.fetchCoins());
    if (opts.symbols) this.symbols.load(opts.symbols);
    if (opts.coins) this.coins.load(opts.coins);
  }

  async refreshMarkets(): Promise<void> {
    await Promise.all([this.symbols.refresh(), this.coins.refresh()]);
  }


  async getSymbols(symbol?: string): Promise<SpotSymbolInfo[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/symbols", {
      query: { symbol: await this.normalizeSymbolFilter(symbol) },
    });
    return raw.map(parseSpotSymbol);
  }

  async getCoins(coin?: string): Promise<SpotCoinInfo[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/coins", { query: { coin } });
    return raw.map(parseSpotCoin);
  }

  async getTickers(symbol?: string): Promise<SpotTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/tickers", {
      query: { symbol: await this.normalizeSymbolFilter(symbol) },
    });
    return raw.map(parseSpotTicker);
  }

  async getMiniTickers(symbol?: string): Promise<MiniTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/miniTickers", {
      query: { symbol: await this.normalizeSymbolFilter(symbol) },
    });
    return raw.map(parseMiniTicker);
  }

  async getBookTickers(symbol?: string): Promise<BookTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/bookTickers", {
      query: { symbol: await this.normalizeSymbolFilter(symbol) },
    });
    return raw.map(parseBookTicker);
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
  ): Promise<Kline[]> {
    const name = await this.resolveWireName(symbol);
    const raw = await this.http.get<WireRecord[]>(`/markets/${encodeURIComponent(name)}/klines`, {
      query: { ...params },
    });
    return raw.map((r) => parseKline(r, { symbol: name, interval: params.interval }));
  }

  async getRecentTrades(symbol: SymbolRef, limit?: number): Promise<Trade[]> {
    const name = await this.resolveWireName(symbol);
    const raw = await this.http.get<WireRecord[]>(`/markets/${encodeURIComponent(name)}/trades`, {
      query: { limit },
    });
    return raw.map(parseTrade);
  }


  async getBalances(userAddress: string, accountId?: bigint): Promise<SpotAccountBalances> {
    const raw = await this.http.get<any>(`/accounts/${userAddress}/balances`, {
      query: { accountID: accountId },
    });
    return parseSpotBalances(raw);
  }

  async getOpenOrders(
    userAddress: string,
    params: { symbol?: string; accountId?: bigint } = {},
  ): Promise<SpotOrder[]> {
    // Wire: `SpotAccountOpenOrder` envelope `{blockTime, blockHeight, orders}`
    // per sodex-docs/rest-v1/schema.md#spotaccountopenorder. We surface only
    // the `orders` list for now; block metadata is intentionally dropped.
    const raw = await this.http.get<WireRecord>(`/accounts/${userAddress}/orders`, {
      query: {
        symbol: await this.normalizeSymbolFilter(params.symbol),
        accountID: params.accountId,
      },
    });
    requireWireField(raw, "getOpenOrders", "orders");
    if (!Array.isArray(raw.orders)) {
      throw new Error("getOpenOrders: wire field `orders` must be an array");
    }
    return raw.orders.map(parseSpotOrder);
  }

  async getAccountState(userAddress: string, accountId?: bigint): Promise<SpotAccountSnapshot> {
    const raw = await this.http.get<any>(`/accounts/${userAddress}/state`, {
      query: { accountID: accountId },
    });
    return parseSpotAccountSnapshot(raw);
  }

  async getApiKeys(
    userAddress: string,
    params: { accountId?: bigint; name?: string } = {},
  ): Promise<ApiKeyInfo[]> {
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/api-keys`, {
      query: { accountID: params.accountId, name: params.name },
    });
    return raw.map(parseApiKey);
  }

  async getFeeRate(
    userAddress: string,
    params: { accountId?: bigint; symbol?: string } = {},
  ): Promise<FeeRate> {
    const raw = await this.http.get<any>(`/accounts/${userAddress}/fee-rate`, {
      query: {
        accountID: params.accountId,
        symbol: await this.normalizeSymbolFilter(params.symbol),
      },
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
  ): Promise<SpotOrder[]> {
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/orders/history`, {
      query: {
        accountID: params.accountId,
        symbol: await this.normalizeSymbolFilter(params.symbol),
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return raw.map(parseSpotOrder);
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
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/trades`, {
      query: {
        accountID: params.accountId,
        symbol: await this.normalizeSymbolFilter(params.symbol),
        orderID: params.orderId,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return raw.map(parseUserTrade);
  }


  async placeOrder(
    input: Omit<SpotNewOrderInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<PlaceOrderReceipt> {
    const { symbol, accountId, clOrdId, side, type, timeInForce, price, quantity, funds } = input;
    const [receipt] = await this.placeOrders({
      accountId,
      orders: [{ symbol, clOrdId, side, type, timeInForce, price, quantity, funds }],
    });
    if (!receipt) {
      throw new Error("SpotClient.placeOrder: server returned empty batch receipt");
    }
    return receipt;
  }

  async placeOrders(
    input: Omit<SpotBatchNewOrderInput, "orders"> & {
      orders: Array<
        Omit<SpotBatchNewOrderInput["orders"][number], "symbolId"> & { symbol: SymbolRef }
      >;
    },
  ): Promise<BatchOrderReceipt[]> {
    const payload = buildBatchNewOrderPayload({
      accountId: input.accountId,
      orders: input.orders.map(({ symbol, ...r }) => ({
        ...r,
        symbolId: this.symbols.resolveId(symbol),
      })),
    });
    const raw = await this.signedPost<any[]>("/trade/orders/batch", payload);
    return raw.map(parseBatchReceipt);
  }

  async cancelOrder(
    input: Omit<SpotCancelOrderInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<BatchCancelReceipt> {
    const { symbol, accountId, clOrdId, orderId, origClOrdId } = input;
    const [receipt] = await this.cancelOrders({
      accountId,
      cancels: [{ symbol, clOrdId, orderId, origClOrdId }],
    });
    if (!receipt) throw new Error("SpotClient.cancelOrder: server returned empty batch receipt");
    return receipt;
  }

  async cancelOrders(
    input: Omit<SpotBatchCancelInput, "cancels"> & {
      cancels: Array<
        Omit<SpotBatchCancelInput["cancels"][number], "symbolId"> & { symbol: SymbolRef }
      >;
    },
  ): Promise<BatchCancelReceipt[]> {
    const payload = buildBatchCancelPayload({
      accountId: input.accountId,
      cancels: input.cancels.map(({ symbol, ...r }) => ({
        ...r,
        symbolId: this.symbols.resolveId(symbol),
      })),
    });
    const raw = await this.signedDelete<any[]>("/trade/orders/batch", payload);
    return raw.map(parseBatchCancelReceipt);
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

  async scheduleCancel(input: ScheduleCancelInput): Promise<void> {
    await this.signedPost("/trade/orders/schedule-cancel", buildScheduleCancelPayload(input));
  }

  async transferAsset(
    input: Omit<TransferAssetInput, "coinId"> & { coin: string | bigint },
  ): Promise<TransferReceipt> {
    const { coin, ...rest } = input;
    const coinId = typeof coin === "bigint" ? coin : this.coins.resolveId(coin);
    const payload = buildTransferAssetPayload({ ...rest, coinId });
    const raw = await this.signedPost<WireRecord>("/accounts/transfers", payload);
    requireWireField(raw, "transferAsset", "id");
    return { id: BigInt(raw.id) };
  }

  async revokeApiKey(input: RevokeApiKeyInput): Promise<void> {
    await this.signedDelete("/accounts/api-keys", buildRevokeApiKeyPayload(input));
  }

  /** Uses the `universal` EIP-712 domain; must be signed by the master private key. */
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
    const nonce = this.nonce();
    const chainId = opts.chainId ?? this.chainId;
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
    const keyBytes =
      typeof opts.masterPrivateKey === "string"
        ? hexToBytes(opts.masterPrivateKey)
        : opts.masterPrivateKey;
    const wireSig = signDigest(digest, keyBytes, SIG_TYPE_ADD_API_KEY);
    const body = {
      accountID: input.accountId,
      name: input.name,
      type: apiKeyTypeToCode(input.type),
      publicKey: bytesToHex(input.publicKey),
      expiresAt: input.expiresAt,
    };
    await this.http.post("/accounts/api-keys", {
      body,
      signed: {
        key: opts.apiKeyName ?? "default",
        signature: bytesToHex(wireSig),
        nonce,
        chainId,
      },
    });
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
      throw new Error("SpotClient: signer not configured — pass `signer` in constructor options");
    }
    const nonce = this.nonce();
    const wireSig = this.signer.signAction(payload, nonce);
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
  }

  private async resolveWireName(ref: SymbolRef): Promise<string> {
    if (typeof ref === "bigint") {
      if (!this.symbols.isLoaded()) await this.symbols.refresh();
      return this.symbols.find(ref).name;
    }
    if (this.symbols.isLoaded()) return this.symbols.find(ref).name;
    if (ref.includes("/")) {
      await this.symbols.refresh();
      return this.symbols.find(ref).name;
    }
    return ref;
  }

  private async normalizeSymbolFilter(input?: string): Promise<string | undefined> {
    if (input === undefined || input === "") return undefined;
    return this.resolveWireName(input);
  }

  private async fetchSymbols(): Promise<SpotSymbolInfo[]> {
    return this.getSymbols();
  }

  private async fetchCoins(): Promise<SpotCoinInfo[]> {
    return this.getCoins();
  }
}


/**
 * Parse `SpotSymbol` from wire (sodex-docs/rest-v1/schema.md#spotsymbol).
 * 22 required fields (strict) + 4 optional coin-denormalization fields
 * (`baseCoin`, `baseCoinPrecision`, `quoteCoin`, `quoteCoinPrecision`).
 */
export function parseSpotSymbol(raw: WireRecord): SpotSymbolInfo {
  for (const key of [
    "id",
    "name",
    "displayName",
    "baseCoinID",
    "quoteCoinID",
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
    "makerFee",
    "takerFee",
    "status",
  ] as const) {
    requireWireField(raw, "parseSpotSymbol", key);
  }
  return {
    id: BigInt(raw.id),
    name: String(raw.name),
    displayName: String(raw.displayName),
    baseCoinId: BigInt(raw.baseCoinID),
    quoteCoinId: BigInt(raw.quoteCoinID),
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
    makerFee: String(raw.makerFee),
    takerFee: String(raw.takerFee),
    status: symbolStatusFromName(raw.status),
    baseCoin: optString(raw, "baseCoin"),
    baseCoinPrecision:
      raw.baseCoinPrecision === undefined || raw.baseCoinPrecision === null
        ? undefined
        : Number(raw.baseCoinPrecision),
    quoteCoin: optString(raw, "quoteCoin"),
    quoteCoinPrecision:
      raw.quoteCoinPrecision === undefined || raw.quoteCoinPrecision === null
        ? undefined
        : Number(raw.quoteCoinPrecision),
  };
}

/**
 * Parse `SpotCoin` from wire (sodex-docs/rest-v1/schema.md#spotcoin).
 * All 3 fields required.
 */
export function parseSpotCoin(raw: WireRecord): SpotCoinInfo {
  requireWireField(raw, "parseSpotCoin", "id");
  requireWireField(raw, "parseSpotCoin", "name");
  requireWireField(raw, "parseSpotCoin", "precision");
  return {
    id: BigInt(raw.id),
    name: String(raw.name),
    precision: Number(raw.precision),
  };
}

/**
 * Parse `SpotTicker` from wire (sodex-docs/rest-v1/schema.md#spotticker).
 * 16 required + 2 optional (`lastSz`, `vwap`).
 */
export function parseSpotTicker(raw: WireRecord): SpotTicker {
  for (const key of [
    "symbol",
    "lastPx",
    "openPx",
    "highPx",
    "lowPx",
    "change",
    "changePct",
    "volume",
    "quoteVolume",
    "bidPx",
    "bidSz",
    "askPx",
    "askSz",
    "openTime",
    "closeTime",
  ] as const) {
    requireWireField(raw, "parseSpotTicker", key);
  }
  return {
    symbol: String(raw.symbol),
    lastPx: String(raw.lastPx),
    openPx: String(raw.openPx),
    highPx: String(raw.highPx),
    lowPx: String(raw.lowPx),
    change: String(raw.change),
    changePct: Number(raw.changePct),
    volume: String(raw.volume),
    quoteVolume: String(raw.quoteVolume),
    bidPx: String(raw.bidPx),
    bidSz: String(raw.bidSz),
    askPx: String(raw.askPx),
    askSz: String(raw.askSz),
    openTime: BigInt(raw.openTime),
    closeTime: BigInt(raw.closeTime),
    lastSz: optString(raw, "lastSz"),
    vwap: optString(raw, "vwap"),
  };
}

/**
 * Parse `SpotAccountBalances` from wire
 * (sodex-docs/rest-v1/schema.md#spotaccountbalances): `{blockTime,
 * blockHeight, balances[]}`, inner shape `{id, coin, total, locked}`. All
 * fields required; no sentinel defaults.
 */
export function parseSpotBalances(raw: WireRecord): SpotAccountBalances {
  requireWireField(raw, "parseSpotBalances", "blockTime");
  requireWireField(raw, "parseSpotBalances", "blockHeight");
  requireWireField(raw, "parseSpotBalances", "balances");
  if (!Array.isArray(raw.balances)) {
    throw new Error("parseSpotBalances: wire field `balances` must be an array");
  }
  return {
    blockTime: BigInt(raw.blockTime),
    blockHeight: BigInt(raw.blockHeight),
    balances: raw.balances.map((b: WireRecord) => {
      requireWireField(b, "parseSpotBalances.balance", "id");
      requireWireField(b, "parseSpotBalances.balance", "coin");
      requireWireField(b, "parseSpotBalances.balance", "total");
      requireWireField(b, "parseSpotBalances.balance", "locked");
      return {
        coinId: BigInt(b.id),
        coin: String(b.coin),
        total: String(b.total),
        locked: String(b.locked),
      };
    }),
  };
}

/**
 * Parse `WsSpotState` from wire (sodex-docs/rest-v1/schema.md#wsspotstate).
 * All 5 envelope fields required. Short wire keys (`aid`, `uid`, `B`, `O`)
 * are renamed for call-site clarity; this is derivation, not invention.
 */
export function parseSpotAccountSnapshot(raw: WireRecord): SpotAccountSnapshot {
  requireWireField(raw, "parseSpotAccountSnapshot", "user");
  requireWireField(raw, "parseSpotAccountSnapshot", "aid");
  requireWireField(raw, "parseSpotAccountSnapshot", "uid");
  requireWireField(raw, "parseSpotAccountSnapshot", "B");
  requireWireField(raw, "parseSpotAccountSnapshot", "O");
  if (!Array.isArray(raw.B)) {
    throw new Error("parseSpotAccountSnapshot: wire field `B` must be an array");
  }
  if (!Array.isArray(raw.O)) {
    throw new Error("parseSpotAccountSnapshot: wire field `O` must be an array");
  }
  return {
    userAddress: String(raw.user),
    accountId: BigInt(raw.aid),
    userId: BigInt(raw.uid),
    balances: raw.B.map(parseSpotSnapshotBalance),
    openOrders: raw.O.map(parseSpotSnapshotOrder),
  };
}

/**
 * Parse `WsSpotBalance` from wire (sodex-docs/rest-v1/schema.md#wsspotbalance).
 * Required: `{i, a, t, l}`.
 */
export function parseSpotSnapshotBalance(b: WireRecord): SpotSnapshotBalance {
  requireWireField(b, "parseSpotSnapshotBalance", "i");
  requireWireField(b, "parseSpotSnapshotBalance", "a");
  requireWireField(b, "parseSpotSnapshotBalance", "t");
  requireWireField(b, "parseSpotSnapshotBalance", "l");
  return {
    coinId: BigInt(b.i),
    coin: String(b.a),
    total: String(b.t),
    locked: String(b.l),
  };
}

/**
 * Parse `WsSpotOrder` from wire (sodex-docs/rest-v1/schema.md#wsspotorder).
 * Required: `{s, c, i, S, o, f, p, q, X, z, v, M}`; nullable-required: `F`
 * (wire `null` → SDK `undefined`).
 */
export function parseSpotSnapshotOrder(o: WireRecord): SpotSnapshotOrder {
  requireWireField(o, "parseSpotSnapshotOrder", "s");
  requireWireField(o, "parseSpotSnapshotOrder", "c");
  requireWireField(o, "parseSpotSnapshotOrder", "i");
  requireWireField(o, "parseSpotSnapshotOrder", "S");
  requireWireField(o, "parseSpotSnapshotOrder", "o");
  requireWireField(o, "parseSpotSnapshotOrder", "f");
  requireWireField(o, "parseSpotSnapshotOrder", "p");
  requireWireField(o, "parseSpotSnapshotOrder", "q");
  requireWireField(o, "parseSpotSnapshotOrder", "X");
  requireWireField(o, "parseSpotSnapshotOrder", "z");
  requireWireField(o, "parseSpotSnapshotOrder", "v");
  requireWireField(o, "parseSpotSnapshotOrder", "M");
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
    funds: optString(o, "F"),
  };
}

/**
 * Parse `SpotOrder` from wire (sodex-docs/rest-v1/schema.md#spotorder).
 * Required: orderID, symbol, side, type, status, executedQty, executedValue,
 * marginFrozen. Optional fields return `undefined` when the server omits them.
 */
export function parseSpotOrder(raw: WireRecord): SpotOrder {
  requireWireField(raw, "parseSpotOrder", "orderID");
  requireWireField(raw, "parseSpotOrder", "symbol");
  requireWireField(raw, "parseSpotOrder", "side");
  requireWireField(raw, "parseSpotOrder", "type");
  requireWireField(raw, "parseSpotOrder", "status");
  requireWireField(raw, "parseSpotOrder", "executedQty");
  requireWireField(raw, "parseSpotOrder", "executedValue");
  requireWireField(raw, "parseSpotOrder", "marginFrozen");
  const tif = raw.timeInForce;
  return {
    orderID: BigInt(raw.orderID),
    symbol: String(raw.symbol),
    side: orderSideFromName(raw.side),
    type: orderTypeFromName(raw.type),
    status: orderStatusFromName(raw.status),
    executedQty: String(raw.executedQty),
    executedValue: String(raw.executedValue),
    marginFrozen: String(raw.marginFrozen),
    clOrdID: optString(raw, "clOrdID"),
    timeInForce:
      tif === undefined || tif === null ? undefined : timeInForceFromName(tif),
    price: optString(raw, "price"),
    origQty: optString(raw, "origQty"),
    funds: optString(raw, "funds"),
    createdAt: optBigInt(raw, "createdAt"),
    updatedAt: optBigInt(raw, "updatedAt"),
  };
}

