async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createEthereumClient({
  explorer,
  apiKey,
  confirmations = 1,
  fetchImpl = fetch,
}) {
  async function getCurrentBlockNumber() {
    const url = new URL(explorer);
    url.searchParams.set("module", "proxy");
    url.searchParams.set("action", "eth_blockNumber");
    url.searchParams.set("apikey", apiKey);

    const response = await fetchImpl(url);
    const body = await readJson(response);
    const hex = body?.result;
    if (typeof hex !== "string" || !hex.startsWith("0x")) {
      throw new Error("etherscan did not return a block number");
    }
    return Number.parseInt(hex, 16);
  }

  async function findPayment({ invoice, consumedHashes }) {
    const url = new URL(explorer);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "txlist");
    url.searchParams.set("address", invoice.destination);
    url.searchParams.set("startblock", String(invoice.startBlock ?? 0));
    url.searchParams.set("sort", "asc");
    url.searchParams.set("apikey", apiKey);

    let body;
    try {
      const response = await fetchImpl(url);
      body = await readJson(response);
    } catch {
      return null;
    }

    const transactions = body?.result;
    if (!Array.isArray(transactions)) {
      return null;
    }

    for (const tx of transactions) {
      if (!tx || typeof tx !== "object") {
        continue;
      }
      if (tx.isError === "1") {
        continue;
      }
      if (tx.to == null) {
        continue;
      }
      if (tx.to.toLowerCase() !== invoice.destination.toLowerCase()) {
        continue;
      }
      if (consumedHashes?.has(tx.hash)) {
        continue;
      }

      let amount;
      try {
        amount = BigInt(tx.value);
      } catch {
        continue;
      }
      if (amount !== invoice.expectedAmount) {
        continue;
      }

      const txConfirmations = Number.parseInt(tx.confirmations, 10);
      if (
        Number.isFinite(txConfirmations) &&
        txConfirmations < confirmations
      ) {
        continue;
      }

      return { txHash: tx.hash, amount };
    }

    return null;
  }

  return { getCurrentBlockNumber, findPayment };
}
