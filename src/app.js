import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  STROOP_DECIMALS,
  WEI_DECIMALS,
  formatMinor,
} from "./util/amounts.js";
import { invoiceQrDataUrl, paymentDisplayAmount } from "./util/qr.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function publicInvoice(invoice) {
  const decimals = invoice.asset === "eth" ? WEI_DECIMALS : STROOP_DECIMALS;
  const messages = {
    pending: "Waiting for payment.",
    paid: "Payment received.",
    underpaid: "Payment is less than the stated amount.",
    expired: "Invoice expired before a matching payment was found.",
  };

  return {
    id: invoice.id,
    asset: invoice.asset,
    status: invoice.status,
    expectedAmount: formatMinor(invoice.expectedAmount, decimals),
    receivedAmount:
      invoice.receivedAmount == null
        ? null
        : formatMinor(invoice.receivedAmount, decimals),
    txHash: invoice.txHash ?? null,
    expiresAt: invoice.expiresAt,
    memo: invoice.memo ?? null,
    destination: invoice.destination,
    message: messages[invoice.status] ?? "",
  };
}

export function createApp({ invoices, qr = invoiceQrDataUrl }) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(rootDir, "..", "templates"));
  app.use("/static", express.static(path.join(rootDir, "..", "public")));

  app.get("/", (_req, res) => {
    res.render("index");
  });

  app.get("/pay/:asset", async (req, res, next) => {
    try {
      const asset = req.params.asset;
      if (asset !== "eth" && asset !== "xlm") {
        res.status(404).send("Unknown asset");
        return;
      }

      const invoice = await invoices.create(asset);
      const qrDataUrl = await qr(invoice);
      const unit = asset === "eth" ? "ETH" : "XLM";

      res.render("payment", {
        invoice: publicInvoice(invoice),
        qrDataUrl,
        displayAmount: paymentDisplayAmount(invoice),
        unit,
        title: asset === "eth" ? "Ethereum Payment" : "Stellar Payment",
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/invoices/:id", async (req, res, next) => {
    try {
      const invoice = await invoices.refresh(req.params.id);
      if (!invoice) {
        res.status(404).json({ error: "invoice not found" });
        return;
      }
      res.json(publicInvoice(invoice));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
