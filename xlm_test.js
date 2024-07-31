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

const horizonEndpoint = process.env.STELLAR_EXPLORER;

async function getTransactionsForAccount(accountId) {
  let transactions = [];
  let pageToken = null;

  try {
    do {
      console.log(
        `Fetching transactions with cursor: ${pageToken || "initial"}`,
      );

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

      if (response.data._embedded.records.length === 0 && pageToken) {
        console.warn(`No transactions found for cursor: ${pageToken}`);
        break;
      }

      transactions = transactions.concat(response.data._embedded.records);
      console.log(
        `Fetched ${response.data._embedded.records.length} transactions`,
      );

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

async function getOperationsForTransaction(transactionId) {
  try {
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

function filterTransactions(transactions, memo) {
  return transactions.filter((tx) => {
    return tx.memo_type === "text" && tx.memo === memo;
  });
}

async function findFilteredTransactions(memo) {
  try {
    if (!walletAddress) {
      throw new Error(
        "Account address is not provided. Set STELLAR_WALLET_ADDRESS in your .env file.",
      );
    }

    const transactions = await getTransactionsForAccount(walletAddress);
    const filteredTransactions = filterTransactions(transactions, memo);

    console.log(`Found ${filteredTransactions.length} filtered transactions:`);
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

    // Generate the stellar URI
    const stellarUri = `web+stellar:pay?destination=${walletAddress}&amount=${statedAmount}&memo=${memo}`;

    const qrCodeData = await QRCode.toDataURL(stellarUri);

    const qrImagePath = path.join(__dirname, "static", "qrcode.png");
    fs.writeFileSync(
      qrImagePath,
      qrCodeData.replace(/^data:image\/png;base64,/, ""),
      "base64",
    );

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
  const { memo } = req.body;

  if (!memo) {
    return res.status(400).send("Memo is required.");
  }

  const interval = 5000; // Poll every 5 seconds

  const checkTransactions = async () => {
    try {
      const filteredTransactions = await findFilteredTransactions(memo);
      console.log("Filtered Transactions:", filteredTransactions);

      const transaction = filteredTransactions.find((tx) => tx.memo === memo);
      console.log("Found Transaction:", transaction);

      if (transaction) {
        clearInterval(pollingInterval);

        // Get transaction amount
        const operations = await getOperationsForTransaction(transaction.id);
        console.log("Operations:", operations);

        const transactionAmount = operations
          .filter((op) => op.amount) // Filter operations that have amount
          .map((op) => ({
            amount: op.amount,
            asset: op.asset_code || "XLM",
          }));

        console.log("Transaction Amount:", transactionAmount);

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

  const pollingInterval = setInterval(checkTransactions, interval);

  // Set a timeout to stop polling after a reasonable amount of time
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
