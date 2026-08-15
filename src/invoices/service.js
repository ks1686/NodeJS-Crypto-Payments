import { randomBytes, randomUUID } from "node:crypto";
import { isAtLeast } from "../util/amounts.js";

const TERMINAL = new Set(["paid", "underpaid", "expired"]);

export class InvoiceService {
  constructor({ store, config, eth, stellar }) {
    this.store = store;
    this.config = config;
    this.eth = eth;
    this.stellar = stellar;
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

    return this.store.create(invoice);
  }

  get(id) {
    return this.store.get(id);
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

    return this.store.update(id, {
      status,
      txHash: payment.txHash,
      receivedAmount: payment.amount,
    });
  }

  async #createEth(expiresAt) {
    return {
      id: randomUUID(),
      asset: "eth",
      status: "pending",
      destination: this.config.ethereum.walletAddress,
      expectedAmount: this.config.ethereum.amountWei,
      startBlock: await this.eth.getCurrentBlockNumber(),
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
