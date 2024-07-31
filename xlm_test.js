const express = require("express");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const QRCode = require("qrcode");
const bodyParser = require("body-parser");
const uuid = require("uuid");
const axios = require("axios");

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "static")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "templates"));

// Load the wallet address
const walletAddress = process.env.STELLAR_WALLET_ADDRESS;
if (!walletAddress) {
  console.error("No wallet address found.");
  process.exit(1);
}

// Explorer endpoint for Stellar
const horizonEndpoint = process.env.STELLAR_EXPLORER;

// Function to get transactions for an account
async function getTransactionsForAccount(accountId) {
  let transactions = [];
  let pageToken = null;

  try {
    do {
      // Fetch transactions for the account
      const response = await axios.get(
        `${horizonEndpoint}/accounts/${accountId}/transactions`,
        {
          params: {
            limit: 200, // Maximum number of records per request
            cursor: pageToken || undefined, // Use cursor if defined
          },
          timeout: 10000, // Set timeout of 10 seconds
        },
      );

      // If no transactions are found and there is a cursor, break the loop
      if (response.data._embedded.records.length === 0 && pageToken) {
        console.warn(`No transactions found for cursor: ${pageToken}`);
        break;
      }

      // Concatenate the transactions
      transactions = transactions.concat(response.data._embedded.records);

      // Get the next page token
      const nextLink = response.data._links.next
        ? new URL(response.data._links.next.href)
        : null;
      pageToken = nextLink ? nextLink.searchParams.get("cursor") : null;
    } while (pageToken);

    return transactions;
  } catch (error) {
    console.error(
      "Error fetching transactions:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

// Function to get operations for a transaction
async function getOperationsForTransaction(transactionId) {
  try {
    // Fetch operations for the transaction
    const response = await axios.get(
      `${horizonEndpoint}/transactions/${transactionId}/operations`,
      {
        timeout: 10000, // Set timeout of 10 seconds
      },
    );
    return response.data._embedded.records;
  } catch (error) {
    console.error(
      `Error fetching operations for transaction ${transactionId}:`,
      error.response?.data || error.message,
    );
    throw error;
  }
}

// Function to filter transactions by memo
function filterTransactions(transactions, memo) {
  return transactions.filter((tx) => {
    return tx.memo_type === "text" && tx.memo === memo;
  });
}

// Function to find filtered transactions by memo
async function findFilteredTransactions(memo) {
  try {
    if (!walletAddress) {
      throw new Error(
        "Account address is not provided. Set STELLAR_WALLET_ADDRESS in your .env file.",
      );
    }

    // Get transactions for the account
    const transactions = await getTransactionsForAccount(walletAddress);
    const filteredTransactions = filterTransactions(transactions, memo);
    return filteredTransactions;
  } catch (error) {
    console.error("Error:", error.message);
    throw error;
  }
}

// Route for '/' to load the xlm_index.ejs file
app.get("/", async (req, res) => {
  try {
    const statedAmount = "30"; // Specify the stated amount
    const guid = uuid.v4();
    const memo = guid.replace(/-/g, "").slice(0, 7); // Generate a unique memo

    // Generate a Stellar URI (replace this with just the wallet address if your test wallets don't support URIs)
    const stellarUri = `web+stellar:pay?destination=${walletAddress}&amount=${statedAmount}&memo=${memo}`;

    // Generate a QR code for the data
    const qrCodeData = await QRCode.toDataURL(stellarUri);
    const qrImagePath = path.join(__dirname, "static", "qrcode.png");
    fs.writeFileSync(
      qrImagePath,
      qrCodeData.replace(/^data:image\/png;base64,/, ""),
      "base64",
    );

    // Render the index page with the QR code
    res.render("xlm_index", {
      qr_img_path: "/qrcode.png", // Ensure the path is relative to the static directory
      paymentMessage: `Destination: ${walletAddress}\nAmount: ${statedAmount}\nMemo: ${memo}`,
      statedAmount: statedAmount, // Pass the stated amount to the frontend
      actualAmount: null, // Placeholder for actual amount
      memo: memo, // Pass the memo to the frontend for tracking
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).send("Error generating QR code.");
  }
});

// Route to check the transaction status
app.post("/check_transaction", async (req, res) => {
  // Get the memo from the request body
  const { memo } = req.body;
  if (!memo) {
    return res.status(400).send("Memo is required.");
  }

  // Poll for transactions with the memo until one is found (frequency: 5 seconds)
  const interval = 5000;
  const checkTransactions = async () => {
    try {
      const filteredTransactions = await findFilteredTransactions(memo);

      // Find the transaction with the memo
      const transaction = filteredTransactions.find((tx) => tx.memo === memo);
      if (transaction) {
        clearInterval(pollingInterval);

        // Get transaction amount
        const operations = await getOperationsForTransaction(transaction.id);
        const transactionAmount = operations
          .filter((op) => op.amount)
          .map((op) => ({
            amount: op.amount,
            asset: op.asset_code || "XLM",
          }));

        // Return the transaction details
        return res.json({
          status: "success",
          transaction,
          statedAmount:
            transactionAmount.length > 0 ? transactionAmount[0].amount : "0", // Pass stated amount
          actualAmount:
            transactionAmount.length > 0 ? transactionAmount[0].amount : "0", // Pass actual amount
        });
      }
    } catch (error) {
      console.error("Error checking transactions:", error.message);
    }
  };

  // Set a timeout to stop polling after a reasonable amount of time
  const pollingInterval = setInterval(checkTransactions, interval);
  setTimeout(() => {
    clearInterval(pollingInterval);
    res.status(200).json({
      status: "timeout",
      message: "Transaction not found within the time limit.",
    });
  }, 60000); // Timeout after 1 minute
});

// Start the server
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Ngrok domain: https://noticeably-hardy-sunbird.ngrok-free.app`);
});
