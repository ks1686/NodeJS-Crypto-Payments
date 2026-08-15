import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEthereumClient } from "../src/chains/ethereum.js";

const destination = "0xAbcDef0000000000000000000000000000000001";
const expectedAmount = 100000000000000000n;

function jsonResponse(body) {
  return {
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function clientWithTxlist(result, { confirmations = 1 } = {}) {
  return createEthereumClient({
    explorer: "https://api-sepolia.etherscan.io/api",
    apiKey: "test-key",
    confirmations,
    fetchImpl: async () => jsonResponse({ status: "1", result }),
  });
}

function invoice(overrides = {}) {
  return {
    destination,
    expectedAmount,
    startBlock: 10,
    ...overrides,
  };
}

describe("createEthereumClient.findPayment", () => {
  it("matches an exact wei transfer to the destination after startBlock", async () => {
    const eth = clientWithTxlist([
      {
        hash: "0xpaid",
        to: destination.toLowerCase(),
        value: expectedAmount.toString(),
        isError: "0",
        confirmations: "3",
        blockNumber: "11",
      },
    ]);

    const payment = await eth.findPayment({
      invoice: invoice(),
      consumedHashes: new Set(),
    });

    assert.deepEqual(payment, { txHash: "0xpaid", amount: expectedAmount });
  });

  it("ignores failed transactions and contract creation", async () => {
    const eth = clientWithTxlist([
      {
        hash: "0xfail",
        to: destination,
        value: expectedAmount.toString(),
        isError: "1",
        confirmations: "12",
      },
      {
        hash: "0xcreate",
        to: null,
        value: expectedAmount.toString(),
        isError: "0",
        confirmations: "12",
      },
    ]);

    assert.equal(
      await eth.findPayment({ invoice: invoice(), consumedHashes: new Set() }),
      null,
    );
  });

  it("ignores Etherscan error strings", async () => {
    const eth = clientWithTxlist("Max rate limit reached");
    assert.equal(
      await eth.findPayment({ invoice: invoice(), consumedHashes: new Set() }),
      null,
    );
  });

  it("requires confirmations when the field is present", async () => {
    const eth = clientWithTxlist(
      [
        {
          hash: "0xunconfirmed",
          to: destination,
          value: expectedAmount.toString(),
          isError: "0",
          confirmations: "0",
        },
      ],
      { confirmations: 1 },
    );

    assert.equal(
      await eth.findPayment({ invoice: invoice(), consumedHashes: new Set() }),
      null,
    );
  });

  it("skips a hash already consumed by another invoice", async () => {
    const eth = clientWithTxlist([
      {
        hash: "0xused",
        to: destination,
        value: expectedAmount.toString(),
        isError: "0",
        confirmations: "8",
      },
    ]);

    assert.equal(
      await eth.findPayment({
        invoice: invoice(),
        consumedHashes: new Set(["0xused"]),
      }),
      null,
    );
  });

  it("parses the current block number from hex", async () => {
    const eth = createEthereumClient({
      explorer: "https://api-sepolia.etherscan.io/api",
      apiKey: "test-key",
      fetchImpl: async () => jsonResponse({ result: "0x10" }),
    });
    assert.equal(await eth.getCurrentBlockNumber(), 16);
  });
});
