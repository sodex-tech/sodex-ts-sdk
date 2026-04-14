/**
 * Live smoke tests against the mainnet gateway. These validate that our
 * response mappers accept the current server schema. They are gated behind
 * `SODEX_LIVE=1` so the default `pnpm test` run stays offline and
 * deterministic.
 *
 * Run with:
 *   SODEX_LIVE=1 pnpm test test/integration
 */
import { describe, expect, it } from "vitest";
import { PerpsClient } from "../../src/perps/client";
import { SpotClient } from "../../src/spot/client";

const live = process.env.SODEX_LIVE === "1";
const describeLive = live ? describe : describe.skip;

const MAINNET = "https://mainnet-gw.sodex.dev";

describeLive("live mainnet smoke — spot", () => {
  const spot = new SpotClient({ baseUrl: MAINNET });

  it("GET /markets/symbols returns at least one symbol", async () => {
    const symbols = await spot.getSymbols();
    expect(symbols.length).toBeGreaterThan(0);
    const first = symbols[0]!;
    expect(typeof first.id).toBe("bigint");
    expect(first.name).toMatch(/[a-zA-Z]/);
    expect(first.displayName.length).toBeGreaterThan(0);
    expect(["TRADING", "HALT"]).toContain(first.status);
  });

  it("GET /markets/tickers parses cleanly", async () => {
    const tickers = await spot.getTickers();
    expect(tickers.length).toBeGreaterThan(0);
    for (const t of tickers) {
      expect(typeof t.openTime).toBe("bigint");
      expect(typeof t.closeTime).toBe("bigint");
    }
  });

  it("registry resolves displayName to id", async () => {
    await spot.refreshMarkets();
    const any = spot.symbols.list()[0]!;
    expect(spot.symbols.resolveId(any.displayName)).toBe(any.id);
    expect(spot.symbols.resolveId(any.name)).toBe(any.id);
  });
});

describeLive("live mainnet smoke — perps", () => {
  const perps = new PerpsClient({ baseUrl: MAINNET });

  it("GET /markets/symbols returns at least one perps symbol", async () => {
    const symbols = await perps.getSymbols();
    expect(symbols.length).toBeGreaterThan(0);
    for (const s of symbols) {
      expect(typeof s.id).toBe("bigint");
      expect(s.maxLeverage).toBeGreaterThan(0);
    }
  });

  it("GET /markets/mark-prices parses cleanly", async () => {
    const mps = await perps.getMarkPrices();
    expect(mps.length).toBeGreaterThan(0);
    for (const m of mps) {
      expect(typeof m.nextFundingTime).toBe("bigint");
    }
  });
});
