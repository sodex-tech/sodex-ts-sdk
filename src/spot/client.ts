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
  parseFeeRate,
  parseUserTrade,
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
    const raw = await this.http.get<any>(`/markets/${encodeURIComponent(name)}/orderbook`, {
      query: { limit },
    });
    return parseOrderBook(raw);
  }

  async getKlines(
    symbol: SymbolRef,
    params: { interval: string; startTime?: bigint; endTime?: bigint; limit?: number },
  ): Promise<Kline[]> {
    const name = await this.resolveWireName(symbol);
    const raw = await this.http.get<WireRecord[]>(`/markets/${encodeURIComponent(name)}/klines`, {
      query: { ...params },
    });
    return raw.map(parseKline);
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
    const raw = await this.http.get<any>(`/accounts/${userAddress}/orders`, {
      query: {
        symbol: await this.normalizeSymbolFilter(params.symbol),
        accountID: params.accountId,
      },
    });
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.orders) ? raw.orders : [];
    return list.map(parseSpotOrder);
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
    const raw = await this.signedPost<any>("/accounts/transfers", payload);
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


function parseSpotSymbol(raw: WireRecord): SpotSymbolInfo {
  return {
    id: BigInt(raw.id),
    name: raw.name,
    displayName: raw.displayName ?? raw.name,
    baseCoinId: BigInt(raw.baseCoinID),
    baseCoin: raw.baseCoin ?? "",
    baseCoinPrecision: raw.baseCoinPrecision ?? 0,
    quoteCoinId: BigInt(raw.quoteCoinID),
    quoteCoin: raw.quoteCoin ?? "",
    quoteCoinPrecision: raw.quoteCoinPrecision ?? 0,
    pricePrecision: raw.pricePrecision,
    tickSize: raw.tickSize,
    minPrice: raw.minPrice,
    maxPrice: raw.maxPrice,
    quantityPrecision: raw.quantityPrecision,
    stepSize: raw.stepSize,
    minQuantity: raw.minQuantity,
    maxQuantity: raw.maxQuantity,
    marketMinQuantity: raw.marketMinQuantity,
    marketMaxQuantity: raw.marketMaxQuantity,
    minNotional: raw.minNotional,
    maxNotional: raw.maxNotional,
    buyLimitUpRatio: raw.buyLimitUpRatio,
    sellLimitDownRatio: raw.sellLimitDownRatio,
    marketDeviationRatio: raw.marketDeviationRatio,
    makerFee: raw.makerFee,
    takerFee: raw.takerFee,
    status: symbolStatusFromName(raw.status),
  };
}

function parseSpotCoin(raw: WireRecord): SpotCoinInfo {
  return {
    id: BigInt(raw.id),
    name: raw.name,
    precision: raw.precision ?? 0,
  };
}

function parseSpotTicker(raw: WireRecord): SpotTicker {
  return {
    symbol: raw.symbol,
    lastPx: raw.lastPx,
    lastSz: raw.lastSz,
    openPx: raw.openPx,
    highPx: raw.highPx,
    lowPx: raw.lowPx,
    vwap: raw.vwap,
    change: raw.change,
    changePct: raw.changePct,
    volume: raw.volume,
    quoteVolume: raw.quoteVolume,
    bidPx: raw.bidPx,
    bidSz: raw.bidSz,
    askPx: raw.askPx,
    askSz: raw.askSz,
    openTime: BigInt(raw.openTime),
    closeTime: BigInt(raw.closeTime),
  };
}

function parseMiniTicker(raw: WireRecord): MiniTicker {
  return {
    symbol: raw.symbol,
    lastPx: raw.lastPx,
    openPx: raw.openPx,
    highPx: raw.highPx,
    lowPx: raw.lowPx,
    volume: raw.volume,
    quoteVolume: raw.quoteVolume,
    openTime: BigInt(raw.openTime),
    closeTime: BigInt(raw.closeTime),
  };
}

function parseBookTicker(raw: WireRecord): BookTicker {
  return {
    symbol: raw.symbol,
    bidPx: raw.bidPx,
    bidSz: raw.bidSz,
    askPx: raw.askPx,
    askSz: raw.askSz,
  };
}

function parseOrderBook(raw: WireRecord): OrderBook {
  const levelMap = (l: WireRecord) => ({ price: l[0] ?? l.price, size: l[1] ?? l.size });
  return {
    symbol: raw.symbol ?? "",
    lastUpdateID: BigInt(raw.lastUpdateID ?? raw.lastUpdateId ?? 0),
    bids: Array.isArray(raw.bids) ? raw.bids.map(levelMap) : [],
    asks: Array.isArray(raw.asks) ? raw.asks.map(levelMap) : [],
  };
}

