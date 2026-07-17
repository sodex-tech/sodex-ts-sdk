import { TransportError } from "./errors";
import { HttpClient } from "./http";

/**
 * Fetch server time from the gateway-level `GET /api/v1/time` endpoint.
 *
 * This endpoint lives at the gateway root (not under `/spot` or `/perps`),
 * so it is a standalone function rather than a client method. The wire
 * response carries no `data` — the server time IS the envelope `timestamp`:
 * `{"code":0,"timestamp":1784259635131}`.
 *
 * @param baseUrl gateway origin, e.g. `https://mainnet-gw.sodex.dev`
 * @returns server time in epoch milliseconds
 */
export async function getServerTime(
  baseUrl: string,
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<bigint> {
  const http = new HttpClient({
    baseUrl: `${baseUrl.replace(/\/$/, "")}/api/v1`,
    fetch: opts.fetch,
  });
  const envelope = await http.getEnvelope<never>("/time", { signal: opts.signal });
  // Type says `timestamp` is always present; distrust the wire anyway — a
  // missing timestamp here means there is no payload at all.
  const ts = envelope.timestamp as number | bigint | null | undefined;
  if (ts === undefined || ts === null) {
    throw new TransportError(
      `getServerTime: response envelope from ${http.baseUrl}/time is missing \`timestamp\``,
    );
  }
  return typeof ts === "bigint" ? ts : BigInt(ts);
}
