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

// Route for '/' to load the crypto_index.ejs file
app.get("/", async (req, res) => {
  try {
    const amount = "30"; // Specify the amount
    const memo = uuid.v4();

    // Generate the stellar URI
    const stellarUri = `web+stellar:pay?destination=${walletAddress}&amount=${amount}&memo=${memo}`;

    const qrCodeData = await QRCode.toDataURL(stellarUri);

    const qrImagePath = path.join(__dirname, "static", "qrcode.png");
    fs.writeFileSync(
      qrImagePath,
      qrCodeData.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );

    res.render("crypto_index", {
      qr_img_path: "/qrcode.png", // Ensure the path is relative to the static directory
      paymentMessage: `Stellar Payment\nDestination: ${walletAddress}\nAmount: ${amount}\nMemo: ${memo}`,
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).send("Error generating QR code.");
  }
});

// Route to check the transaction status
app.post("/check_transaction", async (req, res) => {
  const { tx_hash } = req.body;

  try {
    const response = await axios.get(
      `https://horizon.stellar.org/transactions/${tx_hash}`
    );
    const transaction = response.data;

    if (transaction) {
      res.json({
        status: "Success",
        message: `Transaction ${tx_hash} found. Status: ${
          transaction.successful ? "Successful" : "Failed"
        }`,
      });
    } else {
      res.json({
        status: "Failed",
        message: "Transaction not found.",
      });
    }
  } catch (error) {
    console.error("Error checking transaction:", error);
    res.status(500).json({
      status: "Error",
      message: "Error checking transaction.",
    });
  }
});

// Start the server
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Ngrok domain: https://noticeably-hardy-sunbird.ngrok-free.app`);
});
