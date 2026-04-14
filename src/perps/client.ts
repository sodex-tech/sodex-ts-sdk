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
  orderModifierFromName,
  orderSideFromName,
  orderStatusFromName,
  orderTypeFromName,
  positionSideFromName,
  stopTypeFromName,
  symbolStatusFromName,
  timeInForceFromName,
  triggerTypeFromName,
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
import { type NonceProvider, createMonotonicNonce } from "../spot/client";
import {
  type PerpsCancelOrderInput,
  type PerpsModifyOrderInput,
  type PerpsNewOrderInput,
  type ReplaceOrderInput,
  type RevokeApiKeyInput,
  type ScheduleCancelInput,
  type TransferAssetInput,
  type UpdateLeverageInput,
  type UpdateMarginInput,
  buildPerpsCancelOrderPayload,
  buildPerpsModifyOrderPayload,
  buildPerpsNewOrderPayload,
  buildReplaceOrderPayload,
  buildRevokeApiKeyPayload,
  buildScheduleCancelPayload,
  buildTransferAssetPayload,
  buildUpdateLeveragePayload,
  buildUpdateMarginPayload,
} from "./actions";
import type { PerpsSigner } from "./signer";
import type {
  FundingPayment,
  MarkPriceTicker,
  PerpsCoinInfo,
  PerpsSnapshotBalance,
  PerpsSnapshotOrder,
  PerpsSnapshotPosition,
  PerpsAccountSnapshot,
  PerpsSnapshotSymbolConfig,
  PerpsOpenPositions,
  PerpsOrder,
  PerpsPosition,
  PerpsSymbolInfo,
  PerpsTicker,
} from "./types";

export interface PerpsClientOptions {
  baseUrl: string;
  chainId?: bigint;
  signer?: PerpsSigner;
  apiKeyName?: string;
  fetch?: typeof fetch;
  nonce?: NonceProvider;
  symbols?: PerpsSymbolInfo[];
  coins?: PerpsCoinInfo[];
}

export class PerpsClient {
  readonly http: HttpClient;
  readonly symbols: SymbolRegistry;
  readonly coins: CoinRegistry;
  readonly chainId: bigint;
  private readonly signer?: PerpsSigner;
  private readonly apiKeyName: string;
  private readonly nonce: NonceProvider;

  constructor(opts: PerpsClientOptions) {
    this.http = new HttpClient({
      baseUrl: `${opts.baseUrl.replace(/\/$/, "")}/api/v1/perps`,
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


  async getSymbols(symbol?: string): Promise<PerpsSymbolInfo[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/symbols", { query: { symbol } });
    return raw.map(parsePerpsSymbol);
  }

  async getCoins(coin?: string): Promise<PerpsCoinInfo[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/coins", { query: { coin } });
    return raw.map(parsePerpsCoin);
  }

  async getTickers(symbol?: string): Promise<PerpsTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/tickers", { query: { symbol } });
    return raw.map(parsePerpsTicker);
  }

  async getMiniTickers(symbol?: string): Promise<MiniTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/miniTickers", { query: { symbol } });
    return raw.map(parseMiniTicker);
  }

  async getMarkPrices(symbol?: string): Promise<MarkPriceTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/mark-prices", { query: { symbol } });
    return raw.map(parseMarkPrice);
  }

