import { describe, expect, it, vi } from "vitest";
import type { Signer } from "../src/common/signer";
import { PerpsClient } from "../src/perps";

describe("PerpsClient.updateCollateral", () => {
  // Validates coin-name resolution and the exact signed POST body used by Gateway main.
  it("posts updateCollateral to the dedicated endpoint", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"code":0,"timestamp":1780000000000,"data":null}', { status: 200 }),
      );
    const signer: Signer = {
      address: "0x1111111111111111111111111111111111111111",
      async sign() {
        return new Uint8Array(66);
      },
    };
    const client = new PerpsClient({
      baseUrl: "https://gateway.example",
      fetch: fetchMock,
      signer,
      nonce: () => 123n,
      coins: [{ id: 7n, name: "vUSDC", precision: 6, marginRatio: "1" }],
    });

    await client.updateCollateral({ accountId: 1001n, coin: "vUSDC", amount: "-50" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/api/v1/perps/trade/collateral",
      expect.objectContaining({
        method: "POST",
        body: '{"accountID":1001,"coinID":7,"amount":"-50"}',
      }),
    );
  });
});
