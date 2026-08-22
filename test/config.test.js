import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

const valid = {
  ETHEREUM_WALLET_ADDRESS: "0xabc",
  STELLAR_WALLET_ADDRESS: "GTEST",
  ETHERSCAN_API_KEY: "key",
};

describe("loadConfig", () => {
  it("loads testnet defaults", () => {
    const config = loadConfig(valid);
    assert.equal(config.network, "testnet");
    assert.equal(config.port, 8000);
    assert.equal(config.ethereum.amountWei, 100000000000000000n);
    assert.equal(config.stellar.amountStroops, 300000000n);
    assert.equal(config.display.eth, "0.1");
    assert.equal(config.display.xlm, "30");
  });

  it("fails closed when required variables are missing", () => {
    assert.throws(
      () => loadConfig({}),
      /missing required environment variable: ETHEREUM_WALLET_ADDRESS/,
    );
  });

  it("refuses mainnet without ALLOW_MAINNET=true", () => {
    assert.throws(
      () => loadConfig({ ...valid, NETWORK: "mainnet" }),
      /refusing to start on mainnet/,
    );
  });

  it("allows mainnet when explicitly opted in", () => {
    const config = loadConfig({
      ...valid,
      NETWORK: "mainnet",
      ALLOW_MAINNET: "true",
    });
    assert.equal(config.network, "mainnet");
    // No chain id pin on mainnet; the URI stays chain-agnostic.
    assert.equal(config.ethereum.chainId, null);
  });

  it("pins the Sepolia chain id on testnet for QR safety", () => {
    const config = loadConfig(valid);
    assert.equal(config.ethereum.chainId, "11155111");
  });

  it("rejects a zero or negative payment TTL", () => {
    assert.throws(
      () => loadConfig({ ...valid, PAYMENT_TTL_MS: "0" }),
      /PAYMENT_TTL_MS must be at least 1/,
    );
    assert.throws(
      () => loadConfig({ ...valid, PAYMENT_TTL_MS: "-5" }),
      /PAYMENT_TTL_MS must be a non-negative integer/,
    );
  });

  it("rejects a zero port", () => {
    assert.throws(
      () => loadConfig({ ...valid, PORT: "0" }),
      /PORT must be at least 1/,
    );
  });

  it("defaults the data file to disabled", () => {
    assert.equal(loadConfig(valid).dataFile, "");
    assert.equal(loadConfig({ ...valid, DATA_FILE: "x.json" }).dataFile, "x.json");
  });
});
