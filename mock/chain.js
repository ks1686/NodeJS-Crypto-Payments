// Local mock of both explorers so `npm run demo` works with no API keys,
// no testnet funds, and no internet. Endpoints:
//
//   Etherscan-style:  GET /api?module=proxy&action=eth_blockNumber
//                     GET /api?module=account&action=txlist&address=...
//   Horizon-style:    GET /accounts/:address/payments?cursor=...&order=asc
//   Demo controls:    POST /mock/send   {"chain":"eth"} or {"chain":"xlm","memo":"..."}
//                     POST /mock/reset
//
// This file is demo scaffolding only — the real app never imports it.
import http from "node:http";
import { randomBytes } from "node:crypto";

const port = Number(process.env.MOCK_PORT || 4311);
const merchantEth =
  process.env.ETHEREUM_WALLET_ADDRESS ||
  "0xdemo00000000000000000000000000000000c0ffee";
const merchantStellar =
  process.env.STELLAR_WALLET_ADDRESS ||
  "GDEMOACCOUNT11111111111111111111111111111111111111111111";

const state = {
  block: 16,
  ethTxs: [], // { hash, to, value, blockNumber }
  xlmPayments: [], // { to, amount, memo, transaction_hash, paging_token }
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function handleSend(body, res) {
  if (body.chain === "eth") {
    state.block += 1;
    const value =
      typeof body.valueWei === "string" ? body.valueWei : "100000000000000000";
    const tx = {
      hash: `0xdemo${randomBytes(14).toString("hex")}`,
      to: (body.to || merchantEth).toLowerCase(),
      value,
      isError: "0",
      confirmations: "12",
      blockNumber: String(state.block),
    };
    state.ethTxs.push(tx);
    console.log(`[mock] simulated ETH payment ${tx.hash} value=${value}`);
    return json(res, 200, { ok: true, txHash: tx.hash });
  }

  if (body.chain === "xlm") {
    const record = {
      type: "payment",
      to: body.to || merchantStellar,
      asset_type: "native",
      amount: body.amount || "30.0000000",
      transaction_hash: randomBytes(24).toString("hex"),
      transaction_successful: true,
      memo: body.memo ?? "",
      memo_type: "text",
      paging_token: String(state.xlmPayments.length + 1),
      transaction: { memo: body.memo ?? "", memo_type: "text" },
    };
    state.xlmPayments.push(record);
    console.log(
      `[mock] simulated XLM payment ${record.transaction_hash} memo=${record.memo}`,
    );
    return json(res, 200, { ok: true, txHash: record.transaction_hash });
  }

  json(res, 400, { ok: false, error: 'chain must be "eth" or "xlm"' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (req.method === "POST" && url.pathname === "/mock/send") {
    return handleSend(await readBody(req), res);
  }
  if (req.method === "POST" && url.pathname === "/mock/reset") {
    state.ethTxs = [];
    state.xlmPayments = [];
    console.log("[mock] state reset");
    return json(res, 200, { ok: true });
  }

  // Etherscan-shaped API
  if (url.pathname === "/api") {
    const action = url.searchParams.get("action");
    if (action === "eth_blockNumber") {
      return json(res, 200, {
        status: "1",
        result: `0x${state.block.toString(16)}`,
      });
    }
    if (action === "txlist") {
      const start = Number(url.searchParams.get("startblock") || 0);
      const address = (url.searchParams.get("address") || "").toLowerCase();
      const rows = state.ethTxs.filter(
        (tx) =>
          Number(tx.blockNumber) > start && (!address || tx.to === address),
      );
      return json(res, 200, { status: "1", message: "OK", result: rows });
    }
    return json(res, 200, { status: "0", result: null });
  }

  // Horizon-shaped API
  const paymentsMatch = /^\/accounts\/[^/]+\/payments$/.exec(url.pathname);
  if (paymentsMatch && req.method === "GET") {
    const cursor = Number(url.searchParams.get("cursor") || 0) || 0;
    const records = state.xlmPayments.filter(
      (r) => Number(r.paging_token) > cursor,
    );
    return json(res, 200, { _embedded: { records } });
  }

  json(res, 404, { error: "not found" });
});

server.listen(port, () => {
  console.log(`[mock] explorer listening on http://127.0.0.1:${port}`);
  console.log(`[mock] simulate a payment:`);
  console.log(`[mock]   curl -X POST localhost:${port}/mock/send -d '{"chain":"eth"}'`);
  console.log(`[mock]   curl -X POST localhost:${port}/mock/send -d '{"chain":"xlm","memo":"<invoice memo>"}'`);
});