function parseKline(raw: WireRecord): Kline {
  return {
    symbol: raw.symbol ?? raw.s ?? "",
    interval: raw.interval ?? "",
    openTime: BigInt(raw.openTime ?? raw.startTime ?? raw.t ?? 0),
    closeTime: BigInt(raw.closeTime ?? raw.endTime ?? 0),
    openPx: raw.openPx ?? raw.open ?? raw.o ?? "",
    highPx: raw.highPx ?? raw.high ?? raw.h ?? "",
    lowPx: raw.lowPx ?? raw.low ?? raw.l ?? "",
    closePx: raw.closePx ?? raw.close ?? raw.c ?? "",
    volume: raw.volume ?? raw.a ?? raw.v ?? "",
    quoteVolume: raw.quoteVolume ?? raw.q ?? raw.v ?? "",
    tradeCount: raw.tradeCount ?? raw.trades ?? 0,
  };
}

function parseTrade(raw: WireRecord): Trade {
  return {
    symbol: raw.symbol ?? "",
    id: BigInt(raw.id ?? raw.tradeID ?? 0),
    price: raw.price,
    quantity: raw.quantity ?? raw.qty ?? "",
    quoteQuantity: raw.quoteQuantity ?? raw.quoteQty ?? "",
    time: BigInt(raw.time ?? raw.timestamp ?? 0),
    isBuyerMaker: raw.isBuyerMaker,
  };
}

function parseSpotBalances(raw: WireRecord): SpotAccountBalances {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.balances) ? raw.balances : [];
  return {
    accountId: BigInt(raw.accountID ?? raw.accountId ?? 0),
    balances: list.map((b: WireRecord) => ({
      coinId: BigInt(b.coinID ?? b.coinId ?? 0),
      coin: b.coin ?? "",
      available: b.available ?? "0",
      locked: b.locked ?? "0",
      total: b.total ?? b.balance ?? "0",
    })),
  };
}

function parseSpotAccountSnapshot(raw: WireRecord): SpotAccountSnapshot {
  return {
    userAddress: raw.user ?? raw.userAddress ?? "",
    accountId: BigInt(raw.aid ?? raw.accountID ?? 0),
    userId: BigInt(raw.uid ?? raw.userID ?? 0),
    balances: Array.isArray(raw.B) ? raw.B.map(parseSpotSnapshotBalance) : [],
    openOrders: Array.isArray(raw.O) ? raw.O.map(parseSpotSnapshotOrder) : [],
  };
}

function parseSpotSnapshotBalance(b: WireRecord): SpotSnapshotBalance {
  return {
    coinId: BigInt(b.i ?? 0),
    coin: b.a ?? "",
    total: b.t ?? "0",
    locked: b.l ?? "0",
  };
}

function parseSpotSnapshotOrder(o: WireRecord): SpotSnapshotOrder {
  return {
    symbol: o.s ?? "",
    clOrdID: o.c ?? "",
    orderID: BigInt(o.i ?? 0),
    side: orderSideFromName(o.S),
    type: orderTypeFromName(o.o),
    timeInForce: timeInForceFromName(o.f),
    price: o.p ?? "0",
    quantity: o.q ?? "0",
    funds: o.F === null ? null : (o.F ?? "0"),
    status: orderStatusFromName(o.X),
    executedQty: o.z ?? "0",
    executedQuote: o.v ?? "0",
    marginLocked: o.M ?? "0",
  };
}

function parseSpotOrder(raw: WireRecord): SpotOrder {
  return {
    symbol: raw.symbol ?? "",
    symbolId: BigInt(raw.symbolID ?? raw.symbolId ?? 0),
    accountId: BigInt(raw.accountID ?? raw.accountId ?? 0),
    orderID: BigInt(raw.orderID ?? 0),
    clOrdID: raw.clOrdID ?? "",
    side: orderSideFromName(raw.side),
    type: orderTypeFromName(raw.type),
    timeInForce: timeInForceFromName(raw.timeInForce),
    price: raw.price ?? "0",
    quantity: raw.quantity ?? "0",
    executedQty: raw.executedQty ?? "0",
    cumQuoteQty: raw.cumQuoteQty ?? "0",
    status: orderStatusFromName(raw.status),
    createTime: BigInt(raw.createTime ?? 0),
    updateTime: BigInt(raw.updateTime ?? 0),
  };
}

