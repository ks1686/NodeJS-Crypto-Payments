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
  });
});
