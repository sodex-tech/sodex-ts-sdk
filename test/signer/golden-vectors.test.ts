/**
 * Golden-vector regression tests pin the canonical JSON form of every
 * signable action. Because the server re-derives `payloadHash` from the
 * request body, the byte-for-byte JSON shape IS the root of correctness —
 * if these strings stay stable, the downstream hashes and signatures can't
 * silently drift.
 *
 * Domain-separator and signature byte strings are captured via `toMatchSnapshot`
 * so the *first* run records them and any later change produces a reviewable
 * diff rather than a merge that slips past review.
 */
import { describe, expect, it } from "vitest";
import { hashActionPayload } from "../../src/common/action-payload";
import { bytesToHex, hexToBytes } from "../../src/common/bytes";
import { canonicalStringify } from "../../src/common/canonical-json";
import {
  MAINNET_CHAIN_ID,
  PERPS_DOMAIN_NAME,
  SPOT_DOMAIN_NAME,
  domainSeparator,
  makeDomain,
} from "../../src/common/eip712";
import { EvmSigner } from "../../src/common/signer";
import {
  buildPerpsCancelOrderPayload,
  buildPerpsModifyOrderPayload,
  buildPerpsNewOrderPayload,
  buildUpdateLeveragePayload,
  buildUpdateMarginPayload,
} from "../../src/perps/actions";
import {
  buildBatchCancelPayload,
  buildBatchNewOrderPayload,
  buildCancelOrderPayload,
  buildNewOrderPayload,
  buildReplaceOrderPayload,
  buildRevokeApiKeyPayload,
  buildScheduleCancelPayload,
  buildTransferAssetPayload,
} from "../../src/spot/actions";

const PRIV_HEX = "0x0123456789012345678901234567890123456789012345678901234567890123";

describe("canonical JSON golden vectors — spot actions", () => {
  it("newOrder (limit buy)", () => {
    const p = buildNewOrderPayload({
      accountId: 1001n,
      symbolId: 1n,
      clOrdId: "order-001",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      price: "50000",
      quantity: "0.1",
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"newOrder","params":{"accountID":1001,"symbolID":1,"clOrdID":"order-001","side":1,"type":1,"timeInForce":1,"price":"50000","quantity":"0.1"}}',
    );
  });

  it("batchNewOrder", () => {
    const p = buildBatchNewOrderPayload({
      accountId: 1001n,
      orders: [
        {
          symbolId: 42n,
          clOrdId: "o-1",
          side: "BUY",
          type: "LIMIT",
          timeInForce: "GTC",
          price: "50000",
          quantity: "0.1",
        },
      ],
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"batchNewOrder","params":{"accountID":1001,"orders":[{"symbolID":42,"clOrdID":"o-1","side":1,"type":1,"timeInForce":1,"price":"50000","quantity":"0.1"}]}}',
    );
  });

  it("cancelOrder drops unset optionals", () => {
    const p = buildCancelOrderPayload({
      accountId: 1001n,
      symbolId: 1n,
      clOrdId: "cancel-1",
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"cancelOrder","params":{"accountID":1001,"symbolID":1,"clOrdID":"cancel-1"}}',
    );
  });

  it("batchCancelOrder", () => {
    const p = buildBatchCancelPayload({
      accountId: 1001n,
      cancels: [{ symbolId: 42n, clOrdId: "o-1" }],
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"batchCancelOrder","params":{"accountID":1001,"cancels":[{"symbolID":42,"clOrdID":"o-1"}]}}',
    );
  });

  it("replaceOrder", () => {
    const p = buildReplaceOrderPayload({
      accountId: 1001n,
      orders: [{ symbolId: 42n, clOrdId: "r-1", price: "50100", quantity: "0.2" }],
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"replaceOrder","params":{"accountID":1001,"orders":[{"symbolID":42,"clOrdID":"r-1","price":"50100","quantity":"0.2"}]}}',
    );
  });

  it("scheduleCancel without timestamp", () => {
    const p = buildScheduleCancelPayload({ accountId: 1001n });
    expect(canonicalStringify(p)).toBe('{"type":"scheduleCancel","params":{"accountID":1001}}');
  });

  it("scheduleCancel with timestamp", () => {
    const p = buildScheduleCancelPayload({ accountId: 1001n, scheduledTimestamp: 9999999n });
    expect(canonicalStringify(p)).toBe(
      '{"type":"scheduleCancel","params":{"accountID":1001,"scheduledTimestamp":9999999}}',
    );
  });

  it("transferAsset encodes kind as integer", () => {
    const p = buildTransferAssetPayload({
      id: 1n,
      fromAccountId: 1001n,
      toAccountId: 999n,
      coinId: 0n,
      amount: "100",
      kind: "PERPS_WITHDRAW",
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"transferAsset","params":{"id":1,"fromAccountID":1001,"toAccountID":999,"coinID":0,"amount":"100","type":3}}',
    );
  });

  it("revokeAPIKey", () => {
    const p = buildRevokeApiKeyPayload({ accountId: 1001n, name: "bot-1" });
    expect(canonicalStringify(p)).toBe(
      '{"type":"revokeAPIKey","params":{"accountID":1001,"name":"bot-1"}}',
    );
  });
});

