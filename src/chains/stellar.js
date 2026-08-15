import { STROOP_DECIMALS, parseDecimalToMinor } from "../util/amounts.js";

function memoOf(record) {
  return record.transaction?.memo ?? record.memo ?? null;
}

function memoTypeOf(record) {
  return record.transaction?.memo_type ?? record.memo_type ?? "text";
}

export function createStellarClient({
  explorer,
  walletAddress,
  fetchImpl = fetch,
}) {
  async function getLatestCursor() {
    const url = new URL(
      `${explorer}/accounts/${encodeURIComponent(walletAddress)}/payments`,
    );
    url.searchParams.set("order", "desc");
    url.searchParams.set("limit", "1");

    const response = await fetchImpl(url);
    const body = await response.json();
    const records = body?._embedded?.records;
    if (!Array.isArray(records) || records.length === 0) {
      return "0";
    }
    return records[0].paging_token ?? "0";
  }

  async function findPayment({ invoice, consumedHashes }) {
    const url = new URL(
      `${explorer}/accounts/${encodeURIComponent(invoice.destination)}/payments`,
    );
    url.searchParams.set("cursor", invoice.cursor ?? "0");
    url.searchParams.set("order", "asc");
    url.searchParams.set("limit", "200");
    url.searchParams.set("join", "transactions");

    let body;
    try {
      const response = await fetchImpl(url);
      body = await response.json();
    } catch {
      return null;
    }

    const records = body?._embedded?.records;
    if (!Array.isArray(records)) {
      return null;
    }

    for (const record of records) {
      if (record.type && record.type !== "payment") {
        continue;
      }
      if (record.transaction_successful === false) {
        continue;
      }
      if (record.to !== invoice.destination) {
        continue;
      }
      if (record.asset_type && record.asset_type !== "native") {
        continue;
      }
      if (memoTypeOf(record) !== "text" || memoOf(record) !== invoice.memo) {
        continue;
      }
      if (consumedHashes?.has(record.transaction_hash)) {
        continue;
      }

      let amount;
      try {
        amount = parseDecimalToMinor(String(record.amount), STROOP_DECIMALS);
      } catch {
        continue;
      }

      return { txHash: record.transaction_hash, amount };
    }

    return null;
  }

  return { getLatestCursor, findPayment };
}
