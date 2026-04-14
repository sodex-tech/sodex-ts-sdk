import { canonicalStringify } from "./canonical-json";
import { ApiError, TransportError } from "./errors";
import { parseJsonBigInt } from "./json";

export interface SignedHeaders {
  key: string;
  signature: string;
  nonce: bigint;
  chainId?: bigint;
}

export interface RequestOptions {
  query?: Record<string, string | number | bigint | boolean | undefined | null>;
  body?: unknown;
  /** Pre-serialized canonical JSON body. Takes precedence over `body`. */
  bodyText?: string;
  signed?: SignedHeaders;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ResponseEnvelope<T> {
  code: number;
  data?: T;
  error?: string;
  timestamp: number | bigint;
}

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  defaultHeaders?: Record<string, string>;
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.defaultHeaders = { Accept: "application/json", ...opts.defaultHeaders };
  }

  async get<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  async post<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  async del<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("DELETE", path, opts);
  }

  private async request<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const url = buildUrl(this.baseUrl, path, opts.query);
    const headers: Record<string, string> = { ...this.defaultHeaders, ...opts.headers };

    let body: string | undefined;
    if (opts.bodyText !== undefined) {
      body = opts.bodyText;
      headers["Content-Type"] = "application/json";
    } else if (opts.body !== undefined) {
      body = canonicalStringify(opts.body);
      headers["Content-Type"] = "application/json";
    }
    if (opts.signed) {
      headers["X-API-Key"] = opts.signed.key;
      headers["X-API-Sign"] = opts.signed.signature;
      headers["X-API-Nonce"] = opts.signed.nonce.toString(10);
      if (opts.signed.chainId !== undefined) {
        headers["X-API-Chain"] = opts.signed.chainId.toString(10);
      }
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, { method, headers, body, signal: opts.signal });
    } catch (err) {
      throw new TransportError(`fetch failed for ${method} ${url}`, err);
    }

    const text = await res.text();

    if (!res.ok) {
      throw new TransportError(
        `HTTP ${res.status} from ${method} ${url}: ${text.slice(0, 200)}`,
      );
    }

    let parsed: ResponseEnvelope<T>;
    try {
      parsed = parseJsonBigInt(text) as ResponseEnvelope<T>;
    } catch (err) {
      throw new TransportError(
        `non-JSON response (status ${res.status}) from ${method} ${url}: ${text.slice(0, 200)}`,
        err,
      );
    }

    const rawCode = parsed.code as unknown;
    if (rawCode === undefined || rawCode === null) {
      throw new TransportError(
        `missing response code from ${method} ${url}: ${text.slice(0, 200)}`,
      );
    }
    const code = typeof rawCode === "bigint" ? Number(rawCode) : Number(rawCode);
    const ts =
      typeof parsed.timestamp === "bigint" ? parsed.timestamp : BigInt(parsed.timestamp ?? 0);
    if (code !== 0) {
      throw new ApiError(code, parsed.error ?? "unknown error", ts);
    }
    return (parsed.data ?? (undefined as unknown)) as T;
  }
}

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, typeof v === "bigint" ? v.toString(10) : String(v));
    }
  }
  return url.toString();
}
