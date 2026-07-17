/**
 * `getServerTime` — gateway-level `GET /api/v1/time`. The server time is the
 * envelope `timestamp` itself (the response carries no `data`), so these
 * tests pin the URL, the envelope-timestamp extraction, and the
 * missing-timestamp / non-zero-code failure paths.
 */
import { describe, expect, it } from "vitest";
import { ApiError, TransportError } from "../src/common/errors";
import { getServerTime } from "../src/common/time";

function fakeFetch(body: string, capture?: { url?: string }): typeof fetch {
  return async (input: RequestInfo | URL) => {
    if (capture) capture.url = String(input);
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("getServerTime", () => {
  it("requests GET {baseUrl}/api/v1/time and returns the envelope timestamp", async () => {
    const capture: { url?: string } = {};
    const ts = await getServerTime("https://mainnet-gw.sodex.dev", {
      fetch: fakeFetch(`{"code":0,"timestamp":1784259635131}`, capture),
    });
    expect(capture.url).toBe("https://mainnet-gw.sodex.dev/api/v1/time");
    expect(ts).toBe(1_784_259_635_131n);
  });

  it("strips a trailing slash from baseUrl", async () => {
    const capture: { url?: string } = {};
    await getServerTime("https://mainnet-gw.sodex.dev/", {
      fetch: fakeFetch(`{"code":0,"timestamp":1}`, capture),
    });
    expect(capture.url).toBe("https://mainnet-gw.sodex.dev/api/v1/time");
  });

  it("throws TransportError when the envelope omits `timestamp` (no payload at all)", async () => {
    await expect(
      getServerTime("https://mainnet-gw.sodex.dev", {
        fetch: fakeFetch(`{"code":0}`),
      }),
    ).rejects.toThrow(TransportError);
  });

  it("surfaces a non-zero envelope code as ApiError instead of returning a time", async () => {
    await expect(
      getServerTime("https://mainnet-gw.sodex.dev", {
        fetch: fakeFetch(`{"code":1001,"error":"boom","timestamp":5}`),
      }),
    ).rejects.toThrow(ApiError);
  });
});
