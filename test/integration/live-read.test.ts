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
import { UserClient } from "../../src/user/client";

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

describeLive("live mainnet smoke — user and public", () => {
  const user = new UserClient({ baseUrl: MAINNET });
  const userAddress = "0x0fec2349f465ffa49d654e1825e204bc0828c8a5";

  // Validates the live transfer config is directly usable for coin/chain route discovery.
  it("discovers at least one deposit and withdrawal route", async () => {
    const assets = await user.getTransferConfigs();
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.some((asset) => asset.chains.length > 0)).toBe(true);
    expect(typeof assets[0]!.decimals).toBe("bigint");
  });

  // Validates live Gateway status, announcements, and address-scoped compatibility metadata.
  it("reads public and user metadata", async () => {
    const [status, userStatus, announcements, eligibility, apiKeys] = await Promise.all([
      user.getSystemStatus(),
      user.getUserStatus(userAddress),
      user.getAnnouncements({ page: 1, size: 1, lang: "en" }),
      user.getApiKeyEligibility(userAddress),
      user.getApiKeys(userAddress),
    ]);
    expect(typeof status).toBe("string");
    expect(["Active", "UserNotFound"]).toContain(userStatus.status);
    expect(typeof userStatus.userID).toBe("bigint");
    expect(Array.isArray(announcements.articles)).toBe(true);
    expect(typeof eligibility.eligible).toBe("boolean");
    expect(Array.isArray(apiKeys.spot)).toBe(true);
    expect(Array.isArray(apiKeys.perps)).toBe(true);
  });

  // Validates the current mainnet custody-address response is directly usable by a new integrator.
  it("reads a live custody deposit address", async () => {
    const address = await user.getDepositAddress(userAddress, "BASE_ETH");
    expect(address.chain).toBe("BASE_ETH");
    expect(address.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(address.status).toBe("Enabled");
  });
});
