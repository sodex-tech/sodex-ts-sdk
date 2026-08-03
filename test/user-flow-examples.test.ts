import { decodeAbiParameters, parseAbiParameters } from "viem";
import { describe, expect, it, vi } from "vitest";
import { UserClient } from "../src";
import { encodeWithdrawCommand } from "../src/evm";

const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

describe("UserClient user flows", () => {
  // Validates case-insensitive token/chain discovery and bigint-preserving config decoding.
  it("resolves a transfer route from the Gateway asset config", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(`{
        "code": 0,
        "timestamp": 1780000000000,
        "data": [{
          "id": 0,
          "name": "vUSDC",
          "coin": "USDC",
          "tokenAddress": "0xcb7F80Dff2727c791fA491722c428e6657f7e2c6",
          "decimals": 6,
          "chains": [{
            "chain": "BASE_ETH",
            "coinAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "bridgeAddress": "",
            "custodyWithdrawFee": "1",
            "bridgeWithdrawFee": "0",
            "minDepositAmount": "5",
            "minWithdrawAmount": "5",
            "custodyDisabled": false
          }]
        }]
      }`),
    );
    const client = new UserClient({ baseUrl: "https://gateway.example", fetch: fetchMock });

    const { asset, route } = await client.getTransferRoute("usdc", "base_eth");

    expect(asset.id).toBe(0n);
    expect(asset.decimals).toBe(6n);
    expect(route.minWithdrawAmount).toBe("5");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/api/v1/asset/config?coin=usdc",
      expect.objectContaining({ method: "GET" }),
    );
  });

  // Validates the deposit example's single-address and partner-quota creation endpoints.
  it("maps current deposit-address creation endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        jsonResponse(
          '{"code":0,"timestamp":1780000000000,"data":{"chain":"BASE_ETH","address":"0xabc","status":"Processing"}}',
        ),
      );
    const client = new UserClient({ baseUrl: "https://gateway.example/", fetch: fetchMock });

    await client.createDepositAddress(USER_ADDRESS, { chain: "BASE_ETH" });
    await client.createPartnerDepositAddress(USER_ADDRESS, { chain: "BASE_ETH" }, "partner-key");

    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      [`https://gateway.example/api/v1/user/${USER_ADDRESS}/deposit-address`, "POST"],
      [`https://gateway.example/api/v2/user/${USER_ADDRESS}/deposit-address`, "POST"],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      chain: "BASE_ETH",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ "X-API-Key": "partner-key" });
  });

  // Validates withdrawal status lookup and exact preservation of uint64 withdrawal identifiers.
  it("keeps a large withdrawal ID exact", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(`{
        "code": 0,
        "timestamp": 1780000000000,
        "data": {
          "records": [{"withdrawId": 18446744073709551615, "status": "Success"}],
          "total": 1
        }
      }`),
    );
    const client = new UserClient({ baseUrl: "https://gateway.example", fetch: fetchMock });

    const result = await client.getWithdrawStatus("BASE_ETH", { txHash: "0xabc" });

    expect(result.total).toBe(1n);
    expect(result.records[0]?.withdrawId).toBe(18446744073709551615n);
  });

  // Validates the deposit/withdraw example methods and their Gateway HTTP verbs.
  it("maps deposit address, status, and withdrawal submission endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        jsonResponse('{"code":0,"timestamp":1780000000000,"data":{}}'),
      );
    const client = new UserClient({ baseUrl: "https://gateway.example", fetch: fetchMock });

    await client.getDepositAddress(USER_ADDRESS, "BASE_ETH");
    await client.getDepositStatus("BASE_ETH", "0xdeposit");
    await client.submitEvmWithdraw(USER_ADDRESS, {
      cmdData: "0x1234",
      nonce: "7",
      deadline: "1780000000",
      signature: "0xabcd",
    });

    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      [`https://gateway.example/api/v1/user/${USER_ADDRESS}/deposit-address?chain=BASE_ETH`, "GET"],
      ["https://gateway.example/api/v1/user/deposit/status?chain=BASE_ETH&txHash=0xdeposit", "GET"],
      [`https://gateway.example/api/v1/user/${USER_ADDRESS}/evm-withdraw`, "POST"],
    ]);
  });

  // Validates that a proxy/WAF HTML response produces a useful transport error instead of JSON noise.
  it("reports non-JSON HTTP failures with status and response context", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("<!DOCTYPE html><title>blocked</title>", { status: 403 }));
    const client = new UserClient({ baseUrl: "https://gateway.example", fetch: fetchMock });

    await expect(client.getTransferConfigs("USDC")).rejects.toThrow(
      /HTTP 403 from GET .*<!DOCTYPE html>/,
    );
  });

  // Validates the latest Gateway user-status endpoint and exact uint64 user ID decoding.
  it("queries whether a wallet is registered", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(`{
        "code": 0,
        "timestamp": 1780000000000,
        "data": {
          "status": "Active",
          "userID": 18446744073709551615
        }
      }`),
    );
    const client = new UserClient({ baseUrl: "https://gateway.example", fetch: fetchMock });

    await expect(client.getUserStatus(USER_ADDRESS)).resolves.toEqual({
      status: "Active",
      userID: 18446744073709551615n,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://gateway.example/api/v1/user/${USER_ADDRESS}/status`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  // Validates API-key registration sends wallet signature headers without an engine API-key header.
  it("maps the unified API-key registration write", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        jsonResponse('{"code":0,"timestamp":1780000000000,"data":null}'),
      );
    const client = new UserClient({ baseUrl: "https://gateway.example", fetch: fetchMock });
    const signed = {
      signature: `0x${"11".repeat(66)}` as const,
      nonce: 123n,
      chainId: 286623n,
    };

    await client.addApiKey(
      USER_ADDRESS,
      {
        accountId: 1001n,
        name: "bot",
        type: "EVM",
        publicKey: "0x2222222222222222222222222222222222222222",
        expiresAt: 0n,
      },
      signed,
    );
    const requests = fetchMock.mock.calls.map(([, init]) => init);
    expect(requests.map((request) => request?.method)).toEqual(["POST"]);
    for (const request of requests) {
      expect(request?.headers).toMatchObject({
        "X-API-Sign": signed.signature,
        "X-API-Nonce": "123",
        "X-API-Chain": "286623",
      });
      expect(request?.headers).not.toHaveProperty("X-API-Key");
    }
    expect(JSON.parse(String(requests[0]?.body))).toMatchObject({
      accountID: 1001,
      name: "bot",
      type: 1,
      expiresAt: 0,
    });
  });

  // Validates signer convenience methods create and attach unified signatures without manual header assembly.
  it("signs unified writes through a UserSigner", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse('{"code":0,"timestamp":1780000000000,"data":null}'));
    const client = new UserClient({ baseUrl: "https://gateway.example", fetch: fetchMock });
    const signer = {
      address: USER_ADDRESS,
      chainId: 286623n,
      signAddApiKey: vi.fn().mockResolvedValue({
        signature: `0x${"11".repeat(66)}`,
        nonce: 1780000000000n,
        chainId: 286623n,
      }),
    };
    const input = {
      accountId: 1001n,
      name: "bot",
      type: "EVM" as const,
      publicKey: "0x2222222222222222222222222222222222222222" as const,
      expiresAt: 0n,
    };

    await client.addApiKeyWithSigner(USER_ADDRESS, input, signer, 1780000000000n);

    expect(signer.signAddApiKey).toHaveBeenCalledWith(input, 1780000000000n);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-API-Sign": `0x${"11".repeat(66)}`,
      "X-API-Nonce": "1780000000000",
      "X-API-Chain": "286623",
    });
  });
});

describe("withdraw user-flow encoding", () => {
  // Validates all WithdrawToken command fields, including route code and fallback behavior, in ABI order.
  it("encodes the documented WithdrawToken command", () => {
    const encoded = encodeWithdrawCommand({
      coin: "USDC",
      chain: "BASE_ETH",
      receiver: "0x1111111111111111111111111111111111111111",
      amount: 10_000_000n,
      withdrawalType: 1,
      memo: "memo",
      failedBackToClob: true,
    });

    expect(
      decodeAbiParameters(
        parseAbiParameters("string, string, string, uint256, uint8, string, bool"),
        encoded,
      ),
    ).toEqual([
      "USDC",
      "BASE_ETH",
      "0x1111111111111111111111111111111111111111",
      10_000_000n,
      1,
      "memo",
      true,
    ]);
  });
});

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}
