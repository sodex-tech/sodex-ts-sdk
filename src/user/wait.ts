import { type PollOptions, pollUntil } from "../common/wait";
import type { UserClient } from "./client";
import type { DepositWithdrawalHistory, UserAddress, UserDepositAddress } from "./types";

export type WaitForDepositAddressOptions = PollOptions<UserDepositAddress>;
export type WaitForTransferOptions = PollOptions<DepositWithdrawalHistory>;

const TERMINAL_TRANSFER_STATUSES = new Set([
  "success",
  "succeeded",
  "failed",
  "rejected",
  "cancelled",
  "canceled",
]);

/** Wait until custody address creation leaves the empty/Processing state. */
export function waitForDepositAddress(
  client: UserClient,
  userAddress: UserAddress,
  chain: string,
  options: WaitForDepositAddressOptions = {},
): Promise<UserDepositAddress> {
  return pollUntil(
    `deposit address for ${chain}`,
    () => client.getDepositAddress(userAddress, chain),
    (address) => address.status !== "" && address.status !== "Processing",
    options,
  );
}

/** Wait until Gateway indexes at least one record for a source-chain deposit hash. */
export function waitForDeposit(
  client: UserClient,
  chain: string,
  txHash: string,
  options: WaitForTransferOptions = {},
): Promise<DepositWithdrawalHistory> {
  return pollUntil(
    `deposit ${txHash}`,
    () => client.getDepositStatus(chain, txHash),
    (history) => history.total > 0n,
    options,
  );
}

/** Wait until Gateway reports a terminal withdrawal record. */
export function waitForWithdrawal(
  client: UserClient,
  chain: string,
  reference: { withdrawId?: string; txHash?: string },
  options: WaitForTransferOptions = {},
): Promise<DepositWithdrawalHistory> {
  return pollUntil(
    `withdrawal ${reference.withdrawId ?? reference.txHash ?? ""}`,
    () => client.getWithdrawStatus(chain, reference),
    (history) => history.records.some((record) => isTerminalTransferStatus(record.status)),
    options,
  );
}

export function isTerminalTransferStatus(status: string): boolean {
  return TERMINAL_TRANSFER_STATUSES.has(status.toLowerCase());
}