describe("canonical JSON golden vectors — perps actions", () => {
  it("newOrder matches the docs example exactly", () => {
    const p = buildPerpsNewOrderPayload({
      accountId: 12345n,
      symbolId: 1n,
      orders: [
        {
          clOrdId: "my-order-1",
          modifier: "NORMAL",
          side: "BUY",
          type: "MARKET",
          timeInForce: "IOC",
          quantity: "0.001",
          reduceOnly: false,
          positionSide: "BOTH",
        },
      ],
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"newOrder","params":{"accountID":12345,"symbolID":1,"orders":[{"clOrdID":"my-order-1","modifier":1,"side":1,"type":2,"timeInForce":3,"quantity":"0.001","reduceOnly":false,"positionSide":1}]}}',
    );
  });

  it("cancelOrder", () => {
    const p = buildPerpsCancelOrderPayload({
      accountId: 1001n,
      cancels: [{ symbolId: 1n, clOrdId: "c-1" }],
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"cancelOrder","params":{"accountID":1001,"cancels":[{"symbolID":1,"clOrdID":"c-1"}]}}',
    );
  });

  it("modifyOrder with stop price", () => {
    const p = buildPerpsModifyOrderPayload({
      accountId: 1001n,
      symbolId: 1n,
      orderId: 99n,
      stopPrice: "49000",
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"modifyOrder","params":{"accountID":1001,"symbolID":1,"orderID":99,"stopPrice":"49000"}}',
    );
  });

  it("updateLeverage", () => {
    const p = buildUpdateLeveragePayload({
      accountId: 1001n,
      symbolId: 1n,
      leverage: 10,
      marginMode: "CROSS",
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"updateLeverage","params":{"accountID":1001,"symbolID":1,"leverage":10,"marginMode":2}}',
    );
  });

  it("updateMargin", () => {
    const p = buildUpdateMarginPayload({
      accountId: 1001n,
      symbolId: 1n,
      amount: "-50",
    });
    expect(canonicalStringify(p)).toBe(
      '{"type":"updateMargin","params":{"accountID":1001,"symbolID":1,"amount":"-50"}}',
    );
  });
});

describe("byte-level snapshots", () => {
  // Recorded on first run; any deliberate change to serialization or signing
  // must be acknowledged by updating the snapshot via `pnpm test -- -u`.
  it("spot domain separator (mainnet)", () => {
    expect(
      bytesToHex(domainSeparator(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID))),
    ).toMatchSnapshot();
  });

  it("perps domain separator (mainnet)", () => {
    expect(
      bytesToHex(domainSeparator(makeDomain(PERPS_DOMAIN_NAME, MAINNET_CHAIN_ID))),
    ).toMatchSnapshot();
  });

  it("scheduleCancel payload hash", () => {
    const p = buildScheduleCancelPayload({ accountId: 1001n });
    expect(bytesToHex(hashActionPayload(p))).toMatchSnapshot();
  });

  it("spot scheduleCancel full signature", () => {
    const signer = new EvmSigner(
      makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID),
      hexToBytes(PRIV_HEX),
    );
    const sig = signer.signAction(buildScheduleCancelPayload({ accountId: 1001n }), 1n);
    expect(bytesToHex(sig)).toMatchSnapshot();
  });
});
