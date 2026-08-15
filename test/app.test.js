import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { InvoiceService } from "../src/invoices/service.js";
import { InvoiceStore } from "../src/invoices/store.js";

function testConfig() {
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
  };
}

describe("HTTP app", () => {
  let server;
  let baseUrl;

  before(async () => {
    const store = new InvoiceStore();
    const invoices = new InvoiceService({
      store,
      config: testConfig(),
      eth: {
        getCurrentBlockNumber: async () => 1,
        findPayment: async () => null,
      },
      stellar: {
        getLatestCursor: async () => "cursor-0",
        findPayment: async () => null,
      },
    });

    const app = createApp({
      invoices,
      qr: async () => "data:image/png;base64,TESTQR",
    });

    server = await new Promise((resolve) => {
      const started = app.listen(0, "127.0.0.1", () => resolve(started));
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("creates an XLM invoice page with a data-URL QR", async () => {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/pay/xlm`);
    const html = await response.text();
    const elapsed = Date.now() - started;

    assert.equal(response.status, 200);
    assert.match(html, /Memo \(required\): <strong>[0-9a-f]{28}<\/strong>/);
    assert.match(html, /data:image\/png;base64,TESTQR/);
    assert.doesNotMatch(html, /qrcode\.png/);
    assert.match(html, /30 XLM/);
    assert.ok(elapsed < 2000, `GET /pay/xlm hung (${elapsed}ms)`);
  });

  it("returns invoice JSON without holding the socket", async () => {
    const page = await fetch(`${baseUrl}/pay/xlm`);
    const html = await page.text();
    const memo = html.match(/Memo \(required\): <strong>([0-9a-f]{28})<\/strong>/)[1];

    const started = Date.now();
    const response = await fetch(`${baseUrl}/api/invoices/${memo}`);
    const body = await response.json();
    const elapsed = Date.now() - started;

    assert.equal(response.status, 200);
    assert.equal(body.id, memo);
    assert.equal(body.status, "pending");
    assert.equal(body.expectedAmount, "30");
    assert.ok(elapsed < 2000, `GET /api/invoices/:id hung (${elapsed}ms)`);
  });

  it("returns 404 for an unknown invoice", async () => {
    const response = await fetch(`${baseUrl}/api/invoices/missing`);
    assert.equal(response.status, 404);
  });
});
