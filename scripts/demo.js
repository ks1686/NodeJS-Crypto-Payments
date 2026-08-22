#!/usr/bin/env node
// Zero-config demo launcher: starts the mock explorer and the app together.
//   npm run demo
// Then open http://localhost:8000, click "Pay with ETH", and simulate a
// payment with the curl command the mock prints on startup.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDir);
const children = [];

function start(name, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.push({ name, child });
  return child;
}

start("mock-explorer", ["mock/chain.js"], {});
start(
  "app",
  ["src/index.js"],
  {
    STELLAR_WALLET_ADDRESS:
      process.env.STELLAR_WALLET_ADDRESS ||
      "GDEMOACCOUNT11111111111111111111111111111111111111111111",
    ETHEREUM_WALLET_ADDRESS:
      process.env.ETHEREUM_WALLET_ADDRESS ||
      "0xdemo00000000000000000000000000000000c0ffee",
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY || "demo-key-not-real",
    STELLAR_EXPLORER:
      process.env.STELLAR_EXPLORER || "http://127.0.0.1:4311",
    ETHEREUM_EXPLORER:
      process.env.ETHEREUM_EXPLORER || "http://127.0.0.1:4311/api",
    NETWORK: process.env.NETWORK || "testnet",
    DATA_FILE: process.env.DATA_FILE || "./data/demo-invoices.json",
  },
);

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`\n[demo] ${signal}, stopping`);
  for (const { child } of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 1_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const { name, child } of children) {
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[demo] ${name} exited unexpectedly (code ${code}); stopping all`);
      shutdown("exit");
    }
  });
}
