import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STROOP_DECIMALS,
  WEI_DECIMALS,
  compareAmount,
  formatMinor,
  isAtLeast,
  parseDecimalToMinor,
} from "../src/util/amounts.js";

describe("parseDecimalToMinor", () => {
  it("parses whole XLM into stroops", () => {
    assert.equal(parseDecimalToMinor("30", STROOP_DECIMALS), 300000000n);
  });

  it("parses fractional XLM into stroops", () => {
    assert.equal(parseDecimalToMinor("0.0000001", STROOP_DECIMALS), 1n);
    assert.equal(parseDecimalToMinor("30.0000000", STROOP_DECIMALS), 300000000n);
  });

  it("parses ETH into wei", () => {
    assert.equal(parseDecimalToMinor("0.1", WEI_DECIMALS), 100000000000000000n);
    assert.equal(parseDecimalToMinor("1", WEI_DECIMALS), 1000000000000000000n);
  });

  it("rejects extra fractional digits", () => {
    assert.throws(() => parseDecimalToMinor("1.00000001", STROOP_DECIMALS));
  });
});

describe("formatMinor", () => {
  it("formats stroops and wei without trailing zeros", () => {
    assert.equal(formatMinor(300000000n, STROOP_DECIMALS), "30");
    assert.equal(formatMinor(100000000000000000n, WEI_DECIMALS), "0.1");
    assert.equal(formatMinor(1n, STROOP_DECIMALS), "0.0000001");
  });
});

describe("numeric comparison (not string compare)", () => {
  it("does not treat display string 9 as greater than 30", () => {
    const nine = parseDecimalToMinor("9", STROOP_DECIMALS);
    const thirty = parseDecimalToMinor("30", STROOP_DECIMALS);
    assert.equal("9" >= "30", true);
    assert.equal(isAtLeast(nine, thirty), false);
    assert.equal(compareAmount(nine, thirty), "under");
  });

  it("treats 100 as at least 30", () => {
    const hundred = parseDecimalToMinor("100", STROOP_DECIMALS);
    const thirty = parseDecimalToMinor("30", STROOP_DECIMALS);
    assert.equal("100" >= "30", false);
    assert.equal(isAtLeast(hundred, thirty), true);
    assert.equal(compareAmount(hundred, thirty), "over");
  });

  it("marks an exact match", () => {
    const amount = parseDecimalToMinor("0.1", WEI_DECIMALS);
    assert.equal(compareAmount(amount, amount), "exact");
    assert.equal(isAtLeast(amount, amount), true);
  });
});
