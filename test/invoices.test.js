import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

function createService({ eth = {}, stellar = {}, config, store } = {}) {
  store ??= new InvoiceStore();
  const service = new InvoiceService({
    store,
    config: config ?? testConfig(),
    log: () => {},
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

describe("unique ETH amounts (collision-proof matching)", () => {
  it("gives consecutive invoices distinct expected amounts", async () => {
    const { service } = createService();
    const first = await service.create("eth");
    const second = await service.create("eth");

    assert.equal(first.expectedAmount, 100000000000000000n);
    assert.equal(second.expectedAmount, 100000000000000001n);
    assert.notEqual(first.expectedAmount, second.expectedAmount);
  });

  it("wraps the sequence after 1000 invoices", async () => {
    const { service } = createService();
    let last;
    for (let i = 0; i < 1000; i += 1) {
      last = await service.create("eth");
    }
    // 999 increments after the base invoice -> +999 wei; next wraps to +0.
    assert.equal(last.expectedAmount, 100000000000000999n);
    const wrapped = await service.create("eth");
    assert.equal(wrapped.expectedAmount, 100000000000000000n);
  });

  it("does not stagger XLM amounts", async () => {
    const { service } = createService();
    const first = await service.create("xlm");
    const second = await service.create("xlm");
    assert.equal(first.expectedAmount, second.expectedAmount);
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
        findPayment: async ({ invoice }) => ({
          txHash: "0xpaid",
          amount: invoice.expectedAmount,
        }),
      },
    });
    const invoice = await service.create("eth");
    const refreshed = await service.refresh(invoice.id);

    assert.equal(refreshed.status, "paid");
    assert.equal(refreshed.txHash, "0xpaid");
    assert.equal(refreshed.receivedAmount, invoice.expectedAmount);
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
    const payments = [{ txHash: "0xshared", amount: 100000000000000000n }];
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
        findPayment: async ({ invoice }) => {
          calls += 1;
          return { txHash: "0xonce", amount: invoice.expectedAmount };
        },
      },
    });
    const invoice = await service.create("eth");
    await service.refresh(invoice.id);
    await service.refresh(invoice.id);
    assert.equal(calls, 1);
  });

  it("lists newest-first for the dashboard", async () => {
    const { service } = createService();
    const older = await service.create("xlm");
    const newer = await service.create("xlm");
    const list = service.list();
    assert.deepEqual(
      list.map((i) => i.id),
      [newer.id, older.id],
    );
  });
});

describe("InvoiceStore file persistence", () => {
  it("round-trips invoices with bigint amounts across reloads", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "store-"));
    const file = path.join(dir, "nested", "invoices.json");

    const first = new InvoiceStore({ file });
    const created = first.create({
      id: "inv-1",
      asset: "eth",
      status: "pending",
      destination: "0xabc",
      expectedAmount: 123456789012345678n,
      startBlock: 5,
      expiresAt: 1,
    });
    first.flush();

    const second = new InvoiceStore({ file });
    const loaded = second.get("inv-1");

    assert.ok(loaded);
    assert.equal(typeof loaded.expectedAmount, "bigint");
    assert.equal(loaded.expectedAmount, created.expectedAmount);

    const updated = second.update("inv-1", {
      status: "paid",
      txHash: "0xtx",
      receivedAmount: loaded.expectedAmount,
    });
    assert.equal(updated.status, "paid");
    second.flush();

    const third = new InvoiceStore({ file });
    assert.equal(third.get("inv-1").status, "paid");
    assert.equal(third.consumedHashes().has("0xtx"), true);

    rmSync(dir, { recursive: true, force: true });
  });

  it("starts empty when the data file does not exist yet", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "store-"));
    const store = new InvoiceStore({ file: path.join(dir, "absent.json") });
    assert.equal(store.all().length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps working in memory when no file is configured", () => {
    const store = new InvoiceStore();
    store.create({ id: "a", asset: "xlm", status: "pending", expiresAt: 1 });
    assert.equal(store.all().length, 1);
    assert.throws(() => readFileSync("/nonexistent/nope.json"), Error);
  });
});
