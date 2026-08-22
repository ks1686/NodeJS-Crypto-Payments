import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  paymentDisplayAmount,
  paymentUri,
} from "../src/util/qr.js";

const ethInvoice = {
  asset: "eth",
  destination: "0xABC",
  expectedAmount: 100000000000000000n,
  chainId: "11155111",
};

const xlmInvoice = {
  asset: "xlm",
  destination: "GDEST",
  expectedAmount: 300000000n,
  memo: "a".repeat(28),
};

describe("paymentUri (ETH)", () => {
  it("encodes wei and pins the testnet chain id", () => {
    assert.equal(
      paymentUri(ethInvoice),
      "ethereum:0xABC?value=100000000000000000&chainId=11155111",
    );
  });

  it("omits the chain id when absent (mainnet-style URIs)", () => {
    const { chainId: _chainId, ...noChain } = ethInvoice;
    assert.equal(
      paymentUri(noChain),
      "ethereum:0xABC?value=100000000000000000",
    );
  });
});

describe("paymentUri (XLM)", () => {
  it("is a SEP-0007 pay URI with memo and memo_type", () => {
    const uri = paymentUri(xlmInvoice);
    assert.ok(uri.startsWith("web+stellar:pay?"));

    const params = new URL(uri).searchParams;
    assert.equal(params.get("destination"), "GDEST");
    assert.equal(params.get("amount"), "30");
    assert.equal(params.get("memo"), "a".repeat(28));
    assert.equal(params.get("memo_type"), "MEMO_TEXT");
  });
});

describe("paymentDisplayAmount", () => {
  it("formats each asset in its own decimals", () => {
    assert.equal(paymentDisplayAmount(ethInvoice), "0.1");
    assert.equal(paymentDisplayAmount(xlmInvoice), "30");
  });
});
