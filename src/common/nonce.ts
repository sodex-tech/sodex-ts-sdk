/**
 * Monotonic nonce / ID generation based on millisecond-precision timestamps.
 *
 * The Sodex API requires nonces within `(T - 2 days, T + 1 day)` where `T`
 * is the Unix millisecond timestamp (sodex-docs/README.md §Sodex nonces).
 *
 * Uses `performance.timeOrigin + performance.now()` for sub-millisecond
 * precision rather than `Date.now()` alone, so consecutive calls within
 * the same millisecond are disambiguated by the fractional part before
 * the monotonic bump takes over.
 *
 * Available in Node ≥16, all modern browsers, Deno, and edge runtimes.
 */

export type NonceProvider = () => bigint;

export interface NonceManager {
  /** Return the next strictly increasing nonce for one signer/network key. */
  next(key: string): bigint;
  /**
   * Serialize the complete signed-request lifecycle for one key.
   *
   * Keeping nonce allocation, asynchronous wallet signing, and HTTP sending
   * inside the same critical section prevents a slower wallet prompt from
   * letting a later request overtake an earlier nonce.
   */
  run<T>(key: string, task: (nonce: bigint) => Promise<T>): Promise<T>;
}

export interface NonceManagerOptions {
  /** Wall-clock source in Unix milliseconds. Defaults to {@link nowMillis}. */
  clock?: () => bigint;
}

/** Absolute wall-clock time in milliseconds. */
export function nowMillis(): bigint {
  return BigInt(Math.floor(performance.timeOrigin + performance.now()));
}

/** Stable key shared by every SDK client using the same signer and network. */
export function signerNonceKey(chainId: bigint, address: string): string {
  return `${chainId.toString(10)}:${address.toLowerCase()}`;
}

/**
 * Create a shared, concurrency-safe nonce manager.
 *
 * JavaScript runs `next()` atomically, while `run()` additionally queues the
 * asynchronous sign-and-send path per key. Different signers remain fully
 * concurrent.
 */
export function createNonceManager(options: NonceManagerOptions = {}): NonceManager {
  const clock = options.clock ?? nowMillis;
  const lastByKey = new Map<string, bigint>();
  const tails = new Map<string, Promise<void>>();

  const next = (key: string): bigint => {
    const now = clock();
    const last = lastByKey.get(key) ?? 0n;
    const nonce = now > last ? now : last + 1n;
    lastByKey.set(key, nonce);
    return nonce;
  };

  return {
    next,
    async run<T>(key: string, task: (nonce: bigint) => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = previous.catch(() => {}).then(() => current);
      tails.set(key, tail);

      await previous.catch(() => {});
      try {
        return await task(next(key));
      } finally {
        release();
        if (tails.get(key) === tail) tails.delete(key);
      }
    },
  };
}

/** Process-wide default so separate client instances cannot reuse a nonce. */
export const globalNonceManager = createNonceManager();

/**
 * Returns a provider that yields strictly increasing millisecond-based IDs.
 *
 * Within the same ms tick the counter increments by 1, so rapid-fire calls
 * never collide.  Suitable for both signing nonces (X-API-Nonce) and
 * client-generated request IDs (e.g. `TransferAssetInput.id`).
 */
export function createMonotonicNonce(): NonceProvider {
  const manager = createNonceManager();
  return () => manager.next("default");
}
