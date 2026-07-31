import { type PollOptions, pollUntil } from "../common/wait";
import type { SpotClient } from "./client";
import type { SpotAccountSnapshot } from "./types";

export interface WaitForSpotBalanceChangeOptions extends PollOptions<SpotAccountSnapshot> {
  accountId?: bigint;
  /** Also require the account to be activated (`accountId !== 0`). */
  requireActiveAccount?: boolean;
}

/** Wait until one spot balance differs from a previously observed value. */
export function waitForSpotBalanceChange(
  client: SpotClient,
  userAddress: string,
  coin: string,
  previousBalance: string | undefined,
  options: WaitForSpotBalanceChangeOptions = {},
): Promise<SpotAccountSnapshot> {
  return pollUntil(
    `${coin} spot balance change`,
    () => client.getAccountState(userAddress, options.accountId),
    (state) => {
      const balance = state.balances.find((candidate) => candidate.coin === coin)?.total;
      return (
        balance !== previousBalance && (!options.requireActiveAccount || state.accountId !== 0n)
      );
    },
    options,
  );
}
