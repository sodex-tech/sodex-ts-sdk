import { describe, expect, it, vi } from "vitest";
import { TransportError } from "../src/common/errors";
import { HttpClient } from "../src/common/http";

function okResponse(data: unknown = null): Response {
  return new Response(JSON.stringify({ code: 0, timestamp: 1, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HttpClient transport controls", () => {
  // Validates that the default/per-client timeout aborts a hanging request and exposes structured failure context.
  it("times out a hanging request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason ?? new Error("aborted")),
            { once: true },
          );
        }),
    );
    const client = new HttpClient({
      baseUrl: "https://gateway.example",
      fetch: fetchMock,
      timeoutMs: 5,
    });

    const error = await client.get("/slow").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).context).toMatchObject({
      method: "GET",
      timedOut: true,
      aborted: false,
    });
  });

  // Validates that opt-in retries recover an idempotent GET after a transient Gateway status.
  it("retries configured GET requests", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(okResponse({ value: "ready" }));
    const client = new HttpClient({
      baseUrl: "https://gateway.example",
      fetch: fetchMock,
      retry: { maxAttempts: 2, baseDelayMs: 0 },
    });

    await expect(client.get<{ value: string }>("/status")).resolves.toEqual({
      value: "ready",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Validates that POST requests are never replayed even when the client retry policy is enabled.
  it("never retries write requests", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));
    const client = new HttpClient({
      baseUrl: "https://gateway.example",
      fetch: fetchMock,
      retry: true,
    });

    await expect(client.post("/orders", { body: { symbol: "BTC-USD" } })).rejects.toThrow(
      /HTTP 503/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Validates that a caller AbortSignal stops the transport before any retry is attempted.
  it("honors caller cancellation", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      controller.abort(new Error("caller stopped"));
      throw init?.signal?.reason;
    });
    const client = new HttpClient({
      baseUrl: "https://gateway.example",
      fetch: fetchMock,
      retry: true,
    });

    const error = await client
      .get("/status", { signal: controller.signal })
      .catch((cause) => cause);

    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).context.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
