import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvoiceService } from "../src/invoices/service.js";
import { InvoiceStore } from "../src/invoices/store.js";

function testConfig(overrides = {}) {
  return {
    network: "testnet",
    paymentTtlMs: 60_000,
    ethereum: {
      walletAddress: "0xabc",
      amountWei: 100000000000000000n,
      confirmations: 1,
    },
    stellar: {
      walletAddress: "GTEST",
      amountStroops: 300000000n,
    },
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

function createService({ eth = {}, stellar = {}, config } = {}) {
  const store = new InvoiceStore();
  const service = new InvoiceService({
    store,
    config: config ?? testConfig(),
    eth: {
      getCurrentBlockNumber: async () => 100,
      findPayment: async () => null,
      ...eth,
    },
    stellar: {
      getLatestCursor: async () => "cursor-0",
      findPayment: async () => null,
      ...stellar,
    },
  });
  return { store, service };
}

describe("InvoiceService.create", () => {
  it("creates a pending ETH invoice with startBlock and expected wei", async () => {
    const { service } = createService({
      eth: { getCurrentBlockNumber: async () => 4242 },
    });

    const invoice = await service.create("eth");

    assert.equal(invoice.asset, "eth");
    assert.equal(invoice.status, "pending");
    assert.equal(invoice.destination, "0xabc");
    assert.equal(invoice.expectedAmount, 100000000000000000n);
    assert.equal(invoice.startBlock, 4242);
    assert.equal(invoice.expiresAt, 1_700_000_000_000 + 60_000);
    assert.equal(invoice.memo, undefined);
    assert.match(invoice.id, /^[0-9a-f-]{36}$/);
  });

  it("creates a pending XLM invoice with 28-char memo and horizon cursor", async () => {
    const { service } = createService({
      stellar: { getLatestCursor: async () => "now-cursor" },
    });

    const invoice = await service.create("xlm");

    assert.equal(invoice.asset, "xlm");
    assert.equal(invoice.status, "pending");
    assert.equal(invoice.destination, "GTEST");
    assert.equal(invoice.expectedAmount, 300000000n);
    assert.equal(invoice.cursor, "now-cursor");
    assert.match(invoice.memo, /^[0-9a-f]{28}$/);
    assert.equal(invoice.id, invoice.memo);
  });
});

describe("InvoiceService.refresh", () => {
  it("returns null for an unknown id", async () => {
    const { service } = createService();
    assert.equal(await service.refresh("missing"), null);
  });

  it("expires a pending invoice after ttl", async () => {
    let now = 1_700_000_000_000;
    const { service } = createService({
      config: testConfig({ now: () => now }),
    });
    const invoice = await service.create("eth");

    now += 60_001;
    const refreshed = await service.refresh(invoice.id);

    assert.equal(refreshed.status, "expired");
    assert.equal(refreshed.txHash, undefined);
  });

  it("marks exact ETH payment as paid", async () => {
    const { service } = createService({
      eth: {
        findPayment: async () => ({
          txHash: "0xpaid",
          amount: 100000000000000000n,
        }),
      },
    });
    const invoice = await service.create("eth");
    const refreshed = await service.refresh(invoice.id);

    assert.equal(refreshed.status, "paid");
    assert.equal(refreshed.txHash, "0xpaid");
    assert.equal(refreshed.receivedAmount, 100000000000000000n);
  });

  it("marks an underpay as underpaid, not paid", async () => {
    const { service } = createService({
      stellar: {
        findPayment: async () => ({
          txHash: "xlm-under",
          amount: 100000000n,
        }),
      },
    });
    const invoice = await service.create("xlm");
    const refreshed = await service.refresh(invoice.id);

    assert.equal(refreshed.status, "underpaid");
    assert.equal(refreshed.txHash, "xlm-under");
    assert.equal(refreshed.receivedAmount, 100000000n);
  });

  it("does not settle a second invoice with an already consumed tx hash", async () => {
    let payments = [
      { txHash: "0xshared", amount: 100000000000000000n },
    ];
    const { service } = createService({
      eth: {
        findPayment: async ({ consumedHashes }) =>
          payments.find((p) => !consumedHashes.has(p.txHash)) ?? null,
      },
    });

    const first = await service.create("eth");
    const second = await service.create("eth");
    await service.refresh(first.id);
    const secondRefresh = await service.refresh(second.id);

    assert.equal((await service.get(first.id)).status, "paid");
    assert.equal(secondRefresh.status, "pending");
    assert.equal(secondRefresh.txHash, undefined);
  });

  it("does not re-check explorers for a terminal invoice", async () => {
    let calls = 0;
    const { service } = createService({
      eth: {
        findPayment: async () => {
          calls += 1;
          return { txHash: "0xonce", amount: 100000000000000000n };
        },
      },
    });
    const invoice = await service.create("eth");
    await service.refresh(invoice.id);
    await service.refresh(invoice.id);
    assert.equal(calls, 1);
  });
});
