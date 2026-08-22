import { randomBytes, randomUUID } from "node:crypto";
import { isAtLeast } from "../util/amounts.js";

const TERMINAL = new Set(["paid", "underpaid", "expired"]);

// Unique-amount scheme: each ETH invoice gets base + (seq % 1000) wei so two
// simultaneous buyers never owe the identical amount, which makes exact-value
// matching collision-proof without per-customer deposit addresses.
const UNIQUE_AMOUNT_SLOTS = 1_000n;

export class InvoiceService {
  constructor({ store, config, eth, stellar, log = console.log }) {
    this.store = store;
    this.config = config;
    this.eth = eth;
    this.stellar = stellar;
    this.log = log;
    this.ethSequence = 0;
  }

  now() {
    return this.config.now ? this.config.now() : Date.now();
  }

  async create(asset) {
    if (asset !== "eth" && asset !== "xlm") {
      throw new Error(`unsupported asset: ${asset}`);
    }

    const expiresAt = this.now() + this.config.paymentTtlMs;
    const invoice =
      asset === "eth"
        ? await this.#createEth(expiresAt)
        : await this.#createXlm(expiresAt);

    const created = this.store.create(invoice);
    if (asset === "eth") {
      this.ethSequence = (this.ethSequence + 1) % Number(UNIQUE_AMOUNT_SLOTS);
    }
    this.log(
      `[invoice] created ${created.id} asset=${created.asset} ` +
        `expected=${created.expectedAmount} ttl=${this.config.paymentTtlMs}ms`,
    );
    return created;
  }

  get(id) {
    return this.store.get(id);
  }

  list() {
    return this.store
      .all()
      .sort(
        (a, b) =>
          b.expiresAt - a.expiresAt || (b.seq ?? 0) - (a.seq ?? 0),
      );
  }

  async refresh(id) {
    const invoice = this.store.get(id);
    if (!invoice) {
      return null;
    }
    if (TERMINAL.has(invoice.status)) {
      return invoice;
    }
    if (this.now() > invoice.expiresAt) {
      this.log(`[invoice] expired  ${id}`);
      return this.store.update(id, { status: "expired" });
    }

    const payment = await this.#findPayment(invoice);
    if (!payment) {
      return invoice;
    }
    if (this.store.findByTxHash(payment.txHash)) {
      return invoice;
    }

    const status = isAtLeast(payment.amount, invoice.expectedAmount)
      ? "paid"
      : "underpaid";

    this.log(
      `[invoice] ${status.padEnd(9)} ${id} tx=${payment.txHash} ` +
        `received=${payment.amount}`,
    );
    return this.store.update(id, {
      status,
      txHash: payment.txHash,
      receivedAmount: payment.amount,
    });
  }

  async #createEth(expiresAt) {
    // Slot the sequence into the least-significant wei so concurrent invoices
    // demand distinct amounts; wrap around after UNIQUE_AMOUNT_SLOTS uses.
    const uniqueAmount =
      this.config.ethereum.amountWei + BigInt(this.ethSequence);
    return {
      id: randomUUID(),
      asset: "eth",
      status: "pending",
      destination: this.config.ethereum.walletAddress,
      expectedAmount: uniqueAmount,
      startBlock: await this.eth.getCurrentBlockNumber(),
      chainId: this.config.ethereum.chainId ?? null,
      expiresAt,
    };
  }

  async #createXlm(expiresAt) {
    const memo = randomBytes(14).toString("hex");
    return {
      id: memo,
      asset: "xlm",
      status: "pending",
      destination: this.config.stellar.walletAddress,
      expectedAmount: this.config.stellar.amountStroops,
      memo,
      cursor: await this.stellar.getLatestCursor(),
      expiresAt,
    };
  }

  #findPayment(invoice) {
    const consumedHashes = this.store.consumedHashes();
    if (invoice.asset === "eth") {
      return this.eth.findPayment({ invoice, consumedHashes });
    }
    return this.stellar.findPayment({ invoice, consumedHashes });
  }
}
