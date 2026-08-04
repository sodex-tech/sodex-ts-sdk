import { describe, expect, it, vi } from "vitest";
import { ClobGateway, ZERO_ADDRESS, sendEvmCustodyDeposit } from "../src/evm";

const DEPOSIT_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222" as const;

describe("EVM custody deposit", () => {
  // Validates ERC20 custody deposits call transfer directly to the assigned custody address.
  it("submits an ERC20 transfer", async () => {
    const writeContract = vi.fn().mockResolvedValue("0xerc20");
    const walletClient = { account: null, chain: null, writeContract } as any;

    const hash = await sendEvmCustodyDeposit({
      walletClient,
      depositAddress: DEPOSIT_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
      amount: 5_000_000n,
    });

    expect(hash).toBe("0xerc20");
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN_ADDRESS,
        functionName: "transfer",
        args: [DEPOSIT_ADDRESS, 5_000_000n],
      }),
    );
  });

  // Validates native custody deposits use a value transfer and never call the ERC20 contract.
  it("submits a native-token transfer", async () => {
    const sendTransaction = vi.fn().mockResolvedValue("0xnative");
    const walletClient = { account: null, chain: null, sendTransaction } as any;

    const hash = await sendEvmCustodyDeposit({
      walletClient,
      depositAddress: DEPOSIT_ADDRESS,
      tokenAddress: ZERO_ADDRESS,
      amount: 10n,
    });

    expect(hash).toBe("0xnative");
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ to: DEPOSIT_ADDRESS, value: 10n }),
    );
  });
});

describe("ValueChain engine deposit", () => {
  // Validates a direct Perps deposit forwards the recipient and destination=1 to ClobGateway.
  it("submits the four-argument Perps deposit", async () => {
    const writeContract = vi.fn().mockResolvedValue("0xperps");
    const gateway = new ClobGateway({ walletClient: { writeContract } as any });

    const hash = await gateway.depositErc20({
      token: TOKEN_ADDRESS,
      amount: 5_000_000n,
      recipient: DEPOSIT_ADDRESS,
      destination: "perps",
    });

    expect(hash).toBe("0xperps");
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "depositERC20",
        args: [TOKEN_ADDRESS, 5_000_000n, DEPOSIT_ADDRESS, 1n],
      }),
    );
  });
});
