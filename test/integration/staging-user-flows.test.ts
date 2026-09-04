/**
 * Opt-in staging E2E suite. Reads require SODEX_STAGING_E2E=1. Real writes
 * additionally require SODEX_STAGING_ALLOW_WRITES=I_UNDERSTAND and an
 * explicit flow name in SODEX_STAGING_FLOWS.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { UserClient } from "../../src";

const execFileAsync = promisify(execFile);
const stagingEnabled = process.env.SODEX_STAGING_E2E === "1";
const describeStaging = stagingEnabled ? describe : describe.skip;
const gatewayUrl = process.env.SODEX_STAGING_GATEWAY ?? process.env.SODEX_GATEWAY ?? "";
const userAddress = process.env.SODEX_USER_ADDRESS as `0x${string}` | undefined;
const coin = process.env.SODEX_COIN ?? "USDC";
const chain = process.env.SODEX_CHAIN ?? "BASE_ETH";
const selectedFlows = new Set(
  (process.env.SODEX_STAGING_FLOWS ?? "")
    .split(",")
    .map((flow) => flow.trim())
    .filter(Boolean),
);
const writesAuthorized = process.env.SODEX_STAGING_ALLOW_WRITES === "I_UNDERSTAND";

describeStaging("staging user flows", () => {
  // Validates staging transfer config and custody-address reads without provisioning external resources.
  it("discovers a route and reads the current deposit address", async () => {
    if (!gatewayUrl || !userAddress) {
      throw new Error("SODEX_STAGING_GATEWAY and SODEX_USER_ADDRESS are required");
    }
    const client = new UserClient({ baseUrl: gatewayUrl });
    const { route } = await client.getTransferRoute(coin, chain);
    const address = await client.getDepositAddress(userAddress, route.chain);
    expect(address.chain).toBe(route.chain);
    expect(typeof address.address).toBe("string");
    expect(typeof address.status).toBe("string");
  });

  // Validates a known real deposit hash can be followed through Gateway indexing without broadcasting funds.
  it.runIf(Boolean(process.env.SODEX_DEPOSIT_TX_HASH))(
    "queries a real deposit transaction",
    async () => {
      const client = new UserClient({ baseUrl: gatewayUrl });
      const result = await client.getDepositStatus(chain, process.env.SODEX_DEPOSIT_TX_HASH!);
      expect(result.total).toBeGreaterThan(0n);
    },
  );

  // Validates a known real withdrawal reference can be followed without submitting a second withdrawal.
  it.runIf(Boolean(process.env.SODEX_WITHDRAW_TX_HASH || process.env.SODEX_WITHDRAW_ID))(
    "queries a real withdrawal transaction",
    async () => {
      const client = new UserClient({ baseUrl: gatewayUrl });
      const result = await client.getWithdrawStatus(chain, {
        txHash: process.env.SODEX_WITHDRAW_TX_HASH,
        withdrawId: process.env.SODEX_WITHDRAW_ID,
      });
      expect(result.total).toBeGreaterThan(0n);
    },
  );

  // Executes the custody/bridge deposit example only after both global and flow-specific authorization.
  it.runIf(writeFlowEnabled("deposit"))(
    "executes a real deposit",
    () => runExample("deposit.ts", { SODEX_SEND_DEPOSIT: "1" }),
    600_000,
  );

  // Executes the selected balance-transfer direction only after explicit real-write authorization.
  it.runIf(writeFlowEnabled("transfer"))(
    "executes a real balance transfer",
    () => runExample("transfer.ts"),
    600_000,
  );

  // Executes withdrawal submission and status polling only after explicit real-write authorization.
  it.runIf(writeFlowEnabled("withdraw"))(
    "executes a real withdrawal",
    () => runExample("withdraw.ts"),
    600_000,
  );

  // Executes one real order and waits for WebSocket details only after explicit real-write authorization.
  it.runIf(writeFlowEnabled("trade"))(
    "executes a real trade",
    () => runExample("trade.ts"),
    600_000,
  );

  // Executes a real aggregate builder fee approval only after explicit real-write authorization.
  it.runIf(writeFlowEnabled("builder-fee"))(
    "approves a real builder fee",
    () => runExample("approve-builder-fee.ts"),
    600_000,
  );
});

function writeFlowEnabled(flow: string): boolean {
  return stagingEnabled && writesAuthorized && selectedFlows.has(flow);
}

async function runExample(file: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  if (!gatewayUrl) throw new Error("SODEX_STAGING_GATEWAY is required");
  const { stdout, stderr } = await execFileAsync(
    "./node_modules/.bin/tsx",
    [`examples/user-flows/${file}`],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv, SODEX_GATEWAY: gatewayUrl },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}
