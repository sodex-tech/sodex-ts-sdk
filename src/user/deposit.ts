import type { ChainTransferConfig, CoinTransferConfig, UserDepositAddress } from "./types";

export interface DepositBuildInput {
  asset: CoinTransferConfig;
  route: ChainTransferConfig;
  routeType: "custody" | "bridge";
  amount: string;
  rawAmount: bigint;
  /** Custody address for custody deposits; bridge contract for bridge deposits. */
  destination: string;
  userDepositAddress?: UserDepositAddress;
}

export interface DepositSubmission {
  txHash: string;
}

export interface BuiltDepositTransaction {
  submit(): Promise<DepositSubmission>;
}

/**
 * Integration boundary for chain- or bridge-specific deposit construction.
 * Building and submitting are separate so an integrator can inspect, simulate,
 * or request wallet approval before broadcasting.
 */
export interface DepositAdapter {
  buildDeposit(input: DepositBuildInput): Promise<BuiltDepositTransaction>;
}
