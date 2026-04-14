import { describe, expect, it } from "vitest";
import { toDecimalString } from "../../src/common/decimal";

describe("toDecimalString trailing-zero normalization", () => {
  it("strips trailing zeros after the decimal point", () => {
    expect(toDecimalString("0.10")).toBe("0.1");
    expect(toDecimalString("50000.00")).toBe("50000");
    expect(toDecimalString("-1.50")).toBe("-1.5");
    expect(toDecimalString("1.100")).toBe("1.1");
    expect(toDecimalString("0.00100")).toBe("0.001");
  });

  it("leaves values without trailing zeros unchanged", () => {
    expect(toDecimalString("0.001")).toBe("0.001");
    expect(toDecimalString("50000")).toBe("50000");
    expect(toDecimalString("-1.5")).toBe("-1.5");
    expect(toDecimalString("0")).toBe("0");
    expect(toDecimalString("100")).toBe("100");
  });

  it("handles edge case: all-zero fractional part → integer", () => {
    expect(toDecimalString("1.0")).toBe("1");
    expect(toDecimalString("0.0")).toBe("0");
    expect(toDecimalString("-0.0")).toBe("-0");
  });

  it("normalizes number inputs the same way", () => {
    expect(toDecimalString(0.1)).toBe("0.1");
    expect(toDecimalString(50000)).toBe("50000");
    // JS number 0.10 is the same as 0.1 — toString already strips
    expect(toDecimalString(0.1)).toBe("0.1");
  });

  it("bigint inputs have no decimal point — returned as-is", () => {
    expect(toDecimalString(100n)).toBe("100");
    expect(toDecimalString(0n)).toBe("0");
    expect(toDecimalString(-50n)).toBe("-50");
  });
});
