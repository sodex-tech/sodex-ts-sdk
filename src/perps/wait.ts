import { type PollOptions, pollUntil } from "../common/wait";
import type { PerpsClient } from "./client";
import type { PerpsAccountBalances } from "./types";

export interface WaitForPerpsBalanceChangeOptions extends PollOptions<PerpsAccountBalances> {
  accountId?: bigint;
  /** Optionally require the observed balance to match the caller's expected credit/debit. */
  isExpectedBalance?: (balance: string | undefined, state: PerpsAccountBalances) => boolean;
}

/** Wait until one Perps wallet balance differs from a previously observed value. */
export function waitForPerpsBalanceChange(
  client: PerpsClient,
  userAddress: string,
  coin: string,
  previousBalance: string | undefined,
  options: WaitForPerpsBalanceChangeOptions = {},
): Promise<PerpsAccountBalances> {
  return pollUntil(
    `${coin} Perps balance change`,
    () => client.getBalances(userAddress, options.accountId),
    (state) => {
      const balance = state.balances.find((candidate) => candidate.coin === coin)?.total;
      return (
        balance !== previousBalance &&
        (!options.isExpectedBalance || options.isExpectedBalance(balance, state))
      );
    },
    options,
  );
}
