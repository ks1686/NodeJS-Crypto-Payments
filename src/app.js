import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { isChainError } from "./errors.js";
import { STROOP_DECIMALS, WEI_DECIMALS, formatMinor } from "./util/amounts.js";
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
    // Exact integer amount (wei/stroops) for integrations that must match
    // on-chain values precisely.
    expectedAmountRaw: invoice.expectedAmount.toString(),
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

export function createApp({ invoices, qr = invoiceQrDataUrl, log = console.log }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(rootDir, "..", "templates"));
  app.use(
    "/static",
    express.static(path.join(rootDir, "..", "public"), {
      maxAge: "1h",
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'",
    );
    next();
  });

  app.get("/", (_req, res) => {
    res.render("index");
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Lightweight reachability probe for the home-page indicator. Never throws;
  // a 200 with ok:false means "server up, chain unreachable".
  app.get("/api/chain-status/:asset", async (req, res) => {
    const asset = req.params.asset;
    try {
      if (asset === "eth") {
        await invoices.eth.getCurrentBlockNumber();
        res.json({ ok: true });
      } else if (asset === "xlm") {
        await invoices.stellar.getLatestCursor();
        res.json({ ok: true });
      } else {
        res.status(404).json({ ok: false, error: "unknown asset" });
      }
    } catch {
      res.json({ ok: false });
    }
  });

  app.get("/invoices", (_req, res) => {
    res.render("invoices", {
      title: "Invoices",
      invoices: invoices.list().map(publicInvoice),
    });
  });

  app.get("/pay/:asset", async (req, res, next) => {
    const asset = req.params.asset;
    if (asset !== "eth" && asset !== "xlm") {
      res.status(404).send("Unknown asset");
      return;
    }

    try {
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
      if (!isChainError(error)) {
        next(error);
        return;
      }
      log(`[pay] chain unavailable (${asset}): ${error.message}`);
      res.status(503).render("error", {
        title: asset === "eth" ? "Ethereum unavailable" : "Stellar unavailable",
        heading: "Can't reach the network right now",
        detail:
          `${asset === "eth" ? "Ethereum" : "Stellar"} explorer request failed: ${error.message}. ` +
          "Check the server's connection and API key, then try again.",
        retryHref: `/pay/${asset}`,
      });
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

  app.use((req, res) => {
    res.status(404).render("error", {
      title: "Not found",
      heading: "Page not found",
      detail: `No route matches ${req.method} ${req.path}.`,
      retryHref: "/",
    });
  });

  app.use((error, _req, res, _next) => {
    log(`[error] ${error?.stack || error}`);
    if (res.headersSent) {
      return;
    }
    try {
      res.status(500).render("error", {
        title: "Something went wrong",
        heading: "Something went wrong",
        detail: "An unexpected error occurred. Try again in a moment.",
        retryHref: "/",
      });
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ error: "internal error" });
      }
    }
  });

  return app;
}
