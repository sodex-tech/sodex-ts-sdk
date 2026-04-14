import { describe, expect, it } from "vitest";
import { SymbolRegistry } from "../../src/registry/symbol-registry";

describe("SymbolRegistry", () => {
  it("dedupes concurrent refresh() into one fetcher call", async () => {
    let calls = 0;
    let resolveFetcher: (list: Array<{ id: bigint; name: string; displayName: string }>) => void =
      () => {};
    const r = new SymbolRegistry(
      () =>
        new Promise((resolve) => {
          calls++;
          resolveFetcher = resolve;
        }),
    );

    const first = r.refresh();
    const second = r.refresh();
    resolveFetcher([{ id: 1n, name: "vBTC_vUSDC", displayName: "BTC/USDC" }]);
    await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(r.isLoaded()).toBe(true);
    expect(r.resolveId("BTC/USDC")).toBe(1n);
  });

  it("resolves via displayName, wire name, or bigint id", async () => {
    const r = new SymbolRegistry(async () => [
      { id: 42n, name: "vETH_vUSDC", displayName: "ETH/USDC" },
    ]);
    await r.refresh();
    expect(r.resolveId("ETH/USDC")).toBe(42n);
    expect(r.resolveId("vETH_vUSDC")).toBe(42n);
    expect(r.resolveId(42n)).toBe(42n);
  });

  it("throws UnknownSymbolError with suggestions for near-misses", async () => {
    const r = new SymbolRegistry(async () => [
      { id: 1n, name: "vBTC_vUSDC", displayName: "BTC/USDC" },
      { id: 2n, name: "vETH_vUSDC", displayName: "ETH/USDC" },
    ]);
    await r.refresh();
    try {
      r.resolveId("BTC"); // no exact match, but substring of BTC/USDC
      throw new Error("expected throw");
    } catch (err) {
      expect(String(err)).toMatch(/Unknown symbol "BTC"/);
      expect(String(err)).toMatch(/BTC\/USDC/);
    }
  });

  it("allows external snapshot injection to skip the network", () => {
    const r = new SymbolRegistry(async () => {
      throw new Error("fetcher should not run");
    });
    r.load([{ id: 7n, name: "vFOO_vUSDC", displayName: "FOO/USDC" }]);
    expect(r.resolveId("FOO/USDC")).toBe(7n);
    expect(r.isLoaded()).toBe(true);
  });
});
