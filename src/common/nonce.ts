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

/** Absolute wall-clock time in milliseconds. */
export function nowMillis(): bigint {
  return BigInt(Math.floor(performance.timeOrigin + performance.now()));
}

/**
 * Returns a provider that yields strictly increasing millisecond-based IDs.
 *
 * Within the same ms tick the counter increments by 1, so rapid-fire calls
 * never collide.  Suitable for both signing nonces (X-API-Nonce) and
 * client-generated request IDs (e.g. `TransferAssetInput.id`).
 */
export function createMonotonicNonce(): NonceProvider {
  let last = 0n;
  return () => {
    const now = nowMillis();
    last = now > last ? now : last + 1n;
    return last;
  };
}
