export class InvoiceStore {
  constructor() {
    this.invoices = new Map();
  }

  create(invoice) {
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  get(id) {
    return this.invoices.get(id) ?? null;
  }

  update(id, patch) {
    const current = this.get(id);
    if (!current) {
      return null;
    }
    const next = { ...current, ...patch };
    this.invoices.set(id, next);
    return next;
  }

  findByTxHash(txHash) {
    if (!txHash) {
      return null;
    }
    for (const invoice of this.invoices.values()) {
      if (invoice.txHash === txHash) {
        return invoice;
      }
    }
    return null;
  }

  consumedHashes() {
    const hashes = new Set();
    for (const invoice of this.invoices.values()) {
      if (invoice.txHash) {
        hashes.add(invoice.txHash);
      }
    }
    return hashes;
  }
}
