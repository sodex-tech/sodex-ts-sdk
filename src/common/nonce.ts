/**
 * Monotonic nonce / ID generation based on microsecond-precision timestamps.
 *
 * Uses `performance.timeOrigin + performance.now()` for real μs resolution
 * rather than `Date.now() * 1000` (which is ms precision disguised as μs).
 *
 * Available in Node ≥16, all modern browsers, Deno, and edge runtimes.
 */

export type NonceProvider = () => bigint;

/** Absolute wall-clock time in microseconds. */
export function nowMicros(): bigint {
  return BigInt(Math.floor((performance.timeOrigin + performance.now()) * 1_000));
}

/**
 * Returns a provider that yields strictly increasing microsecond-based IDs.
 *
 * Within the same μs tick the counter increments by 1, so rapid-fire calls
 * never collide.  Suitable for both signing nonces (X-API-Nonce) and
 * client-generated request IDs (e.g. `TransferAssetInput.id`).
 */
export function createMonotonicNonce(): NonceProvider {
  let last = 0n;
  return () => {
    const now = nowMicros();
    last = now > last ? now : last + 1n;
    return last;
  };
}
