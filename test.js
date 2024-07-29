const axios = require("axios");
const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

const horizonEndpoint = "https://horizon-testnet.stellar.org";
const accountAddress = process.env.STELLAR_WALLET_ADDRESS; // Replace with actual account address
const memoToFilter = "efbf776c"; // Replace with actual memo to filter

async function getTransactionsForAccount(accountId) {
  let transactions = [];
  let pageToken = null;

  try {
    do {
      console.log(
        `Fetching transactions with cursor: ${pageToken || "initial"}`
      );

      const response = await axios.get(
        `${horizonEndpoint}/accounts/${accountId}/transactions`,
        {
          params: {
            limit: 200, // Maximum number of records per request
            cursor: pageToken || undefined, // Use cursor if defined
          },
          timeout: 10000, // Set timeout of 10 seconds
        }
      );

      if (response.data._embedded.records.length === 0 && pageToken) {
        console.warn(`No transactions found for cursor: ${pageToken}`);
        break;
      }

      transactions = transactions.concat(response.data._embedded.records);
      console.log(
        `Fetched ${response.data._embedded.records.length} transactions`
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
      error.response?.data || error.message
    );
    throw error;
  }
}

function filterTransactions(transactions, memo) {
  return transactions.filter((tx) => {
    return tx.memo_type === "text" && tx.memo === memo;
  });
}

async function findFilteredTransactions() {
  try {
    if (!accountAddress) {
      throw new Error(
        "Account address is not provided. Set STELLAR_WALLET_ADDRESS in your .env file."
      );
    }

    const transactions = await getTransactionsForAccount(accountAddress);
    const filteredTransactions = filterTransactions(transactions, memoToFilter);

    console.log(`Found ${filteredTransactions.length} filtered transactions:`);
    filteredTransactions.forEach((tx) => {
      console.log(tx);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

findFilteredTransactions();
