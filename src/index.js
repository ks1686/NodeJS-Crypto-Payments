import { config as loadEnv } from "dotenv";
import { createApp } from "./app.js";
import { createEthereumClient } from "./chains/ethereum.js";
import { createStellarClient } from "./chains/stellar.js";
import { loadConfig } from "./config.js";
import { InvoiceService } from "./invoices/service.js";
import { InvoiceStore } from "./invoices/store.js";

loadEnv();

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const store = new InvoiceStore({ file: config.dataFile || null });
const invoices = new InvoiceService({
  store,
  config,
  eth: createEthereumClient({
    explorer: config.ethereum.explorer,
    apiKey: config.ethereum.apiKey,
    confirmations: config.ethereum.confirmations,
  }),
  stellar: createStellarClient({
    explorer: config.stellar.explorer,
    walletAddress: config.stellar.walletAddress,
  }),
});

const app = createApp({ invoices });
const server = app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  if (config.dataFile) {
    console.log(`Invoices persist to ${config.dataFile}`);
  }
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  store.flush();
  server.close(() => process.exit(0));
  // Failsafe in case keep-alive connections hold server.close() open.
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