  async getBookTickers(symbol?: string): Promise<BookTicker[]> {
    const raw = await this.http.get<WireRecord[]>("/markets/bookTickers", { query: { symbol } });
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


  async getBalances(userAddress: string, accountId?: bigint): Promise<unknown> {
    return this.http.get(`/accounts/${userAddress}/balances`, {
      query: { accountID: accountId },
    });
  }

  async getOpenOrders(
    userAddress: string,
    params: { symbol?: string; accountId?: bigint } = {},
  ): Promise<PerpsOrder[]> {
    const raw = await this.http.get<any>(`/accounts/${userAddress}/orders`, {
      query: { symbol: params.symbol, accountID: params.accountId },
    });
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.orders) ? raw.orders : [];
    return list.map(parsePerpsOrder);
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
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/orders/history`, {
      query: {
        accountID: params.accountId,
        symbol: params.symbol,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return raw.map(parsePerpsOrder);
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
  ): Promise<unknown[]> {
    return this.http.get<WireRecord[]>(`/accounts/${userAddress}/positions/history`, {
      query: {
        accountID: params.accountId,
        symbol: params.symbol,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
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
        symbol: params.symbol,
        orderID: params.orderId,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return raw.map(parseUserTrade);
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
    const raw = await this.http.get<WireRecord[]>(`/accounts/${userAddress}/fundings`, {
      query: {
        accountID: params.accountId,
        symbol: params.symbol,
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      },
    });
    return raw.map(parseFunding);
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
  ): Promise<unknown> {
    const { symbol, ...rest } = input;
    const payload = buildPerpsModifyOrderPayload({
      ...rest,
      symbolId: this.symbols.resolveId(symbol),
    });
    return this.signedPost("/trade/orders/modify", payload);
  }

  async scheduleCancel(input: ScheduleCancelInput): Promise<unknown> {
    return this.signedPost("/trade/orders/schedule-cancel", buildScheduleCancelPayload(input));
  }

  async updateLeverage(
    input: Omit<UpdateLeverageInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<unknown> {
    const { symbol, ...rest } = input;
    const payload = buildUpdateLeveragePayload({
      ...rest,
      symbolId: this.symbols.resolveId(symbol),
    });
    return this.signedPost("/trade/leverage", payload);
  }

  async updateMargin(
    input: Omit<UpdateMarginInput, "symbolId"> & { symbol: SymbolRef },
  ): Promise<unknown> {
    const { symbol, ...rest } = input;
    const payload = buildUpdateMarginPayload({
      ...rest,
      symbolId: this.symbols.resolveId(symbol),
    });
    return this.signedPost("/trade/margin", payload);
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

  async revokeApiKey(input: RevokeApiKeyInput): Promise<unknown> {
    return this.signedDelete("/accounts/api-keys", buildRevokeApiKeyPayload(input));
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
  ): Promise<unknown> {
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
    return this.http.post("/accounts/api-keys", {
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
    return ref;
  }

  private async fetchSymbols(): Promise<PerpsSymbolInfo[]> {
    return this.getSymbols();
  }

  private async fetchCoins(): Promise<PerpsCoinInfo[]> {
    return this.getCoins();
  }
}


function parsePerpsSymbol(raw: WireRecord): PerpsSymbolInfo {
  return {
    id: BigInt(raw.id),
    name: raw.name,
    displayName: raw.displayName ?? raw.name,
    baseCoin: raw.baseCoin ?? "",
    quoteCoinId: BigInt(raw.quoteCoinID),
    quoteCoin: raw.quoteCoin ?? "",
    quoteCoinPrecision: raw.quoteCoinPrecision ?? 0,
    pricePrecision: raw.pricePrecision,
    tickSize: raw.tickSize,
    minPrice: raw.minPrice,
    maxPrice: raw.maxPrice,
    quantityPrecision: raw.quantityPrecision,
    openInterestCap: raw.openInterestCap,
    openInterestCapUSD: raw.openInterestCapUSD,
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
    maxLeverage: raw.maxLeverage ?? 0,
    initLeverage: raw.initLeverage ?? 0,
    marginTiers: Array.isArray(raw.marginTiers)
      ? raw.marginTiers.map((t: WireRecord) => ({
          maxNotionalValue: t.maxNotionalValue,
          maintenanceMarginRate: t.maintenanceMarginRate,
          maxLeverage: t.maxLeverage,
          maintenanceDeduction: t.maintenanceDeduction,
        }))
      : [],
    fundingInterval: raw.fundingInterval ?? 0,
    interestRate: raw.interestRate ?? "",
    maxFundingRate: raw.maxFundingRate ?? "",
    minFundingRate: raw.minFundingRate ?? "",
    makerFee: raw.makerFee,
    takerFee: raw.takerFee,
    status: symbolStatusFromName(raw.status),
  };
}

function parsePerpsCoin(raw: WireRecord): PerpsCoinInfo {
  return {
    id: BigInt(raw.id),
    name: raw.name,
    precision: raw.precision ?? 0,
    marginRatio: raw.marginRatio ?? "",
    price: raw.price,
  };
}

function parsePerpsTicker(raw: WireRecord): PerpsTicker {
  return {
    symbol: raw.symbol,
    lastPx: raw.lastPx,
    lastSz: raw.lastSz,
    vwap: raw.vwap,
    change: raw.change,
    changePct: raw.changePct,
    openPx: raw.openPx,
    highPx: raw.highPx,
    lowPx: raw.lowPx,
    volume: raw.volume,
    quoteVolume: raw.quoteVolume,
    bidPx: raw.bidPx,
    bidSz: raw.bidSz,
    askPx: raw.askPx,
    askSz: raw.askSz,
    fundingRate: raw.fundingRate,
    nextFundingTime: BigInt(raw.nextFundingTime),
    indexPrice: raw.indexPrice,
    markPrice: raw.markPrice,
    openInterest: raw.openInterest,
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

function parseMarkPrice(raw: WireRecord): MarkPriceTicker {
  return {
    symbol: raw.symbol,
    fundingRate: raw.fundingRate,
    nextFundingTime: BigInt(raw.nextFundingTime),
    indexPrice: raw.indexPrice,
    markPrice: raw.markPrice,
    openInterest: raw.openInterest,
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
    symbol: raw.symbol ?? "",
    interval: raw.interval ?? "",
    openTime: BigInt(raw.openTime ?? raw.startTime ?? 0),
    closeTime: BigInt(raw.closeTime ?? raw.endTime ?? 0),
    openPx: raw.openPx ?? raw.open ?? "",
    highPx: raw.highPx ?? raw.high ?? "",
    lowPx: raw.lowPx ?? raw.low ?? "",
    closePx: raw.closePx ?? raw.close ?? "",
    volume: raw.volume ?? "",
    quoteVolume: raw.quoteVolume ?? "",
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

function parsePerpsAccountSnapshot(raw: WireRecord): PerpsAccountSnapshot {
  return {
    userAddress: raw.user ?? "",
    accountId: BigInt(raw.aid ?? 0),
    userId: BigInt(raw.uid ?? 0),
    accountValue: raw.av ?? "0",
    availableMargin: raw.am ?? "0",
    availableMarginIsolated: raw.ami ?? "0",
    availableMarginForTransfer: raw.amw ?? "0",
    isolatedFrozenMargin: raw.im ?? "0",
    crossFrozenMargin: raw.cm ?? "0",
    openIsolatedFrozenMargin: raw.oim ?? "0",
    openCrossFrozenMargin: raw.ocm ?? "0",
    balances: Array.isArray(raw.B) ? raw.B.map(parsePerpsSnapshotBalance) : [],
    openOrders: Array.isArray(raw.O) ? raw.O.map(parsePerpsSnapshotOrder) : [],
    openPositions: Array.isArray(raw.P) ? raw.P.map(parsePerpsSnapshotPosition) : [],
    symbolConfigs: Array.isArray(raw.S) ? raw.S.map(parsePerpsSnapshotSymbolConfig) : [],
  };
}

function parsePerpsSnapshotBalance(b: WireRecord): PerpsSnapshotBalance {
  return {
    coinId: BigInt(b.i ?? 0),
    coin: b.a ?? "",
    walletBalance: b.wb ?? "0",
    marginRatio: b.mr ?? "0",
    oraclePrice: b.px ?? "0",
    isolatedFrozen: b.iw === null ? null : (b.iw ?? "0"),
    availableForMargin: b.aw ?? "0",
    availableForWithdraw: b.ww ?? "0",
    walletMargin: b.wm ?? "0",
    availableMargin: b.am ?? "0",
  };
}

function parsePerpsSnapshotOrder(o: WireRecord): PerpsSnapshotOrder {
  const bigIntArray = (v: any): bigint[] | null =>
    v === null || v === undefined ? null : (v as any[]).map((x) => BigInt(x));
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
    positionSide: positionSideFromName(o.ps ?? "BOTH"),
    reduceOnly: o.R,
    stopPrice: o.sp === null ? null : (o.sp ?? "0"),
    stopType: o.st ? stopTypeFromName(o.st) : null,
    triggerType: o.tt ? triggerTypeFromName(o.tt) : null,
    positionId: o.pid === null || o.pid === undefined ? null : BigInt(o.pid),
    primaryOrderId: o.poid === null || o.poid === undefined ? null : BigInt(o.poid),
    attachedOrderIds: bigIntArray(o.aoids),
  };
}

function parsePerpsSnapshotPosition(p: WireRecord): PerpsSnapshotPosition {
  return {
    id: BigInt(p.i ?? 0),
    symbol: p.s ?? "",
    marginMode: marginModeFromName(p.m),
    positionSide: positionSideFromName(p.ps),
    size: p.sz ?? "0",
    isolatedMargin: p.iw === null ? null : (p.iw ?? "0"),
    avgEntryPrice: p.ep ?? "0",
    cumOpenCost: p.co ?? "0",
    cumTradingFee: p.cf ?? "0",
    cumClosedSize: p.cc ?? "0",
    avgClosePrice: p.cp ?? "0",
    maxSize: p.ms ?? "0",
    realizedPnL: p.cr ?? "0",
    unrealizedPnL: p.ur ?? "0",
    leverage: p.l ?? 0,
    liquidationPrice: p.lp ?? "0",
  };
}

function parsePerpsSnapshotSymbolConfig(s: WireRecord): PerpsSnapshotSymbolConfig {
  return {
    symbol: s.s ?? "",
    leverage: s.l ?? 0,
    marginMode: marginModeFromName(s.m),
  };
}

function parsePerpsOpenPositions(raw: WireRecord): PerpsOpenPositions {
  const positions = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.positions)
      ? raw.positions
      : [];
  return {
    blockTime: BigInt(raw.blockTime ?? 0),
    blockHeight: BigInt(raw.blockHeight ?? 0),
    positions: positions.map(parsePerpsPosition),
  };
}

function parsePerpsPosition(raw: WireRecord): PerpsPosition {
  return {
    id: BigInt(raw.id ?? 0),
    symbol: raw.symbol ?? "",
    marginMode: marginModeFromName(raw.marginMode),
    side: positionSideFromName(raw.side),
    size: raw.size ?? "0",
    initialMargin: raw.initialMargin ?? "0",
    avgEntryPrice: raw.avgEntryPrice ?? "0",
    cumOpenCost: raw.cumOpenCost ?? "0",
    cumTradingFee: raw.cumTradingFee ?? "0",
    cumClosedSize: raw.cumClosedSize ?? "0",
    avgClosePrice: raw.avgClosePrice ?? "0",
    maxSize: raw.maxSize ?? "0",
    realizedPnL: raw.realizedPnL ?? raw.realizedPnl ?? "0",
    leverage: raw.leverage ?? 0,
    active: raw.active,
    isTakenOver: raw.isTakenOver,
    takeOverPrice: raw.takeOverPrice ?? "0",
    createdAt: BigInt(raw.createdAt ?? 0),
    updatedAt: BigInt(raw.updatedAt ?? 0),
  };
}

function parsePerpsOrder(raw: WireRecord): PerpsOrder {
  return {
    symbol: raw.symbol ?? "",
    symbolId: BigInt(raw.symbolID ?? raw.symbolId ?? 0),
    accountId: BigInt(raw.accountID ?? raw.accountId ?? 0),
    orderID: BigInt(raw.orderID ?? 0),
    clOrdID: raw.clOrdID ?? "",
    side: orderSideFromName(raw.side),
    type: orderTypeFromName(raw.type),
    timeInForce: timeInForceFromName(raw.timeInForce),
    modifier: orderModifierFromName(raw.modifier ?? "NORMAL"),
    positionSide: positionSideFromName(raw.positionSide ?? "BOTH"),
    reduceOnly: raw.reduceOnly,
    price: raw.price ?? "0",
    quantity: raw.quantity ?? "0",
    executedQty: raw.executedQty ?? "0",
    cumQuoteQty: raw.cumQuoteQty ?? "0",
    status: orderStatusFromName(raw.status),
    stopPrice: raw.stopPrice,
    stopType: raw.stopType ? stopTypeFromName(raw.stopType) : undefined,
    triggerType: raw.triggerType ? triggerTypeFromName(raw.triggerType) : undefined,
    createTime: BigInt(raw.createTime ?? 0),
    updateTime: BigInt(raw.updateTime ?? 0),
  };
}

function parseFunding(raw: WireRecord): FundingPayment {
  return {
    symbol: raw.symbol ?? "",
    positionId: BigInt(raw.positionID ?? raw.positionId ?? 0),
    positionSide: positionSideFromName(raw.positionSide ?? "BOTH"),
    fundingFee: raw.fundingFee ?? "0",
    feeCoin: raw.feeCoin ?? "",
    timestamp: BigInt(raw.timestamp ?? raw.time ?? 0),
  };
}
