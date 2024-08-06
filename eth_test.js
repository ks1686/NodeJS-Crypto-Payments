const express = require("express");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const axios = require("axios");
const QRCode = require("qrcode");

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "static")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "templates"));

// Load the wallet address and Etherscan API key from the environment variables
const walletAddress = process.env.ETHEREUM_WALLET_ADDRESS;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
const explorer = process.env.ETHEREUM_EXPLORER;
if (!walletAddress || !etherscanApiKey || !explorer) {
  console.error("No wallet address or Etherscan API key found.");
  process.exit(1);
}

// Variable to store the current block number
let currentBlockNumber;

// Route for '/' to load the eth_index.ejs file
app.get("/", async (req, res) => {
  try {
    // Generate a QR code for the wallet address (modify data in case wallet compatibility is a problem)
    const qrCodeData = await QRCode.toDataURL(`ethereum:${walletAddress}`);
    const qrImagePath = path.join(__dirname, "static", "qrcode.png");
    fs.writeFileSync(
      qrImagePath,
      qrCodeData.replace(/^data:image\/png;base64,/, ""),
      "base64",
    );

    // Get the current block number
    const blockUrl = `${explorer}?module=proxy&action=eth_blockNumber&apikey=${etherscanApiKey}`;
    const blockResponse = await axios.get(blockUrl);
    currentBlockNumber = parseInt(blockResponse.data.result, 16);

    // Render the eth_index.ejs file
    res.render("eth_index", {
      qr_img_path: "/qrcode.png", // Ensure the path is relative to the static directory
      wallet_address: walletAddress,
    });
  } catch (error) {
    console.error(
      "Error generating QR code or getting current block number:",
      error,
    );
    res
      .status(500)
      .send("Error generating QR code or getting current block number.");
  }
});

// Route to poll for a transaction worth 0.1 ETH
app.get("/poll_transaction", async (req, res) => {
  // Target value to check for (0.1 ETH in Wei; change as needed)
  const targetValue = "100000000000000000";
  const pollingInterval = 5000; // Poll every 5 seconds
  const pollingDuration = 5 * 60 * 1000; // Poll for 5 minutes
  const endTime = Date.now() + pollingDuration;

  // Function to poll for the transaction
  const pollTransaction = async () => {
    try {
      // Get the transactions for the wallet address
      const apiUrl = `${explorer}?module=account&action=txlist&address=${walletAddress}&startblock=${currentBlockNumber}&sort=asc&apikey=${etherscanApiKey}`;
      const response = await axios.get(apiUrl);
      const transactions = response.data.result;

      // Check if the transaction is found
      for (const tx of transactions) {
        if (
          tx.value === targetValue &&
          tx.to.toLowerCase() === walletAddress.toLowerCase()
        ) {
          clearInterval(pollingIntervalId);
          return res.json({ status: "success", transaction: tx });
        }
      }

      // Clear the interval if the time limit is reached
      if (Date.now() > endTime) {
        clearInterval(pollingIntervalId);

        // Return a failure message if no transaction is found
        return res.json({
          status: "failure",
          message: "No transaction found within the time limit.",
        });
      }
    } catch (error) {
      console.error("Error polling transactions:", error);
    }
  };

  // Set up the polling interval
  const pollingIntervalId = setInterval(pollTransaction, pollingInterval);

  // Start the initial polling
  pollTransaction();
});

// Start the server
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Ngrok domain: https://noticeably-hardy-sunbird.ngrok-free.app`);
});
