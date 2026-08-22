import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { ChainError } from "../src/errors.js";
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

function fakeChains({ ethFails = false } = {}) {
  return {
    eth: {
      getCurrentBlockNumber: ethFails
        ? async () =>
            Promise.reject(
              new ChainError("the Ethereum explorer rejected this API key", {
                chain: "ethereum",
              }),
            )
        : async () => 1,
      findPayment: async () => null,
    },
    stellar: {
      getLatestCursor: async () => "cursor-0",
      findPayment: async () => null,
    },
  };
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("HTTP app", () => {
  let server;
  let baseUrl;

  before(async () => {
    const invoices = new InvoiceService({
      store: new InvoiceStore(),
      config: testConfig(),
      ...fakeChains(),
    });
    const app = createApp({
      invoices,
      qr: async () => "data:image/png;base64,TESTQR",
    });
    ({ server, baseUrl } = await listen(app));
  });

  after(async () => close(server));

  it("renders the home page with security headers", async () => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Pay with ETH/);
    assert.match(html, /Pay with XLM/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  });

  it("reports health at /health", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });

  it("creates an XLM invoice page with a data-URL QR", async () => {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/pay/xlm`);
    const html = await response.text();
    const elapsed = Date.now() - started;

    assert.equal(response.status, 200);
    assert.match(
      html,
      /Memo \(required\):\s*<strong[^>]*>[0-9a-f]{28}<\/strong>/,
    );
    assert.match(html, /data:image\/png;base64,TESTQR/);
    assert.doesNotMatch(html, /qrcode\.png/);
    assert.match(html, /30 XLM/);
    assert.match(html, /static\/payment\.js/);
    assert.ok(elapsed < 2000, `GET /pay/xlm hung (${elapsed}ms)`);
  });

  it("returns invoice JSON without holding the socket", async () => {
    const page = await fetch(`${baseUrl}/pay/xlm`);
    const html = await page.text();
    const memo = html.match(
      /Memo \(required\):\s*<strong[^>]*>([0-9a-f]{28})<\/strong>/,
    )[1];

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

  it("returns 404 JSON for an unknown invoice", async () => {
    const response = await fetch(`${baseUrl}/api/invoices/missing`);
    assert.equal(response.status, 404);
  });

  it("lists invoices on the dashboard", async () => {
    const response = await fetch(`${baseUrl}/invoices`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /invoice-table/);
    assert.match(html, /badge badge-pending/);
    assert.match(html, /XLM/);
  });

  it("renders a friendly 404 page for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/definitely-not-a-route`);
    const html = await response.text();

    assert.equal(response.status, 404);
    assert.match(html, /Page not found/);
  });
});

describe("HTTP app with an unreachable Ethereum explorer", () => {
  let server;
  let baseUrl;

  before(async () => {
    const invoices = new InvoiceService({
      store: new InvoiceStore(),
      config: testConfig(),
      ...fakeChains({ ethFails: true }),
    });
    const app = createApp({
      invoices,
      qr: async () => "data:image/png;base64,TESTQR",
      log: () => {},
    });
    ({ server, baseUrl } = await listen(app));
  });

  after(async () => close(server));

  it("shows a retryable error page instead of crashing on /pay/eth", async () => {
    const response = await fetch(`${baseUrl}/pay/eth`);
    const html = await response.text();

    assert.equal(response.status, 503);
    assert.match(html, /reach the network right now/);
    assert.match(html, /Try again/);
  });

  it("keeps serving XLM invoices while ETH is down", async () => {
    const response = await fetch(`${baseUrl}/pay/xlm`);
    assert.equal(response.status, 200);
  });
});
