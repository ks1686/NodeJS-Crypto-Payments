import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStellarClient } from "../src/chains/stellar.js";

const destination = "GDESTINATION";
const memo = "aaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function jsonResponse(body) {
  return { json: async () => body };
}

function paymentsBody(records) {
  return { _embedded: { records } };
}

function clientWithRecords(records) {
  return createStellarClient({
    explorer: "https://horizon-testnet.stellar.org",
    walletAddress: destination,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get("cursor"), "cursor-9");
      return jsonResponse(paymentsBody(records));
    },
  });
}

function invoice(overrides = {}) {
  return {
    destination,
    memo,
    cursor: "cursor-9",
    expectedAmount: 300000000n,
    ...overrides,
  };
}

function paymentRecord(overrides = {}) {
  return {
    type: "payment",
    to: destination,
    asset_type: "native",
    amount: "30.0000000",
    transaction_hash: "xlm-ok",
    transaction_successful: true,
    transaction: { memo, memo_type: "text" },
    ...overrides,
  };
}

describe("createStellarClient.findPayment", () => {
  it("matches memo, destination, and native XLM", async () => {
    const stellar = clientWithRecords([paymentRecord()]);
    const payment = await stellar.findPayment({
      invoice: invoice(),
      consumedHashes: new Set(),
    });
    assert.deepEqual(payment, { txHash: "xlm-ok", amount: 300000000n });
  });

  it("ignores the wrong memo, destination, or asset", async () => {
    const stellar = clientWithRecords([
      paymentRecord({ transaction: { memo: "nope", memo_type: "text" } }),
      paymentRecord({ to: "GOTHER", transaction_hash: "wrong-dest" }),
      paymentRecord({
        asset_type: "credit_alphanum4",
        transaction_hash: "token",
      }),
    ]);

    assert.equal(
      await stellar.findPayment({
        invoice: invoice(),
        consumedHashes: new Set(),
      }),
      null,
    );
  });

  it("requests payments after the stored cursor", async () => {
    let seenCursor = null;
    const stellar = createStellarClient({
      explorer: "https://horizon-testnet.stellar.org",
      walletAddress: destination,
      fetchImpl: async (url) => {
        seenCursor = new URL(url).searchParams.get("cursor");
        return jsonResponse(paymentsBody([]));
      },
    });

    await stellar.findPayment({
      invoice: invoice({ cursor: "cursor-9" }),
      consumedHashes: new Set(),
    });
    assert.equal(seenCursor, "cursor-9");
  });

  it("returns null when Horizon fails instead of throwing", async () => {
    const stellar = createStellarClient({
      explorer: "https://horizon-testnet.stellar.org",
      walletAddress: destination,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    assert.equal(
      await stellar.findPayment({
        invoice: invoice(),
        consumedHashes: new Set(),
      }),
      null,
    );
  });
});
