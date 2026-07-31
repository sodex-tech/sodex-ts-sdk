import { describe, expect, it, vi } from "vitest";
import { createNonceManager, signerNonceKey } from "../src/common/nonce";
import type { Signer } from "../src/common/signer";
import { PerpsClient } from "../src/perps/client";
import { SpotClient } from "../src/spot/client";
import { UserClient } from "../src/user/client";
import type { UserSigner } from "../src/user/signer";

const SIGNER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

describe("NonceManager", () => {
  // Validates that one signer/network key receives strictly increasing nonces even when the clock is unchanged.
  it("allocates monotonic nonces per signer key", () => {
    const manager = createNonceManager({ clock: () => 1_000n });
    const key = signerNonceKey(286_623n, SIGNER_ADDRESS);

    expect(manager.next(key)).toBe(1_000n);
    expect(manager.next(key)).toBe(1_001n);
    expect(manager.next(key)).toBe(1_002n);
  });

  // Validates that concurrent work for one signer cannot send a later nonce before an earlier async signing task completes.
  it("serializes the complete async sign-and-send lifecycle", async () => {
    const manager = createNonceManager({ clock: () => 2_000n });
    const events: string[] = [];
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = manager.run("same-signer", async (nonce) => {
      events.push(`first:start:${nonce}`);
      markFirstStarted();
      await firstGate;
      events.push(`first:send:${nonce}`);
      return nonce;
    });
    const second = manager.run("same-signer", async (nonce) => {
      events.push(`second:start:${nonce}`);
      events.push(`second:send:${nonce}`);
      return nonce;
    });

    await firstStarted;
    expect(events).toEqual(["first:start:2000"]);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([2_000n, 2_001n]);
    expect(events).toEqual([
      "first:start:2000",
      "first:send:2000",
      "second:start:2001",
      "second:send:2001",
    ]);
  });

  // Validates that unrelated signer keys remain concurrent and do not share a global queue.
  it("does not serialize different signer keys", async () => {
    const manager = createNonceManager({ clock: () => 3_000n });
    const started: string[] = [];
    let markAStarted!: () => void;
    let markBStarted!: () => void;
    const aStarted = new Promise<void>((resolve) => {
      markAStarted = resolve;
    });
    const bStarted = new Promise<void>((resolve) => {
      markBStarted = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = manager.run("signer-a", async () => {
      started.push("a");
      markAStarted();
      await gate;
    });
    const second = manager.run("signer-b", async () => {
      started.push("b");
      markBStarted();
    });

    await Promise.all([aStarted, bStarted]);
    expect(started).toEqual(["a", "b"]);
    release();
    await Promise.all([first, second]);
  });

  // Validates Spot, Perps, and unified User writes sharing one signer use the same queue through signing and HTTP submission.
  it("coordinates signed requests across engine clients", async () => {
    const manager = createNonceManager({ clock: () => 4_000n });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const observedNonces: bigint[] = [];
    const signer: Signer = {
      address: SIGNER_ADDRESS,
      async sign(_payload, nonce) {
        observedNonces.push(nonce);
        if (observedNonces.length === 1) {
          markFirstStarted();
          await firstGate;
        }
        return new Uint8Array(66);
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response('{"code":0,"timestamp":1,"data":null}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const common = {
      baseUrl: "https://gateway.example",
      chainId: 286_623n,
      signer,
      nonceManager: manager,
      fetch: fetchMock,
    };
    const spot = new SpotClient(common);
    const perps = new PerpsClient(common);
    const user = new UserClient({ baseUrl: common.baseUrl, fetch: fetchMock });
    const userSigner: UserSigner = {
      address: SIGNER_ADDRESS,
      chainId: common.chainId,
      nonceManager: manager,
      nonceKey: signerNonceKey(common.chainId, SIGNER_ADDRESS),
      async signAddApiKey() {
        throw new Error("not used");
      },
      async signRevokeApiKey(_input, nonce) {
        observedNonces.push(nonce!);
        return {
          signature: `0x${"00".repeat(66)}`,
          nonce: nonce!,
          chainId: common.chainId,
        };
      },
      async signApproveBuilderFee() {
        throw new Error("not used");
      },
    };

    const first = spot.revokeApiKey({ accountId: 1n, name: "bot" });
    const second = perps.revokeApiKey({ accountId: 1n, name: "bot" });
    const third = user.revokeApiKeyWithSigner(
      SIGNER_ADDRESS,
      { accountId: 1n, name: "bot" },
      userSigner,
    );

    await firstStarted;
    expect(observedNonces).toEqual([4_000n]);
    releaseFirst();
    await Promise.all([first, second, third]);

    expect(observedNonces).toEqual([4_000n, 4_001n, 4_002n]);
    expect(
      fetchMock.mock.calls.map(([, init]) => {
        const headers = init?.headers as Record<string, string>;
        return headers["X-API-Nonce"];
      }),
    ).toEqual(["4000", "4001", "4002"]);
  });
});
