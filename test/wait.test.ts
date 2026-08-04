import { describe, expect, it, vi } from "vitest";
import { WaitAbortedError, WaitTimeoutError, pollUntil } from "../src/common/wait";
import type { PerpsClient } from "../src/perps/client";
import { waitForPerpsBalanceChange } from "../src/perps/wait";
import type { SpotClient } from "../src/spot/client";
import { waitForSpotBalanceChange } from "../src/spot/wait";
import type { UserClient } from "../src/user/client";
import { isSuccessfulTransferStatus, waitForDeposit, waitForWithdrawal } from "../src/user/wait";

describe("workflow wait helpers", () => {
  // Validates that deposit polling returns the first indexed record and reports every successful observation.
  it("waits for a deposit to be indexed", async () => {
    const pending = { records: [], total: 0n };
    const indexed = { records: [{ status: "Processing" }], total: 1n };
    const client = {
      getDepositStatus: vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(indexed),
    } as unknown as UserClient;
    const onUpdate = vi.fn();

    await expect(
      waitForDeposit(client, "BASE_ETH", "0xdeposit", {
        intervalMs: 0,
        timeoutMs: 1_000,
        onUpdate,
      }),
    ).resolves.toBe(indexed);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  // Validates withdrawal polling waits for every returned record to become terminal before resolving.
  it("waits for all withdrawal records to reach a terminal status", async () => {
    const processing = { records: [{ status: "Processing" }], total: 1n };
    const partiallyFinished = {
      records: [{ status: "Success" }, { status: "Processing" }],
      total: 2n,
    };
    const succeeded = {
      records: [{ status: "Success" }, { status: "Succeeded" }],
      total: 2n,
    };
    const client = {
      getWithdrawStatus: vi
        .fn()
        .mockResolvedValueOnce(processing)
        .mockResolvedValueOnce(partiallyFinished)
        .mockResolvedValueOnce(succeeded),
    } as unknown as UserClient;

    await expect(
      waitForWithdrawal(
        client,
        "BASE_ETH",
        { withdrawId: "42" },
        { intervalMs: 0, timeoutMs: 1_000 },
      ),
    ).resolves.toBe(succeeded);
  });

  // Validates successful withdrawal statuses stay distinct from terminal failure outcomes.
  it("classifies only successful terminal withdrawal statuses as successful", () => {
    expect(isSuccessfulTransferStatus("Success")).toBe(true);
    expect(isSuccessfulTransferStatus("succeeded")).toBe(true);
    expect(isSuccessfulTransferStatus("Failed")).toBe(false);
    expect(isSuccessfulTransferStatus("Cancelled")).toBe(false);
  });

  // Validates the spot helper waits for both a changed balance and optional account activation.
  it("waits for an active spot account balance change", async () => {
    const inactive = {
      accountId: 0n,
      balances: [{ coin: "USDC", total: "11" }],
    };
    const active = {
      accountId: 7n,
      balances: [{ coin: "USDC", total: "11" }],
    };
    const client = {
      getAccountState: vi.fn().mockResolvedValueOnce(inactive).mockResolvedValueOnce(active),
    } as unknown as SpotClient;

    await expect(
      waitForSpotBalanceChange(client, "0xuser", "USDC", "10", {
        requireActiveAccount: true,
        intervalMs: 0,
        timeoutMs: 1_000,
      }),
    ).resolves.toBe(active);
  });

  // Validates callers can ignore unrelated balance changes until the expected credit is visible.
  it("waits for the caller's expected spot balance", async () => {
    const unrelatedChange = {
      accountId: 7n,
      balances: [{ coin: "USDC", total: "9" }],
    };
    const expectedCredit = {
      accountId: 7n,
      balances: [{ coin: "USDC", total: "12" }],
    };
    const client = {
      getAccountState: vi
        .fn()
        .mockResolvedValueOnce(unrelatedChange)
        .mockResolvedValueOnce(expectedCredit),
    } as unknown as SpotClient;

    await expect(
      waitForSpotBalanceChange(client, "0xuser", "USDC", "10", {
        isExpectedBalance: (balance) => balance === "12",
        intervalMs: 0,
        timeoutMs: 1_000,
      }),
    ).resolves.toBe(expectedCredit);
  });

  // Validates direct EVM-to-Perps deposits wait until the expected wallet credit is visible.
  it("waits for the caller's expected Perps balance", async () => {
    const pending = { blockTime: 1n, blockHeight: 1n, balances: [] };
    const credited = {
      blockTime: 2n,
      blockHeight: 2n,
      balances: [{ coinId: 0n, coin: "vUSDC", total: "12", marginRatio: "1", price: "1" }],
    };
    const client = {
      getBalances: vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(credited),
    } as unknown as PerpsClient;

    await expect(
      waitForPerpsBalanceChange(client, "0xuser", "vUSDC", undefined, {
        isExpectedBalance: (balance) => balance === "12",
        intervalMs: 0,
        timeoutMs: 1_000,
      }),
    ).resolves.toBe(credited);
  });

  // Validates that an unmet condition exits with a typed timeout instead of looping forever.
  it("throws a typed timeout error", async () => {
    await expect(
      pollUntil("never ready", async () => false, Boolean, {
        intervalMs: 0,
        timeoutMs: 0,
      }),
    ).rejects.toBeInstanceOf(WaitTimeoutError);
  });

  // Validates that cancellation interrupts the wait delay and returns a typed abort error.
  it("supports AbortSignal cancellation", async () => {
    const controller = new AbortController();
    const wait = pollUntil("cancelled wait", () => new Promise<boolean>(() => {}), Boolean, {
      intervalMs: 10_000,
      timeoutMs: 20_000,
      signal: controller.signal,
    });
    controller.abort(new Error("stop"));

    await expect(wait).rejects.toBeInstanceOf(WaitAbortedError);
  });
});
