# Crypto Payment API

Testnet demo that accepts **XLM** or **ETH** invoices. Each request to `/pay/eth` or `/pay/xlm` creates an invoice with an amount, destination, expiry, and a unique correlation id. The browser polls `GET /api/invoices/:id` every 5 seconds. The server checks the explorer once per poll and returns immediately.

This is not a hosted processor. There is no merchant auth, no unique ETH deposit address, and no mainnet mode unless you explicitly set `ALLOW_MAINNET=true`.

## Setup

1. Install [Node.js](https://nodejs.org/) 20 or newer.
2. Copy `.env.example` to `.env` and set:

   - `STELLAR_WALLET_ADDRESS`
   - `ETHEREUM_WALLET_ADDRESS`
   - `ETHERSCAN_API_KEY`

3. Install dependencies and start the server:

```bash
npm install
npm start
```

The app listens on `http://localhost:8000` (`PORT` overrides). It exits if a required variable is missing, or if `NETWORK=mainnet` without `ALLOW_MAINNET=true`.

## How payments are matched

- **XLM:** the invoice id is a 28-character hex **memo**. Horizon is queried from the cursor captured when the invoice was created. A match requires destination, native XLM, and that memo. Include the memo or the payment will not settle.
- **ETH:** there is no memo. The watcher looks for the first unused confirmed native transfer to the merchant address whose value is **exactly** `ETH_AMOUNT_WEI` (default **0.1 ETH**). Two buyers paying the same amount to the same address can collide; do not use this as a multi-customer checkout.

Amounts are compared as integers (wei / stroops). An underpay becomes `underpaid`, not `paid`. The same transaction hash cannot settle two invoices.

Default amounts: **0.1 ETH** and **30 XLM**.

## Tests

```bash
npm test
```

Tests inject fake explorers. They do not call Sepolia or Horizon. GitHub Actions runs the same command on every push and pull request.

## Routes

- `GET /` — choose ETH or XLM
- `GET /pay/eth` / `GET /pay/xlm` — create an invoice and show a QR data URL
- `GET /api/invoices/:id` — invoice status JSON
