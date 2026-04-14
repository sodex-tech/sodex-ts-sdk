import { describe, expect, it } from "vitest";
import { bytesToHex } from "../../src/common/bytes";
import {
  MAINNET_CHAIN_ID,
  PERPS_DOMAIN_NAME,
  SPOT_DOMAIN_NAME,
  domainSeparator,
  makeDomain,
} from "../../src/common/eip712";

describe("EIP-712 domain separator", () => {
  it("is deterministic / idempotent for identical inputs", () => {
    const a = domainSeparator(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID));
    const b = domainSeparator(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID));
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it("is distinct between the spot and perps domains", () => {
    const spot = domainSeparator(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID));
    const perps = domainSeparator(makeDomain(PERPS_DOMAIN_NAME, MAINNET_CHAIN_ID));
    expect(bytesToHex(spot)).not.toBe(bytesToHex(perps));
  });

  it("is distinct between chains (mainnet 286623 vs Ethereum 1)", () => {
    const mainnet = domainSeparator(makeDomain(SPOT_DOMAIN_NAME, MAINNET_CHAIN_ID));
    const eth = domainSeparator(makeDomain(SPOT_DOMAIN_NAME, 1n));
    expect(bytesToHex(mainnet)).not.toBe(bytesToHex(eth));
  });
});
