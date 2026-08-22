import QRCode from "qrcode";
import { STROOP_DECIMALS, WEI_DECIMALS, formatMinor } from "./amounts.js";

// EIP-681 payment URI. On testnet we pin chain_id=11155111 (Sepolia) so a
// scanned QR opens in a wallet on Sepolia instead of defaulting to mainnet.
export function paymentUri(invoice) {
  if (invoice.asset === "eth") {
    let uri = `ethereum:${invoice.destination}?value=${invoice.expectedAmount.toString()}`;
    if (invoice.chainId) {
      uri += `&chainId=${invoice.chainId}`;
    }
    return uri;
  }

  // SEP-0007 Pay URI. memo_type is required by the spec when a memo is set;
  // without it some wallets ignore the memo and the payment can't settle.
  const amount = formatMinor(invoice.expectedAmount, STROOP_DECIMALS);
  const params = new URLSearchParams({
    destination: invoice.destination,
    amount,
    memo: invoice.memo,
    memo_type: "MEMO_TEXT",
  });
  return `web+stellar:pay?${params.toString()}`;
}

export function paymentDisplayAmount(invoice) {
  if (invoice.asset === "eth") {
    return formatMinor(invoice.expectedAmount, WEI_DECIMALS);
  }
  return formatMinor(invoice.expectedAmount, STROOP_DECIMALS);
}

export async function invoiceQrDataUrl(invoice) {
  return QRCode.toDataURL(paymentUri(invoice));
}
