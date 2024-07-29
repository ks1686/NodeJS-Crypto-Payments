const express = require("express");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const Web3 = require("web3");
const QRCode = require("qrcode");
const bodyParser = require("body-parser");

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "static")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "templates"));

// Initialize Web3
const web3 = new Web3(
  new Web3.providers.HttpProvider(process.env.SEPOLIA_ETH_ENDPOINT)
);
if (!web3.currentProvider) {
  console.error("No Web3 provider found.");
  process.exit(1);
}

// Load the wallet address
const walletAddress = process.env.SEPOLIA_WALLET_ADDRESS;
if (!walletAddress) {
  console.error("No wallet address found.");
  process.exit(1);
}

// Route for '/' to load the crypto_index.ejs file
app.get("/", async (req, res) => {
  try {
    const qrCodeData = await QRCode.toDataURL(`ethereum:${walletAddress}`);
    const qrImagePath = path.join(__dirname, "static", "qrcode.png");
    fs.writeFileSync(
      qrImagePath,
      qrCodeData.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );

    res.render("crypto_index", {
      qr_img_path: "/qrcode.png", // Ensure the path is relative to the static directory
      wallet_address: walletAddress,
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).send("Error generating QR code.");
  }
});

// Route for '/check_transaction' to check transaction status on the specified network
app.post("/check_transaction", async (req, res) => {
  try {
    const { tx_hash, amount } = req.body;
    const tx = await web3.eth.getTransaction(tx_hash);
    const txValue = tx ? tx.value : null;
    const txTo = tx ? tx.to : null;

    if (
      tx &&
      txTo &&
      walletAddress &&
      txTo.toLowerCase() === walletAddress.toLowerCase() &&
      txValue === Web3.utils.toWei(amount)
    ) {
      res.json({ status: "success", message: "Payment received!" });
    } else {
      res.json({ status: "failure", message: "Payment not received" });
    }
  } catch (error) {
    res.status(500).send("Error checking transaction.");
  }
});

// Route for '/depay_callback' to handle the callback from Depay
app.post("/depay_callback", async (req, res) => {
  const data = req.body;
  console.log(data);
  res.status(200).json({ status: "success" });
});

// Start the server
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Ngrok domain: https://noticeably-hardy-sunbird.ngrok-free.app`);
});
