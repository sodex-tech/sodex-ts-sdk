import { canonicalStringify } from "./canonical-json";
import { ApiError, TransportError } from "./errors";
import { parseJsonBigInt } from "./json";

export interface SignedHeaders {
  /** API-key name. Unified user endpoints authenticate by wallet signature and omit it. */
  key?: string;
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
  /** Per-request timeout override. `null` disables the client default. */
  timeoutMs?: number | null;
  /** GET-only retry override. Signed and other write requests are never retried. */
  retry?: boolean | RetryOptions;
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
  /** Default request timeout. Defaults to 10 seconds; `null` disables it. */
  timeoutMs?: number | null;
  /** Optional GET-only retry policy. Disabled by default. */
  retry?: boolean | RetryOptions;
}

export interface RetryOptions {
  /** Total attempts including the first request. Defaults to 3. */
  maxAttempts?: number;
  /** Initial exponential-backoff delay. Defaults to 200 ms. */
  baseDelayMs?: number;
  /** Backoff ceiling. Defaults to 2 seconds. */
  maxDelayMs?: number;
  /** Retriable HTTP statuses. Defaults to 408, 429 and common 5xx responses. */
  statuses?: readonly number[];
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number | null;
  private readonly retry: boolean | RetryOptions;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.defaultHeaders = { Accept: "application/json", ...opts.defaultHeaders };
    this.timeoutMs = opts.timeoutMs === undefined ? 10_000 : opts.timeoutMs;
    this.retry = opts.retry ?? false;
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

  /**
   * GET returning the full response envelope instead of just `data` — for
   * endpoints where envelope fields themselves carry the payload (e.g.
   * `/api/v1/time`, whose server time is the envelope `timestamp`).
   */
  async getEnvelope<T>(path: string, opts: RequestOptions = {}): Promise<ResponseEnvelope<T>> {
    return this.requestEnvelope<T>("GET", path, opts);
  }

  private async request<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const parsed = await this.requestEnvelope<T>(method, path, opts);
    return (parsed.data ?? (undefined as unknown)) as T;
  }

  private async requestEnvelope<T>(
    method: string,
    path: string,
    opts: RequestOptions,
  ): Promise<ResponseEnvelope<T>> {
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
      if (opts.signed.key !== undefined) {
        headers["X-API-Key"] = opts.signed.key;
      }
      headers["X-API-Sign"] = opts.signed.signature;
      headers["X-API-Nonce"] = opts.signed.nonce.toString(10);
      if (opts.signed.chainId !== undefined) {
        headers["X-API-Chain"] = opts.signed.chainId.toString(10);
      }
    }

    const retry = retryPolicy(method === "GET" ? (opts.retry ?? this.retry) : false);
    const timeoutMs = opts.timeoutMs === undefined ? this.timeoutMs : opts.timeoutMs;
    let res!: Response;
    let text = "";

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort(opts.signal?.reason);
      if (opts.signal?.aborted) onAbort();
      else opts.signal?.addEventListener("abort", onAbort, { once: true });
      const timer =
        timeoutMs === null
          ? undefined
          : setTimeout(() => {
              timedOut = true;
              controller.abort(new Error(`request timed out after ${timeoutMs} ms`));
            }, timeoutMs);

      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        text = await res.text();
      } catch (err) {
        const aborted = opts.signal?.aborted === true;
        if (!aborted && attempt < retry.maxAttempts) {
          try {
            await retryDelay(retry, attempt, opts.signal);
          } catch (delayError) {
            throw new TransportError(`request aborted for ${method} ${url}`, delayError, {
              method,
              url,
              aborted: true,
            });
          }
          continue;
        }
        throw new TransportError(
          timedOut
            ? `request timed out after ${timeoutMs} ms for ${method} ${url}`
            : aborted
              ? `request aborted for ${method} ${url}`
              : `fetch failed for ${method} ${url}`,
          err,
          { method, url, timedOut, aborted },
        );
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
      }

      if (res.ok || attempt === retry.maxAttempts || !retry.statuses.has(res.status)) break;
      try {
        await retryDelay(retry, attempt, opts.signal);
      } catch (delayError) {
        throw new TransportError(`request aborted for ${method} ${url}`, delayError, {
          method,
          url,
          aborted: true,
        });
      }
    }

    if (!res.ok) {
      throw new TransportError(
        `HTTP ${res.status} from ${method} ${url}: ${text.slice(0, 200)}`,
        undefined,
        { method, url, status: res.status, responseBody: text },
      );
    }

    let parsed: ResponseEnvelope<T>;
    try {
      parsed = parseJsonBigInt(text) as ResponseEnvelope<T>;
    } catch (err) {
      throw new TransportError(
        `non-JSON response (status ${res.status}) from ${method} ${url}: ${text.slice(0, 200)}`,
        err,
        { method, url, status: res.status, responseBody: text },
      );
    }

    const rawCode = parsed.code as unknown;
    if (rawCode === undefined || rawCode === null) {
      throw new TransportError(
        `missing response code from ${method} ${url}: ${text.slice(0, 200)}`,
        undefined,
        { method, url, status: res.status, responseBody: text },
      );
    }
    const code = typeof rawCode === "bigint" ? Number(rawCode) : Number(rawCode);
    const ts =
      typeof parsed.timestamp === "bigint" ? parsed.timestamp : BigInt(parsed.timestamp ?? 0);
    if (code !== 0) {
      throw new ApiError(code, parsed.error ?? "unknown error", ts, {
        method,
        url,
        status: res.status,
      });
    }
    return parsed;
  }
}

interface ResolvedRetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  statuses: Set<number>;
}

function retryPolicy(input: boolean | RetryOptions): ResolvedRetryOptions {
  if (!input) {
    return { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, statuses: new Set() };
  }
  const options = input === true ? {} : input;
  return {
    maxAttempts: Math.max(1, Math.floor(options.maxAttempts ?? 3)),
    baseDelayMs: Math.max(0, options.baseDelayMs ?? 200),
    maxDelayMs: Math.max(0, options.maxDelayMs ?? 2_000),
    statuses: new Set(options.statuses ?? [408, 429, 500, 502, 503, 504]),
  };
}

async function retryDelay(
  options: ResolvedRetryOptions,
  failedAttempt: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("request aborted");
  }
  const delayMs = Math.min(
    options.baseDelayMs * 2 ** Math.max(0, failedAttempt - 1),
    options.maxDelayMs,
  );
  if (delayMs === 0) return;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new Error("request aborted"));
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
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
