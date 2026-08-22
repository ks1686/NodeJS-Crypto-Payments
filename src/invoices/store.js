import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// BigInt survives neither JSON.stringify nor parse on its own, so amounts are
// wrapped in an explicit tag on save and unwrapped on load.
function bigIntReplacer(_key, value) {
  return typeof value === "bigint" ? { __bigint__: value.toString() } : value;
}

function bigIntReviver(_key, value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "__bigint__" in value
  ) {
    return BigInt(value.__bigint__);
  }
  return value;
}

export class InvoiceStore {
  /**
   * @param {object} options
   * @param {string|null} options.file Optional path of a JSON file to persist
   *   invoices across restarts. Writes are atomic (temp file + rename).
   */
  constructor({ file = null } = {}) {
    this.file = file;
    this.invoices = new Map();
    this.dirty = false;
    this.flushTimer = null;
    if (file) {
      this.#load();
    }
  }

  #load() {
    let raw;
    try {
      raw = readFileSync(this.file, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.error(
          `Could not read invoice store at ${this.file}: ${error.message}`,
        );
      }
      return;
    }

    try {
      const parsed = JSON.parse(raw, bigIntReviver);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.invoices)
          ? parsed.invoices
          : [];
      for (const invoice of list) {
        if (invoice?.id && invoice.status) {
          this.invoices.set(invoice.id, invoice);
          this.sequence = Math.max(this.sequence ?? 0, invoice.seq ?? 0);
        }
      }
    } catch (error) {
      console.error(
        `Ignoring unreadable invoice store at ${this.file}: ${error.message}`,
      );
    }
  }

  #scheduleFlush() {
    if (!this.file || this.flushTimer) {
      return;
    }
    this.dirty = true;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 250);
    this.flushTimer.unref?.();
  }

  /** Write pending changes to disk immediately (also used on shutdown). */
  flush() {
    if (!this.file || !this.dirty) {
      return;
    }
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.invoices.values()], bigIntReplacer, 2));
    renameSync(tmp, this.file);
    this.dirty = false;
  }

  create(invoice) {
    this.sequence = (this.sequence ?? 0) + 1;
    const stored = { seq: this.sequence, ...invoice };
    this.invoices.set(stored.id, stored);
    this.#scheduleFlush();
    return stored;
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
    this.#scheduleFlush();
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

  all() {
    return [...this.invoices.values()];
  }
}
