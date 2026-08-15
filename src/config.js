import { STROOP_DECIMALS, WEI_DECIMALS, formatMinor } from "./util/amounts.js";

const DEFAULTS = {
  STELLAR_EXPLORER: "https://horizon-testnet.stellar.org",
  ETHEREUM_EXPLORER: "https://api-sepolia.etherscan.io/api",
  NETWORK: "testnet",
  ALLOW_MAINNET: "false",
  PORT: "8000",
  PAYMENT_TTL_MS: "300000",
  ETH_AMOUNT_WEI: "100000000000000000",
  XLM_AMOUNT_STROOPS: "300000000",
  ETH_CONFIRMATIONS: "1",
};

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

function optional(env, name) {
  const value = env[name]?.trim();
  return value || DEFAULTS[name];
}

function parsePositiveInt(name, value) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a safe non-negative integer`);
  }
  return parsed;
}

function parsePositiveBigInt(name, value) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return BigInt(value);
}

export function loadConfig(env = process.env) {
  const network = optional(env, "NETWORK").toLowerCase();
  const allowMainnet = optional(env, "ALLOW_MAINNET").toLowerCase() === "true";

  if (network !== "testnet" && network !== "mainnet") {
    throw new Error("NETWORK must be testnet or mainnet");
  }
  if (network === "mainnet" && !allowMainnet) {
    throw new Error("refusing to start on mainnet without ALLOW_MAINNET=true");
  }

  const ethAmountWei = parsePositiveBigInt(
    "ETH_AMOUNT_WEI",
    optional(env, "ETH_AMOUNT_WEI"),
  );
  const xlmAmountStroops = parsePositiveBigInt(
    "XLM_AMOUNT_STROOPS",
    optional(env, "XLM_AMOUNT_STROOPS"),
  );

  return {
    network,
    allowMainnet,
    port: parsePositiveInt("PORT", optional(env, "PORT")),
    paymentTtlMs: parsePositiveInt(
      "PAYMENT_TTL_MS",
      optional(env, "PAYMENT_TTL_MS"),
    ),
    ethereum: {
      walletAddress: required(env, "ETHEREUM_WALLET_ADDRESS"),
      explorer: optional(env, "ETHEREUM_EXPLORER"),
      apiKey: required(env, "ETHERSCAN_API_KEY"),
      amountWei: ethAmountWei,
      confirmations: parsePositiveInt(
        "ETH_CONFIRMATIONS",
        optional(env, "ETH_CONFIRMATIONS"),
      ),
    },
    stellar: {
      walletAddress: required(env, "STELLAR_WALLET_ADDRESS"),
      explorer: optional(env, "STELLAR_EXPLORER").replace(/\/$/, ""),
      amountStroops: xlmAmountStroops,
    },
    display: {
      eth: formatMinor(ethAmountWei, WEI_DECIMALS),
      xlm: formatMinor(xlmAmountStroops, STROOP_DECIMALS),
    },
  };
}
