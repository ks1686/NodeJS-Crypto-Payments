# Crypto Payment API

![CI](https://github.com/ks1686/Crypto-Payment-API/actions/workflows/test.yml/badge.svg)

A self-hosted **testnet payment demo**: create an invoice page for **ETH** (Sepolia) or **XLM** (Stellar Testnet) with a scannable QR code, watch it flip from *pending* to *paid* automatically as the blockchain confirms the transfer.

No paid services, no merchant accounts, no hosted processor — just Node.js and two public blockchains.

<!-- TODO(karim): drop screenshots here after first run
![Home](docs/screenshots/home.png)
![Invoice waiting](docs/screenshots/pending.png)
![Paid](docs/screenshots/paid.png)
-->

## Try it in 60 seconds (zero config)

The repo ships a fake explorer, so you can demo the entire flow — invoices, QR codes, simulated payments, persistence — without keys, testnet funds, or even internet:

```bash
npm install
npm run demo
```

Open <http://localhost:8000>, click **Pay with ETH**, then simulate the buyer's payment:

```bash
# copy the exact amount from the invoice page/API, then:
curl -X POST http://localhost:4311/mock/send \
  -H 'Content-Type: application/json' \
  -d '{"chain":"eth","valueWei":"100000000000000000"}'
```

The invoice page flips to **paid** within ~5 seconds. For XLM use `{"chain":"xlm","memo":"<invoice memo>"}`.

Prefer containers? `docker compose up` starts the same demo (app + mock explorer).

## Running against real testnets

1. Install [Node.js](https://nodejs.org/) 20 or newer.
2. Copy `.env.example` to `.env` and set:
   - `STELLAR_WALLET_ADDRESS` — your Stellar testnet address (fund it with [friendbot](https://friendbot.stellar.org/))
   - `ETHEREUM_WALLET_ADDRESS` — your Sepolia address (fund it from any Sepolia faucet)
   - `ETHERSCAN_API_KEY` — free key from [etherscan.io](https://etherscan.io/apis) (required by the Etherscan API even on testnet)
3. Install and start:

```bash
npm install
npm start
```

The app listens on `http://localhost:8000`. It exits at startup if a required variable is missing, or if `NETWORK=mainnet` is set without an explicit `ALLOW_MAINNET=true`.

## How payments are matched

Every invoice carries a unique id, exact integer amount (wei/stroops — no floats anywhere), expiry, and destination.

- **XLM:** the invoice id doubles as a 28-character hex **memo**. Horizon is queried from the paging cursor captured when the invoice was created; a match requires the right destination, native XLM, and that memo. Wallets get the memo via the SEP-0007 QR/link.
- **ETH:** each invoice gets a slightly different expected amount (base + a rotating 0–999 wei offset), so two simultaneous buyers can never cross-settle — matching stays "exact value to merchant address", but collisions are designed out.

Additional guarantees:

| Guarantee | How |
|---|---|
| Underpays never settle as paid | amounts compared as integers; underpay → `underpaid` |
| One transaction settles one invoice | consumed tx-hash set shared across invoices |
| Expired invoices stop checking | terminal states are never re-polled |
| Restarts keep history | set `DATA_FILE` to persist invoices as JSON (atomic writes, BigInt-safe) |
| Chain outages don't kill the UX | explorer failures render a friendly retry page (`503`), other chains keep working |

Default amounts: **0.1 ETH** and **30 XLM**. Expiry default **5 minutes**.

> This is a demo, not a custodial processor: there is no per-customer ETH deposit address and no merchant authentication. Don't point it at mainnet wallets with real money.

## Routes

| Route | What it does |
|---|---|
| `GET /` | landing page with live chain-reachability indicators |
| `GET /pay/eth`, `GET /pay/xlm` | create an invoice page with QR code |
| `GET /api/invoices/:id` | invoice status JSON (polled every 5s by the page) |
| `GET /invoices` | all invoices dashboard |
| `GET /health` | liveness probe (`{"ok":true}`) |

The status JSON includes `expectedAmountRaw` (exact wei/stroops string) for integrations that must match on-chain values precisely.

## Configuration

All optional variables have testnet defaults (see `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `NETWORK` | `testnet` | `mainnet` requires `ALLOW_MAINNET=true` |
| `PAYMENT_TTL_MS` | `300000` | invoice expiry (min 1) |
| `ETH_AMOUNT_WEI` / `XLM_AMOUNT_STROOPS` | `100000000000000000` / `300000000` | base invoice amounts |
| `ETH_CONFIRMATIONS` | `1` | confirmations required before settlement |
| `DATA_FILE` | *(unset)* | JSON file path for persistence across restarts |
| `PORT` | `8000` | server port |

QR codes encode standard payment URIs: **EIP-681** for Ethereum (with `chainId=11155111` pinned on testnet, so phone wallets don't default to mainnet) and **SEP-0007** `web+stellar:pay` for Stellar (with explicit `memo_type`).

## Development

```bash
npm test        # 54 tests, node:test runner — explorers are faked, no network needed
npm run lint    # eslint (flat config)
```

CI runs lint + tests on Node 20 and 22 for every push and pull request.

Project layout:

```
src/
  app.js            express app: routes, security headers, error pages
  config.js         env parsing/validation
  errors.js         typed ChainError for graceful degradation
  chains/           explorer clients (etherscan-shaped, horizon-shaped)
  invoices/         store (Map + optional JSON persistence) & service
  util/             bigint<->decimal helpers, payment URIs/QR
mock/chain.js       zero-config fake explorer used by `npm run demo`
scripts/demo.js     demo launcher (mock explorer + app)
templates/, public/ ejs views + static assets
```

## License

[MIT](LICENSE)
