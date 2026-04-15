# sodex-ts-sdk — agent notes

## Parser design: derivation OK, invention not

When mapping server wire records into SDK types (every `parse*` function under
`src/common/types.ts`, `src/spot/client.ts`, `src/perps/client.ts`), follow
this rule:

> **Derivation is allowed. Invention is not. Prefer `undefined` or a thrown
> error over producing a plausible-looking but incorrect value.**

- **Derivation** — computing a field from information the caller already
  supplied, or from another field on the same record that is definitionally
  equivalent. Example: populating `Kline.symbol` and `Kline.interval` from the
  `getKlines()` request context. The caller asked for that tuple; the whole
  response is about it. Derivation does not manufacture new information.

- **Invention** — filling a missing field with a default, a convention
  borrowed from another exchange, or a value from a differently-named field
  on the wire. Examples of invention we have removed and will not re-add:
  - `price ?? "0"` when the server omits a required price field. A zero
    price renders as a needle-to-zero candle downstream; it is not
    "missing data", it is wrong data.
  - `tradeCount: raw.n ?? 0`. Spec marks `n` optional; returning `0` for
    "unreported" silently conflates it with "zero trades".
  - `quoteVolume: raw.q ?? raw.v`. `v` is base volume, `q` is quote volume.
    Treating one as the other is a dimensional bug of ~5 orders of magnitude
    for BTC-class assets, and the `??` chain hides it behind a fallback.
  - `closeTime = openTime + intervalMs - 1`. REST does not emit a close
    time; the arithmetic assumes Binance-style exclusive-end buckets that
    Sodex may not share. If the server did not say it, the SDK does not
    say it either.
  - Multi-shape alias fallbacks like `raw.t ?? raw.openTime ?? raw.startTime`
    across a single documented REST wire. Only one of those is actually
    emitted; the others are dead branches that will silently mask schema
    drift when the server renames a field.

- **Required vs. optional** — match the wire spec exactly. If
  `sodex-docs/rest-v1/schema.md` marks a field required, missing it means
  the server violated its own contract; throw and let the caller see it. If
  the spec marks it optional, reflect that in the TypeScript type
  (`foo?: T`) and return `undefined` when absent — never a sentinel like
  `0` or `""`.

- **One parser per wire shape.** Do not union the REST shape and the
  WebSocket shape into a single `parse*` function "to be flexible". Each
  documented shape gets its own parser; when a WS client lands it will get
  its own `parseWsCandle` (etc.). Merging shapes hides drift and makes
  every `??` chain a silent type-confusion vector.

Callers who want a computed convenience (e.g. kline close time) can use
explicit helpers like `klineIntervalMs(interval)` and do the arithmetic
themselves. Putting those helpers next to the parser is fine; having the
parser invoke them automatically is not — the opt-in makes the assumption
visible at the call site.
